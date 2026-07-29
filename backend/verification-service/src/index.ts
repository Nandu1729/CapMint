import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  assertRlsServiceRole,
  PUBLIC_TENANT_CONTEXT,
  tenantContextFromUser,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';
import { reserveBudgetCapacity, reserveLotIssuance } from '../../../packages/shared/capacity.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const LEDGER_URL = process.env.TRANSPARENCY_SERVICE_URL || 'http://localhost:8085/api/v1/log';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedSpecs: any[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify({
  logger: true
});

// Configure CORS headers manually to support client-side fetch from frontend
server.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (request.method === 'OPTIONS') {
    return reply.status(204).send();
  }
});

// Configure JWT plugin
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-insecure-secret' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
server.register(jwt, {
  secret: JWT_SECRET,
  verify: { algorithms: ['HS256'] }
});

// Service-to-service token for authenticating internal ledger appends (signed with the shared JWT secret).
function makeServiceToken(): string {
  const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({
    svc: 'verification-service',
    role: 'ADMIN',
    orgType: 'SYSTEM_ADMINISTRATOR'
  });
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
const SERVICE_TOKEN = makeServiceToken();

// Decorators: authenticate / authorize
server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    server.log.error(err);
    return reply.status(401).send({
      success: false,
      error: {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing Authorization token.'
      }
    });
  }
});

// Decorator: authorize
server.decorate('authorize', (allowedSpecs: any[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'User context not found.'
        }
      });
    }

    const isAuthorized = allowedSpecs.some(spec => {
      if (typeof spec === 'string') {
        return spec === user.role || spec === user.orgType;
      } else if (spec && typeof spec === 'object') {
        const matchType = spec.orgType === user.orgType;
        const matchRole = !spec.role || spec.role === user.role;
        return matchType && matchRole;
      }
      return false;
    });

    if (!isAuthorized) {
      return reply.status(403).send({
        success: false,
        error: {
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.'
        }
      });
    }
  };
});

const PRODUCER_OPERATION_SPECS = [
  { orgType: 'PRODUCER', role: 'ADMIN' },
  { orgType: 'PRODUCER', role: 'MEMBER' }
];
const CERTIFIER_OPERATION_SPECS = [
  { orgType: 'CERTIFICATION_BODY', role: 'ADMIN' },
  { orgType: 'CERTIFICATION_BODY', role: 'MEMBER' }
];
const LAB_OPERATION_SPECS = [
  { orgType: 'NABL_LABORATORY', role: 'ADMIN' },
  { orgType: 'NABL_LABORATORY', role: 'MEMBER' }
];
const SYSTEM_ADMIN_SPEC = { orgType: 'SYSTEM_ADMINISTRATOR', role: 'ADMIN' };
const OPERATIONAL_READ_SPECS = [
  ...PRODUCER_OPERATION_SPECS,
  ...CERTIFIER_OPERATION_SPECS,
  SYSTEM_ADMIN_SPEC
];
const INVESTIGATION_MUTATION_SPECS = [
  ...CERTIFIER_OPERATION_SPECS,
  SYSTEM_ADMIN_SPEC
];
const LOT_READ_SPECS = [
  ...OPERATIONAL_READ_SPECS,
  ...LAB_OPERATION_SPECS
];

// Initialize PostgreSQL Client Pool
const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
const pgPool = new pg.Pool({
  connectionString: DATABASE_URL
});

const withAuthenticatedTenantTx = <T>(
  request: FastifyRequest,
  fn: (client: pg.PoolClient) => Promise<T>
) => withTenantTx(pgPool, tenantContextFromUser(request.user as any), fn);

