import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

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
  labA: crypto.randomUUID(),
  labB: crypto.randomUUID(),
  exporter: crypto.randomUUID(),
  systemAdmin: crypto.randomUUID(),
  assigneeA: crypto.randomUUID(),
  budgetA: crypto.randomUUID(),
  budgetB: crypto.randomUUID(),
  budgetActivateA: crypto.randomUUID(),
  lotA: crypto.randomUUID(),
  lotB: crypto.randomUUID(),
  lotRevokeA: crypto.randomUUID(),
  codeA: crypto.randomUUID(),
  codeB: crypto.randomUUID(),
  codeRevokeA: crypto.randomUUID(),
  codeAutomation: crypto.randomUUID(),
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
      DATABASE_URL: testDatabaseUrl,
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
       VALUES ($1, 'C0 Certifier A', '{}', $5, 'ACTIVE', $2),
              ($3, 'C0 Certifier B', '{}', $5, 'ACTIVE', $4)`,
      [ids.certifierA, ids.certifierOrgA, ids.certifierB, ids.certifierOrgB, certifierPublicKey]
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
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'PENDING_APPROVAL', '[]')`,
      [
        ids.budgetA, ids.producerA, ids.certifierA, activeSignatureA,
        ids.budgetB, ids.producerB, ids.certifierB, activeSignatureB,
        ids.budgetActivateA
      ]
    );

    await client.query(
      `INSERT INTO lots
         (id, producer_id, budget_id, product_metadata, batch_size, processing_dates,
          lab_status, revocation_status, certification_status)
       VALUES
         ($1, $2, $3, $4, 20, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($5, $6, $7, '{"name":"C0 Product B"}', 20, '{}', 'PASSED', 'ACTIVE', 'PENDING'),
         ($8, $2, $3, '{"name":"C0 Revoke A"}', 20, '{}', 'PASSED', 'ACTIVE', 'PENDING')`,
      [
        ids.lotA, ids.producerA, ids.budgetA, JSON.stringify({ name: 'C0 Product A', batch_id: values.batchA }),
        ids.lotB, ids.producerB, ids.budgetB,
        ids.lotRevokeA
      ]
    );
    await client.query(
      `INSERT INTO unit_codes
         (id, lot_id, serial, gtin, digital_link_uri, public_identifier,
          verification_url, current_state)
       VALUES
         ($1, $2, $3, $4, $5, $1, $6, 'MINTED'),
         ($7, $8, $9, $10, $11, $7, $12, 'MINTED'),
         ($13, $14, $15, $4, $16, $13, $17, 'MINTED')`,
      [
        ids.codeA, ids.lotA, values.serialA, values.gtinA,
        `https://id.c0/01/${values.gtinA}/21/${values.serialA}`,
        `https://verify.c0/v/${ids.codeA}`,
        ids.codeB, ids.lotB, values.serialB, values.gtinB,
        `https://id.c0/01/${values.gtinB}/21/${values.serialB}`,
        `https://verify.c0/v/${ids.codeB}`,
        ids.codeRevokeA, ids.lotRevokeA, values.serialRevokeA,
        `https://id.c0/01/${values.gtinA}/21/${values.serialRevokeA}`,
        `https://verify.c0/v/${ids.codeRevokeA}`
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
    const schema = await fs.readFile(path.join(ROOT, 'database/schema/schema.sql'), 'utf8');
    await testPool.query(schema);

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
      expect(assigned.status).toBe(200);
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
    expect(assignment.status).toBe(200);

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
        producer_id: ids.producerA,
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
});
