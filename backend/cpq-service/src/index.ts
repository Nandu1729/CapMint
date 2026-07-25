import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import crypto from 'crypto';

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

// Configure JWT plugin (using same shared secret)
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-insecure-secret' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
server.register(jwt, {
  secret: JWT_SECRET,
  verify: { algorithms: ['HS256'] }
});

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

// Decorator: authenticate
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

// Initialize PostgreSQL Client Pool
const DATABASE_URL = process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev' : '');
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

// Standard health check route
server.get('/health', async () => {
  return { status: 'healthy', service: 'cpq-service' };
});

// Route: Propose/Draft Budget
server.post('/api/v1/budgets', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER' }])]
}, async (request, reply) => {
  const {
    producer_id,
    certifier_id,
    source_unit_type,
    approved_quantity,
    yield_assumptions,
    signature_bundle,
    effective_start_date,
    effective_end_date
  } = request.body as any;

  if (!producer_id || !certifier_id || !source_unit_type || !approved_quantity || !yield_assumptions || !signature_bundle || !effective_start_date || !effective_end_date) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing required fields in request body.'
      }
    });
  }

  // Enforce organization ownership validation (No cross-org budget proposals)
  const user = request.user as any;
  if (user.orgType === 'PRODUCER' && producer_id !== user.orgId) {
    return reply.status(403).send({
      success: false,
      error: {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You cannot request budgets for another organization.'
      }
    });
  }

  const quantity = parseFloat(approved_quantity);
  if (isNaN(quantity) || quantity <= 0) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_QUANTITY',
        message: 'Approved quantity must be a positive numeric value.'
      }
    });
  }

  // CPQ-09: Create duplicate budget for same season
  const crop = yield_assumptions?.crop;
  if (crop) {
    const dupCheck = await pgPool.query(
      `SELECT id FROM budgets 
       WHERE producer_id = $1 
         AND yield_assumptions->>'crop' = $2 
         AND status != 'REVOKED'
         AND (
           (effective_start_date, effective_end_date) OVERLAPS ($3::timestamp, $4::timestamp)
         )`,
      [producer_id, crop, effective_start_date, effective_end_date]
    );
    if (dupCheck.rows.length > 0) {
      return reply.status(409).send({
        success: false,
        error: {
          statusCode: 409,
          code: 'DUPLICATE_BUDGET',
          message: `A budget already exists for crop "${crop}" within the specified season/timeframe.`
        }
      });
    }
  }

  const query = `
    INSERT INTO budgets (
      producer_id, certifier_id, source_unit_type, approved_quantity,
      yield_assumptions, signature_bundle, effective_start_date, effective_end_date, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')
    RETURNING id, producer_id, certifier_id, source_unit_type, approved_quantity, remaining_quantity, status
  `;

  const result = await pgPool.query(query, [
    producer_id,
    certifier_id,
    source_unit_type,
    quantity,
    JSON.stringify(yield_assumptions),
    signature_bundle,
    effective_start_date,
    effective_end_date
  ]);

  return reply.status(201).send({
    success: true,
    data: {
      budget: result.rows[0]
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: request.id
    }
  });
});

// Route: Approve / Activate Budget
// Helper to log budget status history transitions
async function logBudgetStatus(client: pg.PoolClient | pg.Pool, budgetId: string, fromStatus: string, toStatus: string, actor: string, notes?: string) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    fromStatus,
    toStatus,
    actor,
    notes: notes || ''
  };
  await client.query(`
    UPDATE budgets 
    SET status_history = COALESCE(status_history, '[]'::jsonb) || $2::jsonb 
    WHERE id = $1
  `, [budgetId, JSON.stringify([logEntry])]);
}

server.post('/api/v1/budgets/:id/activate', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid budget ID format. Must be a valid UUID.'
      }
    });
  }

  // 1. Fetch budget first to get approved quantity and current status
  const budgetFetch = await pgPool.query('SELECT status, approved_quantity FROM budgets WHERE id = $1', [id]);
  if (budgetFetch.rows.length === 0) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Budget not found.'
      }
    });
  }

  const budget = budgetFetch.rows[0];
  const approvedQuantity = budget.approved_quantity;
  const message = `budget_id:${id};approved_quantity:${approvedQuantity}`;

  // 2. Cryptographically co-sign using certifier Ed25519 private key
  // Fail closed: never fall back to a hardcoded signing key. If the key is not configured,
  // budget activation cannot be cryptographically co-signed and must not proceed.
  const certifierPrivateKey = process.env.CERTIFIER_PRIVATE_KEY;
  if (!certifierPrivateKey) {
    server.log.error('CERTIFIER_PRIVATE_KEY is not configured; cannot co-sign budget activation.');
    return reply.status(500).send({
      success: false,
      error: { statusCode: 500, code: 'SIGNING_UNAVAILABLE', message: 'Certifier signing key is not configured.' }
    });
  }

  let signatureBundle = 'sig_failed';
  try {
    signatureBundle = crypto.sign(null, Buffer.from(message), certifierPrivateKey).toString('hex');
  } catch (err) {
    server.log.error(err as any, 'Ed25519 signing failed');
  }

  // 3. Update database budget to ACTIVE and save signature bundle
  const result = await pgPool.query(
    `UPDATE budgets SET status = 'ACTIVE', signature_bundle = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, status, signature_bundle`,
    [id, signatureBundle]
  );

  // Log status transition in history
  const user = request.user as any;
  await logBudgetStatus(pgPool, id, budget.status, 'ACTIVE', user ? user.username : 'CERTIFIER');

  return {
    success: true,
    data: {
      budget: result.rows[0]
    }
  };
});