// Initialize Redis Client
const REDIS_URL = process.env.REDIS_URL || (process.env.NODE_ENV === 'test' ? 'redis://:capmint_redis_secure_password@localhost:6379/0' : '');
if (!REDIS_URL) {
  console.error('FATAL: REDIS_URL is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
const redisClient = new Redis(REDIS_URL);

async function lockCertifierLot(client: pg.PoolClient, lotId: string, organizationId: string) {
  return client.query(
    `SELECT l.*
     FROM lots l
     JOIN budgets b ON b.id = l.budget_id
     JOIN certifiers c ON c.id = b.certifier_id
     WHERE l.id = $1
       AND c.organization_id = $2
     FOR UPDATE OF l, b
     FOR SHARE OF c`,
    [lotId, organizationId]
  );
}

async function lockCertifierLotForLaboratoryAssignment(
  client: pg.PoolClient,
  lotId: string,
  organizationId: string
) {
  return client.query(
    `SELECT l.id, l.assigned_laboratory_organization_id
     FROM lots l
     JOIN budgets b ON b.id = l.budget_id
     JOIN certifiers c ON c.id = b.certifier_id
     WHERE l.id = $1
       AND c.organization_id = $2
     FOR UPDATE OF l
     FOR SHARE OF c`,
    [lotId, organizationId]
  );
}

async function lockCertifierInvestigation(client: pg.PoolClient, investigationId: string, organizationId: string) {
  return client.query(
    `SELECT i.*, u.lot_id AS linked_lot_id
     FROM investigations i
     JOIN unit_codes u ON u.id = i.unit_code_id
     JOIN lots l ON l.id = u.lot_id
     JOIN budgets b ON b.id = l.budget_id
     JOIN certifiers c ON c.id = b.certifier_id
     WHERE i.id = $1
       AND c.organization_id = $2
     FOR UPDATE OF i, u, l, b
     FOR SHARE OF c`,
    [investigationId, organizationId]
  );
}

function isSystemAdministrator(user: any): boolean {
  return user.orgType === 'SYSTEM_ADMINISTRATOR' && user.role === 'ADMIN';
}

async function lockInvestigationForActor(client: pg.PoolClient, investigationId: string, user: any) {
  if (isSystemAdministrator(user)) {
    return client.query('SELECT * FROM investigations WHERE id = $1 FOR UPDATE', [investigationId]);
  }
  return lockCertifierInvestigation(client, investigationId, user.orgId);
}

async function loadScopedLotCodes(client: pg.PoolClient, lotId: string, user: any) {
  const selection = `SELECT l.product_metadata,
                            u.public_identifier,
                            u.gtin,
                            u.serial,
                            u.digital_link_uri,
                            u.verification_url
                     FROM lots l
                     JOIN budgets b ON b.id = l.budget_id`;
  const codeJoin = 'LEFT JOIN unit_codes u ON u.lot_id = l.id';
  if (user.orgType === 'PRODUCER') {
    return client.query(
      `${selection}
       JOIN producers p ON p.id = l.producer_id
       ${codeJoin}
       WHERE l.id = $1
         AND b.producer_id = l.producer_id
         AND p.organization_id = $2
       ORDER BY u.minted_at`,
      [lotId, user.orgId]
    );
  }
  if (user.orgType === 'CERTIFICATION_BODY') {
    return client.query(
      `${selection}
       JOIN certifiers c ON c.id = b.certifier_id
       ${codeJoin}
       WHERE l.id = $1
         AND c.organization_id = $2
       ORDER BY u.minted_at`,
      [lotId, user.orgId]
    );
  }
  if (isSystemAdministrator(user)) {
    return client.query(
      `${selection}
       ${codeJoin}
       WHERE l.id = $1
       ORDER BY u.minted_at`,
      [lotId]
    );
  }
  return client.query('SELECT NULL WHERE FALSE');
}

// Redis sliding-window rate limiter (per client IP). Returns true if within the limit.
// Note: behind the local gateway proxy all requests share the gateway IP; production should
// forward the real client IP (X-Forwarded-For + trust proxy) for per-client limiting.
async function rateLimit(bucket: string, ip: string, max: number, windowMs: number): Promise<boolean> {
  const key = `ratelimit:${bucket}:${ip}`;
  const now = Date.now();
  const results = await redisClient
    .multi()
    .zremrangebyscore(key, 0, now - windowMs)
    .zadd(key, now, `${now}-${Math.random()}`)
    .zcard(key)
    .pexpire(key, windowMs)
    .exec();
  const count = Number(results?.[2]?.[1] ?? 0);
  return count <= max;
}
const RATE_LIMIT_VERIFY_MAX = parseInt(process.env.RATE_LIMIT_VERIFY_MAX || '100', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

// Helper: Haversine distance in km between two coordinates
export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Standard health check route
server.get('/health', async () => {
  return { status: 'healthy', service: 'verification-service' };
});

// Route: Public Verification scan lookup (M-009 / M-010 clone detection)
server.post('/api/v1/verify/:gtin/:serial', async (request, reply) => {
  if (!(await rateLimit('verify', request.ip, RATE_LIMIT_VERIFY_MAX, RATE_LIMIT_WINDOW_MS))) {
    return reply.status(429).send({
      success: false,
      error: { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many verification requests. Please try again shortly.' }
    });
  }
  const { gtin, serial } = request.params as any;
  const { lat, lon, device_metadata } = request.body as any;

  if (!gtin || !serial) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing GTIN or Serial parameter.' }
    });
  }

  return withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, async (client) => {
  // 1. Query unit code & lot context
  const query = `
    SELECT u.id, u.serial, u.gtin, u.current_state, u.clone_flag,
           l.id as lot_id, l.revocation_status, l.lab_status,
           r.result_summary, r.report_reference
    FROM unit_codes u
    JOIN lots l ON u.lot_id = l.id
    LEFT JOIN lab_results r ON r.lot_id = l.id
    WHERE u.gtin = $1 AND u.serial = $2
  `;
  const result = await client.query(query, [gtin, serial]);

  if (result.rowCount === 0) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'CODE_NOT_FOUND',
        message: 'The requested product QR code identity record was not found.'
      }
    });
  }

  const codeRecord = result.rows[0];
  let finalVerdict = 'VERIFIED';
  let isCloneSuspect = codeRecord.clone_flag;

  // 2. Evaluate revocation status (M-011)
  if (codeRecord.revocation_status === 'REVOKED' || codeRecord.current_state === 'REVOKED') {
    finalVerdict = 'REVOKED';
  } else {
    // 3. Clone detection checks (M-010 geovelocity calculations)
    if (lat !== undefined && lon !== undefined) {
      // Find the previous scan event for this unit code
      const prevScanRes = await client.query(
        'SELECT * FROM scan_events WHERE unit_code_id = $1 ORDER BY timestamp DESC LIMIT 1',
        [codeRecord.id]
      );

      if (prevScanRes.rowCount && prevScanRes.rowCount > 0) {
        const prevScan = prevScanRes.rows[0];
        const prevLoc = prevScan.location;
        
        if (prevLoc && prevLoc.lat !== undefined && prevLoc.lon !== undefined) {
          const distanceKm = getHaversineDistance(
            parseFloat(prevLoc.lat),
            parseFloat(prevLoc.lon),
            parseFloat(lat),
            parseFloat(lon)
          );
          
          const timeDiffHours = (Date.now() - new Date(prevScan.timestamp).getTime()) / 3600000;
          
          // If time diff is positive and velocity exceeds speed limits (e.g. 800 km/h)
          if (timeDiffHours > 0) {
            const velocity = distanceKm / timeDiffHours;
            if (velocity > 800) {
              isCloneSuspect = true;
              finalVerdict = 'CLONE-SUSPECT';
              
              // Flag record in DB
              await client.query('UPDATE unit_codes SET clone_flag = TRUE WHERE id = $1', [codeRecord.id]);
            }
          }
        }
      }
    }
  }

  // 4. Save this scan event
  await client.query(
    `INSERT INTO scan_events (unit_code_id, location, device_metadata, verdict)
     VALUES ($1, $2, $3, $4)`,
    [
      codeRecord.id,
      JSON.stringify(lat !== undefined && lon !== undefined ? { lat, lon } : null),
      JSON.stringify(device_metadata || {}),
      finalVerdict
    ]
  );

  return {
    success: true,
    data: {
      verdict: finalVerdict,
      gtin: codeRecord.gtin,
      serial: codeRecord.serial,
      cloneSuspect: isCloneSuspect,
      productMetadata: codeRecord.product_metadata,
      labResult: codeRecord.result_summary ? {
        status: codeRecord.result_summary,
        reportUrl: codeRecord.report_reference
      } : null
    }
  };
  });
});

