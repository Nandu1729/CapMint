import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
const server = Fastify({
    logger: true
});
// Configure JWT plugin (using same shared secret)
server.register(jwt, {
    secret: process.env.JWT_SECRET || 'capmint_development_jwt_secret_must_be_minimum_32_bytes_long'
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
server.decorate('authenticate', async (request, reply) => {
    try {
        await request.jwtVerify();
    }
    catch (err) {
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
server.decorate('authorize', (allowedRoles) => {
    return async (request, reply) => {
        const user = request.user;
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
// Standard health check route
server.get('/health', async () => {
    return { status: 'healthy', service: 'cpq-service' };
});
// Route: Propose/Draft Budget
server.post('/api/v1/budgets', {
    preValidation: [server.authenticate, server.authorize(['PRODUCER', 'ADMIN'])]
}, async (request, reply) => {
    const { producer_id, certifier_id, source_unit_type, approved_quantity, yield_assumptions, signature_bundle, effective_start_date, effective_end_date } = request.body;
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
server.post('/api/v1/budgets/:id/activate', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const { id } = request.params;
    const result = await pgPool.query(`UPDATE budgets SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, status`, [id]);
    if (result.rowCount === 0) {
        return reply.status(404).send({
            success: false,
            error: {
                statusCode: 404,
                code: 'NOT_FOUND',
                message: 'Budget not found.'
            }
        });
    }
    return {
        success: true,
        data: {
            budget: result.rows[0]
        }
    };
});
// Route: Drawdown Capacity (supports row locking FOR UPDATE to prevent race conditions)
server.post('/api/v1/budgets/:id/drawdown', {
    preValidation: [server.authenticate, server.authorize(['PACK_HOUSE', 'ADMIN'])]
}, async (request, reply) => {
    const { id } = request.params;
    const { amount } = request.body;
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
        const updateRes = await client.query(`UPDATE budgets
       SET consumed_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, approved_quantity, consumed_quantity, status`, [newConsumed, newStatus, id]);
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
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
});
// Route: Get all budgets
server.get('/api/v1/budgets', async (request, reply) => {
    const result = await pgPool.query(`
    SELECT b.*, p.name as producer 
    FROM budgets b 
    LEFT JOIN producers p ON b.producer_id = p.id 
    ORDER BY b.created_at DESC
  `);
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
// Start the server
const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '8082', 10);
        // Seed default entities
        const client = await pgPool.connect();
        try {
            await client.query(`
        INSERT INTO certifiers (id, name, accreditation_details, public_key, key_status)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Organic Trade Council India', '{}', 'pk_default', 'ACTIVE')
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
        }
        catch (dbErr) {
            server.log.error(dbErr, 'Seeding database failed');
        }
        finally {
            client.release();
        }
        await server.listen({ port, host: '0.0.0.0' });
        server.log.info(`CPQ service listening on port ${port}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map