// Route: Drawdown Capacity (supports row locking FOR UPDATE to prevent race conditions)
server.post('/api/v1/budgets/:id/drawdown', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { amount } = request.body as any;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid budget ID format. Must be a valid UUID.'
      }
    });
  }

  const drawdownAmount = parseFloat(amount);
  if (isNaN(drawdownAmount) || drawdownAmount <= 0) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Drawdown amount must be a positive numeric value.'
      }
    });
  }

  const client = await pgPool.connect();
  try {
    // 1. Start Database Transaction
    await client.query('BEGIN');

    // 2. Select For Update (Row Lock to prevent double-mint race conditions)
    const budgetRes = await client.query('SELECT * FROM budgets WHERE id = $1 FOR UPDATE', [id]);
    if (budgetRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        error: {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Budget not found.'
        }
      });
    }

    const budget = budgetRes.rows[0];

    // Enforce organization ownership validation (No cross-org budget drawdown)
    const user = request.user as any;
    if (user.orgType === 'PRODUCER' && budget.producer_id !== user.orgId) {
      await client.query('ROLLBACK');
      return reply.status(403).send({
        success: false,
        error: {
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You cannot drawdown budgets belonging to another organization.'
        }
      });
    }

    // 2.5 Verify the certifier's Ed25519 signature over the budget authorization. Fail closed:
    // a missing certifier, an unverifiable signature, or the placeholder 'sig_default'/'sig_failed'
    // values must all block the drawdown (no bypass).
    const certifierRes = await client.query('SELECT public_key FROM certifiers WHERE id = $1', [budget.certifier_id]);
    if (certifierRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'INVALID_SIGNATURE',
          message: 'Certifier not found; budget supply authority cannot be verified.'
        }
      });
    }

    const pubKeyPem = certifierRes.rows[0].public_key;
    const message = `budget_id:${id};approved_quantity:${budget.approved_quantity}`;

    let isVerified = false;
    try {
      isVerified = crypto.verify(null, Buffer.from(message), pubKeyPem, Buffer.from(budget.signature_bundle, 'hex'));
    } catch (err) {
      server.log.error(err as any, 'Ed25519 budget signature verification error');
    }

    if (!isVerified) {
      await client.query('ROLLBACK');
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'INVALID_SIGNATURE',
          message: 'Cryptographic budget signature validation failed. Supply authority unverified.'
        }
      });
    }

    // 3. Verify Budget Status
    if (budget.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return reply.status(400).send({
        success: false,
        error: {
          statusCode: 400,
          code: 'INACTIVE_BUDGET',
          message: `Cannot draw down capacity. Budget status is ${budget.status}.`
        }
      });
    }

    const approved = parseFloat(budget.approved_quantity);
    const consumed = parseFloat(budget.consumed_quantity);
    const remaining = approved - consumed;

    // 4. Verify Remaining Capacity
    if (remaining < drawdownAmount) {
      await client.query('ROLLBACK');
      return reply.status(422).send({
        success: false,
        error: {
          statusCode: 422,
          code: 'EXCEEDS_CAPACITY',
          message: `Requested drawdown of ${drawdownAmount} exceeds remaining capacity of ${remaining}.`
        }
      });
    }

    const newConsumed = consumed + drawdownAmount;
    const newRemaining = approved - newConsumed;
    const newStatus = newRemaining === 0 ? 'EXHAUSTED' : 'ACTIVE';

    // 5. Update capacity
    const updateRes = await client.query(
      `UPDATE budgets
       SET consumed_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, approved_quantity, consumed_quantity, status`,
      [newConsumed, newStatus, id]
    );

    // 6. Commit transaction
    await client.query('COMMIT');

    const updatedBudget = updateRes.rows[0];
    return reply.status(200).send({
      success: true,
      data: {
        budget: {
          id: updatedBudget.id,
          approvedQuantity: parseFloat(updatedBudget.approved_quantity),
          consumedQuantity: parseFloat(updatedBudget.consumed_quantity),
          remainingQuantity: parseFloat(updatedBudget.approved_quantity) - parseFloat(updatedBudget.consumed_quantity),
          status: updatedBudget.status
        }
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

// Route: Get all budgets
server.get('/api/v1/budgets', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  const user = request.user as any;
  let result;
  
  if (user && user.orgType === 'PRODUCER') {
    result = await pgPool.query(`
      SELECT b.*, p.name as producer 
      FROM budgets b 
      LEFT JOIN producers p ON b.producer_id = p.id 
      WHERE b.producer_id = $1
      ORDER BY b.created_at DESC
    `, [user.orgId]);
  } else {
    result = await pgPool.query(`
      SELECT b.*, p.name as producer 
      FROM budgets b 
      LEFT JOIN producers p ON b.producer_id = p.id 
      ORDER BY b.created_at DESC
    `);
  }

  return {
    success: true,
    data: {
      budgets: result.rows.map(row => ({
        id: row.id,
        producer: row.producer || 'Premium Farms',
        allocated: parseFloat(row.approved_quantity),
        consumed: parseFloat(row.consumed_quantity),
        status: row.status,
        crop: row.yield_assumptions?.crop || 'Organic White Honey',
        start: row.effective_start_date,
        end: row.effective_end_date
      }))
    }
  };
});

// Route: Submit Budget Proposal for Approval
server.post('/api/v1/budgets/:id/submit', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;

  const budgetFetch = await pgPool.query('SELECT status FROM budgets WHERE id = $1', [id]);
  if (budgetFetch.rows.length === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Budget not found.' } });
  }
  const currentStatus = budgetFetch.rows[0].status;

  await pgPool.query(`UPDATE budgets SET status = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
  await logBudgetStatus(pgPool, id, currentStatus, 'PENDING_APPROVAL', user.username, 'Farmer submitted budget for certifier approval');

  return { success: true, data: { status: 'PENDING_APPROVAL' } };
});

// Route: Certifier Reviewing Budget
server.post('/api/v1/budgets/:id/review', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { notes } = request.body as any;
  const user = request.user as any;

  const budgetFetch = await pgPool.query('SELECT status FROM budgets WHERE id = $1', [id]);
  if (budgetFetch.rows.length === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Budget not found.' } });
  }
  const currentStatus = budgetFetch.rows[0].status;

  await pgPool.query(`UPDATE budgets SET status = 'REVIEWING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
  await logBudgetStatus(pgPool, id, currentStatus, 'REVIEWING', user.username, notes || 'Certifier started administrative review');

  return { success: true, data: { status: 'REVIEWING' } };
});

// Route: Certifier Reject Budget
server.post('/api/v1/budgets/:id/reject', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { rejection_reason } = request.body as any;
  const user = request.user as any;

  if (!rejection_reason) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Rejection reason is required.' } });
  }

  const budgetFetch = await pgPool.query('SELECT status FROM budgets WHERE id = $1', [id]);
  if (budgetFetch.rows.length === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Budget not found.' } });
  }
  const currentStatus = budgetFetch.rows[0].status;

  await pgPool.query(
    `UPDATE budgets SET status = 'REJECTED', rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, rejection_reason]
  );
  await logBudgetStatus(pgPool, id, currentStatus, 'REJECTED', user.username, rejection_reason);

  return { success: true, data: { status: 'REJECTED', rejection_reason } };
});

// Route: Certifier Request Revision
server.post('/api/v1/budgets/:id/revision', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'CERTIFICATION_BODY' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { notes } = request.body as any;
  const user = request.user as any;

  if (!notes) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Revision notes are required.' } });
  }

  const budgetFetch = await pgPool.query('SELECT status FROM budgets WHERE id = $1', [id]);
  if (budgetFetch.rows.length === 0) {
    return reply.status(404).send({ success: false, error: { statusCode: 404, message: 'Budget not found.' } });
  }
  const currentStatus = budgetFetch.rows[0].status;

  await pgPool.query(
    `UPDATE budgets SET status = 'REVISION_REQUESTED', rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, notes]
  );
  await logBudgetStatus(pgPool, id, currentStatus, 'REVISION_REQUESTED', user.username, notes);

  return { success: true, data: { status: 'REVISION_REQUESTED', notes } };
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8082', 10);
    
    // Seed default entities
    const client = await pgPool.connect();
    try {
      await client.query(`
        INSERT INTO certifiers (id, name, accreditation_details, public_key, key_status)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Organic Trade Council India', '{}', '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuivJCz//jZz3K7oRzWslrZ8f02pSYSU/9LqPUFgBBHA=\n-----END PUBLIC KEY-----', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
      `);

      await client.query(`
        INSERT INTO producers (id, name, type, registry_references)
        VALUES ('00000000-0000-0000-0000-000000000002', 'Premium Farms', 'FARMER', '{}')
        ON CONFLICT (id) DO NOTHING
      `);

      await client.query(`
        INSERT INTO budgets (id, producer_id, certifier_id, source_unit_type, approved_quantity, consumed_quantity, signature_bundle, effective_start_date, effective_end_date, status, yield_assumptions)
        VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'UNIT_COUNT', 10000.00, 0.00, 'sig_default', '2026-07-11T00:00:00Z', '2027-07-11T00:00:00Z', 'PENDING_APPROVAL', '{"crop": "Organic White Honey"}')
        ON CONFLICT (id) DO NOTHING
      `);
    } catch (dbErr) {
      server.log.error(dbErr as any, 'Seeding database failed');
    } finally {
      client.release();
    }

    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`CPQ service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
