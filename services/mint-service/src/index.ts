import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import qr from 'qrcode';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedRoles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify({
  logger: true
});

// Configure JWT plugin
server.register(jwt, {
  secret: process.env.JWT_SECRET || 'capmint_development_jwt_secret_must_be_minimum_32_bytes_long'
});

// Decorators: authenticate / authorize
server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
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

server.decorate('authorize', (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user || !allowedRoles.includes(user.role)) {
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

// Helper: Validate GS1 GTIN-14 Check Digit
export function validateGTIN(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) {
    return false;
  }
  let sum = 0;
  // Alternate weights 3 and 1 from right to left (excluding the check digit)
  for (let i = 0; i < 13; i++) {
    const digit = parseInt(gtin.charAt(i), 10);
    const weight = i % 2 === 0 ? 3 : 1;
    sum += digit * weight;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(gtin.charAt(13), 10);
}

// Helper: Generate Cryptographically Secure Serial Numbers
function generateSerial(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomBytes[i] % chars.length);
  }
  return result;
}

// Route: Validate GTIN-14 (GS1 Engine)
server.post('/api/v1/gs1/validate', async (request, reply) => {
  const { gtin } = request.body as any;
  if (!gtin) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing GTIN parameter.' }
    });
  }

  const isValid = validateGTIN(gtin);
  return {
    success: true,
    data: {
      gtin,
      isValid
    }
  };
});

// Route: Mint Serial Numbers (Minting Engine)
server.post('/api/v1/mint', {
  preValidation: [server.authenticate, server.authorize(['PACK_HOUSE', 'ADMIN'])]
}, async (request, reply) => {
  const { lot_id, gtin, quantity } = request.body as any;

  if (!lot_id || !gtin || !quantity) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing lot_id, gtin, or quantity parameter.'
      }
    });
  }

  const mintCount = parseInt(quantity, 10);
  if (isNaN(mintCount) || mintCount <= 0) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be a positive numeric value.'
      }
    });
  }

  // 1. Validate GTIN-14 check digit (GS1 Engine validation gate)
  if (!validateGTIN(gtin)) {
    return reply.status(422).send({
      success: false,
      error: {
        statusCode: 422,
        code: 'INVALID_GTIN',
        message: 'The GTIN-14 identifier failed GS1 validation check digit checks.'
      }
    });
  }

  const client = await pgPool.connect();
  try {
    // Start Database Transaction to handle capacity checks and generation atomically
    await client.query('BEGIN');

    // 2. Fetch lot details and lock budget row to enforce limits
    const lotRes = await client.query('SELECT * FROM lots WHERE id = $1', [lot_id]);
    if (lotRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
      });
    }

    const lot = lotRes.rows[0];
    const budgetId = lot.budget_id;

    // Lock budget row to prevent double-mint race conditions
    const budgetRes = await client.query('SELECT * FROM budgets WHERE id = $1 FOR UPDATE', [budgetId]);
    if (budgetRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Budget linked to Lot not found.' }
      });
    }

    const budget = budgetRes.rows[0];
    if (budget.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'INACTIVE_BUDGET',
          message: `Linked budget status is: ${budget.status}. Cannot draw down capacity.`
        }
      });
    }

    const approved = parseFloat(budget.approved_quantity);
    const consumed = parseFloat(budget.consumed_quantity);
    const remaining = approved - consumed;

    if (remaining < mintCount) {
      await client.query('ROLLBACK');
      return reply.status(422).send({
        success: false,
        error: {
          statusCode: 422,
          code: 'EXCEEDS_CAPACITY',
          message: `Mint count of ${mintCount} exceeds remaining budget capacity of ${remaining}.`
        }
      });
    }

    // 3. Deduct budget capacity
    const newConsumed = consumed + mintCount;
    const newRemaining = approved - newConsumed;
    const newStatus = newRemaining === 0 ? 'EXHAUSTED' : 'ACTIVE';
    await client.query(
      `UPDATE budgets SET consumed_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [newConsumed, newStatus, budgetId]
    );

    // 4. Generate unique serials & digital link URIs
    const serialsList: string[] = [];
    const digitalLinksList: string[] = [];

    for (let i = 0; i < mintCount; i++) {
      const serial = generateSerial();
      const digitalLinkUri = `https://id.capmint.io/01/${gtin}/21/${serial}`;
      
      await client.query(
        `INSERT INTO unit_codes (lot_id, serial, gtin, digital_link_uri, current_state)
         VALUES ($1, $2, $3, $4, 'MINTED')`,
        [lot_id, serial, gtin, digitalLinkUri]
      );

      serialsList.push(serial);
      digitalLinksList.push(digitalLinkUri);
    }

    // Commit transaction
    await client.query('COMMIT');

    return reply.status(201).send({
      success: true,
      data: {
        gtin,
        mintedCount: mintCount,
        serials: serialsList,
        digitalLinks: digitalLinksList
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Route: Generate QR Code (QR Engine)
server.get('/api/v1/qr/generate', async (request, reply) => {
  const { link } = request.query as any;
  if (!link) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing link query parameter.' }
    });
  }

  try {
    const dataUri = await qr.toDataURL(link);
    return {
      success: true,
      data: {
        link,
        qrCode: dataUri
      }
    };
  } catch (err: any) {
    return reply.status(500).send({
      success: false,
      error: { statusCode: 500, code: 'QR_GENERATION_FAILED', message: err.message }
    });
  }
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8083', 10);
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Mint service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