// Route: Public Verification lookup by secure public identifier
server.post('/api/v1/verify/v/:public_identifier', async (request, reply) => {
  if (!(await rateLimit('verify', request.ip, RATE_LIMIT_VERIFY_MAX, RATE_LIMIT_WINDOW_MS))) {
    return reply.status(429).send({
      success: false,
      error: { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many verification requests. Please try again shortly.' }
    });
  }
  const { public_identifier } = request.params as any;
  const { lat, lon, device_metadata } = request.body as any;

  // Validate UUIDv4 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!public_identifier || !uuidRegex.test(public_identifier)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_IDENTIFIER',
        message: 'The provided public identifier is malformed or invalid.'
      }
    });
  }

  let investigationLedgerEvent: Record<string, unknown> | null = null;
  const response = await withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, async (client) => {
  // 1. Query unit code & lot & budget context using public_identifier
  const query = `
    SELECT u.id, u.serial, u.gtin, u.current_state, u.clone_flag,
           l.id as lot_id, l.revocation_status, l.lab_status, l.product_metadata,
           b.effective_end_date,
           r.result_summary, r.report_reference,
           (SELECT COUNT(*) FROM scan_events WHERE unit_code_id = u.id) as real_scan_count
    FROM unit_codes u
    JOIN lots l ON u.lot_id = l.id
    JOIN budgets b ON l.budget_id = b.id
    LEFT JOIN lab_results r ON r.lot_id = l.id
    WHERE u.public_identifier = $1
  `;
  const result = await client.query(query, [public_identifier]);

  if (result.rowCount === 0) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'UNKNOWN_CODE',
        message: 'The requested product QR code identity record was not found.'
      }
    });
  }

  const codeRecord = result.rows[0];
  let finalStatus = 'VERIFIED';
  let isCloneSuspect = codeRecord.clone_flag;

  // 2. Evaluate validity states: VERIFIED, REVOKED, EXPIRED, UNKNOWN
  const isExpired = new Date(codeRecord.effective_end_date) < new Date();
  
  if (codeRecord.revocation_status === 'REVOKED' || codeRecord.current_state === 'REVOKED') {
    finalStatus = 'REVOKED';
  } else if (isExpired) {
    finalStatus = 'EXPIRED';
  }

  // 1.5 Dynamic geovelocity clone detection
  const lastScanQuery = `
    SELECT timestamp, location
    FROM scan_events
    WHERE unit_code_id = $1
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const lastScanResult = await client.query(lastScanQuery, [codeRecord.id]);

  if (lastScanResult.rows.length > 0 && lat !== undefined && lon !== undefined) {
    const prevScan = lastScanResult.rows[0];
    let prevLoc = null;
    try {
      prevLoc = typeof prevScan.location === 'string' ? JSON.parse(prevScan.location) : prevScan.location;
    } catch (e) {}

    if (prevLoc && prevLoc.lat !== undefined && prevLoc.lon !== undefined) {
      const distance = getHaversineDistance(prevLoc.lat, prevLoc.lon, parseFloat(lat), parseFloat(lon));
      const timeDiffMs = Date.now() - new Date(prevScan.timestamp).getTime();
      const hours = timeDiffMs / (1000 * 60 * 60);

      // If scanned in a different location in less than a minimal threshold, or speed > 500 km/h
      if (distance > 5) {
        const speed = hours > 0 ? distance / hours : Infinity;
        if (speed > 500 || hours < 0.05) {
          isCloneSuspect = true;
          await client.query('UPDATE unit_codes SET clone_flag = true WHERE id = $1', [codeRecord.id]);
        }
      }
    }
  }

  // Define default risk level based on clone_flag (LOW or CRITICAL)
  const finalRisk: string = isCloneSuspect ? 'CRITICAL' : 'LOW';

  // 3. Save this scan event
  await client.query(
    `INSERT INTO scan_events (unit_code_id, location, device_metadata, verdict)
     VALUES ($1, $2, $3, $4)`,
    [
      codeRecord.id,
      JSON.stringify(lat !== undefined && lon !== undefined ? { lat, lon } : null),
      JSON.stringify(device_metadata || {}),
      finalStatus
    ]
  );

  // 3.5 Automatically create Investigation Case if risk is CRITICAL or HIGH
  if (finalRisk === 'CRITICAL' || finalRisk === 'HIGH') {
    // Check if open case already exists to prevent duplicate timeline spam
    const existingCheck = await client.query(
      `SELECT id FROM investigations WHERE public_identifier = $1 AND status IN ('OPEN', 'UNDER_REVIEW')`,
      [public_identifier]
    );

    if (existingCheck.rows.length === 0) {
      // Query historical scans for evidence
      const scansRes = await client.query(
        `SELECT timestamp, location, device_metadata, verdict FROM scan_events WHERE unit_code_id = $1 ORDER BY timestamp DESC`,
        [codeRecord.id]
      );

      const evidence = {
        verification_timeline: [
          { name: 'Product Minted', status: '✓ Completed' },
          { name: 'Organic Certificate Approved', status: '✓ Completed' },
          { name: 'Laboratory Verified', status: '✓ Completed' },
          { name: 'Packaged', status: '✓ Completed' },
          { name: 'Distribution Started', status: '✓ Completed' }
        ],
        historical_scan_events: scansRes.rows.map(s => ({
          timestamp: s.timestamp,
          location: s.location || { country: 'India' },
          verdict: s.verdict,
          device: s.device_metadata
        })),
        risk_factors: [
          "Duplicate scan detected: Clone suspect check triggered",
          "Potential counterfeit: Identical QR code scanned multiple times"
        ],
        current_product_status: finalStatus,
        current_risk_level: finalRisk,
        investigation_reason: "High risk clone detection rule triggered: code copy suspect",
        transparency_timeline: [
          { name: 'Investigation Opened', status: '⚠ Under Investigation' }
        ]
      };

      await client.query(`
        INSERT INTO investigations (
          product_name, public_identifier, risk_level, status, detection_reason,
          manufacturer, current_product_status, evidence, unit_code_id
        )
        VALUES ($1, $2, $3, 'OPEN', $4, $5, $6, $7, $8)
        ON CONFLICT (public_identifier) DO UPDATE
        SET status = 'OPEN',
            unit_code_id = EXCLUDED.unit_code_id,
            updated_at = CURRENT_TIMESTAMP
      `, [
        (codeRecord.product_metadata as any)?.name || 'Organic White Honey',
        public_identifier,
        finalRisk,
        'Clone suspect flag tripped due to anomalous scanning frequency',
        (codeRecord.product_metadata as any)?.manufacturer || 'Premium Farms',
        finalStatus,
        JSON.stringify(evidence),
        codeRecord.id
      ]);

      investigationLedgerEvent = {
        entity_type: 'INVESTIGATION',
        entity_id: public_identifier,
        event_type: 'INVESTIGATION_CREATED',
        payload: {
          public_identifier,
          risk_level: finalRisk,
          reason: 'Clone suspect flag tripped due to anomalous scanning frequency'
        }
      };
    }
  }

  // Compute dynamic scan count (this scan + prior scans)
  const realScanCount = parseInt(codeRecord.real_scan_count || '0') + 1;
  const productMetadata = {
    ...codeRecord.product_metadata,
    scan_count: realScanCount.toString()
  };

  return {
    success: true,
    data: {
      status: finalStatus,
      risk: finalRisk,
      gtin: codeRecord.gtin,
      serial: codeRecord.serial,
      productMetadata: productMetadata,
      labResult: codeRecord.result_summary ? {
        status: codeRecord.result_summary,
        reportUrl: codeRecord.report_reference
      } : null
    }
  };
  });

  if (investigationLedgerEvent) {
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_TOKEN },
        body: JSON.stringify(investigationLedgerEvent)
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append INVESTIGATION_CREATED to transparency ledger');
    }
  }
  return response;
});

function sendCapacityFailure(reply: FastifyReply, failure: any) {
  return reply.status(failure.statusCode).send({
    success: false,
    error: {
      statusCode: failure.statusCode,
      code: failure.code,
      message: failure.message
    }
  });
}

// Route: Public simulation registration for Manufacturer Console (persists generated QR/record in DB)
server.post('/api/v1/verify/register', {
  preValidation: [server.authenticate, server.authorize(PRODUCER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { public_identifier, gtin, serial, verification_url, qr_code_data_uri, product_metadata, lot_id } = request.body as any;

  if (!public_identifier || !gtin || !serial || !verification_url) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing public_identifier, gtin, serial, or verification_url in request body.'
      }
    });
  }

  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {

    let lotUuid;
    if (lot_id) {
      const capacity = await reserveLotIssuance(client, lot_id, user.orgId, 1);
      if (!capacity.ok) return sendCapacityFailure(reply, capacity);
      lotUuid = lot_id;
    } else {
      // No explicit lot: draw down exactly one unit of budget capacity atomically and
      // create a single-unit lot, so this quick path can never over-issue.
      const budgetRes = await client.query(
        `SELECT b.id
         FROM budgets b
         JOIN producers p ON p.id = b.producer_id
         WHERE p.organization_id = $1
           AND b.status = 'ACTIVE'
         ORDER BY b.created_at DESC
         LIMIT 1
         FOR UPDATE OF b
         FOR SHARE OF p`,
        [user.orgId]
      );
      if (budgetRes.rowCount === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'NO_ACTIVE_BUDGET',
            message: 'No active budget found for your organization. Please request a budget and obtain certifier approval.'
          }
        });
      }
      const capacity = await reserveBudgetCapacity(client, budgetRes.rows[0].id, user.orgId, 1);
      if (!capacity.ok) return sendCapacityFailure(reply, capacity);
      const lotInsert = await client.query(`
        INSERT INTO lots (id, producer_id, budget_id, product_metadata, batch_size, processing_dates, lab_status)
        VALUES (uuid_generate_v4(), $1, $2, $3, 1, '{}', 'PASSED')
        RETURNING id
      `, [capacity.budget.producer_id, capacity.budget.id, JSON.stringify(product_metadata || { name: 'Organic White Honey', manufacturer: 'Premium Farms' })]);
      lotUuid = lotInsert.rows[0].id;
    }

    // Insert Lab Result for the Lot if not exists
    await client.query(`
      INSERT INTO lab_results (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
      VALUES ($1, 'Intertek India Labs', 'Purity Certification Test', 'PASS', 'hash_lab_default', 'NABL-INTK-2026-10492')
      ON CONFLICT (lot_id) DO NOTHING
    `, [lotUuid]);

    // 4. Insert Unit Code
    const digital_link_uri = `https://id.capmint.io/01/${gtin}/21/${serial}`;
    await client.query(`
      INSERT INTO unit_codes (lot_id, serial, gtin, digital_link_uri, public_identifier, verification_url, qr_code_data_uri, current_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'MINTED')
      ON CONFLICT (public_identifier) DO NOTHING
    `, [lotUuid, serial, gtin, digital_link_uri, public_identifier, verification_url, qr_code_data_uri]);
    return { success: true, message: 'Verification record persisted successfully.' };
  });
});

