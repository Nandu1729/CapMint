const crypto = require('crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET;
const CERTIFIER_PUBLIC_KEY = process.env.CERTIFIER_PUBLIC_KEY;
const DEVELOPMENT_ADMIN_PASSWORD = process.env.CAPMINT_DEVELOPMENT_SEED_PASSWORD;
const EXPECTED_DATABASE_PREFIX = process.env.CAPMINT_EXPECTED_DATABASE_PREFIX || 'capmint_suite_';

if (!JWT_SECRET || !CERTIFIER_PUBLIC_KEY || !DEVELOPMENT_ADMIN_PASSWORD || !process.env.DATABASE_URL) {
  throw new Error(
    'JWT_SECRET, CERTIFIER_PUBLIC_KEY, CAPMINT_DEVELOPMENT_SEED_PASSWORD, and DATABASE_URL are required for the compliance suite.'
  );
}

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
  let pendingCount = 0;
  let failed = 0;
  let fatalError = null;
  let pgPool;

  function report(id, pass, expected, got) {
    if (pass) {
      passed++;
      console.log(`[\x1b[32mPASS\x1b[0m] ${id}: Expected ${expected}`);
    } else {
      failed++;
      console.log(`[\x1b[31mFAIL\x1b[0m] ${id}: Expected ${expected}, got ${got}`);
    }
  }

  function pending(id, reason) {
    pendingCount++;
    console.log(`[\x1b[33mPENDING\x1b[0m] ${id}: ${reason}`);
  }

  try {
    // 0. Database Cleaning and Initializing
    const pg = await import('pg');
    pgPool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
    const databaseIdentity = await pgPool.query('SELECT current_database() AS name');
    const currentDatabase = databaseIdentity.rows[0].name;
    if (!currentDatabase.startsWith(EXPECTED_DATABASE_PREFIX)) {
      throw new Error(
        `Refusing destructive compliance run against ${currentDatabase}; expected prefix ${EXPECTED_DATABASE_PREFIX}.`
      );
    }
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
    const otherLabUsername = `lab_other_${uniqueId}`;
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
      body: JSON.stringify({ username: 'admin', password: DEVELOPMENT_ADMIN_PASSWORD })
    });
    const adminLoginData = await adminLogin.json();
    if (!adminLogin.ok || !adminLoginData.data?.token) {
      throw new Error(
        `Admin login failed (${adminLogin.status}): ${JSON.stringify(adminLoginData)}`
      );
    }
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
      const activation = await fetch(`${BASE_URL}/api/v1/auth/organizations/${orgId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'ACTIVATED' })
      });
      if (!activation.ok) {
        throw new Error(
          `${org.type} activation failed (${activation.status}): ${await activation.text()}`
        );
      }

      // Update Certifier public key in database
      if (org.type === 'CERTIFICATION_BODY') {
        await pgPool.query('UPDATE certifiers SET public_key = $1 WHERE id = $2', [CERTIFIER_PUBLIC_KEY, orgId]);
      }

      // Login to get token
      const log = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: org.username, password: 'password123' })
      });
      const logData = await log.json();
      if (!log.ok || !logData.data?.token) {
        throw new Error(
          `${org.type} login failed (${log.status}): ${JSON.stringify(logData)}`
        );
      }
      tokens[org.type] = logData.data.token;
    }

    const otherLabRegistration = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Lab_Other_${uniqueId}`,
        type: 'NABL_LABORATORY',
        business_reg_details: {
          tax_id: `TAX-NABL-LABORATORY-OTHER-${uniqueId}`,
          registration_number: `REG-NABL-LABORATORY-OTHER-${uniqueId}`
        },
        official_email: `lab_other_${uniqueId}@test.com`,
        contact_info: { phone: '+919999999997', address: 'Testing Sector' },
        admin_username: otherLabUsername,
        admin_password: 'password123'
      })
    });
    const otherLabRegistrationData = await otherLabRegistration.json();
    const otherLabOrganizationId = otherLabRegistrationData.data.organization.id;
    await fetch(`${BASE_URL}/api/v1/auth/organizations/${otherLabOrganizationId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });
    const otherLabLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: otherLabUsername, password: 'password123' })
    });
    const otherLabLoginData = await otherLabLogin.json();
    const otherLabToken = otherLabLoginData.data.token;

    // D-011: a second certifier proves operational reads and mutations are tenant-scoped.
    const otherCertUsername = `cert_other_${uniqueId}`;
    const otherCertRegistration = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Certifier_Other_${uniqueId}`,
        type: 'CERTIFICATION_BODY',
        business_reg_details: {
          tax_id: `TAX-CERTIFICATION_BODY-OTHER-${uniqueId}`,
          registration_number: `REG-CERTIFICATION_BODY-OTHER-${uniqueId}`
        },
        official_email: `cert_other_${uniqueId}@test.com`,
        contact_info: { phone: '+919999999998', address: 'Testing Sector' },
        admin_username: otherCertUsername,
        admin_password: 'password123'
      })
    });
    const otherCertRegistrationData = await otherCertRegistration.json();
    const otherCertifierId = otherCertRegistrationData.data.organization.id;
    await fetch(`${BASE_URL}/api/v1/auth/organizations/${otherCertifierId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });
    const otherCertLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: otherCertUsername, password: 'password123' })
    });
    const otherCertLoginData = await otherCertLogin.json();
    const otherCertifierToken = otherCertLoginData.data.token;

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

    // D-009: every capacity-consuming path must fail closed on an invalid certifier signature.
    const signatureLotSetup = await fetch(`${BASE_URL}/api/v1/lots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        budget_id: budgetIdLot,
        batch_size: 5,
        product_metadata: { name: 'Signature Enforcement Fixture' }
      })
    });
    if (signatureLotSetup.status !== 200) {
      throw new Error(`Signature enforcement fixture lot failed with ${signatureLotSetup.status}.`);
    }
    const signatureLotSetupData = await signatureLotSetup.json();
    const signatureLotId = signatureLotSetupData.data.lot.id;
    const signatureRecord = await pgPool.query(
      'SELECT signature_bundle FROM budgets WHERE id = $1',
      [budgetIdLot]
    );
    const validSignatureBundle = signatureRecord.rows[0].signature_bundle;
    await pgPool.query(
      "UPDATE budgets SET signature_bundle = 'sig_default' WHERE id = $1",
      [budgetIdLot]
    );
    const invalidSignatureStateBefore = await pgPool.query(
      `SELECT
         (SELECT consumed_quantity FROM budgets WHERE id = $1) AS consumed_quantity,
         (SELECT COUNT(*)::integer FROM lots WHERE budget_id = $1) AS lot_count,
         (SELECT COUNT(*)::integer FROM unit_codes WHERE lot_id = $2) AS unit_code_count,
         (SELECT COUNT(*)::integer FROM log_entries) AS ledger_count`,
      [budgetIdLot, signatureLotId]
    );

    const invalidSignatureDrawdown = await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdLot}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ amount: 1 })
    });
    const invalidSignatureDrawdownData = await invalidSignatureDrawdown.json();
    report(
      'SIG-01',
      invalidSignatureDrawdown.status === 400 && invalidSignatureDrawdownData.error?.code === 'INVALID_SIGNATURE',
      'drawdown rejects invalid certifier signature',
      `${invalidSignatureDrawdown.status} ${invalidSignatureDrawdownData.error?.code}`
    );

    const invalidSignatureLot = await fetch(`${BASE_URL}/api/v1/lots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        budget_id: budgetIdLot,
        batch_size: 1,
        product_metadata: { name: 'Rejected Unsigned Lot' }
      })
    });
    const invalidSignatureLotData = await invalidSignatureLot.json();
    report(
      'SIG-02',
      invalidSignatureLot.status === 400 && invalidSignatureLotData.error?.code === 'INVALID_SIGNATURE',
      'lot reservation rejects invalid certifier signature',
      `${invalidSignatureLot.status} ${invalidSignatureLotData.error?.code}`
    );

    const invalidSignatureMint = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: signatureLotId, gtin: scanGtin, quantity: 1 })
    });
    const invalidSignatureMintData = await invalidSignatureMint.json();
    report(
      'SIG-03',
      invalidSignatureMint.status === 400 && invalidSignatureMintData.error?.code === 'INVALID_SIGNATURE',
      'mint rejects invalid certifier signature',
      `${invalidSignatureMint.status} ${invalidSignatureMintData.error?.code}`
    );

    const invalidSignatureExplicitRegister = await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        lot_id: signatureLotId,
        public_identifier: generateUUID(),
        gtin: scanGtin,
        serial: `SN_SIG_EXPLICIT_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${generateUUID()}`
      })
    });
    const invalidSignatureExplicitRegisterData = await invalidSignatureExplicitRegister.json();
    report(
      'SIG-04',
      invalidSignatureExplicitRegister.status === 400 &&
        invalidSignatureExplicitRegisterData.error?.code === 'INVALID_SIGNATURE',
      'explicit-lot registration rejects invalid certifier signature',
      `${invalidSignatureExplicitRegister.status} ${invalidSignatureExplicitRegisterData.error?.code}`
    );

    const invalidSignatureQuickRegister = await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({
        public_identifier: generateUUID(),
        gtin: scanGtin,
        serial: `SN_SIG_QUICK_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${generateUUID()}`
      })
    });
    const invalidSignatureQuickRegisterData = await invalidSignatureQuickRegister.json();
    report(
      'SIG-05',
      invalidSignatureQuickRegister.status === 400 &&
        invalidSignatureQuickRegisterData.error?.code === 'INVALID_SIGNATURE',
      'quick registration rejects invalid certifier signature',
      `${invalidSignatureQuickRegister.status} ${invalidSignatureQuickRegisterData.error?.code}`
    );

    const invalidSignatureStateAfter = await pgPool.query(
      `SELECT
         (SELECT consumed_quantity FROM budgets WHERE id = $1) AS consumed_quantity,
         (SELECT COUNT(*)::integer FROM lots WHERE budget_id = $1) AS lot_count,
         (SELECT COUNT(*)::integer FROM unit_codes WHERE lot_id = $2) AS unit_code_count,
         (SELECT COUNT(*)::integer FROM log_entries) AS ledger_count`,
      [budgetIdLot, signatureLotId]
    );
    report(
      'SIG-06',
      JSON.stringify(invalidSignatureStateAfter.rows[0]) ===
        JSON.stringify(invalidSignatureStateBefore.rows[0]),
      'all invalid-signature denials preserve capacity, lots, codes, and ledger',
      JSON.stringify(invalidSignatureStateAfter.rows[0])
    );
    await pgPool.query(
      'UPDATE budgets SET signature_bundle = $1 WHERE id = $2',
      [validSignatureBundle, budgetIdLot]
    );

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

    // D-011: operational lot discovery is private and scoped to the authenticated producer.
    const lotsListRes = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const lotsListResData = await lotsListRes.json();
    const lotId = lotsListResData.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-MINT-${uniqueId}`).id;

    // MINT-07: valid GTIN-14 remains enforced by the GS1 engine.
    const validGtin = await fetch(`${BASE_URL}/api/v1/gs1/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gtin: scanGtin })
    });
    const validGtinData = await validGtin.json();
    report('MINT-07', validGtin.status === 200 && validGtinData.data.isValid === true, '200 OK + valid GTIN-14', validGtin.status);

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
    
    // D-011: operational lot discovery is private and scoped to the authenticated producer.
    const lotsListRes2 = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
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

    // RESOLVER-01: GS1 Digital Link resolution remains intentionally public under D-011.
    const resolverResponse = await fetch(`${BASE_URL}/01/${scanGtin}/21/${scanSerial}`, {
      headers: { 'Accept': 'application/json' }
    });
    const resolverData = await resolverResponse.json();
    report(
      'RESOLVER-01',
      resolverResponse.status === 200 &&
        resolverData.data.gtin === scanGtin &&
        resolverData.data.serial === scanSerial,
      'public GS1 resolver returns the registered identity',
      resolverResponse.status
    );

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

    // D-011: laboratory writes fail closed until DM-03 provides a trusted lot assignment.
    const labGateResponse = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
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
    const labGateData = await labGateResponse.json();
    report(
      'LAB-GATE-01',
      labGateResponse.status === 403 &&
        labGateData.error?.code === 'LAB_ASSIGNMENT_REQUIRED' &&
        labGateData.error?.message === 'This lot has no trusted laboratory assignment.',
      '403 LAB_ASSIGNMENT_REQUIRED',
      `${labGateResponse.status} ${labGateData.error?.code}`
    );

    const assignmentResponse = await fetch(
      `${BASE_URL}/api/v1/lots/${lotId2}/assign-laboratory`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens.CERTIFICATION_BODY}`
        },
        body: JSON.stringify({ laboratory_organization_id: orgIds.NABL_LABORATORY })
      }
    );
    if (assignmentResponse.status !== 200) {
      throw new Error(`Laboratory assignment fixture failed with ${assignmentResponse.status}.`);
    }

    const pdfBase64 = Buffer.from('%PDF-1.4 mock pdf report').toString('base64');
    const pdfHash = crypto.createHash('sha256').update(Buffer.from('%PDF-1.4 mock pdf report')).digest('hex');

    const corruptedPdfResponse = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: crypto.createHash('sha256').update('different-content').digest('hex'),
        report_reference: 'corrupted.pdf',
        pdf_content: pdfBase64
      })
    });
    const corruptedPdfData = await corruptedPdfResponse.json();
    report(
      'LAB-01',
      corruptedPdfResponse.status === 400 && corruptedPdfData.error?.code === 'HASH_MISMATCH',
      '400 HASH_MISMATCH',
      `${corruptedPdfResponse.status} ${corruptedPdfData.error?.code}`
    );

    const invalidPdfResponse = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: crypto.createHash('sha256').update('not a pdf').digest('hex'),
        report_reference: 'invalid.pdf',
        pdf_content: Buffer.from('not a pdf').toString('base64')
      })
    });
    const invalidPdfData = await invalidPdfResponse.json();
    report(
      'LAB-02',
      invalidPdfResponse.status === 400 && invalidPdfData.error?.code === 'INVALID_PDF',
      '400 INVALID_PDF',
      `${invalidPdfResponse.status} ${invalidPdfData.error?.code}`
    );

    const acceptedLabResult = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        report_reference: 'accepted.pdf',
        pdf_content: pdfBase64
      })
    });
    if (acceptedLabResult.status !== 200) {
      throw new Error(`Accepted laboratory result fixture failed with ${acceptedLabResult.status}.`);
    }

    const duplicateLabResult = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        report_reference: 'duplicate.pdf',
        pdf_content: pdfBase64
      })
    });
    report('LAB-03', duplicateLabResult.status === 409, '409 Conflict', duplicateLabResult.status);

    const replacementPdf = Buffer.from('%PDF-1.4 replacement mock pdf report');
    const replacementHash = crypto.createHash('sha256').update(replacementPdf).digest('hex');
    const replacementLabResult = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: lotId2,
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity and residue',
        result_summary: 'PASSED',
        report_hash: replacementHash,
        report_reference: 'replacement.pdf',
        pdf_content: replacementPdf.toString('base64')
      })
    });
    const replacementAudit = await pgPool.query(
      `SELECT count(*)::int AS count
       FROM log_entries
       WHERE entity_id = $1
         AND event_type = 'LOT_LAB_TEST_REPLACED'`,
      [lotId2]
    );
    report(
      'LAB-04',
      replacementLabResult.status === 200 && replacementAudit.rows[0].count > 0,
      '200 replacement + LOT_LAB_TEST_REPLACED',
      `${replacementLabResult.status} / ${replacementAudit.rows[0].count} events`
    );

    const missingLotResult = await fetch(`${BASE_URL}/api/v1/verify/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.NABL_LABORATORY}` },
      body: JSON.stringify({
        lot_id: generateUUID(),
        lab_name: 'NABL Testing Labs',
        test_type: 'Purity Check',
        result_summary: 'PASSED',
        report_hash: pdfHash,
        report_reference: 'missing.pdf',
        pdf_content: pdfBase64
      })
    });
    const missingLotData = await missingLotResult.json();
    report(
      'LAB-05',
      missingLotResult.status === 403 && missingLotData.error?.code === 'LAB_ASSIGNMENT_REQUIRED',
      '403 LAB_ASSIGNMENT_REQUIRED',
      `${missingLotResult.status} ${missingLotData.error?.code}`
    );

    const otherLabList = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${otherLabToken}` }
    });
    const otherLabListData = await otherLabList.json();
    if (otherLabList.status !== 200 || otherLabListData.data.lots.some(lot => lot.id === lotId2)) {
      throw new Error('Unassigned laboratory fixture could read the assigned private lot.');
    }

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

    // D-011: certification setup discovers the producer's lot through its scoped list.
    const lotsListRes3 = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
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

    // D-011: seed the downstream certification state directly in this disposable database.
    const pdfHashFail = crypto.createHash('sha256').update(Buffer.from('%PDF-1.4 mock pdf report failed')).digest('hex');
    await pgPool.query(
      `INSERT INTO lab_results
         (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
       VALUES ($1, 'Compliance Fixture Laboratory', 'Purity Check', 'FAIL', $2, 'F1-CERT-FAIL')`,
      [lotIdCert, pdfHashFail]
    );
    await pgPool.query("UPDATE lots SET lab_status = 'FAILED' WHERE id = $1", [lotIdCert]);

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

    // D-011: certification setup discovers the producer's lot through its scoped list.
    const lotsListRes4 = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const lotsListRes4Data = await lotsListRes4.json();
    const lotIdCertPass = lotsListRes4Data.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-CERT-PASS-${uniqueId}`).id;

    // D-011: retain certification coverage while lab writes remain feature-gated.
    await pgPool.query(
      `UPDATE lab_results
       SET lab_name = 'Compliance Fixture Laboratory',
           test_type = 'Purity Check',
           result_summary = 'PASS',
           report_hash = $2,
           report_reference = 'F1-CERT-PASS'
       WHERE lot_id = $1`,
      [lotIdCertPass, pdfHash]
    );
    await pgPool.query("UPDATE lots SET lab_status = 'PASSED' WHERE id = $1", [lotIdCertPass]);

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

    console.log('\n--- Phase 9B: Tenant Isolation (D-011) ---');

    const ownerLotsResponse = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const ownerLotsData = await ownerLotsResponse.json();
    report(
      'TENANT-01',
      ownerLotsResponse.status === 200 &&
        ownerLotsData.data.lots.some(lot => lot.id === lotId2) &&
        ownerLotsData.data.lots.every(lot => lot.id !== undefined),
      'owner lot list contains its lot',
      ownerLotsResponse.status
    );

    const otherLotsResponse = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${noBudgetToken}` }
    });
    const otherLotsData = await otherLotsResponse.json();
    report(
      'TENANT-02',
      otherLotsResponse.status === 200 && otherLotsData.data.lots.every(lot => lot.id !== lotId2),
      'other tenant lot list excludes owner lot',
      otherLotsResponse.status
    );

    const anonymousLotsResponse = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    report('TENANT-03', anonymousLotsResponse.status === 401, '401 for unauthenticated lot list', anonymousLotsResponse.status);

    const ownerCodesResponse = await fetch(`${BASE_URL}/api/v1/verify/unit-codes`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const ownerCodesData = await ownerCodesResponse.json();
    report(
      'TENANT-04',
      ownerCodesResponse.status === 200 &&
        ownerCodesData.data.unitCodes.some(code => code.lotId === lotId2 && code.serial === serials[0]),
      'owner unit-code list contains its code',
      ownerCodesResponse.status
    );

    const otherCodesResponse = await fetch(`${BASE_URL}/api/v1/verify/unit-codes`, {
      headers: { 'Authorization': `Bearer ${noBudgetToken}` }
    });
    const otherCodesData = await otherCodesResponse.json();
    report(
      'TENANT-05',
      otherCodesResponse.status === 200 &&
        otherCodesData.data.unitCodes.every(code => code.lotId !== lotId2 && code.serial !== serials[0]),
      'other tenant unit-code list excludes owner code',
      otherCodesResponse.status
    );

    const anonymousCodesResponse = await fetch(`${BASE_URL}/api/v1/verify/unit-codes`);
    report('TENANT-06', anonymousCodesResponse.status === 401, '401 for unauthenticated unit-code list', anonymousCodesResponse.status);

    const ownerBudgetsResponse = await fetch(`${BASE_URL}/api/v1/budgets`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const ownerBudgetsData = await ownerBudgetsResponse.json();
    report(
      'TENANT-07',
      ownerBudgetsResponse.status === 200 && ownerBudgetsData.data.budgets.some(budget => budget.id === budgetIdLot),
      'owner budget list contains its budget',
      ownerBudgetsResponse.status
    );

    const otherBudgetsResponse = await fetch(`${BASE_URL}/api/v1/budgets`, {
      headers: { 'Authorization': `Bearer ${noBudgetToken}` }
    });
    const otherBudgetsData = await otherBudgetsResponse.json();
    report(
      'TENANT-08',
      otherBudgetsResponse.status === 200 && otherBudgetsData.data.budgets.every(budget => budget.id !== budgetIdLot),
      'other tenant budget list excludes owner budget',
      otherBudgetsResponse.status
    );

    const anonymousBudgetsResponse = await fetch(`${BASE_URL}/api/v1/budgets`);
    report('TENANT-09', anonymousBudgetsResponse.status === 401, '401 for unauthenticated budget list', anonymousBudgetsResponse.status);

    const otherInvestigationsResponse = await fetch(`${BASE_URL}/api/v1/verify/investigations`, {
      headers: { 'Authorization': `Bearer ${otherCertifierToken}` }
    });
    const otherInvestigationsData = await otherInvestigationsResponse.json();
    report(
      'TENANT-10',
      otherInvestigationsResponse.status === 200 &&
        otherInvestigationsData.data.investigations.every(investigation => investigation.id !== createdInv.id),
      'other certifier investigation list excludes owner investigation',
      otherInvestigationsResponse.status
    );

    const anonymousInvestigationsResponse = await fetch(`${BASE_URL}/api/v1/verify/investigations`);
    report(
      'TENANT-11',
      anonymousInvestigationsResponse.status === 401,
      '401 for unauthenticated investigation list',
      anonymousInvestigationsResponse.status
    );

    const ownerCsvResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/export/csv`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const ownerCsv = await ownerCsvResponse.text();
    report(
      'TENANT-12',
      ownerCsvResponse.status === 200 && ownerCsv.includes(serials[0]),
      'owner CSV export contains its code',
      ownerCsvResponse.status
    );

    const otherCsvResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/export/csv`, {
      headers: { 'Authorization': `Bearer ${noBudgetToken}` }
    });
    report('TENANT-13', otherCsvResponse.status === 404, '404 for other tenant CSV export', otherCsvResponse.status);

    const anonymousCsvResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/export/csv`);
    report('TENANT-14', anonymousCsvResponse.status === 401, '401 for unauthenticated CSV export', anonymousCsvResponse.status);

    const ownerPdfResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/export/pdf`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const ownerPdfData = await ownerPdfResponse.json();
    report(
      'TENANT-15',
      ownerPdfResponse.status === 200 &&
        ownerPdfData.data.lot_id === lotId2 &&
        ownerPdfData.data.print_ready_codes.some(code => code.serial === serials[0]),
      'owner PDF export contains only its lot data',
      ownerPdfResponse.status
    );

    const otherPdfResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/export/pdf`, {
      headers: { 'Authorization': `Bearer ${noBudgetToken}` }
    });
    report('TENANT-16', otherPdfResponse.status === 404, '404 for other tenant PDF export', otherPdfResponse.status);

    const anonymousPdfResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/export/pdf`);
    report('TENANT-17', anonymousPdfResponse.status === 401, '401 for unauthenticated PDF export', anonymousPdfResponse.status);

    const containmentStateBefore = await pgPool.query(
      `SELECT
         (SELECT consumed_quantity FROM budgets WHERE id = $1) AS drawdown_consumed_quantity,
         (SELECT consumed_quantity FROM budgets WHERE id = $2) AS lot_consumed_quantity,
         (SELECT COUNT(*)::integer FROM unit_codes WHERE lot_id = $3) AS unit_code_count,
         (SELECT revocation_status FROM lots WHERE id = $3) AS revocation_status,
         (SELECT certification_status FROM lots WHERE id = $3) AS certification_status,
         (SELECT status FROM investigations WHERE id = $4) AS investigation_status,
         (SELECT COUNT(*)::integer FROM log_entries) AS ledger_count`,
      [budgetIdLot, budgetIdMint, lotId2, createdInv.id]
    );

    const crossDrawdownResponse = await fetch(`${BASE_URL}/api/v1/budgets/${budgetIdLot}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${noBudgetToken}` },
      body: JSON.stringify({ amount: 1 })
    });
    report('TENANT-18', crossDrawdownResponse.status === 404, '404 for cross-tenant drawdown', crossDrawdownResponse.status);

    const crossMintResponse = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${noBudgetToken}` },
      body: JSON.stringify({ lot_id: lotId2, gtin: scanGtin, quantity: 1 })
    });
    report('TENANT-19', crossMintResponse.status === 404, '404 for cross-tenant mint', crossMintResponse.status);

    const crossRegisterResponse = await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${noBudgetToken}` },
      body: JSON.stringify({
        lot_id: lotId2,
        public_identifier: generateUUID(),
        gtin: scanGtin,
        serial: `SN_CROSS_TENANT_${uniqueId}`,
        verification_url: `${BASE_URL}/verify/${generateUUID()}`
      })
    });
    report('TENANT-20', crossRegisterResponse.status === 404, '404 for cross-tenant registration', crossRegisterResponse.status);

    const crossCertifyResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/certify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${otherCertifierToken}` }
    });
    report('TENANT-21', crossCertifyResponse.status === 404, '404 for cross-certifier certification', crossCertifyResponse.status);

    const crossRevokeResponse = await fetch(`${BASE_URL}/api/v1/lots/${lotId2}/revoke`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${otherCertifierToken}` }
    });
    report('TENANT-22', crossRevokeResponse.status === 404, '404 for cross-certifier revocation', crossRevokeResponse.status);

    const crossInvestigationRead = await fetch(`${BASE_URL}/api/v1/verify/investigations/${createdInv.id}`, {
      headers: { 'Authorization': `Bearer ${otherCertifierToken}` }
    });
    report('TENANT-23', crossInvestigationRead.status === 404, '404 for cross-certifier investigation read', crossInvestigationRead.status);

    const crossInvestigationMutation = await fetch(`${BASE_URL}/api/v1/verify/investigations/${createdInv.id}/dismiss`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${otherCertifierToken}` }
    });
    report(
      'TENANT-24',
      crossInvestigationMutation.status === 404,
      '404 for cross-certifier investigation mutation',
      crossInvestigationMutation.status
    );

    const containmentStateAfter = await pgPool.query(
      `SELECT
         (SELECT consumed_quantity FROM budgets WHERE id = $1) AS drawdown_consumed_quantity,
         (SELECT consumed_quantity FROM budgets WHERE id = $2) AS lot_consumed_quantity,
         (SELECT COUNT(*)::integer FROM unit_codes WHERE lot_id = $3) AS unit_code_count,
         (SELECT revocation_status FROM lots WHERE id = $3) AS revocation_status,
         (SELECT certification_status FROM lots WHERE id = $3) AS certification_status,
         (SELECT status FROM investigations WHERE id = $4) AS investigation_status,
         (SELECT COUNT(*)::integer FROM log_entries) AS ledger_count`,
      [budgetIdLot, budgetIdMint, lotId2, createdInv.id]
    );
    report(
      'TENANT-25',
      JSON.stringify(containmentStateAfter.rows[0]) === JSON.stringify(containmentStateBefore.rows[0]),
      'cross-tenant denials cause zero database or ledger mutation',
      JSON.stringify(containmentStateAfter.rows[0])
    );

    console.log('\n--- Phase 10: Transparency Ledger ---');

    // LEDGER-04: Verify latest block hash matches calculated
    const entriesRes = await fetch(`${BASE_URL}/log/api/v1/log/entries`);
    const entriesData = await entriesRes.json();
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
    const timeoutRes = await fetch(`${BASE_URL}/api/v1/integrations/tracenet/certificates/TIMEOUT-TEST`, {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
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
    
    // D-011: end-to-end setup discovers the producer's lot through its scoped list.
    const lotsListRes5 = await fetch(`${BASE_URL}/api/v1/verify/lots`, {
      headers: { 'Authorization': `Bearer ${tokens.PRODUCER}` }
    });
    const lotsListRes5Data = await lotsListRes5.json();
    const happyLotId = lotsListRes5Data.data.lots.find(l => l.product_metadata?.batch_id === `BATCH-HAPPY-${uniqueId}`).id;

    // 3. Mint
    await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.PRODUCER}` },
      body: JSON.stringify({ lot_id: happyLotId, gtin: happyGtin, quantity: 10 })
    });

    // 4. D-011: seed the downstream state while lab writes remain feature-gated.
    await pgPool.query(
      `UPDATE lab_results
       SET lab_name = 'Compliance Fixture Laboratory',
           test_type = 'Purity Check',
           result_summary = 'PASS',
           report_hash = $2,
           report_reference = 'F1-E2E-PASS'
       WHERE lot_id = $1`,
      [happyLotId, pdfHash]
    );
    await pgPool.query("UPDATE lots SET lab_status = 'PASSED' WHERE id = $1", [happyLotId]);

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

    console.log('\n--- Phase 17: Rate Limiting ---');

    let loginRateLimitStatus = 0;
    for (let attempt = 0; attempt < 120 && loginRateLimitStatus !== 429; attempt += 1) {
      const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: `rate_limit_${uniqueId}`, password: 'incorrect-password' })
      });
      loginRateLimitStatus = response.status;
    }
    report('SEC-05A', loginRateLimitStatus === 429, '429 from Redis login sliding-window limiter', loginRateLimitStatus);

    let verifyRateLimitStatus = 0;
    for (let attempt = 0; attempt < 120 && verifyRateLimitStatus !== 429; attempt += 1) {
      const response = await fetch(`${BASE_URL}/api/v1/verify/v/${scanPublicIdSeq}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 19.0760, lon: 72.8777 })
      });
      verifyRateLimitStatus = response.status;
    }
    report('SEC-05B', verifyRateLimitStatus === 429, '429 from Redis public-verification sliding-window limiter', verifyRateLimitStatus);

  } catch (error) {
    fatalError = error;
    console.error('An error occurred during test execution:', error);
  } finally {
    if (pgPool) await pgPool.end().catch(() => undefined);
  }

  console.log('\n====================================================');
  console.log(` CapMint API Compliance Verification Complete`);
  console.log(` Total Passed: ${passed} | Total Pending: ${pendingCount} | Total Failed: ${failed}`);
  console.log('====================================================');
  if (failed > 0 || fatalError) {
    process.exitCode = 1;
  }
}

runTests().catch(error => {
  console.error('Compliance runner failed before reporting:', error);
  process.exitCode = 1;
});
