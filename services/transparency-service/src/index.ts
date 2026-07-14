import Fastify from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const server = Fastify({
  logger: true
});

// Initialize PostgreSQL Client Pool
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
});

// Initialize Redis Client
const redisClient = new Redis(process.env.REDIS_URL || 'redis://:capmint_redis_secure_password@localhost:6379/0');

// Global error handler complying with RFC 7807 Problem Details
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);
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

// Route: Append to Transparency Log (M-008)
server.post('/api/v1/log', async (request, reply) => {
  const { entity_type, entity_id, event_type, payload } = request.body as any;

  if (!entity_type || !entity_id || !event_type || !payload) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing log entry parameters.' }
    });
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the latest log entry to lock the chain tail and get previous hash
    const latestRes = await client.query(
      'SELECT current_hash FROM log_entries ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE'
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

    await client.query('COMMIT');

    return reply.status(201).send({
      success: true,
      data: {
        entry: result.rows[0]
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Verify Integrity of Hash Chain
server.get('/api/v1/log/verify', async (request, reply) => {
  try {
    // Read all logs ordered by creation to verify sequential links
    const logsRes = await pgPool.query('SELECT * FROM log_entries ORDER BY created_at ASC, id ASC');
    const logs = logsRes.rows;

    let unbroken = true;
    let errorDetails = '';
    let expectedPrevious = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < logs.length; i++) {
      const entry = logs[i];

      // Verify that previous_hash matches expected previous current_hash
      if (entry.previous_hash !== expectedPrevious) {
        unbroken = false;
        errorDetails = `Chain link broken at entry index ${i} (ID: ${entry.id}). Expected previous hash ${expectedPrevious}, got ${entry.previous_hash}.`;
        break;
      }

      // Recompute payload_hash and current_hash to confirm no tampering
      // Note: In real setup, the payload is verified against payload_hash, here we verify structure
      const calculatedCurrent = hashSHA256(
        entry.entity_type + entry.entity_id + entry.event_type + entry.payload_hash + entry.previous_hash
      );

      if (entry.current_hash !== calculatedCurrent) {
        unbroken = false;
        errorDetails = `Hash mismatch at entry index ${i} (ID: ${entry.id}). Calculated current hash ${calculatedCurrent}, database has ${entry.current_hash}.`;
        break;
      }

      expectedPrevious = entry.current_hash;
    }

    return {
      success: true,
      data: {
        unbroken,
        logCount: logs.length,
        error: errorDetails || null
      }
    };
  } catch (err) {
    throw err;
  }
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8085', 10);
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