// Route: Explicit Lot Creation for Manufacturers
server.post('/api/v1/lots', {
  preValidation: [server.authenticate, server.authorize(PRODUCER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { budget_id, product_metadata, batch_size, processing_dates } = request.body as any;
  const user = request.user as any;

  if (!budget_id || !batch_size) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, message: 'Missing budget_id or batch_size.' }
    });
  }

  const quantity = parseFloat(batch_size);
  if (isNaN(quantity) || quantity <= 0) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, message: 'Batch size must be a positive numeric value.' }
    });
  }

  const response = await withAuthenticatedTenantTx(request, async (client) => {

    const capacity = await reserveBudgetCapacity(client, budget_id, user.orgId, quantity);
    if (!capacity.ok) return sendCapacityFailure(reply, capacity);

    // 3. Create Lot
    const lotRes = await client.query(
      `INSERT INTO lots (id, producer_id, budget_id, product_metadata, batch_size, processing_dates, lab_status)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'PENDING')
       RETURNING *`,
      [capacity.budget.producer_id, budget_id, JSON.stringify(product_metadata || {}), quantity, JSON.stringify(processing_dates || {})]
    );

    const lotUuid = lotRes.rows[0].id;

    return {
      success: true,
      data: { lot: lotRes.rows[0] },
      ledgerEvent: {
        entity_type: 'LOT', entity_id: lotUuid, event_type: 'LOT_CREATED',
        payload: { lot_id: lotUuid, budget_id, batch_size: quantity, product_metadata }
      }
    };
  });
  if (response.success) {
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_TOKEN },
        body: JSON.stringify(response.ledgerEvent)
      });
    } catch (ledgerErr) {
      server.log.error(ledgerErr as any, 'Failed to log lot creation to transparency ledger');
    }
  }
  const { ledgerEvent, ...body } = response;
  return body;
});

