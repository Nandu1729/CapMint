import Fastify from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  assertRlsServiceRole,
  PUBLIC_TENANT_CONTEXT,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';
import {
  createLoggingOptions,
  registerRequestLogging
} from '../../../packages/shared/logging.js';
import { registerReadiness } from '../../../packages/shared/readiness.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const server = Fastify(createLoggingOptions());
registerRequestLogging(server);

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

// Standard health check route
server.get('/health', async () => {
  return { status: 'healthy', service: 'resolver-service' };
});

// Route: GS1 Digital Link Resolution (M-007)
// Matches standard: /01/{gtin}/21/{serial}
server.get('/01/:gtin/21/:serial', async (request, reply) => {
  const { gtin, serial } = request.params as any;

  if (!gtin || !serial) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing GTIN or Serial parameter.' }
    });
  }

  try {
    // Optimized lookup using compound B-Tree index on (gtin, serial)
    const query = `
      SELECT u.id, u.serial, u.gtin, u.current_state, u.clone_flag,
             l.id as lot_id, l.product_metadata, l.batch_size, l.revocation_status,
             p.name as producer_name
      FROM unit_codes u
      JOIN lots l ON u.lot_id = l.id
      JOIN producers p ON l.producer_id = p.id
      WHERE u.gtin = $1 AND u.serial = $2
    `;
    const result = await withTenantTx(
      pgPool,
      PUBLIC_TENANT_CONTEXT,
      (client) => client.query(query, [gtin, serial])
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          statusCode: 404,
          code: 'CODE_NOT_FOUND',
          message: 'The requested product QR identity record was not found in the CapMint registry.'
        }
      });
    }

    const codeRecord = result.rows[0];

    // Check header for API client JSON requests vs browser redirects
    const acceptHeader = request.headers['accept'] || '';
    if (acceptHeader.includes('application/json')) {
      return {
        success: true,
        data: {
          gtin: codeRecord.gtin,
          serial: codeRecord.serial,
          state: codeRecord.current_state,
          cloneSuspect: codeRecord.clone_flag,
          lot: {
            id: codeRecord.lot_id,
            revocationStatus: codeRecord.revocation_status,
            batchSize: parseFloat(codeRecord.batch_size),
            productMetadata: codeRecord.product_metadata
          },
          producer: {
            name: codeRecord.producer_name
          }
        }
      };
    }

    // Otherwise, redirect user to the consumer verification frontend page
    const verifyFrontendUrl = process.env.VERIFY_FRONTEND_URL || 'http://localhost:8080';
    const redirectUrl = `${verifyFrontendUrl}/verify?gtin=${gtin}&serial=${serial}`;
    
    return reply.redirect(302, redirectUrl);
  } catch (err) {
    throw err;
  }
});

// Start the server
const start = async () => {
  try {
    await assertRlsServiceRole(pgPool, 'resolver-service');
    const port = parseInt(process.env.PORT || '8084', 10);
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Resolver service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
