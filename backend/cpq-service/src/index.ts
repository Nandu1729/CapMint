import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'node:url';
import {
  assertRlsServiceRole,
  tenantContextFromUser,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';
import {
  createLoggingOptions,
  registerRequestLogging
} from '../../../packages/shared/logging.js';
import { registerReadiness } from '../../../packages/shared/readiness.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedSpecs: any[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify(createLoggingOptions());
registerRequestLogging(server);

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

const PRODUCER_OPERATION_SPECS = [
  { orgType: 'PRODUCER', role: 'ADMIN' },
  { orgType: 'PRODUCER', role: 'MEMBER' }
];
const CERTIFIER_OPERATION_SPECS = [
  { orgType: 'CERTIFICATION_BODY', role: 'ADMIN' },
  { orgType: 'CERTIFICATION_BODY', role: 'MEMBER' }
];
const BUDGET_READ_SPECS = [
  ...PRODUCER_OPERATION_SPECS,
  ...CERTIFIER_OPERATION_SPECS,
  { orgType: 'SYSTEM_ADMINISTRATOR', role: 'ADMIN' }
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
registerReadiness(server, { pgPool, redisClient });

async function lockProducerBudget(client: pg.PoolClient, budgetId: string, organizationId: string) {
  return client.query(
    `SELECT budget.*
     FROM budgets AS budget
     JOIN producers AS producer
       ON producer.id = budget.producer_id
     WHERE budget.id = $1
       AND producer.organization_id = $2
     FOR UPDATE OF budget
     FOR SHARE OF producer`,
    [budgetId, organizationId]
  );
}

async function lockCertifierBudget(client: pg.PoolClient, budgetId: string, organizationId: string) {
  return client.query(
    `SELECT budget.*
     FROM budgets AS budget
     JOIN certifiers AS certifier
       ON certifier.id = budget.certifier_id
     WHERE budget.id = $1
       AND certifier.organization_id = $2
     FOR UPDATE OF budget
     FOR SHARE OF certifier`,
    [budgetId, organizationId]
  );
}

// Standard health check route
server.get('/health', async () => {
  return { status: 'healthy', service: 'cpq-service' };
});

// Route: Propose/Draft Budget
server.post('/api/v1/budgets', {
  preValidation: [server.authenticate, server.authorize(PRODUCER_OPERATION_SPECS)]
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

  if (!certifier_id || !source_unit_type || !approved_quantity || !yield_assumptions || !signature_bundle || !effective_start_date || !effective_end_date) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing required fields in request body.'
      }
    });
  }

  const user = request.user as any;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (producer_id && !uuidPattern.test(producer_id)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'producer_id must be a valid UUID when provided.'
      }
    });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
  // Resolve the caller's only producer profile when the compatibility field is
  // omitted. A supplied legacy profile ID remains accepted only when owned by
  // the caller; profile and organization IDs are independent key spaces.
  const producerProfile = await client.query(
    `SELECT p.id
     FROM producers p
     JOIN organizations o ON o.id = p.organization_id
     WHERE p.organization_id = $1
       AND ($2::uuid IS NULL OR p.id = $2)
       AND o.type = 'PRODUCER'
       AND o.status = 'ACTIVATED'
     ORDER BY p.id
     LIMIT 2`,
    [user.orgId, producer_id || null]
  );
  if (producerProfile.rowCount === 0) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Producer profile not found.'
      }
    });
  }
  if (!producer_id && producerProfile.rowCount !== 1) {
    return reply.status(409).send({
      success: false,
      error: {
        statusCode: 409,
        code: 'AMBIGUOUS_PRODUCER_PROFILE',
        message: 'The producer profile could not be resolved unambiguously.'
      }
    });
  }

  const certifierProfile = await client.query(
    `SELECT c.id
     FROM certifiers c
     JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = $1
       AND c.key_status = 'ACTIVE'
       AND o.type = 'CERTIFICATION_BODY'
       AND o.status = 'ACTIVATED'`,
    [certifier_id]
  );
  if (certifierProfile.rowCount === 0) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Certifier not found.'
      }
    });
  }

  const canonicalProducerId = producerProfile.rows[0].id;
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
    const dupCheck = await client.query(
      `SELECT id FROM budgets 
       WHERE producer_id = $1 
         AND yield_assumptions->>'crop' = $2 
         AND status != 'REVOKED'
         AND (
           (effective_start_date, effective_end_date) OVERLAPS ($3::timestamp, $4::timestamp)
         )`,
      [canonicalProducerId, crop, effective_start_date, effective_end_date]
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
    SELECT producer.id, certifier.id, $3, $4, $5, $6, $7, $8, 'DRAFT'
    FROM producers AS producer
    JOIN organizations AS producer_organization
      ON producer_organization.id = producer.organization_id
    JOIN certifiers AS certifier
      ON certifier.id = $2
    JOIN organizations AS certifier_organization
      ON certifier_organization.id = certifier.organization_id
    WHERE producer.id = $1
      AND producer.organization_id = $9
      AND producer_organization.type = 'PRODUCER'
      AND producer_organization.status = 'ACTIVATED'
      AND certifier.key_status = 'ACTIVE'
      AND certifier_organization.type = 'CERTIFICATION_BODY'
      AND certifier_organization.status = 'ACTIVATED'
    RETURNING id, producer_id, certifier_id, source_unit_type, approved_quantity, remaining_quantity, status
  `;

  const result = await client.query(query, [
    canonicalProducerId,
    certifier_id,
    source_unit_type,
    quantity,
    JSON.stringify(yield_assumptions),
    signature_bundle,
    effective_start_date,
    effective_end_date,
    user.orgId
  ]);

  if (result.rowCount === 0) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Producer or certifier profile not found.'
      }
    });
  }

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
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;

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

  return withAuthenticatedTenantTx(request, async (client) => {

    const budgetFetch = await lockCertifierBudget(client, id, user.orgId);
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
    const message = `budget_id:${id};approved_quantity:${budget.approved_quantity}`;
    const certifierPrivateKey = process.env.CERTIFIER_PRIVATE_KEY;
    if (!certifierPrivateKey) {
      request.log.error('CERTIFIER_PRIVATE_KEY is not configured; cannot co-sign budget activation.');
      return reply.status(500).send({
        success: false,
        error: { statusCode: 500, code: 'SIGNING_UNAVAILABLE', message: 'Certifier signing key is not configured.' }
      });
    }

    let signatureBundle: string;
    try {
      signatureBundle = crypto.sign(null, Buffer.from(message), certifierPrivateKey).toString('hex');
    } catch (err) {
      request.log.error(err as any, 'Ed25519 signing failed');
      return reply.status(500).send({
        success: false,
        error: { statusCode: 500, code: 'SIGNING_FAILED', message: 'Budget activation could not be signed.' }
      });
    }

    const result = await client.query(
      `UPDATE budgets
       SET status = 'ACTIVE', signature_bundle = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, signature_bundle`,
      [id, signatureBundle]
    );
    await logBudgetStatus(client, id, budget.status, 'ACTIVE', user.username);
    return {
      success: true,
      data: {
        budget: result.rows[0]
      }
    };
  });
});

// Route: Drawdown Capacity (supports row locking FOR UPDATE to prevent race conditions)
server.post('/api/v1/budgets/:id/drawdown', {
  preValidation: [server.authenticate, server.authorize(PRODUCER_OPERATION_SPECS)]
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

  return withAuthenticatedTenantTx(request, async (client) => {

    // 2. Select For Update (Row Lock to prevent double-mint race conditions)
    const user = request.user as any;
    const budgetRes = await lockProducerBudget(client, id, user.orgId);
    if (budgetRes.rowCount === 0) {
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

    // 2.5 Verify the certifier's Ed25519 signature over the budget authorization. Fail closed:
    // a missing certifier, an unverifiable signature, or the placeholder 'sig_default'/'sig_failed'
    // values must all block the drawdown (no bypass).
    const certifierRes = await client.query('SELECT public_key FROM certifiers WHERE id = $1', [budget.certifier_id]);
    if (certifierRes.rows.length === 0) {
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
      request.log.error(err as any, 'Ed25519 budget signature verification error');
    }

    if (!isVerified) {
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
  });
});

// Route: Get all budgets
server.get('/api/v1/budgets', {
  preValidation: [server.authenticate, server.authorize(BUDGET_READ_SPECS)]
}, async (request, reply) => {
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
  let result;
  
  if (user.orgType === 'PRODUCER') {
    result = await client.query(`
      SELECT b.*, p.name as producer 
      FROM budgets b 
      JOIN producers p ON b.producer_id = p.id
      WHERE p.organization_id = $1
      ORDER BY b.created_at DESC
    `, [user.orgId]);
  } else if (user.orgType === 'CERTIFICATION_BODY') {
    result = await client.query(`
      SELECT b.*, p.name as producer
      FROM budgets b
      LEFT JOIN producers p ON b.producer_id = p.id
      JOIN certifiers c ON c.id = b.certifier_id
      WHERE c.organization_id = $1
      ORDER BY b.created_at DESC
    `, [user.orgId]);
  } else if (user.orgType === 'SYSTEM_ADMINISTRATOR' && user.role === 'ADMIN') {
    result = await client.query(`
      SELECT b.*, p.name as producer 
      FROM budgets b 
      LEFT JOIN producers p ON b.producer_id = p.id 
      ORDER BY b.created_at DESC
    `);
  } else {
    return reply.status(403).send({
      success: false,
      error: {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You do not have permission to list budgets.'
      }
    });
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
});

// Route: Submit Budget Proposal for Approval
server.post('/api/v1/budgets/:id/submit', {
  preValidation: [server.authenticate, server.authorize(PRODUCER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
    const budgetFetch = await lockProducerBudget(client, id, user.orgId);
    if (budgetFetch.rows.length === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Budget not found.' } });
    }

    await client.query(
      `UPDATE budgets SET status = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    await logBudgetStatus(client, id, budgetFetch.rows[0].status, 'PENDING_APPROVAL', user.username, 'Farmer submitted budget for certifier approval');
    return { success: true, data: { status: 'PENDING_APPROVAL' } };
  });
});

