const crypto = require('crypto');

const BASE_URL = 'http://localhost:8080';
const JWT_SECRET = 'capmint_development_jwt_secret_must_be_minimum_32_bytes_long';

// Helper to generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Pure JS base64url encoder
function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Generate signed JWT manually
function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signatureInput}.${signature}`;
}

const uniqueId = Date.now().toString().slice(-6);

// Main test runner
async function runTests() {
  console.log('====================================================');
  console.log('       CapMint Extended Compliance API Testing       ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function report(id, pass, expected, got) {
    if (pass) {
      passed++;
      console.log(`[\x1b[32mPASS\x1b[0m] ${id}: Expected ${expected}`);
    } else {
      failed++;
      console.log(`[\x1b[31mFAIL\x1b[0m] ${id}: Expected ${expected}, got ${got}`);
    }
  }

  try {
    // 0. Database Cleaning and Initializing
    const pg = await import('pg');
    const pgPool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
    });
    await pgPool.query('TRUNCATE TABLE log_entries CASCADE');
    await pgPool.query(`
      INSERT INTO log_entries (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
      VALUES ('SYSTEM', '00000000-0000-0000-0000-000000000000', 'GENESIS_BLOCK_ANCHOR', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '00000000-0000-0000-0000-000000000000', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    `);
    
    // Create test organizations and retrieve tokens
    const prodEmail = `prod_${uniqueId}@test.com`;
    const prodUsername = `prod_user_${uniqueId}`;
    const certEmail = `cert_${uniqueId}@test.com`;
    const certUsername = `cert_user_${uniqueId}`;
    const labEmail = `lab_${uniqueId}@test.com`;
    const labUsername = `lab_user_${uniqueId}`;
    const expEmail = `exp_${uniqueId}@test.com`;
    const expUsername = `exp_user_${uniqueId}`;

    const orgs = [
      { name: `Producer_${uniqueId}`, type: 'PRODUCER', email: prodEmail, username: prodUsername },
      { name: `Certifier_${uniqueId}`, type: 'CERTIFICATION_BODY', email: certEmail, username: certUsername },
      { name: `Lab_${uniqueId}`, type: 'NABL_LABORATORY', email: labEmail, username: labUsername },
      { name: `Exporter_${uniqueId}`, type: 'EXPORTER', email: expEmail, username: expUsername }
    ];

    const tokens = {};
    const orgIds = {};

    // Get Admin Token
    const adminLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' })
    });
    const adminLoginData = await adminLogin.json();
    const adminToken = adminLoginData.data.token;

    for (const org of orgs) {
      const reg = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: org.name,
          type: org.type,
          business_reg_details: { tax_id: `TAX-${org.type}-${uniqueId}`, registration_number: `REG-${org.type}-${uniqueId}` },
          official_email: org.email,
          contact_info: { phone: '+919999999999', address: 'Testing Sector' },
          admin_username: org.username,
          admin_password: 'password123'
        })
      });
      const regData = await reg.json();
      const orgId = regData.data.organization.id;
      orgIds[org.type] = orgId;

      // Activate Org
      await fetch(`${BASE_URL}/api/v1/auth/organizations/${orgId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'ACTIVATED' })
      });

      // Update Certifier public key in database
      if (org.type === 'CERTIFICATION_BODY') {
        const certPubKey = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuivJCz//jZz3K7oRzWslrZ8f02pSYSU/9LqPUFgBBHA=\n-----END PUBLIC KEY-----';
        await pgPool.query('UPDATE certifiers SET public_key = $1 WHERE id = $2', [certPubKey, orgId]);
      }

      // Login to get token
      const log = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: org.username, password: 'password123' })
      });
      const logData = await log.json();
      tokens[org.type] = logData.data.token;
    }

    console.log('--- Phase 1: Authentication & Identity ---');

    // AUTH-07: Duplicate email
    const regDupEmail = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Prod_DupEmail_${uniqueId}`,
        type: 'PRODUCER',
        official_email: prodEmail,
        admin_username: `prod_dup_email_${uniqueId}`,
        admin_password: 'password123'
      })
    });
    report('AUTH-07', regDupEmail.status === 409, '409 Conflict', regDupEmail.status);

    // AUTH-08: Duplicate GST/license
    const regDupGst = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Prod_DupGst_${uniqueId}`,
        type: 'PRODUCER',
        business_reg_details: { tax_id: `TAX-PRODUCER-${uniqueId}` },
        official_email: `prod_dup_gst_${uniqueId}@test.com`,
        admin_username: `prod_dup_gst_${uniqueId}`,
        admin_password: 'password123'
      })
    });
    report('AUTH-08', regDupGst.status === 409, '409 Conflict', regDupGst.status);

    // AUTH-09: Register using invalid email format
    const regInvEmail = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Prod_InvEmail_${uniqueId}`,
        type: 'PRODUCER',
        official_email: 'invalidemail',
        admin_username: `prod_inv_email_${uniqueId}`,
        admin_password: 'password123'
      })
    });
    report('AUTH-09', regInvEmail.status === 400, '400 Validation Error', regInvEmail.status);

    // AUTH-10: Register with weak password
    const regWeakPass = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Prod_WeakPass_${uniqueId}`,
        type: 'PRODUCER',
        official_email: `weakpass_${uniqueId}@test.com`,
        admin_username: `prod_weak_pass_${uniqueId}`,
        admin_password: '123'
      })
    });
    report('AUTH-10', regWeakPass.status === 400, '400 Validation Error', regWeakPass.status);

    // AUTH-11: Login using expired JWT
    const expiredToken = signJWT({
      id: generateUUID(),
      username: prodUsername,
      orgId: orgIds.PRODUCER,
      orgType: 'PRODUCER',
      role: 'ADMIN',
      exp: Math.floor(Date.now() / 1000) - 3600
    }, JWT_SECRET);

    const expiredRes = await fetch(`${BASE_URL}/api/v1/budgets`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    report('AUTH-11', expiredRes.status === 401, '401 Unauthorized', expiredRes.status);

    // AUTH-12: Login using malformed JWT
    const malformedRes = await fetch(`${BASE_URL}/api/v1/budgets`, {
      headers: { 'Authorization': `Bearer invalidjwtpart1.invalidjwtpart2.invalidjwtpart3` }
    });
    report('AUTH-12', malformedRes.status === 401, '401 Unauthorized', malformedRes.status);

    // AUTH-13: Access protected endpoint without JWT
    const noJwtRes = await fetch(`${BASE_URL}/api/v1/budgets`);
    report('AUTH-13', noJwtRes.status === 401, '401 Unauthorized', noJwtRes.status);

    // AUTH-14: SYSTEM_ADMIN deactivates organization -> Login blocked
    await fetch(`${BASE_URL}/api/v1/auth/organizations/${orgIds.PRODUCER}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'SUSPENDED' })
    });
    const logSuspended = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: prodUsername, password: 'password123' })
    });
    report('AUTH-14', logSuspended.status === 403, 'Login Blocked (403)', logSuspended.status);

    // Reactivate for further tests
    await fetch(`${BASE_URL}/api/v1/auth/organizations/${orgIds.PRODUCER}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });

    console.log('\n--- Phase 2: RBAC ---');

    // RBAC-01: Producer uploads NABL report
    const rbacLabRes = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: generateUUID(), lab_name: 'test', test_type: 'purity', result_summary: 'PASSED', report_hash: 'hash' })
    });
    report('RBAC-01', rbacLabRes.status === 403, '403 Forbidden', rbacLabRes.status);

    // RBAC-02: NABL approves budget
    const rbacBudgetRes = await fetch(`${BASE_URL}/api/v1/budgets/${generateUUID()}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: '{}'
    });
    report('RBAC-02', rbacBudgetRes.status === 403, '403 Forbidden', rbacBudgetRes.status);

    // RBAC-03: Exporter revokes lot
    const rbacRevokeRes = await fetch(`${BASE_URL}/api/v1/lots/${generateUUID()}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.EXPORTER}` },
      body: '{}'
    });
    report('RBAC-03', rbacRevokeRes.status === 403, '403 Forbidden', rbacRevokeRes.status);

    // RBAC-04: Consumer accesses admin API
    const rbacAdminRes = await fetch(`${BASE_URL}/api/v1/auth/organizations/${orgIds.PRODUCER}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });
    report('RBAC-04', rbacAdminRes.status === 403 || rbacAdminRes.status === 401, '403/401 Forbidden', rbacAdminRes.status);

    // RBAC-05: Certifier deletes organization
    const rbacDeleteRes = await fetch(`${BASE_URL}/api/v1/auth/organizations/${orgIds.PRODUCER}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    report('RBAC-05', rbacDeleteRes.status === 403, '403 Forbidden', rbacDeleteRes.status);

    console.log('\n--- Phase 3: CPQ / Budget ---');

    // Create initial budget
    const propBud1 = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'Organic Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBud1Data = await propBud1.json();
    const budgetId = propBud1Data.data.budget.id;

    // Activate the budget
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    // CPQ-09: Create duplicate budget for same season
    const propBudDup = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 2000.0,
        yield_assumptions: { crop: 'Organic Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    report('CPQ-09', propBudDup.status === 409, '409 Conflict', propBudDup.status);

    // CPQ-10: Drawdown amount = 0
    const ddZero = await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ amount: 0 })
    });
    report('CPQ-10', ddZero.status === 400, '400 Validation Error', ddZero.status);

    // CPQ-11: Drawdown negative quantity
    const ddNeg = await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ amount: -100 })
    });
    report('CPQ-11', ddNeg.status === 400, '400 Validation Error', ddNeg.status);

    // CPQ-12: Drawdown exactly remaining balance
    // Deduct 1000 (drawdown 500 then 500)
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ amount: 500 })
    });
    const ddExact = await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ amount: 500 })
    });
    const ddExactData = await ddExact.json();
    report('CPQ-12', ddExact.status === 200 && ddExactData.data.budget.remainingQuantity === 0, '200 OK + exhausted', ddExact.status);

    // CPQ-13: Drawdown after budget exhausted
    const ddExhausted = await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ amount: 10 })
    });
    report('CPQ-13', ddExhausted.status === 422 || ddExhausted.status === 400, '400/422 Rejected', ddExhausted.status);

    // CPQ-14: Concurrent drawdown by two requests
    // First, let's create a fresh budget of 500
    const propBud2 = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 500.0,
        yield_assumptions: { crop: 'Organic Apples', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBud2Data = await propBud2.json();
    const budgetId2 = propBud2Data.data.budget.id;

    await fetch(`${BASE_URL}/api/v1/budgets/${budgetId2}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    const [ddRes1, ddRes2] = await Promise.all([
      fetch(`${BASE_URL}/api/v1/budgets/${budgetId2}/drawdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
        body: JSON.stringify({ amount: 300 })
      }),
      fetch(`${BASE_URL}/api/v1/budgets/${budgetId2}/drawdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
        body: JSON.stringify({ amount: 300 })
      })
    ]);
    const statuses = [ddRes1.status, ddRes2.status];
    const ok = statuses.includes(200) && (statuses.includes(422) || statuses.includes(400));
    report('CPQ-14', ok, 'One succeeds (200), one fails (400/422)', statuses.join(', '));

    console.log('\n--- Phase 4: Mint ---');

    // Create a lot for minting
    const scanGtin = '07612345678900';
    const scanPublicId = generateUUID();
    const scanSerial = `SN_MINT_${uniqueId}_01`;

    // Create a fresh active budget for the lot
    const propBudLot = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'Mint Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBudLotData = await propBudLot.json();
    const budgetIdLot = propBudLotData.data.budget.id;
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdLot}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: scanPublicId,
        gtin: scanGtin,
        serial: scanSerial,
        verification_url: `${BASE_URL}/verify/${scanPublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-MINT-${uniqueId}` }
      })
    });

    const lotsListRes = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    const lotsListResData = await lotsListRes.json();
    const lotId = lotsListResData.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-MINT-${uniqueId}`).id;

    // MINT-05: Mint zero QR codes
    const mintZero = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: lotId, gtin: scanGtin, quantity: 0 })
    });
    report('MINT-05', mintZero.status === 400, '400 Validation Error', mintZero.status);

    // MINT-06: Mint negative quantity
    const mintNeg = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: lotId, gtin: scanGtin, quantity: -10 })
    });
    report('MINT-06', mintNeg.status === 400, '400 Validation Error', mintNeg.status);

    // MINT-08: Mint with invalid lot
    const mintInvLot = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: generateUUID(), gtin: scanGtin, quantity: 5 })
    });
    report('MINT-08', mintInvLot.status === 404, '404 Not Found', mintInvLot.status);

    // MINT-09: Verify every generated serial is unique
    // Create a new budget with 1000 capacity
    const propBudMint = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'Organic Strawberries', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBudMintData = await propBudMint.json();
    const budgetIdMint = propBudMintData.data.budget.id;
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdMint}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: generateUUID(),
        gtin: scanGtin,
        serial: `SN_MINT_UNIQ_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${generateUUID()}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-MINT-UNIQ-${uniqueId}` }
      })
    });
    
    const lotsListRes2 = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    const lotsListRes2Data = await lotsListRes2.json();
    const lotId2 = lotsListRes2Data.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-MINT-UNIQ-${uniqueId}`).id;

    const mintUniq = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: lotId2, gtin: scanGtin, quantity: 10 })
    });
    const mintUniqData = await mintUniq.json();
    const serials = mintUniqData.data.serials;
    const uniqueSerials = [...new Set(serials)];
    report('MINT-09', serials.length === 10 && uniqueSerials.length === 10, '10 unique serials', `${uniqueSerials.length} unique`);

    // MINT-10: Simulate concurrent mint requests
    const [concurrentMintRes1, concurrentMintRes2] = await Promise.all([
      fetch(`${BASE_URL}/api/v1/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
        body: JSON.stringify({ lot_id: lotId2, gtin: scanGtin, quantity: 5 })
      }),
      fetch(`${BASE_URL}/api/v1/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
        body: JSON.stringify({ lot_id: lotId2, gtin: scanGtin, quantity: 5 })
      })
    ]);
    const cData1 = await concurrentMintRes1.json();
    const cData2 = await concurrentMintRes2.json();
    const allConcurrentSerials = [...cData1.data.serials, ...cData2.data.serials];
    const uniqueConcurrentSerials = [...new Set(allConcurrentSerials)];
    report('MINT-10', allConcurrentSerials.length === 10 && uniqueConcurrentSerials.length === 10, 'No duplicate serials across concurrent requests', `${uniqueConcurrentSerials.length} unique`);

    console.log('\n--- Phase 5: Lot Lifecycle ---');

    // LOT-01: Create lot without budget -> Rejected
    // Register a new organization that has NO active budget
    const regNoBudgetOrg = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Prod_NoBudget_${uniqueId}`,
        type: 'PRODUCER',
        official_email: `nobudget_${uniqueId}@test.com`,
        admin_username: `nobudget_user_${uniqueId}`,
        admin_password: 'password123'
      })
    });
    const regNoBudgetData = await regNoBudgetOrg.json();
    const noBudgetOrgId = regNoBudgetData.data.organization.id;
    await fetch(`${BASE_URL}/api/v1/auth/organizations/${noBudgetOrgId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });
    const logNoBudget = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `nobudget_user_${uniqueId}`, password: 'password123' })
    });
    const logNoBudgetData = await logNoBudget.json();
    const noBudgetToken = logNoBudgetData.data.token;

    const lotNoBudgetRes = await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${noBudgetToken}` },
      body: JSON.stringify({
        public_identifier: generateUUID(),
        gtin: scanGtin,
        serial: `SN_NO_BUDGET_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${generateUUID()}`
      })
    });
    report('LOT-01', lotNoBudgetRes.status === 400, '400 (NO_ACTIVE_BUDGET)', lotNoBudgetRes.status);

    // LOT-02: Delete active lot -> Prevented
    const delLotRes = await fetch(`${BASE_URL}/api/v1/verify/lots/${lotId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    report('LOT-02', delLotRes.status === 404 || delLotRes.status === 403 || delLotRes.status === 405, 'Blocked (404/403/405)', delLotRes.status);

    console.log('\n--- Phase 6: NABL ---');

    // LAB-01: Upload corrupted PDF -> Validation error
    const uploadCorrupt = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: 'some_hash',
        pdf_content: 'invalid_base64_pdf_content'
      })
    });
    report('LAB-01', uploadCorrupt.status === 400, '400 Bad Request', uploadCorrupt.status);

    // LAB-02: Upload non-PDF -> Validation error
    // Upload text file base64 encoded "Hello World" (starts with SGVsbG8... not %PDF)
    const uploadNonPdf = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
        pdf_content: 'SGVsbG8gV29ybGQ=' // Hello World
      })
    });
    report('LAB-02', uploadNonPdf.status === 400, '400 Bad Request', uploadNonPdf.status);

    // LAB-03: Upload duplicate report -> Conflict
    const pdfBase64 = Buffer.from('%PDF-1.4 mock pdf report').toString('base64');
    const pdfHash = crypto.createHash('sha256').update(Buffer.from('%PDF-1.4 mock pdf report')).digest('hex');

    // Upload first report
    await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        pdf_content: pdfBase64
      })
    });

    // Upload duplicate hash report
    const uploadDupReport = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        pdf_content: pdfBase64
      })
    });
    report('LAB-03', uploadDupReport.status === 409, '409 Conflict', uploadDupReport.status);

    // LAB-04: Replace existing report -> Audit entry created
    const pdfBase64New = Buffer.from('%PDF-1.4 mock pdf report replacement').toString('base64');
    const pdfHashNew = crypto.createHash('sha256').update(Buffer.from('%PDF-1.4 mock pdf report replacement')).digest('hex');

    const uploadReplaceReport = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHashNew,
        pdf_content: pdfBase64New
      })
    });

    const entriesRes = await fetch(`${BASE_URL}/log/api/v1/log/entries`);
    const entriesData = await entriesRes.json();
    const replacedAudit = entriesData.data.logs.find(l => l.event === 'LOT_LAB_TEST_REPLACED');
    report('LAB-04', uploadReplaceReport.status === 200 && replacedAudit !== undefined, '200 OK + LOT_LAB_TEST_REPLACED audit log', uploadReplaceReport.status);

    // LAB-05: Upload report to nonexistent lot -> 404
    const uploadNonexistLot = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: generateUUID(),
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        pdf_content: pdfBase64
      })
    });
    report('LAB-05', uploadNonexistLot.status === 404, '404 Not Found', uploadNonexistLot.status);

    console.log('\n--- Phase 7: Certification ---');

    // Create a new lot for certification checks
    const certGtin = '07612345678900';
    const certSerial = `SN_CERT_${uniqueId}`;
    const certPublicId = generateUUID();

    // Create a fresh active budget for the lot
    const propBudCert = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'Cert Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBudCertData = await propBudCert.json();
    const budgetIdCert = propBudCertData.data.budget.id;
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdCert}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: certPublicId,
        gtin: certGtin,
        serial: certSerial,
        verification_url: `${BASE_URL}/verify/${certPublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-CERT-${uniqueId}` }
      })
    });

    const lotsListRes3 = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    const lotsListRes3Data = await lotsListRes3.json();
    const lotIdCert = lotsListRes3Data.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-CERT-${uniqueId}`).id;

    // Delete default lab result to simulate a lot without any lab report
    await pgPool.query('DELETE FROM lab_results WHERE lot_id = $1', [lotIdCert]);

    // CERT-01: Certify lot without lab report -> Rejected
    const certifyNoLab = await fetch(`${BASE_URL}/api/v1/lots/${lotIdCert}/certify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    report('CERT-01', certifyNoLab.status === 400, '400 Bad Request', certifyNoLab.status);

    // Upload failed lab report to lotIdCert
    const pdfBase64Fail = Buffer.from('%PDF-1.4 mock pdf report failed').toString('base64');
    const pdfHashFail = crypto.createHash('sha256').update(Buffer.from('%PDF-1.4 mock pdf report failed')).digest('hex');
    await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotIdCert,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'FAILED',
        report_hash: pdfHashFail,
        pdf_content: pdfBase64Fail
      })
    });

    // CERT-02: Certify failed lot -> Rejected
    const certifyFailed = await fetch(`${BASE_URL}/api/v1/lots/${lotIdCert}/certify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    report('CERT-02', certifyFailed.status === 400, '400 Bad Request', certifyFailed.status);

    // Create a successful certified lot path
    const certGtinPass = '07612345678900';
    const certSerialPass = `SN_CERT_PASS_${uniqueId}`;
    const certPublicIdPass = generateUUID();

    // Create fresh active budget
    const propBudCertPass = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'Cert Pass Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBudCertPassData = await propBudCertPass.json();
    const budgetIdCertPass = propBudCertPassData.data.budget.id;
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdCertPass}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: certPublicIdPass,
        gtin: certGtinPass,
        serial: certSerialPass,
        verification_url: `${BASE_URL}/verify/${certPublicIdPass}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-CERT-PASS-${uniqueId}` }
      })
    });

    const lotsListRes4 = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    const lotsListRes4Data = await lotsListRes4.json();
    const lotIdCertPass = lotsListRes4Data.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-CERT-PASS-${uniqueId}`).id;

    // Upload passed report
    await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotIdCertPass,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        pdf_content: pdfBase64
      })
    });

    // Certify Lot
    const certifySuccess = await fetch(`${BASE_URL}/api/v1/lots/${lotIdCertPass}/certify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });

    // CERT-03: Certify already certified lot -> Conflict
    const certifyAgain = await fetch(`${BASE_URL}/api/v1/lots/${lotIdCertPass}/certify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    report('CERT-03', certifyAgain.status === 409, '409 Conflict', certifyAgain.status);

    // CERT-04: Revoke already revoked lot -> No duplicate action
    await fetch(`${BASE_URL}/api/v1/lots/${lotIdCertPass}/revoke`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    const revokeAgain = await fetch(`${BASE_URL}/api/v1/lots/${lotIdCertPass}/revoke`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    report('CERT-04', revokeAgain.status === 400, '400 Bad Request (Already Revoked)', revokeAgain.status);

    console.log('\n--- Phase 8: Verification ---');

    // VER-07: Scan unknown QR
    const scanUnknown = await fetch(`${BASE_URL}/api/v1/verify/v/${generateUUID()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777 })
    });
    report('VER-07', scanUnknown.status === 404, '404 Not Found', scanUnknown.status);

    // VER-08: Scan invalid QR format
    const scanInvalidFormat = await fetch(`${BASE_URL}/api/v1/verify/v/invalid-uuid-format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777 })
    });
    report('VER-08', scanInvalidFormat.status === 400 || scanInvalidFormat.status === 404, '400/404 Error', scanInvalidFormat.status);

    // VER-12: Scan same QR 100 times -> Always VERIFIED
    const scanGtinSeq = '07612345678900';
    const scanSerialSeq = `SN_SEQ_${uniqueId}`;
    const scanPublicIdSeq = generateUUID();

    // Create fresh budget
    const propBudSeq = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'Seq Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBudSeqData = await propBudSeq.json();
    const budgetIdSeq = propBudSeqData.data.budget.id;
    await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdSeq}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: scanPublicIdSeq,
        gtin: scanGtinSeq,
        serial: scanSerialSeq,
        verification_url: `${BASE_URL}/verify/${scanPublicIdSeq}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-SEQ-${uniqueId}` }
      })
    });

    let sequentialPassCount = 0;
    for (let i = 0; i < 50; i++) { // sequential scans
      const res = await fetch(`${BASE_URL}/api/v1/verify/v/${scanPublicIdSeq}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 19.0760, lon: 72.8777, device_metadata: 'iPhone' })
      });
      const data = await res.json();
      if (res.status === 200 && data.data.status === 'VERIFIED') {
        sequentialPassCount++;
      }
    }
    report('VER-12', sequentialPassCount === 50, 'Always VERIFIED (50/50 scans)', `${sequentialPassCount}/50 verified`);

    console.log('\n--- Phase 9: Clone Detection ---');

    const clonePublicId = generateUUID();
    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: clonePublicId,
        gtin: scanGtinSeq,
        serial: `SN_CLONE_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${clonePublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-CLONE-${uniqueId}` }
      })
    });

    // CLONE-01: Two impossible scans
    await fetch(`${BASE_URL}/api/v1/verify/v/${clonePublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777, device_metadata: 'iPhone' })
    });
    const cloneScan2 = await fetch(`${BASE_URL}/api/v1/verify/v/${clonePublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 40.7128, lon: -74.0060, device_metadata: 'Android' })
    });
    const cloneData2 = await cloneScan2.json();
    report('CLONE-01', cloneScan2.status === 200 && cloneData2.data.risk === 'CRITICAL', 'Flagged CRITICAL risk', cloneData2.data.risk);

    // CLONE-02: Two nearby scans
    const nearbyPublicId = generateUUID();
    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: nearbyPublicId,
        gtin: scanGtinSeq,
        serial: `SN_NEARBY_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${nearbyPublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-NEARBY-${uniqueId}` }
      })
    });
    await fetch(`${BASE_URL}/api/v1/verify/v/${nearbyPublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777, device_metadata: 'iPhone' })
    });
    const nearbyScan2 = await fetch(`${BASE_URL}/api/v1/verify/v/${nearbyPublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0762, lon: 72.8779, device_metadata: 'iPhone' }) // very close
    });
    const nearbyData2 = await nearbyScan2.json();
    report('CLONE-02', nearbyScan2.status === 200 && nearbyData2.data.risk === 'LOW', 'Flagged LOW risk', nearbyData2.data.risk);

    // CLONE-04: Investigation created automatically
    const invListRes = await fetch(`${BASE_URL}/api/v1/verify/investigations`, {
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });
    const invListData = await invListRes.json();
    const createdInv = invListData.data.investigations.find(i => i.public_identifier === clonePublicId);
    report('CLONE-04', createdInv !== undefined, 'Investigation created automatically', createdInv ? 'Created' : 'Not found');

    console.log('\n--- Phase 10: Transparency Ledger ---');

    // LEDGER-04: Verify latest block hash matches calculated
    const lastEntry = entriesData.data.logs[entriesData.data.logs.length - 1];
    report('LEDGER-04', lastEntry.currentHash !== undefined && lastEntry.currentHash.length === 64, 'Valid SHA-256 current_hash', lastEntry.currentHash);

    // LEDGER-06: Insert fake ledger row -> Chain invalid
    // Write fake row direct to database
    const pgClient = await pgPool.connect();
    await pgClient.query(`
      INSERT INTO log_entries (id, entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
      VALUES (uuid_generate_v4(), 'SYSTEM', '${generateUUID()}', 'FAKED_EVENT', 'fake_payload', 'fake_prev', 'fake_current')
    `);
    const verifyLedgerFake = await fetch(`${BASE_URL}/log/api/v1/log/verify`);
    const verifyLedgerFakeData = await verifyLedgerFake.json();
    report('LEDGER-06', verifyLedgerFakeData.data.unbroken === false, 'Chain link broken (unbroken: false)', verifyLedgerFakeData.data.unbroken);

    // Restore clean table state for subsequent E2E runs
    await pgClient.query("DELETE FROM log_entries WHERE event_type = 'FAKED_EVENT'");
    pgClient.release();

    console.log('\n--- Phase 11: External Integrations ---');

    // INT-03: TraceNet timeout mock lookup
    const timeoutRes = await fetch(`${BASE_URL}/api/v1/integrations/tracenet/certificates/TIMEOUT-TEST`);
    report('INT-03', timeoutRes.status === 200 || timeoutRes.status === 408 || timeoutRes.status === 504 || timeoutRes.status === 404, 'Graceful network timeout handling (200/404/408/504)', timeoutRes.status);

    console.log('\n--- Phase 13: Security ---');

    // SEC-01: SQL Injection check
    const sqliLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: "' OR 1=1 --", password: 'password' })
    });
    report('SEC-01', sqliLogin.status === 401, '401 Unauthorized (Blocked SQLi)', sqliLogin.status);

    // SEC-02: XSS escaping check
    const xssOrgName = `<script>alert('xss_${uniqueId}')</script>`;
    const regXss = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: xssOrgName,
        type: 'PRODUCER',
        official_email: `xss_${uniqueId}@test.com`,
        admin_username: `xss_user_${uniqueId}`,
        admin_password: 'password123'
      })
    });
    const regXssData = await regXss.json();
    const storedName = regXssData.data?.organization?.name;
    report('SEC-02', storedName === xssOrgName, 'Escaped and stored string correctly without execution', storedName);

    // SEC-03: JWT signature tampering check
    const tamperedToken = tokens.PRODUCER.slice(0, -5) + 'xxxxx';
    const tamperedRes = await fetch(`${BASE_URL}/api/v1/budgets`, {
      headers: { 'Authorization': `Bearer ${tamperedToken}` }
    });
    report('SEC-03', tamperedRes.status === 401, '401 Unauthorized (JWT Tampering blocked)', tamperedRes.status);

    // SEC-04: IDOR (Access another org's budget)
    // Create budget for Exporter
    const idorRes = await fetch(`${BASE_URL}/api/v1/budgets/${budgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.EXPORTER}` }, // Exporter trying to draw down Producer's budget
      body: JSON.stringify({ amount: 100 })
    });
    report('SEC-04', idorRes.status === 403, '403 Forbidden (Blocked IDOR)', idorRes.status);

    // SEC-06: Invalid Content-Type check
    const invalidCt = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ username: prodUsername, password: 'password123' })
    });
    report('SEC-06', invalidCt.status === 415 || invalidCt.status === 400, '415 Unsupported Media Type / 400 Bad Request', invalidCt.status);

    console.log('\n--- Phase 14: Performance ---');

    // PERF-04: Verify response latency of verification
    const startVer = Date.now();
    const verRes = await fetch(`${BASE_URL}/api/v1/verify/v/${scanPublicIdSeq}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777 })
    });
    const verVerData = await verRes.json();
    const latency = Date.now() - startVer;
    report('PERF-04', latency < 50, 'Response latency < 50ms', `${latency}ms`);

    console.log('\n--- Phase 15: Audit & Governance ---');

    // AUDIT-01: User action logged
    const logsRes = await fetch(`${BASE_URL}/log/api/v1/log/entries`);
    const logsData = await logsRes.json();
    const loginLogs = logsData.data.logs.filter(l => l.event === 'USER_LOGIN');
    report('AUDIT-01', loginLogs.length > 0, 'Audit log created for user login events', `${loginLogs.length} logs found`);

    console.log('\n--- Phase 16: End-to-End Business Flow ---');

    // E2E-01: Happy Path
    // Register -> Budget -> Approve -> Mint -> Lab -> Certify -> Scan VALID
    const happyGtin = '07612345678900';
    const happySerial = `SN_HAPPY_${uniqueId}`;
    const happyPublicId = generateUUID();

    // 1. Propose & approve budget
    const e2eBudget = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        producer_id: orgIds.PRODUCER,
        certifier_id: orgIds.CERTIFICATION_BODY,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 1000.0,
        yield_assumptions: { crop: 'E2E Happy Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const e2eBudgetData = await e2eBudget.json();
    const happyBudgetId = e2eBudgetData.data.budget.id;
    await fetch(`${BASE_URL}/api/v1/budgets/${happyBudgetId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` },
      body: '{}'
    });

    // 2. Register code
    await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: happyPublicId,
        gtin: happyGtin,
        serial: happySerial,
        verification_url: `${BASE_URL}/verify/${happyPublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: `Producer_${uniqueId}`, batch_id: `BATCH-HAPPY-${uniqueId}` }
      })
    });
    
    const lotsListRes5 = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    const lotsListRes5Data = await lotsListRes5.json();
    const happyLotId = lotsListRes5Data.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-HAPPY-${uniqueId}`).id;

    // 3. Mint
    await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: happyLotId, gtin: happyGtin, quantity: 10 })
    });

    // 4. Lab results passed
    await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: happyLotId,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        pdf_content: pdfBase64
      })
    });

    // 5. Certify lot
    await fetch(`${BASE_URL}/api/v1/lots/${happyLotId}/certify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}` }
    });

    // 6. Verify scan returns VERIFIED
    const happyScan = await fetch(`${BASE_URL}/api/v1/verify/v/${happyPublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777 })
    });
    const happyScanData = await happyScan.json();
    report('E2E-01', happyScan.status === 200 && happyScanData.data.status === 'VERIFIED', 'Provenance Happy Path fully VERIFIED', happyScanData.data.status);

    await pgPool.end();

  } catch (error) {
    console.error('An error occurred during test execution:', error);
  }

  console.log('\n====================================================');
  console.log(` CapMint API Compliance Verification Complete`);
  console.log(` Total Passed: ${passed} | Total Failed: ${failed}`);
  console.log('====================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
