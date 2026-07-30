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

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify(createLoggingOptions());
registerRequestLogging(server);

// Configure JWT plugin. Fail closed: never fall back to a hardcoded secret in real environments.
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-insecure-secret' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
server.register(jwt, { secret: JWT_SECRET, verify: { algorithms: ['HS256'] } });

// Authentication guard for ledger-mutating routes (append). Reads stay public (transparency).
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

// Global error handler complying with RFC 7807 Problem Details
server.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = error.statusCode || 500;
  const errorCode = error.code || 'INTERNAL_SERVER_ERROR';
  reply.status(statusCode).send({
    success: false,
    error: {
      statusCode,
      code: errorCode,
      message: error.message,
      details: []
    }
  });
});

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

    // 1. Serialize appends and read the chain tail. log_entries is immutable (no UPDATE
    // policy), so SELECT ... FOR UPDATE returns zero rows under RLS for the non-owner app
    // role. Take the same SHARE ROW EXCLUSIVE table lock the registration definer uses to
    // serialize all appends, then read the tail with a plain SELECT (permitted by the
    // log_entries SELECT policy).
    await client.query('LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE');
    const latestRes = await client.query(
      'SELECT current_hash FROM log_entries ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    
    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    if (latestRes.rowCount && latestRes.rowCount > 0) {
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
  try {
    // Read all logs ordered by creation to verify sequential links
    const logsRes = await client.query('SELECT * FROM log_entries ORDER BY created_at ASC, id ASC');
    const logs = logsRes.rows;

    let unbroken = true;
    const errors: string[] = [];
    let expectedPrevious = '00000000-0000-0000-0000-000000000000';

    for (let i = 0; i < logs.length; i++) {
      const entry = logs[i];

      // Genesis anchor has a static hash and no parent link, skip verification
      if (entry.event_type === 'GENESIS_BLOCK_ANCHOR') {
        expectedPrevious = entry.current_hash;
        continue;
      }

      // Verify that previous_hash matches expected previous current_hash
      if (entry.previous_hash !== expectedPrevious) {
        unbroken = false;
        errors.push(`Chain link broken at entry index ${i} (ID: ${entry.id}). Expected previous hash ${expectedPrevious}, got ${entry.previous_hash}.`);
      }

      // Recompute payload_hash and current_hash to confirm no tampering
      const calculatedCurrent = hashSHA256(
        entry.entity_type + entry.entity_id + entry.event_type + entry.payload_hash + entry.previous_hash
      );

      if (entry.current_hash !== calculatedCurrent) {
        unbroken = false;
        errors.push(`Hash mismatch at entry index ${i} (ID: ${entry.id}). Calculated current hash ${calculatedCurrent}, database has ${entry.current_hash}.`);
      }

      expectedPrevious = entry.current_hash;
    }

    return {
      success: true,
      data: {
        unbroken,
        logCount: logs.length,
        error: errors.length > 0 ? errors.join('; ') : null,
        errors: errors
      }
    };
  } catch (err) {
    throw err;
  }
}

// Route: Verify Integrity of Hash Chain
const verifyLogPublicly = (request: any, reply: any) =>
  withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, (client) => handleVerifyLog(request, reply, client));
server.get('/api/v1/log/verify', verifyLogPublicly);
server.get('/log/api/v1/log/verify', verifyLogPublicly);

// Helper to implement log entries fetching
async function handleGetEntries(request: any, reply: any, client: pg.PoolClient) {
  const result = await client.query('SELECT * FROM log_entries ORDER BY created_at ASC, id ASC');
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

const getEntriesPublicly = (request: any, reply: any) =>
  withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, (client) => handleGetEntries(request, reply, client));
server.get('/api/v1/log/entries', getEntriesPublicly);
server.get('/log/api/v1/log/entries', getEntriesPublicly);

// Helper to handle appending to log
async function handleAppendLog(request: any, reply: any, client: pg.PoolClient) {
  const { entity_type, entity_id, event_type, payload } = request.body as any;

  if (!entity_type || !entity_id || !event_type || !payload) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing log entry parameters.' }
    });
  }

    // 1. Serialize appends and read the chain tail. log_entries is immutable (no UPDATE
    // policy), so SELECT ... FOR UPDATE returns zero rows under RLS for the non-owner app
    // role. Take the same SHARE ROW EXCLUSIVE table lock the registration definer uses to
    // serialize all appends, then read the tail with a plain SELECT (permitted by the
    // log_entries SELECT policy).
    await client.query('LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE');
    const latestRes = await client.query(
      'SELECT current_hash FROM log_entries ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    
    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    if (latestRes.rowCount && latestRes.rowCount > 0) {
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
        const checkRes = await client.query('SELECT COUNT(*) FROM log_entries');
        if (parseInt(checkRes.rows[0].count, 10) === 0) {
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