// Route: Assign an activated NABL laboratory to a certifier-controlled lot
server.post('/api/v1/lots/:id/assign-laboratory', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { laboratory_organization_id } = (request.body || {}) as any;
  const user = request.user as any;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id || '') || !uuidPattern.test(laboratory_organization_id || '')) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'A valid laboratory_organization_id is required.'
      }
    });
  }

  return withAuthenticatedTenantTx(request, async (client) => {

    const lotResult = await lockCertifierLotForLaboratoryAssignment(client, id, user.orgId);
    if (lotResult.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    const laboratoryResult = await client.query(
      `SELECT id
       FROM organizations
       WHERE id = $1
         AND type = 'NABL_LABORATORY'
         AND status = 'ACTIVATED'`,
      [laboratory_organization_id]
    );
    if (laboratoryResult.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Activated laboratory not found.'
        }
      });
    }

    if (lotResult.rows[0].assigned_laboratory_organization_id !== laboratory_organization_id) {
      await client.query(
        `UPDATE lots
         SET assigned_laboratory_organization_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, laboratory_organization_id]
      );
    }
    return {
      success: true,
      data: {
        lot: {
          id,
          assigned_laboratory_organization_id: laboratory_organization_id
        }
      }
    };
  });
});

// Route: Export Lot Unit Codes as CSV
server.get('/api/v1/lots/:id/export/csv', {
  preValidation: [server.authenticate, server.authorize(OPERATIONAL_READ_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;

  return withAuthenticatedTenantTx(request, async (client) => {
  const scopedRows = await loadScopedLotCodes(client, id, user);
  if (scopedRows.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' } });
  }

  const unitCodes = scopedRows.rows.filter(row => row.public_identifier !== null);

  let csvContent = 'public_identifier,gtin,serial,digital_link_uri,verification_url\n';
  unitCodes.forEach(row => {
    csvContent += `"${row.public_identifier}","${row.gtin}","${row.serial}","${row.digital_link_uri}","${row.verification_url}"\n`;
  });

  reply
    .header('Content-Type', 'text/csv')
    .header('Content-Disposition', `attachment; filename=lot_export_${id}.csv`)
    .send(csvContent);
  });
});

// Route: Export Lot Unit Codes as print-ready PDF data sheet
server.get('/api/v1/lots/:id/export/pdf', {
  preValidation: [server.authenticate, server.authorize(OPERATIONAL_READ_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;

  return withAuthenticatedTenantTx(request, async (client) => {
  const scopedRows = await loadScopedLotCodes(client, id, user);
  if (scopedRows.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' } });
  }

  const unitCodes = scopedRows.rows.filter(row => row.public_identifier !== null);

  // Return a structured JSON listing to represent the print-sheet layout
  return {
    success: true,
    data: {
      lot_id: id,
      product_name: scopedRows.rows[0].product_metadata?.name || 'Organic White Honey',
      sheet_format: 'A4 Grid (3x8 stickers)',
      total_codes: unitCodes.length,
      print_ready_codes: unitCodes.map(row => ({
        public_id: row.public_identifier,
        gtin: row.gtin,
        serial: row.serial,
        digital_link: row.digital_link_uri,
        qr_border_color: '#000000',
        label: `GTIN: ${row.gtin} SN: ${row.serial}`
      }))
    }
  };
  });
});

// Route: Assign Caseworker to Investigation
server.post('/api/v1/verify/investigations/:id/assign', {
  preValidation: [server.authenticate, server.authorize(INVESTIGATION_MUTATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { assigned_to } = request.body as any;
  const user = request.user as any;

  if (!assigned_to) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Missing assigned_to UUID.' } });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
    const investigation = await lockInvestigationForActor(client, id, user);
    if (investigation.rowCount === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' } });
    }

    const assignee = isSystemAdministrator(user)
      ? await client.query('SELECT id FROM users WHERE id = $1 AND status = $2', [assigned_to, 'ACTIVE'])
      : await client.query(
          'SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND status = $3',
          [assigned_to, user.orgId, 'ACTIVE']
        );
    if (assignee.rowCount === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Assignee not found.' } });
    }

    const timelineEntry = {
      timestamp: new Date().toISOString(),
      event: 'CASE_ASSIGNED',
      author: user.username,
      details: `Investigation assigned to caseworker ID: ${assigned_to}`
    };
    const result = await client.query(
      `UPDATE investigations
       SET assigned_to = $2,
           evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, assigned_to, JSON.stringify([timelineEntry])]
    );
    return { success: true, data: { investigation: result.rows[0] } };
  });
});

// Route: Add Case Notes to Investigation
server.post('/api/v1/verify/investigations/:id/notes', {
  preValidation: [server.authenticate, server.authorize(INVESTIGATION_MUTATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { note_text } = request.body as any;
  const user = request.user as any;

  if (!note_text) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Missing note_text.' } });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
    const investigation = await lockInvestigationForActor(client, id, user);
    if (investigation.rowCount === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' } });
    }

    const noteEntry = { timestamp: new Date().toISOString(), author: user.username, note: note_text };
    const timelineEntry = {
      timestamp: new Date().toISOString(),
      event: 'NOTE_ADDED',
      author: user.username,
      details: 'Caseworker added a case note'
    };
    const result = await client.query(
      `UPDATE investigations
       SET case_notes = COALESCE(case_notes, '[]'::jsonb) || $2::jsonb,
           evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify([noteEntry]), JSON.stringify([timelineEntry])]
    );
    return { success: true, data: { investigation: result.rows[0] } };
  });
});

// Route: Escalate Investigation Severity
server.post('/api/v1/verify/investigations/:id/escalate', {
  preValidation: [server.authenticate, server.authorize(INVESTIGATION_MUTATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { risk_level } = request.body as any;
  const user = request.user as any;

  if (!risk_level) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Missing risk_level.' } });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
    const investigation = await lockInvestigationForActor(client, id, user);
    if (investigation.rowCount === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' } });
    }

    const timelineEntry = {
      timestamp: new Date().toISOString(),
      event: 'CASE_ESCALATED',
      author: user.username,
      details: `Threat level escalated to ${risk_level}`
    };
    const result = await client.query(
      `UPDATE investigations
       SET risk_level = $2,
           status = 'ESCALATED',
           evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, risk_level, JSON.stringify([timelineEntry])]
    );
    return { success: true, data: { investigation: result.rows[0] } };
  });
});