// Route: Certifier Reviewing Budget
server.post('/api/v1/budgets/:id/review', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { notes } = request.body as any;
  const user = request.user as any;
  return withAuthenticatedTenantTx(request, async (client) => {
    const budgetFetch = await lockCertifierBudget(client, id, user.orgId);
    if (budgetFetch.rows.length === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Budget not found.' } });
    }

    await client.query(`UPDATE budgets SET status = 'REVIEWING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    await logBudgetStatus(client, id, budgetFetch.rows[0].status, 'REVIEWING', user.username, notes || 'Certifier started administrative review');
    return { success: true, data: { status: 'REVIEWING' } };
  });
});

// Route: Certifier Reject Budget
server.post('/api/v1/budgets/:id/reject', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { rejection_reason } = request.body as any;
  const user = request.user as any;

  if (!rejection_reason) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Rejection reason is required.' } });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
    const budgetFetch = await lockCertifierBudget(client, id, user.orgId);
    if (budgetFetch.rows.length === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Budget not found.' } });
    }

    await client.query(
      `UPDATE budgets SET status = 'REJECTED', rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, rejection_reason]
    );
    await logBudgetStatus(client, id, budgetFetch.rows[0].status, 'REJECTED', user.username, rejection_reason);
    return { success: true, data: { status: 'REJECTED', rejection_reason } };
  });
});

// Route: Certifier Request Revision
server.post('/api/v1/budgets/:id/revision', {
  preValidation: [server.authenticate, server.authorize(CERTIFIER_OPERATION_SPECS)]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { notes } = request.body as any;
  const user = request.user as any;

  if (!notes) {
    return reply.status(400).send({ success: false, error: { statusCode: 400, message: 'Revision notes are required.' } });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
    const budgetFetch = await lockCertifierBudget(client, id, user.orgId);
    if (budgetFetch.rows.length === 0) {
      return reply.status(404).send({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Budget not found.' } });
    }

    await client.query(
      `UPDATE budgets SET status = 'REVISION_REQUESTED', rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, notes]
    );
    await logBudgetStatus(client, id, budgetFetch.rows[0].status, 'REVISION_REQUESTED', user.username, notes);
    return { success: true, data: { status: 'REVISION_REQUESTED', notes } };
  });
});

// Start the server
const start = async () => {
  try {
    await assertRlsServiceRole(pgPool, 'cpq-service');
    const port = parseInt(process.env.PORT || '8082', 10);
    
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`CPQ service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
