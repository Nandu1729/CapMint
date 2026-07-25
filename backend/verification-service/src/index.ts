import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

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
  secret: JWT_SECRET
});

// Decorators: authenticate / authorize
server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    server.log.info({ authHeader: request.headers.authorization }, 'Received auth header');
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

// Initialize PostgreSQL Client Pool
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
});

// Initialize Redis Client
const redisClient = new Redis(process.env.REDIS_URL || 'redis://:capmint_redis_secure_password@localhost:6379/0');

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
  const { gtin, serial } = request.params as any;
  const { lat, lon, device_metadata } = request.body as any;

  if (!gtin || !serial) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing GTIN or Serial parameter.' }
    });
  }

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
  const result = await pgPool.query(query, [gtin, serial]);

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
      const prevScanRes = await pgPool.query(
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
              await pgPool.query('UPDATE unit_codes SET clone_flag = TRUE WHERE id = $1', [codeRecord.id]);
            }
          }
        }
      }
    }
  }

  // 4. Save this scan event
  await pgPool.query(
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

// Route: Public Verification lookup by secure public identifier
server.post('/api/v1/verify/v/:public_identifier', async (request, reply) => {
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
  const result = await pgPool.query(query, [public_identifier]);

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
  const lastScanResult = await pgPool.query(lastScanQuery, [codeRecord.id]);

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
          await pgPool.query('UPDATE unit_codes SET clone_flag = true WHERE id = $1', [codeRecord.id]);
        }
      }
    }
  }

  // Define default risk level based on clone_flag (LOW or CRITICAL)
  const finalRisk: string = isCloneSuspect ? 'CRITICAL' : 'LOW';

  // 3. Save this scan event
  await pgPool.query(
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
    const existingCheck = await pgPool.query(
      `SELECT id FROM investigations WHERE public_identifier = $1 AND status IN ('OPEN', 'UNDER_REVIEW')`,
      [public_identifier]
    );

    if (existingCheck.rows.length === 0) {
      // Query historical scans for evidence
      const scansRes = await pgPool.query(
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

      await pgPool.query(`
        INSERT INTO investigations (
          product_name, public_identifier, risk_level, status, detection_reason, manufacturer, current_product_status, evidence
        )
        VALUES ($1, $2, $3, 'OPEN', $4, $5, $6, $7)
        ON CONFLICT (public_identifier) DO UPDATE
        SET status = 'OPEN', updated_at = CURRENT_TIMESTAMP
      `, [
        (codeRecord.product_metadata as any)?.name || 'Organic White Honey',
        public_identifier,
        finalRisk,
        'Clone suspect flag tripped due to anomalous scanning frequency',
        (codeRecord.product_metadata as any)?.manufacturer || 'Premium Farms',
        finalStatus,
        JSON.stringify(evidence)
      ]);

      // Append Investigation Created event to transparency ledger
      try {
        await fetch(LEDGER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'INVESTIGATION',
            entity_id: public_identifier,
            event_type: 'INVESTIGATION_CREATED',
            payload: {
              public_identifier,
              risk_level: finalRisk,
              reason: 'Clone suspect flag tripped due to anomalous scanning frequency'
            }
          })
        });
      } catch (logErr) {
        server.log.error(logErr as any, 'Failed to append INVESTIGATION_CREATED to transparency ledger');
      }
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

// Verify a budget's certifier Ed25519 signature (fail closed: false on missing certifier or invalid signature).
async function verifyBudgetAuthority(client: pg.PoolClient, budgetId: string, certifierId: string, approvedQuantity: any, signatureBundle: string): Promise<boolean> {
  const certRes = await client.query('SELECT public_key FROM certifiers WHERE id = $1', [certifierId]);
  if (certRes.rows.length === 0) return false;
  const message = `budget_id:${budgetId};approved_quantity:${approvedQuantity}`;
  try {
    return crypto.verify(null, Buffer.from(message), certRes.rows[0].public_key, Buffer.from(signatureBundle || '', 'hex'));
  } catch (err) {
    return false;
  }
}