// Route: Close/Resolve Investigation
server.post('/api/v1/verify/investigations/:id/close', {
  preValidation: [server.authenticate, server.authorize(INVESTIGATION_MUTATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { closure_status, notes } = request.body as any;
  const user = request.user as any;

  const finalStatus = closure_status || 'CLOSED';
  const allowedClosureStatuses = ['RESOLVED', 'CLOSED'];
  if (!allowedClosureStatuses.includes(finalStatus)) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Invalid closure status.' } });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
    const investigation = await lockInvestigationForActor(client, id, user);
    if (investigation.rowCount === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' } });
    }

    const timelineEntry = {
      timestamp: new Date().toISOString(),
      event: 'CASE_CLOSED',
      author: user.username,
      details: `Investigation closed as ${finalStatus}. Notes: ${notes || ''}`
    };
    const result = await client.query(
      `UPDATE investigations
       SET status = $2,
           evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, finalStatus, JSON.stringify([timelineEntry])]
    );
    return { success: true, data: { investigation: result.rows[0] } };
  });
});

// Route: Public simulation revocation for Manufacturer Console
server.post('/api/v1/verify/revoke', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { batch_id, reason } = request.body as any;
  const user = request.user as any;

  if (!batch_id) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing batch_id in request body.'
      }
    });
  }

  return withAuthenticatedTenantTx(request, async (client) => {

    const lotRes = await client.query(
      `SELECT l.id
       FROM lots l
       JOIN budgets b ON b.id = l.budget_id
       JOIN certifiers c ON c.id = b.certifier_id
       WHERE l.product_metadata->>'batch_id' = $1
         AND c.organization_id = $2
       FOR UPDATE OF l
       FOR SHARE OF c`,
      [batch_id, user.orgId]
    );

    if (lotRes.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Batch not found.' }
      });
    }

    const lotIds = lotRes.rows.map(row => row.id);
    const revocationReason = reason || 'Organic certification withdrawn';
    await client.query(
      `UPDATE lots
       SET revocation_status = 'REVOKED',
           product_metadata = product_metadata || jsonb_build_object('revocation_reason', $2::text, 'revocation_date', CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1)`,
      [lotIds, revocationReason]
    );
    await client.query(
      `UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE lot_id = ANY($1)`,
      [lotIds]
    );
    return { success: true, message: `Batch ${batch_id} and all associated unit codes cascade revoked successfully in simulation.` };
  });
});

// Route: Cascade Revocation (M-011)
server.post('/api/v1/lots/:id/revoke', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;

  return withAuthenticatedTenantTx(request, async (client) => {

    const lotRes = await lockCertifierLot(client, id, user.orgId);
    if (lotRes.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    // CERT-04: Revoke already revoked lot -> No duplicate action
    if (lotRes.rows[0].revocation_status === 'REVOKED') {
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'ALREADY_REVOKED',
          message: 'Lot has already been revoked. No duplicate action taken.'
        }
      });
    }

    // 2. Cascade update lot status
    await client.query(
      `UPDATE lots SET revocation_status = 'REVOKED', certification_status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // 3. Cascade update associated unit codes to REVOKED status
    await client.query(
      `UPDATE unit_codes
       SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
       WHERE lot_id = $1`,
      [id]
    );

    return {
      success: true,
      message: 'Lot and all associated unit codes cascade revoked successfully.'
    };
  });
});

// Route: Certify Lot (Certification Body only)
server.post('/api/v1/lots/:id/certify', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;

  return withAuthenticatedTenantTx(request, async (client) => {

    const lotRes = await lockCertifierLot(client, id, user.orgId);
    if (lotRes.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    const lot = lotRes.rows[0];

    // CERT-02: Certify failed lot -> Rejected
    if (lot.lab_status === 'FAILED' || lot.revocation_status === 'REVOKED') {
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'INVALID_LOT_STATE',
          message: 'Cannot certify a lot that has failed laboratory testing or is revoked.'
        }
      });
    }

    // 2. Check if lab result report exists
    const labCheck = await client.query('SELECT result_summary FROM lab_results WHERE lot_id = $1', [id]);
    
    // CERT-01: Certify lot without lab report -> Rejected
    if (labCheck.rowCount === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'NO_LAB_REPORT',
          message: 'Lot cannot be certified without a registered NABL laboratory report.'
        }
      });
    }

    // CERT-03: Certify already certified lot -> Conflict
    if (lot.product_metadata?.certification_status === 'CERTIFIED') {
      return reply.status(409).send({
        success: false,
        error: {
          statusCode: 409,
          code: 'ALREADY_CERTIFIED',
          message: 'This lot has already been certified.'
        }
      });
    }

    // 3. Update lot metadata to mark it as certified
    const updatedMetadata = {
      ...lot.product_metadata,
      certification_status: 'CERTIFIED',
      certified_at: new Date().toISOString()
    };

    await client.query(
      `UPDATE lots SET product_metadata = $1, certification_status = 'CERTIFIED', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(updatedMetadata), id]
    );

    // 4. Append to Transparency Ledger
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_TOKEN },
        body: JSON.stringify({
          entity_type: 'LOT',
          entity_id: id,
          event_type: 'LOT_CERTIFIED',
          payload: { lot_id: id, certified_by: (request.user as any).orgId }
        })
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append LOT_CERTIFIED event to ledger');
    }
    return {
      success: true,
      message: 'Lot successfully certified.'
    };
  });
});

// Route: Get all unit codes
server.get('/api/v1/verify/unit-codes', {
  preValidation: [server.authenticate, server.authorize(OPERATIONAL_READ_SPECS)]
}, async (request, reply) => {
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
  let result;
  if (user.orgType === 'PRODUCER') {
    result = await client.query(
      `SELECT u.*, l.product_metadata
       FROM unit_codes u
       JOIN lots l ON l.id = u.lot_id
       JOIN budgets b ON b.id = l.budget_id
       JOIN producers p ON p.id = l.producer_id
       WHERE b.producer_id = l.producer_id
         AND p.organization_id = $1
       ORDER BY u.minted_at DESC`,
      [user.orgId]
    );
  } else if (user.orgType === 'CERTIFICATION_BODY') {
    result = await client.query(
      `SELECT u.*, l.product_metadata
       FROM unit_codes u
       JOIN lots l ON l.id = u.lot_id
       JOIN budgets b ON b.id = l.budget_id
       JOIN certifiers c ON c.id = b.certifier_id
       WHERE c.organization_id = $1
       ORDER BY u.minted_at DESC`,
      [user.orgId]
    );
  } else if (isSystemAdministrator(user)) {
    result = await client.query(`
      SELECT u.*, l.product_metadata
      FROM unit_codes u
      JOIN lots l ON l.id = u.lot_id
      ORDER BY u.minted_at DESC
    `);
  } else {
    return reply.status(403).send({ success: false, error: { statusCode: 403, code: 'FORBIDDEN', message: 'You do not have permission to list unit codes.' } });
  }
  return {
    success: true,
    data: {
      unitCodes: result.rows.map(row => ({
        lotId: row.lot_id,
        serial: row.serial,
        gtin: row.gtin,
        public_identifier: row.public_identifier,
        verification_url: row.verification_url,
        qrCodeDataUri: row.qr_code_data_uri,
        state: row.current_state,
        clone_flag: row.clone_flag,
        productMetadata: row.product_metadata
      }))
    }
  };
  });
});

// Route: Get all lots
server.get('/api/v1/verify/lots', {
  preValidation: [server.authenticate, server.authorize(LOT_READ_SPECS)]
}, async (request, reply) => {
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
  let result;
  if (user.orgType === 'PRODUCER') {
    result = await client.query(
      `SELECT l.*
       FROM lots l
       JOIN budgets b ON b.id = l.budget_id
       JOIN producers p ON p.id = l.producer_id
       WHERE b.producer_id = l.producer_id
         AND p.organization_id = $1
       ORDER BY l.created_at DESC`,
      [user.orgId]
    );
  } else if (user.orgType === 'CERTIFICATION_BODY') {
    result = await client.query(
      `SELECT l.*
       FROM lots l
       JOIN budgets b ON b.id = l.budget_id
       JOIN certifiers c ON c.id = b.certifier_id
       WHERE c.organization_id = $1
       ORDER BY l.created_at DESC`,
      [user.orgId]
    );
  } else if (user.orgType === 'NABL_LABORATORY') {
    result = await client.query(
      `SELECT l.*
       FROM lots l
       JOIN organizations o
         ON o.id = l.assigned_laboratory_organization_id
       WHERE l.assigned_laboratory_organization_id = $1
         AND o.type = 'NABL_LABORATORY'
         AND o.status = 'ACTIVATED'
       ORDER BY l.created_at DESC`,
      [user.orgId]
    );
  } else if (isSystemAdministrator(user)) {
    result = await client.query('SELECT * FROM lots ORDER BY created_at DESC');
  } else {
    return reply.status(403).send({ success: false, error: { statusCode: 403, code: 'FORBIDDEN', message: 'You do not have permission to list lots.' } });
  }
  return {
    success: true,
    data: {
      lots: result.rows.map(row => ({
        id: row.id,
        budgetId: row.budget_id,
        crop: row.product_metadata?.name || 'Organic White Honey',
        weight: parseFloat(row.batch_size),
        status: row.revocation_status === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
        product_metadata: row.product_metadata,
        lab_status: row.lab_status,
        revocation_status: row.revocation_status,
        certification_status: row.certification_status,
        certificationStatus: row.certification_status
      }))
    }
  };
  });
});

// Route: List Investigations
server.get('/api/v1/verify/investigations', {
  preValidation: [server.authenticate, server.authorize(INVESTIGATION_MUTATION_SPECS)]
}, async (request, reply) => {
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
  const result = isSystemAdministrator(user)
    ? await client.query('SELECT * FROM investigations ORDER BY created_at DESC')
    : await client.query(
        `SELECT i.*
         FROM investigations i
         JOIN unit_codes u ON u.id = i.unit_code_id
         JOIN lots l ON l.id = u.lot_id
         JOIN budgets b ON b.id = l.budget_id
         JOIN certifiers c ON c.id = b.certifier_id
         WHERE c.organization_id = $1
         ORDER BY i.created_at DESC`,
        [user.orgId]
      );
  return {
    success: true,
    data: {
      investigations: result.rows.map(row => ({
        id: row.id,
        product_name: row.product_name,
        public_identifier: row.public_identifier,
        risk_level: row.risk_level,
        status: row.status,
        detection_time: row.detection_time,
        detection_reason: row.detection_reason,
        manufacturer: row.manufacturer,
        current_product_status: row.current_product_status,
        evidence: row.evidence
      }))
    }
  };
  });
});

// Route: Get Investigation Details
server.get('/api/v1/verify/investigations/:id', {
  preValidation: [server.authenticate, server.authorize(INVESTIGATION_MUTATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
  const result = isSystemAdministrator(user)
    ? await client.query('SELECT * FROM investigations WHERE id = $1', [id])
    : await client.query(
        `SELECT i.*
         FROM investigations i
         JOIN unit_codes u ON u.id = i.unit_code_id
         JOIN lots l ON l.id = u.lot_id
         JOIN budgets b ON b.id = l.budget_id
         JOIN certifiers c ON c.id = b.certifier_id
         WHERE i.id = $1
           AND c.organization_id = $2`,
        [id, user.orgId]
      );
  if (result.rows.length === 0) {
    return reply.status(404).send({
      success: false,
      error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
    });
  }
  const row = result.rows[0];
  return {
    success: true,
    data: {
      investigation: {
        id: row.id,
        product_name: row.product_name,
        public_identifier: row.public_identifier,
        risk_level: row.risk_level,
        status: row.status,
        detection_time: row.detection_time,
        detection_reason: row.detection_reason,
        manufacturer: row.manufacturer,
        current_product_status: row.current_product_status,
        evidence: row.evidence
      }
    }
  };
  });
});

// Route: Approve Revocation
server.post('/api/v1/verify/investigations/:id/approve', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;
  let ledgerPublicIdentifier = '';
  let ledgerReason = '';
  const response = await withAuthenticatedTenantTx(request, async (client) => {

    // 1. Fetch Investigation
    const invRes = await lockCertifierInvestigation(client, id, user.orgId);
    if (invRes.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
      });
    }

    const inv = invRes.rows[0];
    const pubId = inv.public_identifier;

    // 2. The scoped lock already resolved and locked the linked unit and lot.
    await client.query(
      `UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [inv.unit_code_id]
    );

    // 3. Update Lot revocation status to REVOKED
    await client.query(
      `UPDATE lots
       SET revocation_status = 'REVOKED',
           product_metadata = product_metadata || jsonb_build_object('revocation_reason', $2::text, 'revocation_date', CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [inv.linked_lot_id, inv.detection_reason]
    );

    // 4. Update Investigation Status to REVOKED (resolved state)
    await client.query(
      `UPDATE investigations SET status = 'REVOKED', current_product_status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    ledgerPublicIdentifier = pubId;
    ledgerReason = inv.detection_reason;
    return {
      success: true,
      message: 'Investigation approved and product officially revoked.'
    };
  });

  if (ledgerPublicIdentifier) {
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_TOKEN },
        body: JSON.stringify({
          entity_type: 'INVESTIGATION',
          entity_id: ledgerPublicIdentifier,
          event_type: 'INVESTIGATION_APPROVED',
          payload: {
            investigation_id: id,
            public_identifier: ledgerPublicIdentifier,
            action: 'REVOCATION_APPROVED',
            reason: ledgerReason
          }
        })
      });

      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_TOKEN },
        body: JSON.stringify({
          entity_type: 'PRODUCT',
          entity_id: ledgerPublicIdentifier,
          event_type: 'PRODUCT_REVOKED',
          payload: {
            public_identifier: ledgerPublicIdentifier,
            reason: ledgerReason
          }
        })
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append to ledger during approval');
    }
  }
  return response;
});

