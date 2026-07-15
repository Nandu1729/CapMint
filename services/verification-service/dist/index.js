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
           l.id as lot_id, l.revocation_status, l.lab_status, l.product_metadata,
           b.effective_end_date,
           r.result_summary, r.report_reference,
           (SELECT COUNT(*) FROM scan_events WHERE unit_code_id = u.id) as real_scan_count
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
    // 1.5 Dynamic geovelocity clone detection
    const lastScanQuery = `
    SELECT timestamp, location
    FROM scan_events
    WHERE unit_code_id = $1
    ORDER BY timestamp DESC
    LIMIT 1
  `;
    const lastScanResult = await pgPool.query(lastScanQuery, [codeRecord.id]);
    if (lastScanResult.rows.length > 0 && lat !== undefined && lon !== undefined) {
        const prevScan = lastScanResult.rows[0];
        let prevLoc = null;
        try {
            prevLoc = typeof prevScan.location === 'string' ? JSON.parse(prevScan.location) : prevScan.location;
        }
        catch (e) { }
        if (prevLoc && prevLoc.lat !== undefined && prevLoc.lon !== undefined) {
            const distance = getHaversineDistance(prevLoc.lat, prevLoc.lon, parseFloat(lat), parseFloat(lon));
            const timeDiffMs = Date.now() - new Date(prevScan.timestamp).getTime();
            const hours = timeDiffMs / (1000 * 60 * 60);
            // If scanned in a different location in less than a minimal threshold, or speed > 500 km/h
            if (distance > 5) {
                const speed = hours > 0 ? distance / hours : Infinity;
                if (speed > 500 || hours < 0.05) {
                    isCloneSuspect = true;
                    await pgPool.query('UPDATE unit_codes SET clone_flag = true WHERE id = $1', [codeRecord.id]);
                }
            }
        }
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
    // 3.5 Automatically create Investigation Case if risk is CRITICAL or HIGH
    if (finalRisk === 'CRITICAL' || finalRisk === 'HIGH') {
        // Check if open case already exists to prevent duplicate timeline spam
        const existingCheck = await pgPool.query(`SELECT id FROM investigations WHERE public_identifier = $1 AND status IN ('OPEN', 'UNDER_REVIEW')`, [public_identifier]);
        if (existingCheck.rows.length === 0) {
            // Query historical scans for evidence
            const scansRes = await pgPool.query(`SELECT timestamp, location, device_metadata, verdict FROM scan_events WHERE unit_code_id = $1 ORDER BY timestamp DESC`, [codeRecord.id]);
            const evidence = {
                verification_timeline: [
                    { name: 'Product Minted', status: '✓ Completed' },
                    { name: 'Organic Certificate Approved', status: '✓ Completed' },
                    { name: 'Laboratory Verified', status: '✓ Completed' },
                    { name: 'Packaged', status: '✓ Completed' },
                    { name: 'Distribution Started', status: '✓ Completed' }
                ],
                historical_scan_events: scansRes.rows.map(s => ({
                    timestamp: s.timestamp,
                    location: s.location || { country: 'India' },
                    verdict: s.verdict,
                    device: s.device_metadata
                })),
                risk_factors: [
                    "Duplicate scan detected: Clone suspect check triggered",
                    "Potential counterfeit: Identical QR code scanned multiple times"
                ],
                current_product_status: finalStatus,
                current_risk_level: finalRisk,
                investigation_reason: "High risk clone detection rule triggered: code copy suspect",
                transparency_timeline: [
                    { name: 'Investigation Opened', status: '⚠ Under Investigation' }
                ]
            };
            await pgPool.query(`
        INSERT INTO investigations (
          product_name, public_identifier, risk_level, status, detection_reason, manufacturer, current_product_status, evidence
        )
        VALUES ($1, $2, $3, 'OPEN', $4, $5, $6, $7)
        ON CONFLICT (public_identifier) DO UPDATE
        SET status = 'OPEN', updated_at = CURRENT_TIMESTAMP
      `, [
                codeRecord.product_metadata?.name || 'Organic White Honey',
                public_identifier,
                finalRisk,
                'Clone suspect flag tripped due to anomalous scanning frequency',
                codeRecord.product_metadata?.manufacturer || 'Premium Farms',
                finalStatus,
                JSON.stringify(evidence)
            ]);
            // Append Investigation Created event to transparency ledger
            try {
                await fetch('http://transparency-service:8085/api/v1/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entity_type: 'INVESTIGATION',
                        entity_id: public_identifier,
                        event_type: 'INVESTIGATION_CREATED',
                        payload: {
                            public_identifier,
                            risk_level: finalRisk,
                            reason: 'Clone suspect flag tripped due to anomalous scanning frequency'
                        }
                    })
                });
            }
            catch (logErr) {
                server.log.error(logErr, 'Failed to append INVESTIGATION_CREATED to transparency ledger');
            }
        }
    }
    // Compute dynamic scan count (this scan + prior scans)
    const realScanCount = parseInt(codeRecord.real_scan_count || '0') + 1;
    const productMetadata = {
        ...codeRecord.product_metadata,
        scan_count: realScanCount.toString()
    };
    return {
        success: true,
        data: {
            status: finalStatus,
            risk: finalRisk,
            gtin: codeRecord.gtin,
            serial: codeRecord.serial,
            productMetadata: productMetadata,
            labResult: codeRecord.result_summary ? {
                status: codeRecord.result_summary,
                reportUrl: codeRecord.report_reference
            } : null
        }
    };
});
// Route: Public simulation registration for Manufacturer Console (persists generated QR/record in DB)
server.post('/api/v1/verify/register', async (request, reply) => {
    const { public_identifier, gtin, serial, verification_url, qr_code_data_uri, product_metadata } = request.body;
    if (!public_identifier || !gtin || !serial || !verification_url) {
        return reply.status(400).send({
            success: false,
            error: {
                statusCode: 400,
                code: 'BAD_REQUEST',
                message: 'Missing public_identifier, gtin, serial, or verification_url in request body.'
            }
        });
    }
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // 1. Insert default Certifier if not exists
        await client.query(`
      INSERT INTO certifiers (id, name, accreditation_details, public_key, key_status)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Organic Trade Council India', '{}', 'pk_default', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `);
        // 2. Insert default Producer if not exists
        await client.query(`
      INSERT INTO producers (id, name, type, registry_references)
      VALUES ('00000000-0000-0000-0000-000000000002', 'Premium Farms', 'FARMER', '{}')
      ON CONFLICT (id) DO NOTHING
    `);
        // 3. Insert default Budget if not exists
        await client.query(`
      INSERT INTO budgets (id, producer_id, certifier_id, source_unit_type, approved_quantity, signature_bundle, effective_start_date, effective_end_date, status, yield_assumptions)
      VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'UNIT_COUNT', 1000000, 'sig_default', '2026-07-11T00:00:00Z', '2027-07-11T00:00:00Z', 'ACTIVE', '{}')
      ON CONFLICT (id) DO NOTHING
    `);
        // 4. Insert dynamic Lot
        const lotInsert = await client.query(`
      INSERT INTO lots (id, producer_id, budget_id, product_metadata, batch_size, processing_dates, lab_status)
      VALUES (uuid_generate_v4(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', $1, 10000, '{}', 'PASSED')
      RETURNING id
    `, [JSON.stringify(product_metadata || { name: 'Organic White Honey', manufacturer: 'Premium Farms' })]);
        const lotUuid = lotInsert.rows[0].id;
        // 5. Insert Lab Result for the dynamic Lot if not exists
        await client.query(`
      INSERT INTO lab_results (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
      VALUES ($1, 'Intertek India Labs', 'Purity Certification Test', 'PASS', 'hash_lab_default', 'NABL-INTK-2026-10492')
      ON CONFLICT (lot_id) DO NOTHING
    `, [lotUuid]);
        // 6. Insert Unit Code
        const digital_link_uri = `https://id.capmint.io/01/${gtin}/21/${serial}`;
        await client.query(`
      INSERT INTO unit_codes (lot_id, serial, gtin, digital_link_uri, public_identifier, verification_url, qr_code_data_uri, current_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'MINTED')
      ON CONFLICT (public_identifier) DO NOTHING
    `, [lotUuid, serial, gtin, digital_link_uri, public_identifier, verification_url, qr_code_data_uri]);
        await client.query('COMMIT');
        return { success: true, message: 'Verification record persisted successfully.' };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
});
// Route: Public simulation revocation for Manufacturer Console
server.post('/api/v1/verify/revoke', async (request, reply) => {
    const { batch_id, reason } = request.body;
    if (!batch_id) {
        return reply.status(400).send({
            success: false,
            error: {
                statusCode: 400,
                code: 'BAD_REQUEST',
                message: 'Missing batch_id in request body.'
            }
        });
    }
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // 1. Find all lots matching batch_id
        const lotRes = await client.query(`SELECT id FROM lots WHERE product_metadata->>'batch_id' = $1`, [batch_id]);
        if (lotRes.rowCount !== null && lotRes.rowCount > 0) {
            const lotIds = lotRes.rows.map(row => row.id);
            const revocationReason = reason || 'Organic certification withdrawn';
            // 2. Update revocation status and metadata on these lots
            await client.query(`UPDATE lots 
         SET revocation_status = 'REVOKED', 
             product_metadata = product_metadata || jsonb_build_object('revocation_reason', $2::text, 'revocation_date', CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ANY($1)`, [lotIds, revocationReason]);
            // 3. Update associated unit codes to REVOKED state
            await client.query(`UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE lot_id = ANY($1)`, [lotIds]);
        }
        await client.query('COMMIT');
        return { success: true, message: `Batch ${batch_id} and all associated unit codes cascade revoked successfully in simulation.` };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
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
// Route: Get all unit codes
server.get('/api/v1/verify/unit-codes', async (request, reply) => {
    const result = await pgPool.query(`
    SELECT u.*, l.product_metadata 
    FROM unit_codes u
    LEFT JOIN lots l ON u.lot_id = l.id
    ORDER BY u.minted_at DESC
  `);
    return {
        success: true,
        data: {
            unitCodes: result.rows.map(row => ({
                lotId: row.lot_id,
                serial: row.serial,
                gtin: row.gtin,
                public_identifier: row.public_identifier,
                verification_url: row.verification_url,
                qrCodeDataUri: row.qr_code_data_uri,
                state: row.current_state,
                clone_flag: row.clone_flag,
                productMetadata: row.product_metadata
            }))
        }
    };
});
// Route: Get all lots
server.get('/api/v1/verify/lots', async (request, reply) => {
    const result = await pgPool.query('SELECT * FROM lots ORDER BY created_at DESC');
    return {
        success: true,
        data: {
            lots: result.rows.map(row => ({
                id: row.id,
                budgetId: row.budget_id,
                crop: row.product_metadata?.name || 'Organic White Honey',
                weight: parseFloat(row.batch_size),
                status: row.revocation_status === 'REVOKED' ? 'REVOKED' : 'ACTIVE'
            }))
        }
    };
});
// Route: List Investigations
server.get('/api/v1/verify/investigations', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const result = await pgPool.query('SELECT * FROM investigations ORDER BY created_at DESC');
    return {
        success: true,
        data: {
            investigations: result.rows.map(row => ({
                id: row.id,
                product_name: row.product_name,
                public_identifier: row.public_identifier,
                risk_level: row.risk_level,
                status: row.status,
                detection_time: row.detection_time,
                detection_reason: row.detection_reason,
                manufacturer: row.manufacturer,
                current_product_status: row.current_product_status,
                evidence: row.evidence
            }))
        }
    };
});
// Route: Get Investigation Details
server.get('/api/v1/verify/investigations/:id', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const { id } = request.params;
    const result = await pgPool.query('SELECT * FROM investigations WHERE id = $1', [id]);
    if (result.rows.length === 0) {
        return reply.status(404).send({
            success: false,
            error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
        });
    }
    const row = result.rows[0];
    return {
        success: true,
        data: {
            investigation: {
                id: row.id,
                product_name: row.product_name,
                public_identifier: row.public_identifier,
                risk_level: row.risk_level,
                status: row.status,
                detection_time: row.detection_time,
                detection_reason: row.detection_reason,
                manufacturer: row.manufacturer,
                current_product_status: row.current_product_status,
                evidence: row.evidence
            }
        }
    };
});
// Route: Approve Revocation
server.post('/api/v1/verify/investigations/:id/approve', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const { id } = request.params;
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // 1. Fetch Investigation
        const invRes = await client.query('SELECT * FROM investigations WHERE id = $1 FOR UPDATE', [id]);
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
                success: false,
                error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
            });
        }
        const inv = invRes.rows[0];
        const pubId = inv.public_identifier;
        // 2. Fetch linked unit code to get lot ID
        const ucRes = await client.query('SELECT id, lot_id FROM unit_codes WHERE public_identifier = $1', [pubId]);
        if (ucRes.rows.length > 0) {
            const codeRecord = ucRes.rows[0];
            const lotId = codeRecord.lot_id;
            // 3. Update Unit Code state to REVOKED
            await client.query(`UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE id = $1`, [codeRecord.id]);
            // 4. Update Lot revocation status to REVOKED
            await client.query(`UPDATE lots 
         SET revocation_status = 'REVOKED', 
             product_metadata = product_metadata || jsonb_build_object('revocation_reason', $2::text, 'revocation_date', CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`, [lotId, inv.detection_reason]);
        }
        // 5. Update Investigation Status to REVOKED (resolved state)
        await client.query(`UPDATE investigations SET status = 'REVOKED', current_product_status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        // 6. Commit transaction
        await client.query('COMMIT');
        // 7. Log to Transparency Ledger
        try {
            await fetch('http://transparency-service:8085/api/v1/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entity_type: 'INVESTIGATION',
                    entity_id: pubId,
                    event_type: 'INVESTIGATION_APPROVED',
                    payload: {
                        investigation_id: id,
                        public_identifier: pubId,
                        action: 'REVOCATION_APPROVED',
                        reason: inv.detection_reason
                    }
                })
            });
            await fetch('http://transparency-service:8085/api/v1/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entity_type: 'PRODUCT',
                    entity_id: pubId,
                    event_type: 'PRODUCT_REVOKED',
                    payload: {
                        public_identifier: pubId,
                        reason: inv.detection_reason
                    }
                })
            });
        }
        catch (logErr) {
            server.log.error(logErr, 'Failed to append to ledger during approval');
        }
        return {
            success: true,
            message: 'Investigation approved and product officially revoked.'
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
// Route: Dismiss Investigation
server.post('/api/v1/verify/investigations/:id/dismiss', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const { id } = request.params;
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // 1. Fetch Investigation
        const invRes = await client.query('SELECT * FROM investigations WHERE id = $1 FOR UPDATE', [id]);
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
                success: false,
                error: { statusCode: 404, code: 'NOT_FOUND', message: 'Investigation not found.' }
            });
        }
        const inv = invRes.rows[0];
        const pubId = inv.public_identifier;
        // 2. Update status to DISMISSED
        await client.query(`UPDATE investigations SET status = 'DISMISSED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        await client.query('COMMIT');
        // 3. Log to Transparency Ledger
        try {
            await fetch('http://transparency-service:8085/api/v1/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entity_type: 'INVESTIGATION',
                    entity_id: pubId,
                    event_type: 'INVESTIGATION_DISMISSED',
                    payload: {
                        investigation_id: id,
                        public_identifier: pubId,
                        action: 'INVESTIGATION_DISMISSED'
                    }
                })
            });
        }
        catch (logErr) {
            server.log.error(logErr, 'Failed to append to ledger during dismissal');
        }
        return {
            success: true,
            message: 'Investigation successfully dismissed.'
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
// Route: Register Lab Results
server.post('/api/v1/verify/lab-results', {
    preValidation: [server.authenticate, server.authorize(['CERTIFIER', 'ADMIN'])]
}, async (request, reply) => {
    const { lot_id, lab_name, test_type, result_summary, report_hash, report_reference, pdf_content } = request.body;
    if (!lot_id || !lab_name || !test_type || !result_summary || !report_hash) {
        return reply.status(400).send({
            success: false,
            error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing required lab result fields.' }
        });
    }
    // Cryptographically validate and recompute PDF hash on the backend
    if (pdf_content) {
        const crypto = require('crypto');
        try {
            const buffer = Buffer.from(pdf_content, 'base64');
            const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex');
            if (calculatedHash !== report_hash) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        statusCode: 400,
                        code: 'HASH_MISMATCH',
                        message: `Uploaded PDF SHA-256 hash validation failed. Recomputed hash: ${calculatedHash} does not match provided hash: ${report_hash}.`
                    }
                });
            }
        }
        catch (err) {
            return reply.status(400).send({
                success: false,
                error: {
                    statusCode: 400,
                    code: 'INVALID_PDF_CONTENT',
                    message: 'Failed to decode and validate PDF content.'
                }
            });
        }
    }
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // 1. Check if lot exists
        const lotCheck = await client.query('SELECT id FROM lots WHERE id = $1', [lot_id]);
        if (lotCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
                success: false,
                error: { statusCode: 404, code: 'NOT_FOUND', message: 'Lot not found.' }
            });
        }
        // 2. Insert lab result
        const insertRes = await client.query(`
      INSERT INTO lab_results (id, lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
      VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [lot_id, lab_name, test_type, result_summary, report_reference || '']);
        // 3. Update the lot's lab status in PostgreSQL
        await client.query(`UPDATE lots SET lab_status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [lot_id, result_summary === 'PASSED' ? 'PASSED' : 'FAILED']);
        // 4. If result is FAILED, trigger dynamic revocation
        if (result_summary === 'FAILED') {
            // Cascade revocation
            await client.query(`UPDATE unit_codes SET current_state = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE lot_id = $1`, [lot_id]);
            await client.query(`UPDATE lots 
         SET revocation_status = 'REVOKED', 
             product_metadata = product_metadata || jsonb_build_object('revocation_reason', 'Laboratory test failed: ' || $2::text, 'revocation_date', CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`, [lot_id, test_type]);
            // Append log entry to Transparency Ledger
            try {
                await fetch('http://transparency-service:8085/api/v1/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entity_type: 'LOT',
                        entity_id: lot_id,
                        event_type: 'LOT_LAB_TEST_FAILED_CASCADING_REVOCATION',
                        payload: {
                            lot_id,
                            lab_name,
                            test_type,
                            report_hash
                        }
                    })
                });
            }
            catch (logErr) {
                server.log.error(logErr, 'Failed to append failed lab test event to ledger');
            }
        }
        else {
            // Append standard lab test passed log event
            try {
                await fetch('http://transparency-service:8085/api/v1/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entity_type: 'LOT',
                        entity_id: lot_id,
                        event_type: 'LOT_LAB_TEST_PASSED',
                        payload: {
                            lot_id,
                            lab_name,
                            test_type,
                            report_hash
                        }
                    })
                });
            }
            catch (logErr) {
                server.log.error(logErr, 'Failed to append passed lab test event to ledger');
            }
        }
        await client.query('COMMIT');
        return {
            success: true,
            data: {
                labResult: insertRes.rows[0]
            }
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
        // Create investigations table if not exists
        const client = await pgPool.connect();
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS investigations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          product_name VARCHAR(255) NOT NULL,
          public_identifier UUID NOT NULL UNIQUE,
          risk_level VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
          detection_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          detection_reason TEXT NOT NULL,
          manufacturer VARCHAR(255) NOT NULL,
          current_product_status VARCHAR(32) NOT NULL,
          evidence JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
        }
        catch (dbErr) {
            server.log.error(dbErr, 'Failed to initialize investigations table');
        }
        finally {
            client.release();
        }
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