import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  assertRlsServiceRole,
  PUBLIC_TENANT_CONTEXT,
  tenantContextFromUser,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';
import {
  createLoggingOptions,
  registerRequestLogging
} from '../../../packages/shared/logging.js';
import { createErrorHandler } from '../../../packages/shared/errors.js';
import { registerMetrics } from '../../../packages/shared/metrics.js';
import { registerReadiness } from '../../../packages/shared/readiness.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify(createLoggingOptions());
registerRequestLogging(server);
registerMetrics(server);
server.setErrorHandler(createErrorHandler());

// Configure JWT plugin. Fail closed: never fall back to a hardcoded secret in real environments.
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-insecure-secret' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
server.register(jwt, { secret: JWT_SECRET, verify: { algorithms: ['HS256'] } });

// Authentication guard for ledger contents and mutating routes. Integrity proof stays public.
server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid or missing Authorization token.' }
    });
  }
});

// Initialize PostgreSQL Client Pool
const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
const pgPool = new pg.Pool({
  connectionString: DATABASE_URL
});

// Initialize Redis Client
const REDIS_URL = process.env.REDIS_URL || (process.env.NODE_ENV === 'test' ? 'redis://:capmint_redis_secure_password@localhost:6379/0' : '');
if (!REDIS_URL) {
  console.error('FATAL: REDIS_URL is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
const redisClient = new Redis(REDIS_URL);
registerReadiness(server, { pgPool, redisClient });

// Helper: Calculate SHA-256 Hash
export function hashSHA256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Standard health check route
server.get('/health', async () => {
  return { status: 'healthy', service: 'transparency-service' };
});

// Route: Append to Transparency Log (M-008) — authenticated (ledger writes must not be forgeable)
server.post('/api/v1/log', { preValidation: [server.authenticate] }, async (request, reply) => {
  const { entity_type, entity_id, event_type, payload } = request.body as any;

  if (!entity_type || !entity_id || !event_type || !payload) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing log entry parameters.' }
    });
  }

  return withTenantTx(pgPool, tenantContextFromUser(request.user as any), async (client) => {

    // 1. Serialize appends and read only the global chain tail through the bounded helper.
    await client.query('LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE');
    const latestRes = await client.query(
      'SELECT capmint_ledger_tail_hash() AS current_hash'
    );
    
    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    if (latestRes.rows[0]?.current_hash) {
      previousHash = latestRes.rows[0].current_hash;
    }

    // 2. Compute cryptographic hashes
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const payloadHash = hashSHA256(payloadStr);
    const currentHash = hashSHA256(entity_type + entity_id + event_type + payloadHash + previousHash);

    // 3. Insert record
    const insertQuery = `
      INSERT INTO log_entries (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, entity_type, entity_id, event_type, current_hash, created_at
    `;
    const result = await client.query(insertQuery, [
      entity_type,
      entity_id,
      event_type,
      payloadHash,
      previousHash,
      currentHash
    ]);

    return reply.status(201).send({
      success: true,
      data: {
        entry: result.rows[0]
      }
    });
  });
});

// Helper to implement route handler logic for verify integrity
async function handleVerifyLog(request: any, reply: any, client: pg.PoolClient) {
  const result = await client.query(
    'SELECT unbroken, log_count, error, errors FROM capmint_verify_ledger_integrity()'
  );
  const verification = result.rows[0];
  return {
    success: true,
    data: {
      unbroken: verification.unbroken,
      logCount: Number(verification.log_count),
      error: verification.error,
      errors: verification.errors
    }
  };
}

// Route: Verify Integrity of Hash Chain
const verifyLogPublicly = (request: any, reply: any) =>
  withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, (client) => handleVerifyLog(request, reply, client));
server.get('/api/v1/log/verify', verifyLogPublicly);
server.get('/log/api/v1/log/verify', verifyLogPublicly);

// Helper to implement log entries fetching
async function handleGetEntries(request: any, reply: any, client: pg.PoolClient) {
  const result = await client.query(`
    SELECT *
    FROM log_entries
    WHERE current_setting('app.actor_is_system_admin', true) = 'on'
       OR (
         NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL
         AND capmint_rls_log_entry_actor(
           entity_type,
           entity_id,
           NULLIF(current_setting('app.current_organization_id', true), '')::uuid
         )
       )
    ORDER BY created_at ASC, id ASC
  `);
  return {
    success: true,
    data: {
      logs: result.rows.map((row, idx) => ({
        index: idx,
        entity: row.entity_type,
        id: row.entity_id,
        event: row.event_type,
        payloadHash: row.payload_hash,
        prevHash: row.previous_hash,
        currentHash: row.current_hash
      }))
    }
  };
}

const getEntriesForTenant = (request: any, reply: any) =>
  withTenantTx(
    pgPool,
    tenantContextFromUser(request.user as any),
    (client) => handleGetEntries(request, reply, client)
  );
server.get('/api/v1/log/entries', { preValidation: [server.authenticate] }, getEntriesForTenant);
server.get('/log/api/v1/log/entries', { preValidation: [server.authenticate] }, getEntriesForTenant);

// Helper to handle appending to log
async function handleAppendLog(request: any, reply: any, client: pg.PoolClient) {
  const { entity_type, entity_id, event_type, payload } = request.body as any;

  if (!entity_type || !entity_id || !event_type || !payload) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing log entry parameters.' }
    });
  }

    // 1. Serialize appends and read only the global chain tail through the bounded helper.
    await client.query('LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE');
    const latestRes = await client.query(
      'SELECT capmint_ledger_tail_hash() AS current_hash'
    );
    
    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    if (latestRes.rows[0]?.current_hash) {
      previousHash = latestRes.rows[0].current_hash;
    }

    // 2. Compute cryptographic hashes
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const payloadHash = hashSHA256(payloadStr);
    const currentHash = hashSHA256(entity_type + entity_id + event_type + payloadHash + previousHash);

    // 3. Insert record
    const insertQuery = `
      INSERT INTO log_entries (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, entity_type, entity_id, event_type, current_hash, created_at
    `;
    const result = await client.query(insertQuery, [
      entity_type,
      entity_id,
      event_type,
      payloadHash,
      previousHash,
      currentHash
    ]);

    return reply.status(201).send({
      success: true,
      data: {
        entry: result.rows[0]
      }
    });
}

server.post('/log/api/v1/log', { preValidation: [server.authenticate] }, (request, reply) =>
  withTenantTx(
    pgPool,
    tenantContextFromUser(request.user as any),
    (client) => handleAppendLog(request, reply, client)
  )
);

// Start the server
const start = async () => {
  try {
    await assertRlsServiceRole(pgPool, 'transparency-service');
    const port = parseInt(process.env.PORT || '8085', 10);

    // Seed genesis block if table is empty
    try {
      await withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, async (client) => {
        await client.query('LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE');
        const checkRes = await client.query(
          'SELECT capmint_ledger_tail_hash() AS current_hash'
        );
        if (!checkRes.rows[0]?.current_hash) {
          await client.query(`
            INSERT INTO log_entries (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
            VALUES ('SYSTEM', '00000000-0000-0000-0000-000000000000', 'GENESIS_BLOCK_ANCHOR', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '00000000-0000-0000-0000-000000000000', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
          `);
        }
      });
    } catch (seedErr) {
      server.log.error(seedErr as any, 'Seeding log_entries failed');
    }

    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Transparency service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  start();
}
