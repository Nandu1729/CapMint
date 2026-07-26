import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import qr from 'qrcode';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { tenantContextFromUser, withTenantTx } from '../../../packages/shared/tenant-db.js';
import { reserveLotIssuance } from '../../../packages/shared/capacity.js';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedSpecs: any[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify({
  logger: true
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
  preValidation: [server.authenticate, server.authorize(PRODUCER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { lot_id, gtin, quantity } = request.body as any;
  const user = request.user as any;

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

  return withTenantTx(pgPool, tenantContextFromUser(user), async (client) => {

    const capacity = await reserveLotIssuance(client, lot_id, user.orgId, mintCount);
    if (!capacity.ok) {
      return reply.status(capacity.statusCode).send({
        success: false,
        error: {
          statusCode: capacity.statusCode,
          code: capacity.code,
          message: capacity.message
        }
      });
    }

    // 4. Generate unique serials, digital link URIs, secure verification URLs, and local QR codes
    const serialsList: string[] = [];
    const digitalLinksList: string[] = [];
    const verificationUrlsList: string[] = [];
    const qrCodesList: string[] = [];

    for (let i = 0; i < mintCount; i++) {
      const serial = generateSerial();
      const digitalLinkUri = `https://id.capmint.io/01/${gtin}/21/${serial}`;
      const publicIdentifier = crypto.randomUUID();
      const verificationUrl = `https://verify.capmint.com/v/${publicIdentifier}`;
      const qrCodeDataUri = await qr.toDataURL(verificationUrl);
      
      await client.query(
        `INSERT INTO unit_codes (lot_id, serial, gtin, digital_link_uri, public_identifier, verification_url, qr_code_data_uri, current_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'MINTED')`,
        [lot_id, serial, gtin, digitalLinkUri, publicIdentifier, verificationUrl, qrCodeDataUri]
      );

      serialsList.push(serial);
      digitalLinksList.push(digitalLinkUri);
      verificationUrlsList.push(verificationUrl);
      qrCodesList.push(qrCodeDataUri);
    }

    return reply.status(201).send({
      success: true,
      data: {
        gtin,
        mintedCount: mintCount,
        serials: serialsList,
        digitalLinks: digitalLinksList,
        verificationUrls: verificationUrlsList,
        qrCodes: qrCodesList
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  });
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

if (process.env.NODE_ENV !== 'test') {
  start();
}
