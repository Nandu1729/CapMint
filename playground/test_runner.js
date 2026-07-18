const BASE_URL = 'http://localhost:8080';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate unique suffix to prevent duplicate key constraint issues in database
const uniqueId = Date.now().toString().slice(-6);
const testProducerName = `Test Producer ${uniqueId}`;
const testProducerEmail = `prod_${uniqueId}@test.com`;
const testProducerUsername = `prod_user_${uniqueId}`;

const testCertifierName = `Test Certifier ${uniqueId}`;
const testCertifierEmail = `cert_${uniqueId}@test.com`;
const testCertifierUsername = `cert_user_${uniqueId}`;

let producerOrgId = '';
let certifierOrgId = '';
let producerToken = '';
let certifierToken = '';
let proposedBudgetId = '';
let generatedLotId = '';
let testGtin = '07612345678900';
let testSerial = `SN_${uniqueId}_001`;
let testPublicId = generateUUID();

async function runTests() {
  console.log('====================================================');
  console.log('       CapMint Automated API Test Execution         ');
  console.log('====================================================\n');

  try {
    // 0. Clean and Re-seed Transparency Log table to ensure a clean hash chain
    const pgInit = await import('pg');
    const pgPoolInit = new pgInit.default.Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
    });
    await pgPoolInit.query('TRUNCATE TABLE log_entries CASCADE');
    await pgPoolInit.query(`
      INSERT INTO log_entries (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
      VALUES ('SYSTEM', '00000000-0000-0000-0000-000000000000', 'GENESIS_BLOCK_ANCHOR', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '00000000-0000-0000-0000-000000000000', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    `);
    await pgPoolInit.end();
    console.log('--- Running Phase 0: Clean and Re-seed Ledger Chain ---');
    console.log('[LEDGER-00] PASS: Transparency ledger truncated and clean genesis anchor inserted.\n');
    // -------------------------------------------------------------------------
    // 1. Authentication & Identity Tests
    // -------------------------------------------------------------------------
    console.log('--- Running Phase 1: Authentication & Identity ---');

    // AUTH-01: Register Producer Org
    const regProdRes = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testProducerName,
        type: 'PRODUCER',
        business_reg_details: { tax_id: `TAX-P-${uniqueId}`, registration_number: `REG-P-${uniqueId}` },
        official_email: testProducerEmail,
        contact_info: { phone: '+919999999999', address: 'Farming Sector, India' },
        admin_username: testProducerUsername,
        admin_password: 'password123'
      })
    });
    const regProdData = await regProdRes.json();
    if (regProdRes.status === 201) {
      producerOrgId = regProdData.data.organization.id;
      console.log(`[AUTH-01] PASS: Register Producer Org (Status: ${regProdRes.status}), Org ID: ${producerOrgId}`);
    } else {
      console.log(`[AUTH-01] FAIL: Register Producer Org (Status: ${regProdRes.status}) - ${JSON.stringify(regProdData)}`);
    }

    // Register Certifier Org
    const regCertRes = await fetch(`${BASE_URL}/api/v1/auth/register-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testCertifierName,
        type: 'CERTIFICATION_BODY',
        business_reg_details: { tax_id: `TAX-C-${uniqueId}`, registration_number: `REG-C-${uniqueId}` },
        official_email: testCertifierEmail,
        contact_info: { phone: '+918888888888', address: 'Standards office, Delhi' },
        admin_username: testCertifierUsername,
        admin_password: 'password123'
      })
    });
    const regCertData = await regCertRes.json();
    if (regCertRes.status === 201) {
      certifierOrgId = regCertData.data.organization.id;
      console.log(`[AUTH-01.1] PASS: Register Certifier Org (Status: ${regCertRes.status}), Org ID: ${certifierOrgId}`);
    } else {
      console.log(`[AUTH-01.1] FAIL: Register Certifier Org (Status: ${regCertRes.status}) - ${JSON.stringify(regCertData)}`);
    }

    // AUTH-02: Login with PENDING credentials
    const loginPendingRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testProducerUsername, password: 'password123' })
    });
    const loginPendingData = await loginPendingRes.json();
    if (loginPendingRes.status === 403) {
      console.log(`[AUTH-02] PASS: Login blocked for PENDING org (Status: ${loginPendingRes.status})`);
    } else {
      console.log(`[AUTH-02] FAIL: Login allowed for PENDING org (Status: ${loginPendingRes.status})`);
    }

    // AUTH-03: Activate organizations using SYSTEM_ADMIN login
    // First, login as default seed Admin to activate them
    const adminLoginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' })
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data.token;

    // Activate Producer Org
    const actProdRes = await fetch(`${BASE_URL}/api/v1/auth/organizations/${producerOrgId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });
    const actProdData = await actProdRes.json();

    // Activate Certifier Org
    const actCertRes = await fetch(`${BASE_URL}/api/v1/auth/organizations/${certifierOrgId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVATED' })
    });
    const actCertData = await actCertRes.json();

    if (actProdRes.status === 200 && actCertRes.status === 200) {
      console.log(`[AUTH-03] PASS: Organizations ACTIVATED by System Admin (Status: 200)`);
      // Update new certifier public key to match test signature
      const pg = await import('pg');
      const pgPool = new pg.default.Pool({
        connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
      });
      const certPubKey = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuivJCz//jZz3K7oRzWslrZ8f02pSYSU/9LqPUFgBBHA=\n-----END PUBLIC KEY-----';
      await pgPool.query('UPDATE certifiers SET public_key = $1 WHERE id = $2', [certPubKey, certifierOrgId]);
      await pgPool.end();
      console.log(`[AUTH-03.1] PASS: Certifier public key updated to matching Ed25519 key in database.`);
    } else {
      console.log(`[AUTH-03] FAIL: Organization activation failed`);
    }

    // AUTH-04: Login with ACTIVATED credentials (Producer)
    const loginProdRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testProducerUsername, password: 'password123' })
    });
    const loginProdData = await loginProdRes.json();
    producerToken = loginProdData.data.token;

    // Login as Certifier
    const loginCertRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testCertifierUsername, password: 'password123' })
    });
    const loginCertData = await loginCertRes.json();
    certifierToken = loginCertData.data.token;

    if (producerToken && certifierToken) {
      console.log(`[AUTH-04] PASS: Login successful for activated organizations. Producer & Certifier tokens retrieved.`);
    } else {
      console.log(`[AUTH-04] FAIL: Login failed after activation`);
    }

    // AUTH-05: Login with incorrect password
    const loginBadRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testProducerUsername, password: 'wrong_password' })
    });
    if (loginBadRes.status === 401) {
      console.log(`[AUTH-05] PASS: Login rejected with invalid password (Status: ${loginBadRes.status})`);
    } else {
      console.log(`[AUTH-05] FAIL: Login allowed with invalid password (Status: ${loginBadRes.status})`);
    }

    // -------------------------------------------------------------------------
    // 2. Quota & Budgets (CPQ) Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Running Phase 2: Quota & Budgets (CPQ) ---');

    // CPQ-01: Propose Budget as Producer
    const propBudRes = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: JSON.stringify({
        producer_id: producerOrgId,
        certifier_id: certifierOrgId,
        source_unit_type: 'WEIGHT_KG',
        approved_quantity: 10000.0,
        yield_assumptions: { crop: 'Organic Honey', land_area_hectares: 5.0 },
        signature_bundle: 'sig_bundle_abc123',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    const propBudData = await propBudRes.json();
    proposedBudgetId = propBudData.data?.budget?.id;
    if (propBudRes.status === 201 && proposedBudgetId) {
      console.log(`[CPQ-01] PASS: Budget Proposed successfully. Budget ID: ${proposedBudgetId}`);
    } else {
      console.log(`[CPQ-01] FAIL: Propose Budget failed (Status: ${propBudRes.status}) - ${JSON.stringify(propBudData)}`);
    }

    // CPQ-02: Activate Budget as Producer (Should fail)
    const actBudProdRes = await fetch(`${BASE_URL}/api/v1/budgets/${proposedBudgetId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: '{}'
    });
    if (actBudProdRes.status === 403) {
      console.log(`[CPQ-02] PASS: Producer activation blocked (Status: ${actBudProdRes.status})`);
    } else {
      console.log(`[CPQ-02] FAIL: Producer allowed to activate budget (Status: ${actBudProdRes.status})`);
    }

    // CPQ-03: Activate Budget as Certifier (Should pass)
    const actBudCertRes = await fetch(`${BASE_URL}/api/v1/budgets/${proposedBudgetId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${certifierToken}` },
      body: '{}'
    });
    if (actBudCertRes.status === 200) {
      console.log(`[CPQ-03] PASS: Certifier activated and signed budget (Status: ${actBudCertRes.status})`);
    } else {
      console.log(`[CPQ-03] FAIL: Certifier activation failed (Status: ${actBudCertRes.status})`);
    }

    // CPQ-04: Drawdown from ACTIVE budget
    const drawdownRes = await fetch(`${BASE_URL}/api/v1/budgets/${proposedBudgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: JSON.stringify({ amount: 500 })
    });
    const drawdownData = await drawdownRes.json();
    if (drawdownRes.status === 200) {
      console.log(`[CPQ-05] PASS: Quota drawdown successful (Status: 200), remaining capacity: ${drawdownData.data?.budget?.remainingQuantity}`);
    } else {
      console.log(`[CPQ-05] FAIL: Quota drawdown failed (Status: ${drawdownRes.status})`);
    }

    // CPQ-06: Drawdown exceeding remaining budget
    const drawdownExcessRes = await fetch(`${BASE_URL}/api/v1/budgets/${proposedBudgetId}/drawdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: JSON.stringify({ amount: 20000 })
    });
    if (drawdownExcessRes.status === 422) {
      console.log(`[CPQ-06] PASS: Drawdown exceeding remaining quota blocked (Status: ${drawdownExcessRes.status})`);
    } else {
      console.log(`[CPQ-06] FAIL: Allowed drawdown exceeding limit (Status: ${drawdownExcessRes.status})`);
    }

    // CPQ-07: Get budgets list
    const getBudgetsRes = await fetch(`${BASE_URL}/api/v1/budgets`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${producerToken}` }
    });
    const getBudgetsData = await getBudgetsRes.json();
    if (getBudgetsRes.status === 200 && getBudgetsData.data.budgets.length > 0) {
      console.log(`[CPQ-07] PASS: Retrieved budgets list with tenant isolation active.`);
    } else {
      console.log(`[CPQ-07] FAIL: Could not fetch budgets list`);
    }

    // -------------------------------------------------------------------------
    // 3. Serialization & Minting Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Running Phase 3: Serialization & Minting ---');

    // Register a lot to generate lot ID
    const regCodeRes = await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: JSON.stringify({
        public_identifier: testPublicId,
        gtin: testGtin,
        serial: testSerial,
        verification_url: `${BASE_URL}/verify/${testPublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: testProducerName, batch_id: `BATCH-${uniqueId}` }
      })
    });
    
    // Fetch lot to use lot_id
    const lotsRes = await fetch(`${BASE_URL}/api/v1/verify/lots`);
    const lotsData = await lotsRes.json();
    generatedLotId = lotsData.data.lots[0].id;
    console.log(`Lot registered and retrieved for minting. Lot ID: ${generatedLotId}`);

    // MINT-01: Mint unique serialized numbers
    const mintRes = await fetch(`${BASE_URL}/api/v1/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: JSON.stringify({
        lot_id: generatedLotId,
        gtin: testGtin,
        quantity: 5
      })
    });
    const mintData = await mintRes.json();
    if (mintRes.status === 201 && mintData.data.serials.length === 5) {
      console.log(`[MINT-01] PASS: Minted ${mintData.data.serials.length} serials successfully.`);
    } else {
      console.log(`[MINT-01] FAIL: Minting failed (Status: ${mintRes.status}) - ${JSON.stringify(mintData)}`);
    }

    // MINT-03: Validate GTIN with invalid check digit
    const validateGtinRes = await fetch(`${BASE_URL}/api/v1/gs1/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gtin: '07612345678909' }) // Invalid check digit
    });
    const validateGtinData = await validateGtinRes.json();
    if (validateGtinData.success === true && validateGtinData.data.isValid === false) {
      console.log(`[MINT-03] PASS: Invalid GTIN check digit correctly flagged.`);
    } else {
      console.log(`[MINT-03] FAIL: GTIN check validation failed`);
    }

    // -------------------------------------------------------------------------
    // 4. Verification & Clone Detection Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Running Phase 4: Verification & Clone Detection ---');

    // Register a specific code we will scan
    const scanGtin = '07612345678900';
    const scanSerial = `SN_SCAN_${uniqueId}`;
    const scanPublicId = generateUUID();

    const regScanRes = await fetch(`${BASE_URL}/api/v1/verify/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${producerToken}` },
      body: JSON.stringify({
        public_identifier: scanPublicId,
        gtin: scanGtin,
        serial: scanSerial,
        verification_url: `${BASE_URL}/verify/${scanPublicId}`,
        qr_code_data_uri: 'data:image/png;base64,mock',
        product_metadata: { name: 'Organic Honey', manufacturer: testProducerName, batch_id: `BATCH-SCAN-${uniqueId}` }
      })
    });
    if (regScanRes.status !== 200) {
      const regScanErr = await regScanRes.json();
      console.log(`[VER-01] FAIL: Registration of scan code failed (Status: ${regScanRes.status}) - ${JSON.stringify(regScanErr)}`);
    } else {
      console.log(`[VER-01] PASS: Registration of scan code successful.`);
    }

    // VER-02: Scan Event 1 (Normal Scan)
    const scan1Res = await fetch(`${BASE_URL}/api/v1/verify/v/${scanPublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.0760, lon: 72.8777, device_metadata: 'iPhone' })
    });
    const scan1Data = await scan1Res.json();
    if (scan1Res.status === 200 && scan1Data.data.status === 'VERIFIED') {
      console.log(`[VER-02] PASS: First scan recorded as VERIFIED.`);
    } else {
      console.log(`[VER-02] FAIL: First scan failed (Status: ${scan1Res.status}) - ${JSON.stringify(scan1Data)}`);
    }

    // VER-03: Scan Event 2 (Clone Simulation Scan from New York 1 second later)
    const scan2Res = await fetch(`${BASE_URL}/api/v1/verify/v/${scanPublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 40.7128, lon: -74.0060, device_metadata: 'Android' })
    });
    const scan2Data = await scan2Res.json();
    if (scan2Res.status === 200 && scan2Data.data.risk === 'CRITICAL') {
      console.log(`[VER-03] PASS: Counterfeit geovelocity clone scan correctly flagged as CRITICAL risk.`);
    } else {
      console.log(`[VER-03] FAIL: Clone detection failed (Status: ${scan2Res.status}) - ${JSON.stringify(scan2Data)}`);
    }

    // VER-04: View investigations as Certifier
    const getInvsRes = await fetch(`${BASE_URL}/api/v1/verify/investigations`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${certifierToken}` }
    });
    const getInvsData = await getInvsRes.json();
    const activeInvestigation = getInvsData.data.investigations.find(i => i.public_identifier === scanPublicId);
    if (getInvsRes.status === 200 && activeInvestigation) {
      console.log(`[VER-04] PASS: Certifier successfully retrieved active clone investigations.`);
    } else {
      console.log(`[VER-04] FAIL: Certifier could not retrieve active investigations`);
    }

    // VER-05: Approve revocation of lot
    const invId = activeInvestigation?.id;
    const approveRevRes = await fetch(`${BASE_URL}/api/v1/verify/investigations/${invId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${certifierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Confirmed duplicate copies found in retail.' })
    });
    if (approveRevRes.status === 200) {
      console.log(`[VER-05] PASS: Certifier approved lot revocation.`);
    } else {
      console.log(`[VER-05] FAIL: Lot revocation approval failed`);
    }

    // VER-06: Scan revoked code
    const scanRevokedRes = await fetch(`${BASE_URL}/api/v1/verify/v/${scanPublicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 28.7041, lon: 77.1025, device_metadata: 'iPhone' })
    });
    const scanRevokedData = await scanRevokedRes.json();
    if (scanRevokedRes.status === 200 && scanRevokedData.data.status === 'REVOKED') {
      console.log(`[VER-06] PASS: Scan of revoked QR code correctly returned REVOKED verdict.`);
    } else {
      console.log(`[VER-06] FAIL: Scan of revoked code returned status: ${scanRevokedData.data?.status}`);
    }

    // -------------------------------------------------------------------------
    // 5. Transparency Ledger & Integrations Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Running Phase 5: Transparency Ledger & Integrations ---');

    // LEDGER-01: Get ledger entries
    const getLogRes = await fetch(`${BASE_URL}/log/api/v1/log/entries`);
    const getLogData = await getLogRes.json();
    if (getLogRes.status === 200 && getLogData.data?.logs?.length > 0) {
      console.log(`[LEDGER-01] PASS: Retrieved Transparency Ledger entries.`);
    } else {
      console.log(`[LEDGER-01] FAIL: Could not fetch ledger entries`);
    }

    // LEDGER-02: Verify ledger chain integrity
    const verifyLogRes = await fetch(`${BASE_URL}/log/api/v1/log/verify`);
    const verifyLogData = await verifyLogRes.json();
    if (verifyLogRes.status === 200 && verifyLogData.data?.unbroken === true) {
      console.log(`[LEDGER-02] PASS: Blockchain hash chain verification passed.`);
    } else {
      console.log(`[LEDGER-02] FAIL: Ledger verification failed -`, JSON.stringify(verifyLogData));
    }

    // INT-01: Verify Agristack
    const agristackRes = await fetch(`${BASE_URL}/api/v1/integrations/agristack/farmers/FARMER-901`);
    const agristackData = await agristackRes.json();
    if (agristackRes.status === 200 && agristackData.success === true) {
      console.log(`[INT-01] PASS: AgriStack external registry validation mock succeeded.`);
    } else {
      console.log(`[INT-01] FAIL: AgriStack check failed -`, JSON.stringify(agristackData));
    }

    // INT-02: Verify TraceNet
    const tracenetRes = await fetch(`${BASE_URL}/api/v1/integrations/tracenet/certificates/NPOP-IN-90812`);
    const tracenetData = await tracenetRes.json();
    if (tracenetRes.status === 200 && tracenetData.success === true) {
      console.log(`[INT-02] PASS: TraceNet external certificate validation mock succeeded.`);
    } else {
      console.log(`[INT-02] FAIL: TraceNet check failed -`, JSON.stringify(tracenetData));
    }

    console.log('\n====================================================');
    console.log('       CapMint API Execution Testing Complete       ');
    console.log('====================================================');

  } catch (error) {
    console.error('An error occurred during test execution:', error);
  }
}

runTests();
