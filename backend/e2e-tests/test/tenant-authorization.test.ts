import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  PUBLIC_TENANT_CONTEXT,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';

const RUN_INTEGRATION = process.env.RUN_C0_INTEGRATION === '1';
const TEST_DATABASE_NAME = process.env.C0_TEST_DATABASE_NAME || '';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

dotenv.config({ path: path.join(ROOT, '.env') });

const PORTS = {
  cpq: 28182,
  mint: 28183,
  resolver: 28184,
  transparency: 28185,
  verification: 28186,
  integration: 28187
};

const BASE = {
  cpq: `http://127.0.0.1:${PORTS.cpq}`,
  mint: `http://127.0.0.1:${PORTS.mint}`,
  resolver: `http://127.0.0.1:${PORTS.resolver}`,
  transparency: `http://127.0.0.1:${PORTS.transparency}`,
  verification: `http://127.0.0.1:${PORTS.verification}`,
  integration: `http://127.0.0.1:${PORTS.integration}`
};

const ids = {
  producerOrgA: crypto.randomUUID(),
  producerOrgB: crypto.randomUUID(),
  certifierOrgA: crypto.randomUUID(),
  certifierOrgB: crypto.randomUUID(),
  producerA: crypto.randomUUID(),
  producerB: crypto.randomUUID(),
  certifierA: crypto.randomUUID(),
  certifierB: crypto.randomUUID(),
  revokedCertifierB: crypto.randomUUID(),
  labA: crypto.randomUUID(),
  labB: crypto.randomUUID(),
  exporter: crypto.randomUUID(),
  systemAdmin: crypto.randomUUID(),
  assigneeA: crypto.randomUUID(),
  budgetA: crypto.randomUUID(),
  budgetB: crypto.randomUUID(),
  budgetActivateA: crypto.randomUUID(),
  capacityBudget: crypto.randomUUID(),
  overfilledBudget: crypto.randomUUID(),
  unsignedBudget: crypto.randomUUID(),
  revokedBudget: crypto.randomUUID(),
  lotA: crypto.randomUUID(),
  lotB: crypto.randomUUID(),
  lotRevokeA: crypto.randomUUID(),
  capacityLot: crypto.randomUUID(),
  overfilledLot: crypto.randomUUID(),
  unsignedLot: crypto.randomUUID(),
  revokedBudgetLot: crypto.randomUUID(),
  codeA: crypto.randomUUID(),
  codeB: crypto.randomUUID(),
  codeRevokeA: crypto.randomUUID(),
  codeAutomation: crypto.randomUUID(),
  overfilledCode: crypto.randomUUID(),
  investigationA: crypto.randomUUID(),
  investigationB: crypto.randomUUID()
};

