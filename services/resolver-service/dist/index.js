import Fastify from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
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
// Standard health check route
server.get('/health', async () => {
    return { status: 'healthy', service: 'resolver-service' };
});
// Route: GS1 Digital Link Resolution (M-007)
// Matches standard: /01/{gtin}/21/{serial}
server.get('/01/:gtin/21/:serial', async (request, reply) => {
    const { gtin, serial } = request.params;
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
        const result = await pgPool.query(query, [gtin, serial]);
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
        const verifyFrontendUrl = process.env.VERIFY_FRONTEND_URL || 'https://verify.capmint.io';
        const redirectUrl = `${verifyFrontendUrl}/verify?gtin=${gtin}&serial=${serial}`;
        return reply.redirect(302, redirectUrl);
    }
    catch (err) {
        throw err;
    }
});
// Start the server
const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '8084', 10);
        await server.listen({ port, host: '0.0.0.0' });
        server.log.info(`Resolver service listening on port ${port}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map