// Route: Public simulation registration for Manufacturer Console (persists generated QR/record in DB)
server.post('/api/v1/verify/register', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER' }])]
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
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    let lotUuid;
    if (lot_id) {
      // Explicit lot: budget capacity was already reserved when the lot was created
      // (POST /api/v1/lots draws down atomically). Lock the lot and bound the number of
      // unit codes to its batch_size so codes can never exceed the reserved quantity.
      const lotRes = await client.query(
        `SELECT id, batch_size, budget_id FROM lots WHERE id = $1 AND producer_id = $2 AND revocation_status = 'ACTIVE' FOR UPDATE`,
        [lot_id, user.orgId]
      );
      if (lotRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({
          success: false,
          error: { statusCode: 404, code: 'NOT_FOUND', message: 'Explicit lot not found, revoked, or unauthorized.' }
        });
      }
      const batchSize = parseFloat(lotRes.rows[0].batch_size);
      const countRes = await client.query('SELECT COUNT(*)::int AS c FROM unit_codes WHERE lot_id = $1', [lot_id]);
      if (countRes.rows[0].c + 1 > batchSize) {
        await client.query('ROLLBACK');
        return reply.status(422).send({
          success: false,
          error: { statusCode: 422, code: 'EXCEEDS_LOT_CAPACITY', message: `Lot capacity exhausted: ${countRes.rows[0].c}/${batchSize} units already minted for this lot.` }
        });
      }
      // Verify the lot's budget carries a valid certifier signature (fail closed).
      const budForLot = await client.query('SELECT id, certifier_id, approved_quantity, signature_bundle FROM budgets WHERE id = $1', [lotRes.rows[0].budget_id]);
      if (budForLot.rows.length === 0 || !(await verifyBudgetAuthority(client, budForLot.rows[0].id, budForLot.rows[0].certifier_id, budForLot.rows[0].approved_quantity, budForLot.rows[0].signature_bundle))) {
        await client.query('ROLLBACK');
        return reply.status(400).send({
          success: false,
          error: { statusCode: 400, code: 'INVALID_SIGNATURE', message: 'Budget supply authority could not be cryptographically verified.' }
        });
      }
      lotUuid = lot_id;
    } else {
      // No explicit lot: draw down exactly one unit of budget capacity atomically and
      // create a single-unit lot, so this quick path can never over-issue.
      const budgetRes = await client.query(
        `SELECT id, approved_quantity, consumed_quantity, certifier_id, signature_bundle FROM budgets WHERE producer_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [user.orgId]
      );
      if (budgetRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'NO_ACTIVE_BUDGET',
            message: 'No active budget found for your organization. Please request a budget and obtain certifier approval.'
          }
        });
      }
      const budgetRow = budgetRes.rows[0];
      // Verify certifier signature authorizing this budget (defense in depth; fail closed).
      if (!(await verifyBudgetAuthority(client, budgetRow.id, budgetRow.certifier_id, budgetRow.approved_quantity, budgetRow.signature_bundle))) {
        await client.query('ROLLBACK');
        return reply.status(400).send({
          success: false,
          error: { statusCode: 400, code: 'INVALID_SIGNATURE', message: 'Budget supply authority could not be cryptographically verified.' }
        });
      }
      const remaining = parseFloat(budgetRow.approved_quantity) - parseFloat(budgetRow.consumed_quantity);
      if (remaining < 1) {
        await client.query('ROLLBACK');
        return reply.status(422).send({
          success: false,
          error: { statusCode: 422, code: 'EXCEEDS_CAPACITY', message: 'No remaining budget capacity to mint a new unit.' }
        });
      }
      await client.query(
        `UPDATE budgets SET consumed_quantity = consumed_quantity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [budgetRow.id]
      );
      const lotInsert = await client.query(`
        INSERT INTO lots (id, producer_id, budget_id, product_metadata, batch_size, processing_dates, lab_status)
        VALUES (uuid_generate_v4(), $1, $2, $3, 1, '{}', 'PASSED')
        RETURNING id
      `, [user.orgId, budgetRow.id, JSON.stringify(product_metadata || { name: 'Organic White Honey', manufacturer: 'Premium Farms' })]);
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

    await client.query('COMMIT');
    return { success: true, message: 'Verification record persisted successfully.' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Explicit Lot Creation for Manufacturers
server.post('/api/v1/lots', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER' }])]
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

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock budget row to avoid concurrent drawdowns
    const budgetRes = await client.query(
      `SELECT status, approved_quantity, consumed_quantity 
       FROM budgets 
       WHERE id = $1 AND producer_id = $2 FOR UPDATE`,
      [budget_id, user.orgId]
    );

    if (budgetRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, message: 'Budget not found or unauthorized.' }
      });
    }

    const budget = budgetRes.rows[0];
    if (budget.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return reply.status(400).send({
        success: false,
        error: { statusCode: 400, message: 'Budget is not active.' }
      });
    }

    const remaining = parseFloat(budget.approved_quantity) - parseFloat(budget.consumed_quantity);
    if (quantity > remaining) {
      await client.query('ROLLBACK');
      return reply.status(400).send({
        success: false,
        error: { statusCode: 400, code: 'BUDGET_EXHAUSTED', message: 'Insufficient capacity remaining in budget.' }
      });
    }

    // 2. Draw down budget capacity
    await client.query(
      `UPDATE budgets SET consumed_quantity = consumed_quantity + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [budget_id, quantity]
    );

    // 3. Create Lot
    const lotRes = await client.query(
      `INSERT INTO lots (id, producer_id, budget_id, product_metadata, batch_size, processing_dates, lab_status)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'PENDING')
       RETURNING *`,
      [user.orgId, budget_id, JSON.stringify(product_metadata || {}), quantity, JSON.stringify(processing_dates || {})]
    );

    const lotUuid = lotRes.rows[0].id;

    // 4. Log to transparency ledger
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'LOT',
          entity_id: lotUuid,
          event_type: 'LOT_CREATED',
          payload: {
            lot_id: lotUuid,
            budget_id,
            batch_size: quantity,
            product_metadata
          }
        })
      });
    } catch (ledgerErr) {
      server.log.error(ledgerErr as any, 'Failed to log lot creation to transparency ledger');
    }

    await client.query('COMMIT');
    return {
      success: true,
      data: { lot: lotRes.rows[0] }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Export Lot Unit Codes as CSV
server.get('/api/v1/lots/:id/export/csv', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  const { id } = request.params as any;

  const lotCheck = await pgPool.query('SELECT id FROM lots WHERE id = $1', [id]);
  if (lotCheck.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Lot not found.' } });
  }

  const result = await pgPool.query(
    'SELECT public_identifier, gtin, serial, digital_link_uri, verification_url FROM unit_codes WHERE lot_id = $1',
    [id]
  );

  let csvContent = 'public_identifier,gtin,serial,digital_link_uri,verification_url\n';
  result.rows.forEach(row => {
    csvContent += `"${row.public_identifier}","${row.gtin}","${row.serial}","${row.digital_link_uri}","${row.verification_url}"\n`;
  });

  reply
    .header('Content-Type', 'text/csv')
    .header('Content-Disposition', `attachment; filename=lot_export_${id}.csv`)
    .send(csvContent);
});

// Route: Export Lot Unit Codes as print-ready PDF data sheet
server.get('/api/v1/lots/:id/export/pdf', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  const { id } = request.params as any;

  const lotCheck = await pgPool.query('SELECT product_metadata FROM lots WHERE id = $1', [id]);
  if (lotCheck.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Lot not found.' } });
  }

  const result = await pgPool.query(
    'SELECT public_identifier, gtin, serial, digital_link_uri, verification_url FROM unit_codes WHERE lot_id = $1',
    [id]
  );

  // Return a structured JSON listing to represent the print-sheet layout
  return {
    success: true,
    data: {
      lot_id: id,
      product_name: lotCheck.rows[0].product_metadata?.name || 'Organic White Honey',
      sheet_format: 'A4 Grid (3x8 stickers)',
      total_codes: result.rows.length,
      print_ready_codes: result.rows.map(row => ({
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

// Route: Assign Caseworker to Investigation
server.post('/api/v1/verify/investigations/:id/assign', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }, { orgType: 'SYSTEM_ADMINISTRATOR' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { assigned_to } = request.body as any;
  const user = request.user as any;

  if (!assigned_to) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Missing assigned_to UUID.' } });
  }

  const timelineEntry = {
    timestamp: new Date().toISOString(),
    event: 'CASE_ASSIGNED',
    author: user.username,
    details: `Investigation assigned to caseworker ID: ${assigned_to}`
  };

  const result = await pgPool.query(
    `UPDATE investigations 
     SET assigned_to = $2, 
         evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1 
     RETURNING *`,
    [id, assigned_to, JSON.stringify([timelineEntry])]
  );

  if (result.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Investigation not found.' } });
  }

  return { success: true, data: { investigation: result.rows[0] } };
});

// Route: Add Case Notes to Investigation
server.post('/api/v1/verify/investigations/:id/notes', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }, { orgType: 'SYSTEM_ADMINISTRATOR' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { note_text } = request.body as any;
  const user = request.user as any;

  if (!note_text) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Missing note_text.' } });
  }

  const noteEntry = {
    timestamp: new Date().toISOString(),
    author: user.username,
    note: note_text
  };

  const timelineEntry = {
    timestamp: new Date().toISOString(),
    event: 'NOTE_ADDED',
    author: user.username,
    details: `Caseworker added a case note`
  };

  const result = await pgPool.query(
    `UPDATE investigations 
     SET case_notes = COALESCE(case_notes, '[]'::jsonb) || $2::jsonb, 
         evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1 
     RETURNING *`,
    [id, JSON.stringify([noteEntry]), JSON.stringify([timelineEntry])]
  );

  if (result.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Investigation not found.' } });
  }

  return { success: true, data: { investigation: result.rows[0] } };
});

// Route: Escalate Investigation Severity
server.post('/api/v1/verify/investigations/:id/escalate', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }, { orgType: 'SYSTEM_ADMINISTRATOR' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { risk_level } = request.body as any;
  const user = request.user as any;

  if (!risk_level) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Missing risk_level.' } });
  }

  const timelineEntry = {
    timestamp: new Date().toISOString(),
    event: 'CASE_ESCALATED',
    author: user.username,
    details: `Threat level escalated to ${risk_level}`
  };

  const result = await pgPool.query(
    `UPDATE investigations 
     SET risk_level = $2, 
         status = 'ESCALATED',
         evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1 
     RETURNING *`,
    [id, risk_level, JSON.stringify([timelineEntry])]
  );

  if (result.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Investigation not found.' } });
  }

  return { success: true, data: { investigation: result.rows[0] } };
});

// Route: Close/Resolve Investigation
server.post('/api/v1/verify/investigations/:id/close', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }, { orgType: 'SYSTEM_ADMINISTRATOR' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { closure_status, notes } = request.body as any;
  const user = request.user as any;

  const finalStatus = closure_status || 'CLOSED';
  const timelineEntry = {
    timestamp: new Date().toISOString(),
    event: 'CASE_CLOSED',
    author: user.username,
    details: `Investigation closed as ${finalStatus}. Notes: ${notes || ''}`
  };

  const result = await pgPool.query(
    `UPDATE investigations 
     SET status = $2, 
         evidence_timeline = COALESCE(evidence_timeline, '[]'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1 
     RETURNING *`,
    [id, finalStatus, JSON.stringify([timelineEntry])]
  );

  if (result.rowCount === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Investigation not found.' } });
  }

  return { success: true, data: { investigation: result.rows[0] } };
});

// Route: Public simulation revocation for Manufacturer Console
server.post('/api/v1/verify/revoke', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { batch_id, reason } = request.body as any;

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

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find all lots matching batch_id
    const lotRes = await client.query(
      `SELECT id FROM lots WHERE product_metadata->>'batch_id' = $1`,
      [batch_id]
    );

    if (lotRes.rowCount !== null && lotRes.rowCount > 0) {
      const lotIds = lotRes.rows.map(row => row.id);
      const revocationReason = reason || 'Organic certification withdrawn';
      
      // 2. Update revocation status and metadata on these lots
      await client.query(
        `UPDATE lots 
         SET revocation_status = 'REVOKED', 
             product_metadata = product_metadata || jsonb_build_object('revocation_reason', $2::text, 'revocation_date', CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ANY($1)`,
        [lotIds, revocationReason]
      );

      // 3. Update associated unit codes to REVOKED state
      await client.query(
        `UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE lot_id = ANY($1)`,
        [lotIds]
      );
    }

    await client.query('COMMIT');
    return { success: true, message: `Batch ${batch_id} and all associated unit codes cascade revoked successfully in simulation.` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Cascade Revocation (M-011)
server.post('/api/v1/lots/:id/revoke', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if Lot exists
    const lotRes = await client.query('SELECT id, revocation_status FROM lots WHERE id = $1', [id]);
    if (lotRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    // CERT-04: Revoke already revoked lot -> No duplicate action
    if (lotRes.rows[0].revocation_status === 'REVOKED') {
      await client.query('ROLLBACK');
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

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Lot and all associated unit codes cascade revoked successfully.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Certify Lot (Certification Body only)
server.post('/api/v1/lots/:id/certify', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if Lot exists
    const lotRes = await client.query('SELECT * FROM lots WHERE id = $1', [id]);
    if (lotRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    const lot = lotRes.rows[0];

    // CERT-02: Certify failed lot -> Rejected
    if (lot.lab_status === 'FAILED' || lot.revocation_status === 'REVOKED') {
      await client.query('ROLLBACK');
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
      await client.query('ROLLBACK');
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
      await client.query('ROLLBACK');
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
        headers: { 'Content-Type': 'application/json' },
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

    await client.query('COMMIT');
    return {
      success: true,
      message: 'Lot successfully certified.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Get all unit codes
server.get('/api/v1/verify/unit-codes', async (request, reply) => {
  const result = await pgPool.query(`
    SELECT u.*, l.product_metadata 
    FROM unit_codes u
    LEFT JOIN lots l ON u.lot_id = l.id
    ORDER BY u.minted_at DESC
  `);
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

// Route: Get all lots
server.get('/api/v1/verify/lots', async (request, reply) => {
  const result = await pgPool.query('SELECT * FROM lots ORDER BY created_at DESC');
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

// Route: List Investigations
server.get('/api/v1/verify/investigations', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const result = await pgPool.query('SELECT * FROM investigations ORDER BY created_at DESC');
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

// Route: Get Investigation Details
server.get('/api/v1/verify/investigations/:id', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const result = await pgPool.query('SELECT * FROM investigations WHERE id = $1', [id]);
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

// Route: Approve Revocation
server.post('/api/v1/verify/investigations/:id/approve', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch Investigation
    const invRes = await client.query('SELECT * FROM investigations WHERE id = $1 FOR UPDATE', [id]);
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
      });
    }

    const inv = invRes.rows[0];
    const pubId = inv.public_identifier;

    // 2. Fetch linked unit code to get lot ID
    const ucRes = await client.query('SELECT id, lot_id FROM unit_codes WHERE public_identifier = $1', [pubId]);
    if (ucRes.rows.length > 0) {
      const codeRecord = ucRes.rows[0];
      const lotId = codeRecord.lot_id;

      // 3. Update Unit Code state to REVOKED
      await client.query(
        `UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [codeRecord.id]
      );

      // 4. Update Lot revocation status to REVOKED
      await client.query(
        `UPDATE lots 
         SET revocation_status = 'REVOKED', 
             product_metadata = product_metadata || jsonb_build_object('revocation_reason', $2::text, 'revocation_date', CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [lotId, inv.detection_reason]
      );
    }

    // 5. Update Investigation Status to REVOKED (resolved state)
    await client.query(
      `UPDATE investigations SET status = 'REVOKED', current_product_status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // 6. Commit transaction
    await client.query('COMMIT');

    // 7. Log to Transparency Ledger
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'INVESTIGATION',
          entity_id: pubId,
          event_type: 'INVESTIGATION_APPROVED',
          payload: {
            investigation_id: id,
            public_identifier: pubId,
            action: 'REVOCATION_APPROVED',
            reason: inv.detection_reason
          }
        })
      });

      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'PRODUCT',
          entity_id: pubId,
          event_type: 'PRODUCT_REVOKED',
          payload: {
            public_identifier: pubId,
            reason: inv.detection_reason
          }
        })
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append to ledger during approval');
    }

    return {
      success: true,
      message: 'Investigation approved and product officially revoked.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Dismiss Investigation
server.post('/api/v1/verify/investigations/:id/dismiss', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch Investigation
    const invRes = await client.query('SELECT * FROM investigations WHERE id = $1 FOR UPDATE', [id]);
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
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

    await client.query('COMMIT');

    // 3. Log to Transparency Ledger
    try {
      await fetch(LEDGER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'INVESTIGATION',
          entity_id: pubId,
          event_type: 'INVESTIGATION_DISMISSED',
          payload: {
            investigation_id: id,
            public_identifier: pubId,
            action: 'INVESTIGATION_DISMISSED'
          }
        })
      });
    } catch (logErr) {
      server.log.error(logErr as any, 'Failed to append to ledger during dismissal');
    }

    return {
      success: true,
      message: 'Investigation successfully dismissed.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Register Lab Results
server.post('/api/v1/verify/lab-results', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'NABL_LABORATORY' }])]
}, async (request, reply) => {
  const { lot_id, lab_name, test_type, result_summary, report_hash, report_reference, pdf_content } = request.body as any;

  if (!lot_id || !lab_name || !test_type || !result_summary || !report_hash) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing required lab result fields.' }
    });
  }

  const user = request.user as any;
  const authClient = await pgPool.connect();
  try {
    // Validate lab identity and certifier trust chain status
    const labOrg = await authClient.query('SELECT status FROM organizations WHERE id = $1 AND type = \'NABL_LABORATORY\'', [user.orgId]);
    if (labOrg.rows.length === 0 || labOrg.rows[0].status !== 'ACTIVATED') {
      return reply.status(403).send({
        success: false,
        error: { statusCode: 403, code: 'FORBIDDEN', message: 'Laboratory is not activated in the trust registry.' }
      });
    }
  } finally {
    authClient.release();
  }

  // Cryptographically validate and recompute PDF hash on the backend
  if (pdf_content) {
    try {
      const buffer = Buffer.from(pdf_content, 'base64');
      // Validate PDF magic bytes (%PDF)
      const isPdf = buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF';
      if (!isPdf) {
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'INVALID_PDF',
            message: 'Uploaded file is not a valid PDF document.'
          }
        });
      }
      const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (calculatedHash !== report_hash) {
        return reply.status(400).send({
          success: false,
          error: {
            statusCode: 400,
            code: 'HASH_MISMATCH',
            message: `Uploaded PDF SHA-256 hash validation failed. Recomputed hash: ${calculatedHash} does not match provided hash: ${report_hash}.`
          }
        });
      }
    } catch (err) {
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'INVALID_PDF_CONTENT',
          message: 'Failed to decode and validate PDF content.'
        }
      });
    }
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if lot exists
    const lotCheck = await client.query('SELECT id FROM lots WHERE id = $1', [lot_id]);
    if (lotCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    // Check duplicate or replacement logic
    const existingCheck = await client.query('SELECT id, report_hash FROM lab_results WHERE lot_id = $1', [lot_id]);
    
    let isReplacement = false;
    let insertRes;
    
    const dbResultSummary = (result_summary === 'PASSED' || result_summary === 'PASS') ? 'PASS' : 'FAIL';
    const lotLabStatus = (result_summary === 'PASSED' || result_summary === 'PASS') ? 'PASSED' : 'FAILED';

    if (existingCheck.rows.length > 0) {
      // LAB-03: Upload duplicate report -> Conflict
      if (existingCheck.rows[0].report_hash === report_hash) {
        await client.query('ROLLBACK');
        return reply.status(409).send({
          success: false,
          error: {
            statusCode: 409,
            code: 'CONFLICT',
            message: 'A lab report with the same hash already exists for this lot.'
          }
        });
      }
      
      // LAB-04: Replace existing report -> Audit entry created
      isReplacement = true;
      insertRes = await client.query(`
        UPDATE lab_results 
        SET lab_name = $2, test_type = $3, result_summary = $4, report_hash = $5, report_reference = $6
        WHERE lot_id = $1
        RETURNING *
      `, [lot_id, lab_name, test_type, dbResultSummary, report_hash, report_reference || '']);
    } else {
      // 2. Insert lab result
      insertRes = await client.query(`
        INSERT INTO lab_results (id, lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [lot_id, lab_name, test_type, dbResultSummary, report_hash, report_reference || '']);
    }

    // 3. Update the lot's lab status in PostgreSQL
    await client.query(
      `UPDATE lots SET lab_status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [lot_id, lotLabStatus]
    );

    // If replacement, write replacement audit block to ledger
    if (isReplacement) {
      try {
        await fetch(LEDGER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'LOT',
            entity_id: lot_id,
            event_type: 'LOT_LAB_TEST_REPLACED',
            payload: {
              lot_id,
              lab_name,
              test_type,
              report_hash
            }
          })
        });
      } catch (logErr) {
        server.log.error(logErr as any, 'Failed to append replacement lab test event to ledger');
      }
    }

    // 4. If result is FAILED, trigger dynamic revocation
    if (result_summary === 'FAILED') {
      // Cascade revocation
      await client.query(
        `UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE lot_id = $1`,
        [lot_id]
      );
      
      await client.query(
        `UPDATE lots 
         SET revocation_status = 'REVOKED', 
             product_metadata = product_metadata || jsonb_build_object('revocation_reason', 'Laboratory test failed: ' || $2::text, 'revocation_date', CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [lot_id, test_type]
      );

      // Append log entry to Transparency Ledger
      try {
        await fetch(LEDGER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'LOT',
            entity_id: lot_id,
            event_type: 'LOT_LAB_TEST_FAILED_CASCADING_REVOCATION',
            payload: {
              lot_id,
              lab_name,
              test_type,
              report_hash
            }
          })
        });
      } catch (logErr) {
        server.log.error(logErr as any, 'Failed to append failed lab test event to ledger');
      }
    } else {
      // Append standard lab test passed log event
      try {
        await fetch(LEDGER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'LOT',
            entity_id: lot_id,
            event_type: 'LOT_LAB_TEST_PASSED',
            payload: {
              lot_id,
              lab_name,
              test_type,
              report_hash
            }
          })
        });
      } catch (logErr) {
        server.log.error(logErr as any, 'Failed to append passed lab test event to ledger');
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      data: {
        labResult: insertRes.rows[0]
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Start the server
const start = async () => {
  try {
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