const values = {
  gtinA: '07612345678900',
  gtinB: '00000000000000',
  serialA: `A${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
  serialB: `B${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
  serialRevokeA: `R${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
  serialAutomation: `I${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
  batchA: `batch-a-${crypto.randomUUID()}`
};

let adminPool: pg.Pool;
let testPool: pg.Pool;
let testDatabaseUrl: string;
let appDatabaseUrl: string;
let appRoleProvisioned = false;
let jwtSecret: string;
let certifierPrivateKey: string;
let certifierPublicKey: string;
let services: ChildProcess[] = [];
let databaseCreated = false;
const serviceLogs = new Map<number, string>();

function quoteIdentifier(value: string): string {
  if (!/^capmint_c0_test_[a-z0-9_]+$/.test(value)) {
    throw new Error('Refusing to use a database outside the capmint_c0_test_ namespace.');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function makeDatabaseUrl(source: string, databaseName: string): string {
  const parsed = new URL(source);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function signToken(orgId: string, orgType: string, role = 'ADMIN'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    id: crypto.randomUUID(),
    username: `c0_${orgType.toLowerCase()}`,
    orgId,
    orgType,
    role,
    iat: now,
    exp: now + 3600
  });
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function portIsOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForService(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test service exited before readiness with code ${child.exitCode}.`);
    }
    if (await portIsOpen(port)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const output = serviceLogs.get(child.pid || -1) || '(no child output)';
  throw new Error(`Timed out waiting for port ${port}. Startup output: ${output.slice(-2000)}`);
}

async function startService(name: keyof typeof PORTS, sourcePath: string): Promise<void> {
  if (await portIsOpen(PORTS[name])) {
    throw new Error(`Port ${PORTS[name]} is already in use; refusing to reuse or stop an existing process.`);
  }

  const tsxPath = path.join(ROOT, 'node_modules/.bin/tsx');
  const child = spawn(tsxPath, [sourcePath], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'integration',
      PORT: String(PORTS[name]),
      DATABASE_URL: name === 'integration' ? testDatabaseUrl : appDatabaseUrl,
      REDIS_URL: process.env.REDIS_URL || '',
      JWT_SECRET: jwtSecret,
      CERTIFIER_PRIVATE_KEY: certifierPrivateKey,
      TRANSPARENCY_SERVICE_URL: `${BASE.transparency}/api/v1/log`,
      VERIFY_FRONTEND_URL: 'http://127.0.0.1:28180',
      CORS_ORIGIN: 'http://127.0.0.1:28180'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serviceLogs.set(child.pid || -1, '');
  const capture = (chunk: Buffer) => {
    const pid = child.pid || -1;
    serviceLogs.set(pid, `${serviceLogs.get(pid) || ''}${chunk.toString('utf8')}`);
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  services.push(child);
  await waitForService(PORTS[name], child);
}

async function requestJson(
  baseUrl: string,
  route: string,
  options: { method?: string; token?: string; body?: unknown; accept?: string } = {}
) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accept) headers.Accept = options.accept;
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual'
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  return { status: response.status, data };
}

async function insertFixtures(): Promise<void> {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    const orgs = [
      [ids.producerOrgA, 'C0 Producer A', 'PRODUCER', 'producer-a@c0.test'],
      [ids.producerOrgB, 'C0 Producer B', 'PRODUCER', 'producer-b@c0.test'],
      [ids.certifierOrgA, 'C0 Certifier A', 'CERTIFICATION_BODY', 'certifier-a@c0.test'],
      [ids.certifierOrgB, 'C0 Certifier B', 'CERTIFICATION_BODY', 'certifier-b@c0.test'],
      [ids.labA, 'C0 Laboratory A', 'NABL_LABORATORY', 'lab-a@c0.test'],
      [ids.labB, 'C0 Laboratory B', 'NABL_LABORATORY', 'lab-b@c0.test'],
      [ids.systemAdmin, 'C0 System Administrator', 'SYSTEM_ADMINISTRATOR', 'system-admin@c0.test']
    ];
    for (const [id, name, type, email] of orgs) {
      await client.query(
        `INSERT INTO organizations
           (id, name, type, official_email, status, business_reg_details, contact_info)
         VALUES ($1, $2, $3, $4, 'ACTIVATED', '{}', '{}')`,
        [id, name, type, email]
      );
    }

    await client.query(
      `INSERT INTO producers (id, name, type, registry_references, organization_id)
       VALUES ($1, 'C0 Producer A', 'FARMER', '{}', $2),
              ($3, 'C0 Producer B', 'FARMER', '{}', $4)`,
      [ids.producerA, ids.producerOrgA, ids.producerB, ids.producerOrgB]
    );
    await client.query(
      `INSERT INTO certifiers (id, name, accreditation_details, public_key, key_status, organization_id)
       VALUES ($1, 'C0 Certifier A', '{}', $6, 'ACTIVE', $2),
              ($3, 'C0 Certifier B', '{}', $6, 'ACTIVE', $4),
              ($5, 'C0 Revoked Certifier B', '{}', $6, 'REVOKED', $4)`,
      [
        ids.certifierA,
        ids.certifierOrgA,
        ids.certifierB,
        ids.certifierOrgB,
        ids.revokedCertifierB,
        certifierPublicKey
      ]
    );
    await client.query(
      `INSERT INTO users (id, organization_id, username, password_hash, role, status)
       VALUES ($1, $2, $3, 'integration-only', 'MEMBER', 'ACTIVE')`,
      [ids.assigneeA, ids.certifierOrgA, `assignee_${ids.assigneeA}`]
    );

    const activeSignatureA = crypto.sign(
      null,
      Buffer.from(`budget_id:${ids.budgetA};approved_quantity:100.00`),
      certifierPrivateKey
    ).toString('hex');
    const activeSignatureB = crypto.sign(
      null,
      Buffer.from(`budget_id:${ids.budgetB};approved_quantity:100.00`),
      certifierPrivateKey
    ).toString('hex');
    const capacitySignature = crypto.sign(
      null,
      Buffer.from(`budget_id:${ids.capacityBudget};approved_quantity:1.00`),
      certifierPrivateKey
    ).toString('hex');
    const overfilledSignature = crypto.sign(
      null,
      Buffer.from(`budget_id:${ids.overfilledBudget};approved_quantity:1.00`),
      certifierPrivateKey
    ).toString('hex');
    const revokedSignature = crypto.sign(
      null,
      Buffer.from(`budget_id:${ids.revokedBudget};approved_quantity:1.00`),
      certifierPrivateKey
    ).toString('hex');
    await client.query(
      `INSERT INTO budgets
         (id, producer_id, certifier_id, source_unit_type, approved_quantity,
          consumed_quantity, yield_assumptions, signature_bundle,
          effective_start_date, effective_end_date, status, status_history)
       VALUES
         ($1, $2, $3, 'UNIT_COUNT', 100, 10, '{"crop":"C0 A"}', $4,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'ACTIVE', '[]'),
         ($5, $6, $7, 'UNIT_COUNT', 100, 10, '{"crop":"C0 B"}', $8,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'ACTIVE', '[]'),
         ($9, $2, $3, 'UNIT_COUNT', 100, 0, '{"crop":"C0 Activate"}', 'pending',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'PENDING_APPROVAL', '[]'),
         ($10, $2, $3, 'UNIT_COUNT', 1, 1, '{"crop":"Capacity race"}', $11,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'EXHAUSTED', '[]'),
         ($12, $2, $3, 'UNIT_COUNT', 1, 1, '{"crop":"Overfilled guard"}', $13,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'EXHAUSTED', '[]'),
         ($14, $2, $3, 'UNIT_COUNT', 1, 1, '{"crop":"Unsigned guard"}', '',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'EXHAUSTED', '[]'),
         ($15, $2, $3, 'UNIT_COUNT', 1, 1, '{"crop":"Revoked budget guard"}', $16,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'REVOKED', '[]')`,
      [
        ids.budgetA, ids.producerA, ids.certifierA, activeSignatureA,
        ids.budgetB, ids.producerB, ids.certifierB, activeSignatureB,
        ids.budgetActivateA,
        ids.capacityBudget, capacitySignature,
        ids.overfilledBudget, overfilledSignature,
        ids.unsignedBudget,
        ids.revokedBudget, revokedSignature
      ]
    );

    await client.query(
      `INSERT INTO lots
         (id, producer_id, budget_id, product_metadata, batch_size, processing_dates,
          lab_status, revocation_status, certification_status)
       VALUES
         ($1, $2, $3, $4, 20, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($5, $6, $7, '{"name":"C0 Product B"}', 20, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($8, $2, $3, '{"name":"C0 Revoke A"}', 20, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($9, $2, $10, '{"name":"Capacity race"}', 1, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($11, $2, $12, '{"name":"Overfilled guard"}', 1, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($13, $2, $14, '{"name":"Unsigned guard"}', 1, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($15, $2, $16, '{"name":"Revoked budget guard"}', 1, '{}', 'PASSED', 'ACTIVE', 'PENDING')`,
      [
        ids.lotA, ids.producerA, ids.budgetA, JSON.stringify({ name: 'C0 Product A', batch_id: values.batchA }),
        ids.lotB, ids.producerB, ids.budgetB,
        ids.lotRevokeA,
        ids.capacityLot, ids.capacityBudget,
        ids.overfilledLot, ids.overfilledBudget,
        ids.unsignedLot, ids.unsignedBudget,
        ids.revokedBudgetLot, ids.revokedBudget
      ]
    );
    await client.query(
      `INSERT INTO unit_codes
         (id, lot_id, serial, gtin, digital_link_uri, public_identifier,
          verification_url, current_state)
       VALUES
         ($1, $2, $3, $4, $5, $1, $6, 'MINTED'),
         ($7, $8, $9, $10, $11, $7, $12, 'MINTED'),
         ($13, $14, $15, $4, $16, $13, $17, 'MINTED'),
         ($18, $19, $20, $4, $21, $18, $22, 'MINTED')`,
      [
        ids.codeA, ids.lotA, values.serialA, values.gtinA,
        `https://id.c0/01/${values.gtinA}/21/${values.serialA}`,
        `https://verify.c0/v/${ids.codeA}`,
        ids.codeB, ids.lotB, values.serialB, values.gtinB,
        `https://id.c0/01/${values.gtinB}/21/${values.serialB}`,
        `https://verify.c0/v/${ids.codeB}`,
        ids.codeRevokeA, ids.lotRevokeA, values.serialRevokeA,
        `https://id.c0/01/${values.gtinA}/21/${values.serialRevokeA}`,
        `https://verify.c0/v/${ids.codeRevokeA}`,
        ids.overfilledCode, ids.overfilledLot, `O${crypto.randomBytes(6).toString('hex')}`,
        `https://id.c0/01/${values.gtinA}/21/${crypto.randomUUID()}`,
        `https://verify.c0/v/${ids.overfilledCode}`
      ]
    );
    await client.query(
      `INSERT INTO unit_codes
         (id, lot_id, serial, gtin, digital_link_uri, public_identifier,
          verification_url, current_state)
       VALUES ($1, $2, $3, $4, $5, $1, $6, 'MINTED')`,
      [
        ids.codeAutomation,
        ids.lotB,
        values.serialAutomation,
        values.gtinB,
        `https://id.c0/01/${values.gtinB}/21/${values.serialAutomation}`,
        `https://verify.c0/v/${ids.codeAutomation}`
      ]
    );
    await client.query(
      `INSERT INTO lab_results
         (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
       VALUES ($1, 'Legacy Test Lab', 'Purity', 'PASS', $2, 'c0-a.pdf')`,
      [ids.lotA, crypto.createHash('sha256').update('c0-a').digest('hex')]
    );
    await client.query(
      `INSERT INTO investigations
         (id, product_name, public_identifier, risk_level, status, detection_reason,
          manufacturer, current_product_status, evidence, unit_code_id)
       VALUES
         ($1, 'C0 Product A', $2, 'HIGH', 'OPEN', 'C0 test', 'Producer A', 'ACTIVE', '{}', $2),
         ($3, 'C0 Product B', $4, 'HIGH', 'OPEN', 'C0 test', 'Producer B', 'ACTIVE', '{}', $4)`,
      [ids.investigationA, ids.codeA, ids.investigationB, ids.codeB]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function mutationSnapshot() {
  const result = await testPool.query(
    `SELECT
       (SELECT jsonb_build_object('consumed', consumed_quantity, 'status', status, 'history', status_history, 'signature', signature_bundle)
          FROM budgets WHERE id = $1) AS budget_a,
       (SELECT count(*)::int FROM unit_codes WHERE lot_id = $2) AS lot_a_codes,
       (SELECT jsonb_build_object('lab', lab_status, 'revocation', revocation_status, 'certification', certification_status)
          FROM lots WHERE id = $2) AS lot_a,
       (SELECT assigned_laboratory_organization_id FROM lots WHERE id = $2) AS assigned_laboratory,
       (SELECT jsonb_agg(jsonb_build_object('id', id, 'state', current_state) ORDER BY id)
          FROM unit_codes WHERE lot_id = $2) AS lot_a_code_states,
       (SELECT jsonb_build_object('status', status, 'notes', case_notes, 'timeline', evidence_timeline)
          FROM investigations WHERE id = $3) AS investigation_a,
       (SELECT count(*)::int FROM lab_results WHERE lot_id = $2) AS lab_results,
       (SELECT count(*)::int FROM budgets) AS budget_count,
       (SELECT count(*)::int FROM log_entries) AS ledger_entries`,
    [ids.budgetA, ids.lotA, ids.investigationA]
  );
  return result.rows[0];
}

const suite = RUN_INTEGRATION ? describe : describe.skip;

suite('C0 tenant authorization containment', () => {
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    if (!TEST_DATABASE_NAME) throw new Error('C0_TEST_DATABASE_NAME is required.');
    quoteIdentifier(TEST_DATABASE_NAME);
    const sourceDatabaseUrl = process.env.DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    if (!sourceDatabaseUrl || !redisUrl) {
      throw new Error('DATABASE_URL and REDIS_URL are required without exposing their values.');
    }

    const adminUrl = new URL(sourceDatabaseUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
    const existing = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DATABASE_NAME]);
    if (existing.rowCount !== 0) {
      throw new Error(`Disposable database ${TEST_DATABASE_NAME} already exists; refusing to overwrite it.`);
    }

    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(TEST_DATABASE_NAME)} TEMPLATE template0`);
    databaseCreated = true;
    testDatabaseUrl = makeDatabaseUrl(sourceDatabaseUrl, TEST_DATABASE_NAME);
    testPool = new pg.Pool({ connectionString: testDatabaseUrl });
    const migrationLogSchema = await fs.readFile(
      path.join(ROOT, 'database/schema/migrations_log.sql'),
      'utf8'
    );
    await testPool.query(migrationLogSchema);
    const schema = await fs.readFile(path.join(ROOT, 'database/schema/schema.sql'), 'utf8');
    await testPool.query(schema);
    const roleMigration = await fs.readFile(
      path.join(ROOT, 'database/migrations/0015_add_capmint_app_role.sql'),
      'utf8'
    );
    await testPool.query(roleMigration);
    await testPool.query(
      `INSERT INTO migrations_log (filename)
       VALUES ('0015_add_capmint_app_role.sql')`
    );
    const identityRlsMigration = await fs.readFile(
      path.join(ROOT, 'database/migrations/0016_enable_identity_table_rls.sql'),
      'utf8'
    );
    await testPool.query(identityRlsMigration);
    await testPool.query(
      `INSERT INTO migrations_log (filename)
       VALUES ('0016_enable_identity_table_rls.sql')`
    );
    const provenanceRlsMigration = await fs.readFile(
      path.join(ROOT, 'database/migrations/0017_enable_provenance_chain_rls.sql'),
      'utf8'
    );
    await testPool.query(provenanceRlsMigration);
    await testPool.query(
      `INSERT INTO migrations_log (filename)
       VALUES ('0017_enable_provenance_chain_rls.sql')`
    );
    const supportingRlsMigration = await fs.readFile(
      path.join(ROOT, 'database/migrations/0018_enable_supporting_table_rls.sql'),
      'utf8'
    );
    await testPool.query(supportingRlsMigration);
    await testPool.query(
      `INSERT INTO migrations_log (filename)
       VALUES ('0018_enable_supporting_table_rls.sql')`
    );
    const finalRlsMigration = await fs.readFile(
      path.join(ROOT, 'database/migrations/0019_enable_users_and_ledger_rls.sql'),
      'utf8'
    );
    await testPool.query(finalRlsMigration);
    await testPool.query(
      `INSERT INTO migrations_log (filename)
       VALUES ('0019_enable_users_and_ledger_rls.sql')`
    );
    const roleState = await adminPool.query(
      `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'capmint_app'`
    );
    if (roleState.rows[0]?.rolcanlogin) {
      throw new Error('capmint_app already has LOGIN; refusing to replace an operator-managed credential.');
    }
    const appPassword = crypto.randomBytes(36).toString('base64url');
    await adminPool.query(`ALTER ROLE capmint_app LOGIN PASSWORD '${appPassword}'`);
    appRoleProvisioned = true;
    const appUrl = new URL(testDatabaseUrl);
    appUrl.username = 'capmint_app';
    appUrl.password = appPassword;
    appDatabaseUrl = appUrl.toString();

    jwtSecret = crypto.randomBytes(48).toString('base64url');
    const keyPair = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    certifierPrivateKey = keyPair.privateKey;
    certifierPublicKey = keyPair.publicKey;

    await startService('transparency', 'backend/transparency-service/src/index.ts');
    await startService('cpq', 'backend/cpq-service/src/index.ts');
    await startService('mint', 'backend/mint-service/src/index.ts');
    await startService('verification', 'backend/verification-service/src/index.ts');
    await startService('resolver', 'backend/resolver-service/src/index.ts');
    await startService('integration', 'backend/integration-service/src/index.ts');
    await insertFixtures();

    tokens.producerA = signToken(ids.producerOrgA, 'PRODUCER');
    tokens.producerB = signToken(ids.producerOrgB, 'PRODUCER');
    tokens.certifierA = signToken(ids.certifierOrgA, 'CERTIFICATION_BODY');
    tokens.certifierB = signToken(ids.certifierOrgB, 'CERTIFICATION_BODY');
    tokens.labA = signToken(ids.labA, 'NABL_LABORATORY');
    tokens.labB = signToken(ids.labB, 'NABL_LABORATORY');
    tokens.exporter = signToken(ids.exporter, 'EXPORTER');
    tokens.systemAdmin = signToken(ids.systemAdmin, 'SYSTEM_ADMINISTRATOR');
    tokens.systemAdminMember = signToken(ids.systemAdmin, 'SYSTEM_ADMINISTRATOR', 'MEMBER');
    tokens.invalidRole = signToken(ids.producerOrgA, 'PRODUCER', 'VIEWER');
  }, 60_000);

  afterAll(async () => {
    for (const child of services) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    if (testPool) await testPool.end();
    if (appRoleProvisioned && adminPool) {
      await adminPool.query('ALTER ROLE capmint_app NOLOGIN PASSWORD NULL');
    }
    if (databaseCreated && adminPool) {
      await adminPool.query(`DROP DATABASE ${quoteIdentifier(TEST_DATABASE_NAME)} WITH (FORCE)`);
    }
    if (adminPool) await adminPool.end();
  }, 30_000);

  it('rejects unauthenticated and unsupported operational actors', async () => {
    expect((await requestJson(BASE.verification, '/api/v1/verify/lots')).status).toBe(401);
    const unassignedLabLots = await requestJson(
      BASE.verification,
      '/api/v1/verify/lots',
      { token: tokens.labA }
    );
    expect(unassignedLabLots.status).toBe(200);
    expect(JSON.stringify(unassignedLabLots.data)).not.toContain(ids.lotA);
    expect(JSON.stringify(unassignedLabLots.data)).not.toContain(ids.lotB);
    expect((await requestJson(BASE.verification, '/api/v1/verify/lots', { token: tokens.invalidRole })).status).toBe(403);
    expect((await requestJson(BASE.verification, '/api/v1/verify/lots', { token: tokens.systemAdminMember })).status).toBe(403);

    const systemLots = await requestJson(BASE.verification, '/api/v1/verify/lots', { token: tokens.systemAdmin });
    expect(systemLots.status).toBe(200);
    expect(JSON.stringify(systemLots.data)).toContain(ids.lotA);
    expect(JSON.stringify(systemLots.data)).toContain(ids.lotB);
  });

  it('enforces identity-table isolation on raw capmint_app queries', async () => {
    const appPool = new pg.Pool({ connectionString: appDatabaseUrl, max: 1 });
    try {
      await withTenantTx(
        appPool,
        {
          access: 'authenticated',
          orgId: ids.producerOrgA,
          isSystemAdmin: false
        },
        async client => {
          expect((await client.query(
            'SELECT id FROM organizations WHERE id = $1',
            [ids.producerOrgB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'UPDATE organizations SET name = name WHERE id = $1 RETURNING id',
            [ids.producerOrgB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'DELETE FROM organizations WHERE id = $1 RETURNING id',
            [ids.producerOrgB]
          )).rowCount).toBe(0);

          expect((await client.query(
            'SELECT id FROM producers WHERE id = $1',
            [ids.producerB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'UPDATE producers SET name = name WHERE id = $1 RETURNING id',
            [ids.producerB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'DELETE FROM producers WHERE id = $1 RETURNING id',
            [ids.producerB]
          )).rowCount).toBe(0);

          expect((await client.query(
            'SELECT id FROM certifiers WHERE id = $1',
            [ids.revokedCertifierB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'SELECT public_key FROM certifiers WHERE id = $1',
            [ids.certifierB]
          )).rowCount).toBe(1);
          expect((await client.query(
            'UPDATE certifiers SET name = name WHERE id = $1 RETURNING id',
            [ids.certifierB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'DELETE FROM certifiers WHERE id = $1 RETURNING id',
            [ids.certifierB]
          )).rowCount).toBe(0);
        }
      );

      await withTenantTx(
        appPool,
        {
          access: 'authenticated',
          orgId: ids.certifierOrgA,
          isSystemAdmin: false
        },
        async client => {
          expect((await client.query(
            `SELECT id FROM organizations
             WHERE id = $1
               AND type = 'NABL_LABORATORY'
               AND status = 'ACTIVATED'`,
            [ids.labA]
          )).rowCount).toBe(1);
        }
      );

      const producerContext = {
        access: 'authenticated' as const,
        orgId: ids.producerOrgA,
        isSystemAdmin: false
      };
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO organizations
             (id, name, type, official_email, status)
           VALUES ($1, 'Cross-tenant insert', 'PRODUCER', $2, 'ACTIVATED')`,
          [crypto.randomUUID(), `cross-${crypto.randomUUID()}@c0.test`]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO investigations
             (product_name, public_identifier, risk_level, status,
              detection_reason, manufacturer, current_product_status,
              evidence, unit_code_id)
           VALUES ('Denied', $1, 'HIGH', 'OPEN', 'Denied',
                   'Producer B', 'ACTIVE', '{}', $1)
           ON CONFLICT (public_identifier) DO UPDATE SET status = 'OPEN'`,
          [ids.codeB]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO producers
             (id, name, type, registry_references, organization_id)
           VALUES ($1, 'Cross-tenant producer', 'FARMER', '{}', $2)`,
          [crypto.randomUUID(), ids.producerOrgB]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO producer_brandings (producer_id, brand_story)
           VALUES ($1, 'Denied')
           ON CONFLICT (producer_id) DO UPDATE
           SET brand_story = EXCLUDED.brand_story`,
          [ids.producerB]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO certifiers
             (id, name, accreditation_details, public_key, key_status, organization_id)
           VALUES ($1, 'Cross-tenant certifier', '{}', $2, 'ACTIVE', $3)`,
          [crypto.randomUUID(), certifierPublicKey, ids.certifierOrgB]
        )
      )).rejects.toMatchObject({ code: '42501' });

      const adminRows = await withTenantTx(
        appPool,
        { access: 'authenticated', orgId: null, isSystemAdmin: true },
        async client => client.query(
          `SELECT
             (SELECT count(*)::int FROM organizations) AS organizations,
             (SELECT count(*)::int FROM producers) AS producers,
             (SELECT count(*)::int FROM certifiers) AS certifiers`
        )
      );
      expect(adminRows.rows[0]).toMatchObject({
        organizations: 7,
        producers: 2,
        certifiers: 3
      });
    } finally {
      await appPool.end();
    }
  });

  it('enforces provenance-chain isolation and preserves transitive actor access', async () => {
    const appPool = new pg.Pool({ connectionString: appDatabaseUrl, max: 1 });
    const producerContext = {
      access: 'authenticated' as const,
      orgId: ids.producerOrgA,
      isSystemAdmin: false
    };
    try {
      await withTenantTx(appPool, producerContext, async client => {
        expect((await client.query(
          'SELECT id FROM budgets WHERE id = $1',
          [ids.budgetB]
        )).rowCount).toBe(0);
        expect((await client.query(
          'UPDATE budgets SET status = status WHERE id = $1 RETURNING id',
          [ids.budgetB]
        )).rowCount).toBe(0);
        expect((await client.query(
          'DELETE FROM budgets WHERE id = $1 RETURNING id',
          [ids.budgetB]
        )).rowCount).toBe(0);

        expect((await client.query(
          'SELECT id FROM lots WHERE id = $1',
          [ids.lotB]
        )).rowCount).toBe(0);
        expect((await client.query(
          'UPDATE lots SET lab_status = lab_status WHERE id = $1 RETURNING id',
          [ids.lotB]
        )).rowCount).toBe(0);
        expect((await client.query(
          'DELETE FROM lots WHERE id = $1 RETURNING id',
          [ids.lotB]
        )).rowCount).toBe(0);

        expect((await client.query(
          'SELECT id FROM unit_codes WHERE id = $1',
          [ids.codeB]
        )).rowCount).toBe(0);
        expect((await client.query(
          'UPDATE unit_codes SET clone_flag = clone_flag WHERE id = $1 RETURNING id',
          [ids.codeB]
        )).rowCount).toBe(0);
        expect((await client.query(
          'DELETE FROM unit_codes WHERE id = $1 RETURNING id',
          [ids.codeB]
        )).rowCount).toBe(0);

        const ownRows = await client.query(
          `SELECT
             (SELECT count(*)::int
              FROM budgets
              WHERE id = ANY($1::uuid[])) AS budgets,
             (SELECT count(*)::int
              FROM lots
              WHERE id = ANY($2::uuid[])) AS lots,
             (SELECT count(*)::int
              FROM unit_codes
              WHERE id = ANY($3::uuid[])) AS unit_codes`,
          [
            [ids.budgetA, ids.budgetActivateA, ids.budgetB],
            [ids.lotA, ids.lotRevokeA, ids.lotB],
            [ids.codeA, ids.codeRevokeA, ids.codeB]
          ]
        );
        expect(ownRows.rows[0]).toEqual({
          budgets: 2,
          lots: 2,
          unit_codes: 2
        });
      });

      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO budgets
             (id, producer_id, certifier_id, source_unit_type,
              approved_quantity, yield_assumptions, signature_bundle,
              effective_start_date, effective_end_date, status)
           VALUES
             ($1, $2, $3, 'UNIT_COUNT', 1, '{}', 'denied',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day', 'DRAFT')`,
          [crypto.randomUUID(), ids.producerB, ids.certifierB]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO lots
             (id, producer_id, budget_id, product_metadata, batch_size,
              processing_dates, lab_status)
           VALUES ($1, $2, $3, '{}', 1, '{}', 'PENDING')`,
          [crypto.randomUUID(), ids.producerB, ids.budgetB]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO unit_codes
             (id, lot_id, serial, gtin, digital_link_uri, public_identifier,
              verification_url, current_state)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'MINTED')`,
          [
            crypto.randomUUID(),
            ids.lotB,
            `D${crypto.randomBytes(6).toString('hex')}`,
            values.gtinB,
            `https://id.c0/denied/${crypto.randomUUID()}`,
            crypto.randomUUID(),
            `https://verify.c0/denied/${crypto.randomUUID()}`
          ]
        )
      )).rejects.toMatchObject({ code: '42501' });

      await withTenantTx(
        appPool,
        {
          access: 'authenticated',
          orgId: ids.certifierOrgA,
          isSystemAdmin: false
        },
        async client => {
          expect((await client.query(
            'SELECT id FROM budgets WHERE id = $1',
            [ids.budgetA]
          )).rowCount).toBe(1);
          expect((await client.query(
            'SELECT id FROM lots WHERE id = $1',
            [ids.lotA]
          )).rowCount).toBe(1);
          expect((await client.query(
            'SELECT id FROM unit_codes WHERE id = $1',
            [ids.codeA]
          )).rowCount).toBe(1);
          expect((await client.query(
            'SELECT id FROM budgets WHERE id = $1',
            [ids.budgetB]
          )).rowCount).toBe(0);
        }
      );

      await withTenantTx(
        appPool,
        PUBLIC_TENANT_CONTEXT,
        async client => {
          expect((await client.query(
            `SELECT unit_code.id
             FROM unit_codes AS unit_code
             JOIN lots AS lot ON lot.id = unit_code.lot_id
             JOIN budgets AS budget ON budget.id = lot.budget_id
             WHERE unit_code.public_identifier = $1`,
            [ids.codeA]
          )).rowCount).toBe(1);
          expect((await client.query(
            `UPDATE unit_codes
             SET clone_flag = true
             WHERE id = $1
             RETURNING clone_flag`,
            [ids.codeA]
          )).rows[0].clone_flag).toBe(true);
          expect((await client.query(
            `UPDATE unit_codes
             SET clone_flag = false
             WHERE id = $1
             RETURNING clone_flag`,
            [ids.codeA]
          )).rows[0].clone_flag).toBe(false);
          expect((await client.query(
            'UPDATE lots SET lab_status = lab_status WHERE id = $1 RETURNING id',
            [ids.lotA]
          )).rowCount).toBe(0);
          expect((await client.query(
            'UPDATE budgets SET status = status WHERE id = $1 RETURNING id',
            [ids.budgetA]
          )).rowCount).toBe(0);
        }
      );

      const adminRows = await withTenantTx(
        appPool,
        { access: 'authenticated', orgId: null, isSystemAdmin: true },
        async client => client.query(
          `SELECT
             (SELECT count(*)::int FROM budgets) AS budgets,
             (SELECT count(*)::int FROM lots) AS lots,
             (SELECT count(*)::int FROM unit_codes) AS unit_codes`
        )
      );
      expect(adminRows.rows[0]).toEqual({
        budgets: 7,
        lots: 7,
        unit_codes: 5
      });
    } finally {
      await appPool.end();
    }
  });

  it('enforces supporting-table isolation while preserving bounded public and actor flows', async () => {
    const plotA = crypto.randomUUID();
    const plotB = crypto.randomUUID();
    const scanA = crypto.randomUUID();
    const scanB = crypto.randomUUID();
    const publicInvestigation = crypto.randomUUID();
    await testPool.query(
      `INSERT INTO lab_results
         (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
       VALUES ($1, 'Producer B Lab', 'Purity', 'PASS', $2, 'b.pdf')
       ON CONFLICT (lot_id) DO NOTHING`,
      [ids.lotB, crypto.createHash('sha256').update('d3b-lab-b').digest('hex')]
    );
    await testPool.query(
      `INSERT INTO plots_or_hive_clusters
         (id, producer_id, geo_boundary, crop_type, season_year)
       VALUES
         ($1, $2, '{}', 'HONEY', '2026'),
         ($3, $4, '{}', 'HONEY', '2026')`,
      [plotA, ids.producerA, plotB, ids.producerB]
    );
    await testPool.query(
      `INSERT INTO producer_brandings (producer_id, brand_story)
       VALUES ($1, 'Producer A public story'), ($2, 'Producer B public story')
       ON CONFLICT (producer_id) DO UPDATE
       SET brand_story = EXCLUDED.brand_story`,
      [ids.producerA, ids.producerB]
    );
    await testPool.query(
      `INSERT INTO scan_events (id, unit_code_id, device_metadata, verdict)
       VALUES
         ($1, $2, '{}', 'VERIFIED'),
         ($3, $4, '{}', 'VERIFIED')`,
      [scanA, ids.codeA, scanB, ids.codeB]
    );

    const appPool = new pg.Pool({ connectionString: appDatabaseUrl, max: 1 });
    const producerContext = {
      access: 'authenticated' as const,
      orgId: ids.producerOrgA,
      isSystemAdmin: false
    };
    try {
      await withTenantTx(appPool, producerContext, async client => {
        for (const [table, column, value] of [
          ['lab_results', 'lot_id', ids.lotB],
          ['investigations', 'id', ids.investigationB],
          ['scan_events', 'id', scanB],
          ['plots_or_hive_clusters', 'id', plotB],
          ['producer_brandings', 'producer_id', ids.producerB]
        ]) {
          expect((await client.query(
            `SELECT 1 FROM ${table} WHERE ${column} = $1`,
            [value]
          )).rowCount).toBe(0);
          expect((await client.query(
            `UPDATE ${table} SET ${column} = ${column}
             WHERE ${column} = $1 RETURNING ${column}`,
            [value]
          )).rowCount).toBe(0);
          expect((await client.query(
            `DELETE FROM ${table} WHERE ${column} = $1 RETURNING ${column}`,
            [value]
          )).rowCount).toBe(0);
        }

        expect((await client.query(
          'SELECT 1 FROM lab_results WHERE lot_id = $1',
          [ids.lotA]
        )).rowCount).toBe(1);
        expect((await client.query(
          'SELECT 1 FROM plots_or_hive_clusters WHERE id = $1',
          [plotA]
        )).rowCount).toBe(1);
        expect((await client.query(
          'SELECT 1 FROM producer_brandings WHERE producer_id = $1',
          [ids.producerA]
        )).rowCount).toBe(1);
      });

      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO lab_results
             (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
           VALUES ($1, 'Denied', 'Purity', 'PASS', $2, 'denied.pdf')
           ON CONFLICT (lot_id) DO UPDATE SET lab_name = EXCLUDED.lab_name`,
          [ids.lotB, crypto.createHash('sha256').update('denied').digest('hex')]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO scan_events (unit_code_id, device_metadata, verdict)
           VALUES ($1, '{}', 'VERIFIED')`,
          [ids.codeB]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        producerContext,
        client => client.query(
          `INSERT INTO plots_or_hive_clusters
             (producer_id, geo_boundary, crop_type, season_year)
           VALUES ($1, '{}', 'HONEY', '2026')`,
          [ids.producerB]
        )
      )).rejects.toMatchObject({ code: '42501' });

      await withTenantTx(appPool, PUBLIC_TENANT_CONTEXT, async client => {
        expect((await client.query(
          'SELECT 1 FROM lab_results WHERE lot_id = $1',
          [ids.lotA]
        )).rowCount).toBe(1);
        expect((await client.query(
          'SELECT brand_story FROM producer_brandings WHERE producer_id = $1',
          [ids.producerA]
        )).rows[0].brand_story).toBe('Producer A public story');
        expect((await client.query(
          'SELECT 1 FROM scan_events WHERE id = $1',
          [scanA]
        )).rowCount).toBe(1);

        await client.query(
          `INSERT INTO scan_events (unit_code_id, device_metadata, verdict)
           VALUES ($1, '{"source":"d3b-public"}', 'VERIFIED')`,
          [ids.codeA]
        );
        const insertInvestigation = () => client.query(
          `INSERT INTO investigations
             (id, product_name, public_identifier, risk_level, status,
              detection_reason, manufacturer, current_product_status,
              evidence, unit_code_id)
           VALUES
             ($1, 'D3b public', $2, 'HIGH', 'OPEN', 'D3b public scan',
              'Producer B', 'ACTIVE', '{}', $2)
           ON CONFLICT (public_identifier) DO UPDATE
           SET status = 'OPEN',
               unit_code_id = EXCLUDED.unit_code_id`,
          [publicInvestigation, ids.codeAutomation]
        );
        await insertInvestigation();
        await insertInvestigation();
      });

      const nonexistentCode = crypto.randomUUID();
      await expect(withTenantTx(
        appPool,
        PUBLIC_TENANT_CONTEXT,
        client => client.query(
          `INSERT INTO scan_events (unit_code_id, device_metadata, verdict)
           VALUES ($1, '{}', 'VERIFIED')`,
          [nonexistentCode]
        )
      )).rejects.toMatchObject({ code: '42501' });
      await expect(withTenantTx(
        appPool,
        PUBLIC_TENANT_CONTEXT,
        client => client.query(
          `INSERT INTO investigations
             (product_name, public_identifier, risk_level, status,
              detection_reason, manufacturer, current_product_status,
              evidence, unit_code_id)
           VALUES ('Rejected', $1, 'HIGH', 'OPEN', 'Rejected',
                   'Unknown', 'ACTIVE', '{}', $1)`,
          [nonexistentCode]
        )
      )).rejects.toMatchObject({ code: '42501' });

      await withTenantTx(
        appPool,
        {
          access: 'authenticated',
          orgId: ids.certifierOrgA,
          isSystemAdmin: false
        },
        async client => {
          expect((await client.query(
            'SELECT 1 FROM investigations WHERE id = $1',
            [ids.investigationA]
          )).rowCount).toBe(1);
          expect((await client.query(
            'SELECT 1 FROM investigations WHERE id = $1',
            [ids.investigationB]
          )).rowCount).toBe(0);
          expect((await client.query(
            'SELECT 1 FROM scan_events WHERE id = $1',
            [scanA]
          )).rowCount).toBe(1);
        }
      );

      const adminRows = await withTenantTx(
        appPool,
        { access: 'authenticated', orgId: null, isSystemAdmin: true },
        client => client.query(
          `SELECT
             (SELECT count(*)::int FROM lab_results) AS lab_results,
             (SELECT count(*)::int FROM investigations) AS investigations,
             (SELECT count(*)::int FROM scan_events) AS scan_events,
             (SELECT count(*)::int FROM plots_or_hive_clusters) AS plots,
             (SELECT count(*)::int FROM producer_brandings) AS brandings`
        )
      );
      expect(adminRows.rows[0]).toMatchObject({
        lab_results: 2,
        investigations: 3,
        plots: 2,
        brandings: 2
      });
      expect(adminRows.rows[0].scan_events).toBeGreaterThanOrEqual(3);
    } finally {
      await appPool.end();
      await testPool.query('DELETE FROM investigations WHERE id = $1', [publicInvestigation]);
      await testPool.query(
        `DELETE FROM scan_events
         WHERE id IN ($1, $2)
            OR device_metadata @> '{"source":"d3b-public"}'::jsonb`,
        [scanA, scanB]
      );
      await testPool.query(
        'DELETE FROM plots_or_hive_clusters WHERE id IN ($1, $2)',
        [plotA, plotB]
      );
      await testPool.query(
        'DELETE FROM producer_brandings WHERE producer_id IN ($1, $2)',
        [ids.producerA, ids.producerB]
      );
      await testPool.query('DELETE FROM lab_results WHERE lot_id = $1', [ids.lotB]);
    }
  });

  it('enforces user isolation and append-only ledger immutability', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    await testPool.query(
      `INSERT INTO users (id, organization_id, username, password_hash, role, status)
       VALUES ($1, $2, $3, 'd3c-a', 'MEMBER', 'ACTIVE'),
              ($4, $5, $6, 'd3c-b', 'MEMBER', 'ACTIVE')`,
      [userA, ids.producerOrgA, `d3c_a_${userA}`, userB, ids.producerOrgB, `d3c_b_${userB}`]
    );
    await testPool.query(
      `INSERT INTO log_entries (id, entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
       VALUES ($1, 'TEST', $1, 'D3C_TEST', repeat('a',64), repeat('0',64), repeat('b',64))`,
      [ledgerId]
    );
    const appPool = new pg.Pool({ connectionString: appDatabaseUrl, max: 1 });
    const context = { access: 'authenticated' as const, orgId: ids.producerOrgA, isSystemAdmin: false };
    try {
      await withTenantTx(appPool, context, async client => {
        expect((await client.query('SELECT id FROM users WHERE id = $1', [userB])).rowCount).toBe(0);
        expect((await client.query('UPDATE users SET status = status WHERE id = $1 RETURNING id', [userB])).rowCount).toBe(0);
        expect((await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userB])).rowCount).toBe(0);
        expect((await client.query('UPDATE log_entries SET event_type = event_type WHERE id = $1 RETURNING id', [ledgerId])).rowCount).toBe(0);
        expect((await client.query('DELETE FROM log_entries WHERE id = $1 RETURNING id', [ledgerId])).rowCount).toBe(0);
      });
      await expect(withTenantTx(appPool, context, client => client.query(
        `INSERT INTO users (organization_id, username, password_hash, role, status)
         VALUES ($1, $2, 'denied', 'MEMBER', 'ACTIVE')`, [ids.producerOrgB, `d3c_denied_${crypto.randomUUID()}`]
      ))).rejects.toMatchObject({ code: '42501' });
      await withTenantTx(appPool, PUBLIC_TENANT_CONTEXT, async client => {
        expect((await client.query('SELECT id FROM users WHERE id = $1', [userA])).rowCount).toBe(1);
        expect((await client.query('SELECT id FROM log_entries WHERE id = $1', [ledgerId])).rowCount).toBe(1);
      });
      const ownerUpdate = await testPool.query('UPDATE log_entries SET event_type = event_type WHERE id = $1 RETURNING id', [ledgerId]);
      expect(ownerUpdate.rowCount).toBe(1);
    } finally {
      await appPool.end();
      await testPool.query('DELETE FROM log_entries WHERE id = $1', [ledgerId]);
      await testPool.query('DELETE FROM users WHERE id IN ($1, $2)', [userA, userB]);
    }
  });

  it('enforces explicit integration lookup role allowlists', async () => {
    expect((await requestJson(
      BASE.integration,
      '/api/v1/integrations/agristack/farmers/FARMER-901'
    )).status).toBe(401);

    for (const token of [tokens.producerA, tokens.certifierA, tokens.systemAdmin]) {
      expect((await requestJson(
        BASE.integration,
        '/api/v1/integrations/agristack/farmers/FARMER-901',
        { token }
      )).status).toBe(200);
      expect((await requestJson(
        BASE.integration,
        '/api/v1/integrations/tracenet/certificates/NPOP-IN-90812',
        { token }
      )).status).toBe(200);
    }

    for (const token of [tokens.labA, tokens.labB, tokens.exporter, tokens.systemAdminMember]) {
      expect((await requestJson(
        BASE.integration,
        '/api/v1/integrations/agristack/farmers/FARMER-901',
        { token }
      )).status).toBe(403);
      expect((await requestJson(
        BASE.integration,
        '/api/v1/integrations/tracenet/certificates/NPOP-IN-90812',
        { token }
      )).status).toBe(403);
    }
  });

  it('prevents producer B from mutating producer A resources', async () => {
    const before = await mutationSnapshot();
    const attempts = [
      requestJson(BASE.mint, '/api/v1/mint', {
        method: 'POST', token: tokens.producerB,
        body: { lot_id: ids.lotA, gtin: values.gtinA, quantity: 1 }
      }),
      requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/drawdown`, {
        method: 'POST', token: tokens.producerB, body: { amount: 1 }
      }),
      requestJson(BASE.verification, '/api/v1/verify/register', {
        method: 'POST', token: tokens.producerB,
        body: {
          lot_id: ids.lotA,
          public_identifier: crypto.randomUUID(),
          gtin: values.gtinA,
          serial: `X${crypto.randomBytes(6).toString('hex')}`,
          verification_url: 'https://verify.c0/denied'
        }
      }),
      requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/submit`, {
        method: 'POST', token: tokens.producerB, body: {}
      }),
      requestJson(BASE.verification, '/api/v1/lots', {
        method: 'POST', token: tokens.producerB,
        body: { budget_id: ids.budgetA, batch_size: 1, product_metadata: {} }
      }),
      requestJson(BASE.cpq, '/api/v1/budgets', {
        method: 'POST',
        token: tokens.producerB,
        body: {
          producer_id: ids.producerA,
          certifier_id: ids.certifierB,
          source_unit_type: 'UNIT_COUNT',
          approved_quantity: 5,
          yield_assumptions: { crop: `forged-${crypto.randomUUID()}` },
          signature_bundle: 'pending',
          effective_start_date: new Date().toISOString(),
          effective_end_date: new Date(Date.now() + 86_400_000).toISOString()
        }
      })
    ];
    const results = await Promise.all(attempts);
    expect(results.map(result => result.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(await mutationSnapshot()).toEqual(before);
  });

  it('prevents certifier B from mutating certifier A resources', async () => {
    const before = await mutationSnapshot();
    const attempts = [
      requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetActivateA}/activate`, {
        method: 'POST', token: tokens.certifierB, body: {}
      }),
      requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/review`, {
        method: 'POST', token: tokens.certifierB, body: {}
      }),
      requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/reject`, {
        method: 'POST', token: tokens.certifierB, body: { rejection_reason: 'denied' }
      }),
      requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/revision`, {
        method: 'POST', token: tokens.certifierB, body: { notes: 'denied' }
      }),
      requestJson(BASE.verification, `/api/v1/lots/${ids.lotA}/certify`, {
        method: 'POST', token: tokens.certifierB, body: {}
      }),
      requestJson(BASE.verification, `/api/v1/lots/${ids.lotA}/revoke`, {
        method: 'POST', token: tokens.certifierB, body: {}
      }),
      requestJson(BASE.verification, '/api/v1/verify/revoke', {
        method: 'POST', token: tokens.certifierB, body: { batch_id: values.batchA }
      })
    ];
    const results = await Promise.all(attempts);
    expect(results.map(result => result.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
    expect(await mutationSnapshot()).toEqual(before);
  });

  it('scopes investigations and prevents unrelated mutation', async () => {
    const list = await requestJson(BASE.verification, '/api/v1/verify/investigations', { token: tokens.certifierB });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.data)).not.toContain(ids.investigationA);

    const before = await mutationSnapshot();
    const suffixes = [
      { suffix: '', method: 'GET', body: undefined },
      { suffix: '/assign', method: 'POST', body: { assigned_to: ids.assigneeA } },
      { suffix: '/notes', method: 'POST', body: { note_text: 'denied' } },
      { suffix: '/escalate', method: 'POST', body: { risk_level: 'CRITICAL' } },
      { suffix: '/close', method: 'POST', body: { closure_status: 'CLOSED' } },
      { suffix: '/approve', method: 'POST', body: {} },
      { suffix: '/dismiss', method: 'POST', body: {} }
    ];
    for (const attempt of suffixes) {
      const result = await requestJson(
        BASE.verification,
        `/api/v1/verify/investigations/${ids.investigationA}${attempt.suffix}`,
        { method: attempt.method, token: tokens.certifierB, body: attempt.body }
      );
      expect(result.status).toBe(404);
    }
    expect(await mutationSnapshot()).toEqual(before);
  });

  it('scopes operational lists and exports', async () => {
    const lots = await requestJson(BASE.verification, '/api/v1/verify/lots', { token: tokens.producerB });
    const codes = await requestJson(BASE.verification, '/api/v1/verify/unit-codes', { token: tokens.producerB });
    const budgets = await requestJson(BASE.cpq, '/api/v1/budgets', { token: tokens.certifierB });
    expect(lots.status).toBe(200);
    expect(codes.status).toBe(200);
    expect(budgets.status).toBe(200);
    expect(JSON.stringify(lots.data)).not.toContain(ids.lotA);
    expect(JSON.stringify(codes.data)).not.toContain(ids.codeA);
    expect(JSON.stringify(budgets.data)).not.toContain(ids.budgetA);

    expect((await requestJson(BASE.verification, `/api/v1/lots/${ids.lotA}/export/csv`, { token: tokens.producerB })).status).toBe(404);
    expect((await requestJson(BASE.verification, `/api/v1/lots/${ids.lotA}/export/pdf`, { token: tokens.certifierB })).status).toBe(404);
  });

  it('prevents an unrelated certifier from assigning a laboratory', async () => {
    const before = await mutationSnapshot();
    const denied = await requestJson(
      BASE.verification,
      `/api/v1/lots/${ids.lotA}/assign-laboratory`,
      {
        method: 'POST',
        token: tokens.certifierB,
        body: { laboratory_organization_id: ids.labA }
      }
    );
    expect(denied.status).toBe(404);
    expect(await mutationSnapshot()).toEqual(before);
  });

  it('allows the controlling certifier to assign an activated laboratory idempotently', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const assigned = await requestJson(
        BASE.verification,
        `/api/v1/lots/${ids.lotA}/assign-laboratory`,
        {
          method: 'POST',
          token: tokens.certifierA,
          body: { laboratory_organization_id: ids.labA }
        }
      );
      expect(assigned.status, JSON.stringify(assigned.data)).toBe(200);
      expect(assigned.data).toEqual({
        success: true,
        data: {
          lot: {
            id: ids.lotA,
            assigned_laboratory_organization_id: ids.labA
          }
        }
      });
    }

    const assignment = await testPool.query(
      'SELECT assigned_laboratory_organization_id FROM lots WHERE id = $1',
      [ids.lotA]
    );
    expect(assignment.rows[0].assigned_laboratory_organization_id).toBe(ids.labA);

    const labAList = await requestJson(
      BASE.verification,
      '/api/v1/verify/lots',
      { token: tokens.labA }
    );
    const labBList = await requestJson(
      BASE.verification,
      '/api/v1/verify/lots',
      { token: tokens.labB }
    );
    expect(labAList.status).toBe(200);
    expect(JSON.stringify(labAList.data)).toContain(ids.lotA);
    expect(JSON.stringify(labAList.data)).not.toContain(ids.lotB);
    expect(labBList.status).toBe(200);
    expect(JSON.stringify(labBList.data)).not.toContain(ids.lotA);
  });

  it('keeps legacy null-submitter evidence readable without fabricating identity', async () => {
    const legacy = await testPool.query(
      'SELECT submitted_by_organization_id FROM lab_results WHERE lot_id = $1',
      [ids.lotA]
    );
    expect(legacy.rows[0].submitted_by_organization_id).toBeNull();

    const publicVerification = await requestJson(
      BASE.verification,
      `/api/v1/verify/${values.gtinA}/${values.serialA}`,
      { method: 'POST', body: { device_metadata: { c3b: 'legacy-read' } } }
    );
    expect(publicVerification.status).toBe(200);
    expect((publicVerification.data as any).data.labResult.status).toBe('PASS');
    expect(JSON.stringify(publicVerification.data)).not.toContain(ids.labA);
    expect(JSON.stringify(publicVerification.data)).not.toContain(ids.labB);
  });

  it('denies an unassigned laboratory FAILED report without state or ledger changes', async () => {
    const before = await mutationSnapshot();
    const failedPdf = Buffer.from('%PDF-1.4 denied failed report');
    const denied = await requestJson(BASE.verification, '/api/v1/verify/lab-results', {
      method: 'POST',
      token: tokens.labB,
      body: {
        lot_id: ids.lotA,
        lab_name: 'Unassigned Laboratory',
        test_type: 'Purity',
        result_summary: 'FAILED',
        report_hash: crypto.createHash('sha256').update(failedPdf).digest('hex'),
        report_reference: 'denied.pdf',
        pdf_content: failedPdf.toString('base64')
      }
    });
    expect(denied.status).toBe(403);
    expect(denied.data).toEqual({
      success: false,
      error: {
        statusCode: 403,
        code: 'LAB_ASSIGNMENT_REQUIRED',
        message: 'This lot has no trusted laboratory assignment.'
      }
    });
    expect(await mutationSnapshot()).toEqual(before);
  });

  it('allows the assigned laboratory to submit and replace results with actor provenance', async () => {
    const assignment = await requestJson(
      BASE.verification,
      `/api/v1/lots/${ids.lotRevokeA}/assign-laboratory`,
      {
        method: 'POST',
        token: tokens.certifierA,
        body: { laboratory_organization_id: ids.labA }
      }
    );
    expect(assignment.status, JSON.stringify(assignment.data)).toBe(200);

    const firstPdf = Buffer.from('%PDF-1.4 assigned laboratory report one');
    const firstHash = crypto.createHash('sha256').update(firstPdf).digest('hex');
    const inserted = await requestJson(BASE.verification, '/api/v1/verify/lab-results', {
      method: 'POST',
      token: tokens.labA,
      body: {
        lot_id: ids.lotRevokeA,
        lab_name: 'Assigned Laboratory A',
        test_type: 'Purity',
        result_summary: 'PASSED',
        report_hash: firstHash,
        report_reference: 'assigned-one.pdf',
        pdf_content: firstPdf.toString('base64')
      }
    });
    expect(inserted.status).toBe(200);
    expect(JSON.stringify(inserted.data)).not.toContain(ids.labA);

    const secondPdf = Buffer.from('%PDF-1.4 assigned laboratory report two');
    const secondHash = crypto.createHash('sha256').update(secondPdf).digest('hex');
    const replaced = await requestJson(BASE.verification, '/api/v1/verify/lab-results', {
      method: 'POST',
      token: tokens.labA,
      body: {
        lot_id: ids.lotRevokeA,
        lab_name: 'Assigned Laboratory A',
        test_type: 'Purity and residue',
        result_summary: 'PASSED',
        report_hash: secondHash,
        report_reference: 'assigned-two.pdf',
        pdf_content: secondPdf.toString('base64')
      }
    });
    expect(replaced.status).toBe(200);

    const stored = await testPool.query(
      `SELECT result_summary, report_hash, submitted_by_organization_id
       FROM lab_results
       WHERE lot_id = $1`,
      [ids.lotRevokeA]
    );
    expect(stored.rows[0]).toEqual({
      result_summary: 'PASS',
      report_hash: secondHash,
      submitted_by_organization_id: ids.labA
    });
    const replacementEvents = await testPool.query(
      `SELECT count(*)::int AS count
       FROM log_entries
       WHERE entity_id = $1
         AND event_type = 'LOT_LAB_TEST_REPLACED'`,
      [ids.lotRevokeA]
    );
    expect(replacementEvents.rows[0].count).toBe(1);
  });

  it('rejects lot capacity reservation when budget authority is unverifiable', async () => {
    await testPool.query(
      "UPDATE budgets SET signature_bundle = 'sig_default' WHERE id = $1",
      [ids.budgetA]
    );
    const before = await mutationSnapshot();
    const result = await requestJson(BASE.verification, '/api/v1/lots', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        budget_id: ids.budgetA,
        batch_size: 1,
        product_metadata: { name: 'Rejected unsigned lot' }
      }
    });
    expect(result.status).toBe(400);
    expect(result.data).toEqual({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Budget supply authority could not be cryptographically verified.'
      }
    });
    expect(await mutationSnapshot()).toEqual(before);

    const restoredSignature = crypto.sign(
      null,
      Buffer.from(`budget_id:${ids.budgetA};approved_quantity:100.00`),
      certifierPrivateKey
    ).toString('hex');
    await testPool.query(
      'UPDATE budgets SET signature_bundle = $1 WHERE id = $2',
      [restoredSignature, ids.budgetA]
    );
  });

  it('preserves valid same-tenant and intentional public workflows', async () => {
    expect((await requestJson(BASE.cpq, '/api/v1/budgets', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        certifier_id: ids.certifierA,
        source_unit_type: 'UNIT_COUNT',
        approved_quantity: 5,
        yield_assumptions: { crop: `same-tenant-${crypto.randomUUID()}` },
        signature_bundle: 'pending',
        effective_start_date: new Date().toISOString(),
        effective_end_date: new Date(Date.now() + 86_400_000).toISOString()
      }
    })).status).toBe(201);
    expect((await requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetActivateA}/activate`, {
      method: 'POST', token: tokens.certifierA, body: {}
    })).status).toBe(200);
    expect((await requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/drawdown`, {
      method: 'POST', token: tokens.producerA, body: { amount: 1 }
    })).status).toBe(200);
    expect((await requestJson(BASE.mint, '/api/v1/mint', {
      method: 'POST', token: tokens.producerA,
      body: { lot_id: ids.lotA, gtin: values.gtinA, quantity: 1 }
    })).status).toBe(201);
    expect((await requestJson(BASE.verification, '/api/v1/verify/register', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        lot_id: ids.lotA,
        public_identifier: crypto.randomUUID(),
        gtin: values.gtinA,
        serial: `S${crypto.randomBytes(6).toString('hex')}`,
        verification_url: `https://verify.c0/v/${crypto.randomUUID()}`
      }
    })).status).toBe(200);
    expect((await requestJson(BASE.verification, `/api/v1/lots/${ids.lotA}/export/csv`, {
      token: tokens.producerA
    })).status).toBe(200);
    expect((await requestJson(BASE.verification, `/api/v1/lots/${ids.lotA}/certify`, {
      method: 'POST', token: tokens.certifierA, body: {}
    })).status).toBe(200);
    expect((await requestJson(BASE.verification, `/api/v1/lots/${ids.lotRevokeA}/revoke`, {
      method: 'POST', token: tokens.certifierA, body: {}
    })).status).toBe(200);
    expect((await requestJson(BASE.verification, `/api/v1/verify/investigations/${ids.investigationA}/notes`, {
      method: 'POST', token: tokens.certifierA, body: { note_text: 'same-tenant' }
    })).status).toBe(200);
    expect((await requestJson(BASE.cpq, `/api/v1/budgets/${ids.budgetA}/submit`, {
      method: 'POST', token: tokens.producerA, body: {}
    })).status).toBe(200);

    expect((await requestJson(BASE.verification, `/api/v1/verify/${values.gtinA}/${values.serialA}`, {
      method: 'POST', body: { device_metadata: { test: true } }
    })).status).toBe(200);
    expect((await requestJson(BASE.verification, `/api/v1/verify/v/${ids.codeA}`, {
      method: 'POST', body: { device_metadata: { test: true } }
    })).status).toBe(200);
    expect((await requestJson(BASE.resolver, `/01/${values.gtinA}/21/${values.serialA}`, {
      accept: 'application/json'
    })).status).toBe(200);
    expect((await requestJson(BASE.transparency, '/api/v1/log/entries')).status).toBe(200);
    expect((await requestJson(BASE.transparency, '/api/v1/log/verify')).status).toBe(200);
  });

  it('persists unit_code_id when public verification automation creates an investigation', async () => {
    expect((await requestJson(
      BASE.verification,
      `/api/v1/verify/v/${ids.codeAutomation}`,
      { method: 'POST', body: { lat: 0, lon: 0, device_metadata: { c3b: 1 } } }
    )).status).toBe(200);
    expect((await requestJson(
      BASE.verification,
      `/api/v1/verify/v/${ids.codeAutomation}`,
      { method: 'POST', body: { lat: 20, lon: 20, device_metadata: { c3b: 2 } } }
    )).status).toBe(200);

    const investigation = await testPool.query(
      `SELECT unit_code_id
       FROM investigations
       WHERE public_identifier = $1`,
      [ids.codeAutomation]
    );
    expect(investigation.rowCount).toBe(1);
    expect(investigation.rows[0].unit_code_id).toBe(ids.codeAutomation);
  });

  it('rejects /verify/register issuance beyond the locked lot ceiling', async () => {
    const result = await requestJson(BASE.verification, '/api/v1/verify/register', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        lot_id: ids.overfilledLot,
        public_identifier: crypto.randomUUID(),
        gtin: values.gtinA,
        serial: `O${crypto.randomBytes(6).toString('hex')}`,
        verification_url: `https://verify.c0/v/${crypto.randomUUID()}`
      }
    });

    expect(result.status).toBe(422);
    expect(result.data).toMatchObject({
      success: false,
      error: { statusCode: 422, code: 'EXCEEDS_LOT_CAPACITY' }
    });
    const issued = await testPool.query(
      'SELECT COUNT(*)::int AS count FROM unit_codes WHERE lot_id = $1',
      [ids.overfilledLot]
    );
    expect(issued.rows[0].count).toBe(1);
  });

  it('rejects /mint issuance beyond the locked lot ceiling', async () => {
    const result = await requestJson(BASE.mint, '/api/v1/mint', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        lot_id: ids.overfilledLot,
        gtin: values.gtinA,
        quantity: 1
      }
    });

    expect(result.status).toBe(422);
    expect(result.data).toMatchObject({
      success: false,
      error: { statusCode: 422, code: 'EXCEEDS_LOT_CAPACITY' }
    });
    const issued = await testPool.query(
      'SELECT COUNT(*)::int AS count FROM unit_codes WHERE lot_id = $1',
      [ids.overfilledLot]
    );
    expect(issued.rows[0].count).toBe(1);
  });

  it('rejects /verify/register issuance backed by an unsigned budget', async () => {
    const result = await requestJson(BASE.verification, '/api/v1/verify/register', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        lot_id: ids.unsignedLot,
        public_identifier: crypto.randomUUID(),
        gtin: values.gtinA,
        serial: `U${crypto.randomBytes(6).toString('hex')}`,
        verification_url: `https://verify.c0/v/${crypto.randomUUID()}`
      }
    });

    expect(result.status).toBe(400);
    expect(result.data).toEqual({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Budget supply authority could not be cryptographically verified.'
      }
    });
    const issued = await testPool.query(
      'SELECT COUNT(*)::int AS count FROM unit_codes WHERE lot_id = $1',
      [ids.unsignedLot]
    );
    expect(issued.rows[0].count).toBe(0);
  });

  it('rejects explicit-lot /verify/register issuance when the budget is revoked', async () => {
    const before = await testPool.query(
      'SELECT COUNT(*)::int AS count FROM unit_codes WHERE lot_id = $1',
      [ids.revokedBudgetLot]
    );
    const result = await requestJson(BASE.verification, '/api/v1/verify/register', {
      method: 'POST',
      token: tokens.producerA,
      body: {
        lot_id: ids.revokedBudgetLot,
        public_identifier: crypto.randomUUID(),
        gtin: values.gtinA,
        serial: `R${crypto.randomBytes(6).toString('hex')}`,
        verification_url: `https://verify.c0/v/${crypto.randomUUID()}`
      }
    });

    expect(result.status).toBe(400);
    expect(result.data).toEqual({
      success: false,
      error: {
        statusCode: 400,
        code: 'INACTIVE_BUDGET',
        message: 'Linked budget status is: REVOKED. Cannot issue codes.'
      }
    });
    const after = await testPool.query(
      'SELECT COUNT(*)::int AS count FROM unit_codes WHERE lot_id = $1',
      [ids.revokedBudgetLot]
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    expect(after.rows[0].count).toBe(0);
  });

  it('serializes parallel /verify/register requests without over-issuance', async () => {
    const requests = Array.from({ length: 2 }, () => requestJson(
      BASE.verification,
      '/api/v1/verify/register',
      {
        method: 'POST',
        token: tokens.producerA,
        body: {
          lot_id: ids.capacityLot,
          public_identifier: crypto.randomUUID(),
          gtin: values.gtinA,
          serial: `C${crypto.randomBytes(6).toString('hex')}`,
          verification_url: `https://verify.c0/v/${crypto.randomUUID()}`
        }
      }
    ));
    const results = await Promise.all(requests);

    expect(results.map(result => result.status).sort()).toEqual([200, 422]);
    expect(results.find(result => result.status === 422)?.data).toMatchObject({
      success: false,
      error: { statusCode: 422, code: 'EXCEEDS_LOT_CAPACITY' }
    });
    const issued = await testPool.query(
      'SELECT COUNT(*)::int AS count FROM unit_codes WHERE lot_id = $1',
      [ids.capacityLot]
    );
    expect(issued.rows[0].count).toBe(1);
  });
});
