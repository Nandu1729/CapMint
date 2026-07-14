import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
const server = Fastify({
    logger: true
});
// Configure CORS headers manually to support client-side fetch from frontend
server.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (request.method === 'OPTIONS') {
        return reply.status(204).send();
    }
});
// Configure JWT plugin
server.register(jwt, {
    secret: process.env.JWT_SECRET || 'capmint_development_jwt_secret_must_be_minimum_32_bytes_long'
});
// Decorators: authenticate / authorize
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
// Helper: Haversine distance in km between two coordinates
export function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
// Standard health check route
server.get('/health', async () => {
    return { status: 'healthy', service: 'verification-service' };
});
// Route: Public Verification scan lookup (M-009 / M-010 clone detection)
server.post('/api/v1/verify/:gtin/:serial', async (request, reply) => {
    const { gtin, serial } = request.params;
    const { lat, lon, device_metadata } = request.body;
    if (!gtin || !serial) {
        return reply.status(400).send({
            success: false,
            error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing GTIN or Serial parameter.' }
        });
    }
    // 1. Query unit code & lot context
    const query = `
    SELECT u.id, u.serial, u.gtin, u.current_state, u.clone_flag,
           l.id as lot_id, l.revocation_status, l.lab_status,
           r.result_summary, r.report_reference
    FROM unit_codes u
    JOIN lots l ON u.lot_id = l.id
    LEFT JOIN lab_results r ON r.lot_id = l.id
    WHERE u.gtin = $1 AND u.serial = $2
  `;
    const result = await pgPool.query(query, [gtin, serial]);
    if (result.rowCount === 0) {
        return reply.status(404).send({
            success: false,
            error: {
                statusCode: 404,
                code: 'CODE_NOT_FOUND',
                message: 'The requested product QR code identity record was not found.'
            }
        });
    }
    const codeRecord = result.rows[0];
    let finalVerdict = 'VERIFIED';
    let isCloneSuspect = codeRecord.clone_flag;
    // 2. Evaluate revocation status (M-011)
    if (codeRecord.revocation_status === 'REVOKED' || codeRecord.current_state === 'REVOKED') {
        finalVerdict = 'REVOKED';
    }
    else {
        // 3. Clone detection checks (M-010 geovelocity calculations)
        if (lat !== undefined && lon !== undefined) {
            // Find the previous scan event for this unit code
            const prevScanRes = await pgPool.query('SELECT * FROM scan_events WHERE unit_code_id = $1 ORDER BY timestamp DESC LIMIT 1', [codeRecord.id]);
            if (prevScanRes.rowCount && prevScanRes.rowCount > 0) {
                const prevScan = prevScanRes.rows[0];
                const prevLoc = prevScan.location;
                if (prevLoc && prevLoc.lat !== undefined && prevLoc.lon !== undefined) {
                    const distanceKm = getHaversineDistance(parseFloat(prevLoc.lat), parseFloat(prevLoc.lon), parseFloat(lat), parseFloat(lon));
                    const timeDiffHours = (Date.now() - new Date(prevScan.timestamp).getTime()) / 3600000;
                    // If time diff is positive and velocity exceeds speed limits (e.g. 800 km/h)
                    if (timeDiffHours > 0) {
                        const velocity = distanceKm / timeDiffHours;
                        if (velocity > 800) {
                            isCloneSuspect = true;
                            finalVerdict = 'CLONE-SUSPECT';
                            // Flag record in DB
                            await pgPool.query('UPDATE unit_codes SET clone_flag = TRUE WHERE id = $1', [codeRecord.id]);
                        }
                    }
                }
            }
        }
    }
    // 4. Save this scan event
    await pgPool.query(`INSERT INTO scan_events (unit_code_id, location, device_metadata, verdict)
     VALUES ($1, $2, $3, $4)`, [
        codeRecord.id,
        JSON.stringify(lat !== undefined && lon !== undefined ? { lat, lon } : null),
        JSON.stringify(device_metadata || {}),
        finalVerdict
    ]);
    return {
        success: true,
        data: {
            verdict: finalVerdict,
            gtin: codeRecord.gtin,
            serial: codeRecord.serial,
            cloneSuspect: isCloneSuspect,
            productMetadata: codeRecord.product_metadata,
            labResult: codeRecord.result_summary ? {
                status: codeRecord.result_summary,
                reportUrl: codeRecord.report_reference
            } : null
        }
    };
});
// Route: Public Verification lookup by secure public identifier
server.post('/api/v1/verify/v/:public_identifier', async (request, reply) => {
    const { public_identifier } = request.params;
    const { lat, lon, device_metadata } = request.body;
    // Validate UUIDv4 format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!public_identifier || !uuidRegex.test(public_identifier)) {
        return reply.status(400).send({
            success: false,
            error: {
                statusCode: 400,
                code: 'INVALID_IDENTIFIER',
                message: 'The provided public identifier is malformed or invalid.'
            }
        });
    }
    // 1. Query unit code & lot & budget context using public_identifier
    const query = `
    SELECT u.id, u.serial, u.gtin, u.current_state, u.clone_flag,
           l.id as lot_id, l.revocation_status, l.lab_status,
           b.effective_end_date,
           r.result_summary, r.report_reference
    FROM unit_codes u
    JOIN lots l ON u.lot_id = l.id
    JOIN budgets b ON l.budget_id = b.id
    LEFT JOIN lab_results r ON r.lot_id = l.id
    WHERE u.public_identifier = $1
  `;
    const result = await pgPool.query(query, [public_identifier]);
    if (result.rowCount === 0) {
        return reply.status(404).send({
            success: false,
            error: {
                statusCode: 404,
                code: 'UNKNOWN_CODE',
                message: 'The requested product QR code identity record was not found.'
            }
        });
    }
    const codeRecord = result.rows[0];
    let finalStatus = 'VERIFIED';
    let isCloneSuspect = codeRecord.clone_flag;
    // 2. Evaluate validity states: VERIFIED, REVOKED, EXPIRED, UNKNOWN
    const isExpired = new Date(codeRecord.effective_end_date) < new Date();
    if (codeRecord.revocation_status === 'REVOKED' || codeRecord.current_state === 'REVOKED') {
        finalStatus = 'REVOKED';
    }
    else if (isExpired) {
        finalStatus = 'EXPIRED';
    }
    // Define default risk level based on clone_flag (LOW or CRITICAL)
    const finalRisk = isCloneSuspect ? 'CRITICAL' : 'LOW';
    // 3. Save this scan event
    await pgPool.query(`INSERT INTO scan_events (unit_code_id, location, device_metadata, verdict)
     VALUES ($1, $2, $3, $4)`, [
        codeRecord.id,
        JSON.stringify(lat !== undefined && lon !== undefined ? { lat, lon } : null),
        JSON.stringify(device_metadata || {}),
        finalStatus
    ]);
    return {
        success: true,
        data: {
            status: finalStatus,
            risk: finalRisk,
            gtin: codeRecord.gtin,
            serial: codeRecord.serial,
            productMetadata: codeRecord.product_metadata,
            labResult: codeRecord.result_summary ? {
                status: codeRecord.result_summary,
                reportUrl: codeRecord.report_reference
            } : null
        }
    };
});
// Route: Cascade Revocation (M-011)
server.post('/api/v1/lots/:id/revoke', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const { id } = request.params;
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // 1. Check if Lot exists
        const lotRes = await client.query('SELECT id FROM lots WHERE id = $1', [id]);
        if (lotRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
                success: false,
                error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
            });
        }
        // 2. Cascade update lot status
        await client.query(`UPDATE lots SET revocation_status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        // 3. Cascade update associated unit codes to REVOKED status
        await client.query(`UPDATE unit_codes
       SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
       WHERE lot_id = $1`, [id]);
        await client.query('COMMIT');
        return {
            success: true,
            message: 'Lot and all associated unit codes cascade revoked successfully.'
        };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
});
// Start the server
const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '8086', 10);
        await server.listen({ port, host: '0.0.0.0' });
        server.log.info(`Verification service listening on port ${port}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
if (process.env.NODE_ENV !== 'test') {
    start();
}
//# sourceMappingURL=index.js.map