// Route: Dismiss Investigation
server.post('/api/v1/verify/investigations/:id/dismiss', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;
  let publicIdentifier: string | null = null;
  const response = await withAuthenticatedTenantTx(request, async (client) => {

    // 1. Fetch Investigation
    const invRes = await lockCertifierInvestigation(client, id, user.orgId);
    if (invRes.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
      });
    }

    const inv = invRes.rows[0];
    const pubId = inv.public_identifier;

    // 2. Update status to DISMISSED
    await client.query(
      `UPDATE investigations SET status = 'DISMISSED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    publicIdentifier = pubId;
    return {
      success: true,
      message: 'Investigation successfully dismissed.'
    };
  });

  if (publicIdentifier) {
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_TOKEN },
        body: JSON.stringify({
          entity_type: 'INVESTIGATION',
          entity_id: publicIdentifier,
          event_type: 'INVESTIGATION_DISMISSED',
          payload: {
            investigation_id: id,
            public_identifier: publicIdentifier,
            action: 'INVESTIGATION_DISMISSED'
          }
        })
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append to ledger during dismissal');
    }
  }
  return response;
});

// Route: Register Lab Results
server.post('/api/v1/verify/lab-results', {
  preValidation: [server.authenticate, server.authorize(LAB_OPERATION_SPECS)]
}, async (request, reply) => {
  const {
    lot_id,
    lab_name,
    test_type,
    result_summary,
    report_hash,
    report_reference,
    pdf_content
  } = (request.body || {}) as any;
  const user = request.user as any;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(lot_id || '')) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'A valid lot_id is required.' }
    });
  }

  let ledgerEvents: Array<{ event_type: string; payload: Record<string, unknown> }> = [];
  let labResult: any;
  const response = await withAuthenticatedTenantTx(request, async (client) => {

    const scopedLot = await client.query(
      `SELECT l.id
       FROM lots l
       JOIN organizations o
         ON o.id = l.assigned_laboratory_organization_id
       WHERE l.id = $1
         AND l.assigned_laboratory_organization_id = $2
         AND o.type = 'NABL_LABORATORY'
         AND o.status = 'ACTIVATED'
       FOR UPDATE OF l
       FOR SHARE OF o`,
      [lot_id, user.orgId]
    );
    if (scopedLot.rowCount === 0) {
      return reply.status(403).send({
        success: false,
        error: {
          statusCode: 403,
          code: 'LAB_ASSIGNMENT_REQUIRED',
          message: 'This lot has no trusted laboratory assignment.'
        }
      });
    }

    if (!lab_name || !test_type || !result_summary || !report_hash) {
      return reply.status(400).send({
        success: false,
        error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing required lab result fields.' }
      });
    }

    const normalizedSummary = String(result_summary).toUpperCase();
    if (!['PASS', 'PASSED', 'FAIL', 'FAILED'].includes(normalizedSummary)) {
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'result_summary must be PASSED or FAILED.'
        }
      });
    }
    const dbResultSummary = normalizedSummary === 'PASS' || normalizedSummary === 'PASSED' ? 'PASS' : 'FAIL';
    const lotLabStatus = dbResultSummary === 'PASS' ? 'PASSED' : 'FAILED';

    if (pdf_content) {
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = Buffer.from(pdf_content, 'base64');
      } catch {
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'INVALID_PDF_CONTENT',
            message: 'Failed to decode and validate PDF content.'
          }
        });
      }
      if (pdfBuffer.length < 4 || pdfBuffer.toString('ascii', 0, 4) !== '%PDF') {
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'INVALID_PDF',
            message: 'Uploaded file is not a valid PDF document.'
          }
        });
      }
      const calculatedHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
      if (calculatedHash !== report_hash) {
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'HASH_MISMATCH',
            message: 'Uploaded PDF SHA-256 hash validation failed.'
          }
        });
      }
    }

    const existingResult = await client.query(
      'SELECT id, report_hash FROM lab_results WHERE lot_id = $1 FOR UPDATE',
      [lot_id]
    );
    const isReplacement = existingResult.rowCount !== 0;
    if (isReplacement && existingResult.rows[0].report_hash === report_hash) {
      return reply.status(409).send({
        success: false,
        error: {
          statusCode: 409,
          code: 'CONFLICT',
          message: 'A lab report with the same hash already exists for this lot.'
        }
      });
    }

    const result = isReplacement
      ? await client.query(
          `UPDATE lab_results
           SET lab_name = $2,
               test_type = $3,
               result_summary = $4,
               report_hash = $5,
               report_reference = $6,
               submitted_by_organization_id = $7,
               updated_at = CURRENT_TIMESTAMP
           WHERE lot_id = $1
           RETURNING id, lot_id, lab_name, test_type, result_summary,
                     report_hash, report_reference, created_at, updated_at`,
          [lot_id, lab_name, test_type, dbResultSummary, report_hash, report_reference || '', user.orgId]
        )
      : await client.query(
          `INSERT INTO lab_results
             (id, lot_id, lab_name, test_type, result_summary, report_hash,
              report_reference, submitted_by_organization_id)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7)
           RETURNING id, lot_id, lab_name, test_type, result_summary,
                     report_hash, report_reference, created_at, updated_at`,
          [lot_id, lab_name, test_type, dbResultSummary, report_hash, report_reference || '', user.orgId]
        );
    labResult = result.rows[0];

    await client.query(
      `UPDATE lots
       SET lab_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [lot_id, lotLabStatus]
    );

    if (isReplacement) {
      ledgerEvents.push({
        event_type: 'LOT_LAB_TEST_REPLACED',
        payload: { lot_id, lab_name, test_type, report_hash }
      });
    }

    if (dbResultSummary === 'FAIL') {
      await client.query(
        `UPDATE unit_codes
         SET current_state = 'REVOKED',
             revoked_at = CURRENT_TIMESTAMP
         WHERE lot_id = $1`,
        [lot_id]
      );
      await client.query(
        `UPDATE lots
         SET revocation_status = 'REVOKED',
             product_metadata = product_metadata
               || jsonb_build_object(
                    'revocation_reason',
                    'Laboratory test failed: ' || $2::text,
                    'revocation_date',
                    CURRENT_TIMESTAMP
                  ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [lot_id, test_type]
      );
      ledgerEvents.push({
        event_type: 'LOT_LAB_TEST_FAILED_CASCADING_REVOCATION',
        payload: { lot_id, lab_name, test_type, report_hash }
      });
    } else {
      ledgerEvents.push({
        event_type: 'LOT_LAB_TEST_PASSED',
        payload: { lot_id, lab_name, test_type, report_hash }
      });
    }
    return {
      success: true,
      data: { labResult }
    };
  });

  if (reply.sent) return response;
  for (const event of ledgerEvents) {
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SERVICE_TOKEN
        },
        body: JSON.stringify({
          entity_type: 'LOT',
          entity_id: lot_id,
          event_type: event.event_type,
          payload: event.payload
        })
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append laboratory event to ledger');
    }
  }

  return response;
});

// Start the server
const start = async () => {
  try {
    await assertRlsServiceRole(pgPool, 'verification-service');
    const port = parseInt(process.env.PORT || '8086', 10);

    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Verification service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  start();
}
