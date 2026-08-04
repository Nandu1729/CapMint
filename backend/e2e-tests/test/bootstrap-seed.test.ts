import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  PUBLIC_TENANT_CONTEXT,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs') as {
  compareSync(value: string, hash: string): boolean;
};

const RUN_INTEGRATION = process.env.RUN_F2_INTEGRATION === '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RUN_ID = process.env.F2_TEST_RUN_ID || 'local';
const PREFIX = `capmint_f2_test_${RUN_ID}`;
const migrationRunner = path.join(ROOT, 'playground/run_migrations.js');
const bootstrapAdminScript = path.join(ROOT, 'scripts/bootstrap-admin.js');
const developmentSeedScript = path.join(ROOT, 'database/seed/development.js');
const legacySeedPath = path.join(
  ROOT,
  'database/migrations/0006_seed_initial_system_admin_and_certifiers.sql'
);
const tsxPath = path.join(ROOT, 'node_modules/.bin/tsx');

dotenv.config({ path: path.join(ROOT, '.env') });

let adminPool: pg.Pool;
let sourceUrl: URL;
const createdDatabases = new Set<string>();
const children = new Set<ChildProcessWithoutNullStreams>();

function quoteIdentifier(value: string): string {
  if (!/^capmint_f2_test_[a-z0-9_]+$/.test(value)) {
    throw new Error(`Refusing unsafe disposable database name: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseName(scenario: string): string {
  return `${PREFIX}_${scenario}`;
}

function databaseUrl(name: string): string {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabase(name: string): Promise<void> {
  quoteIdentifier(name);
  const existing = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (existing.rowCount !== 0) {
    throw new Error(`Disposable database ${name} already exists; refusing to overwrite it.`);
  }
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0`);
  createdDatabases.add(name);
  await withPool(name, async pool => {
    const identity = await pool.query('SELECT current_database() AS name');
    expect(identity.rows[0].name).toBe(name);
  });
}

async function dropDatabase(name: string): Promise<void> {
  if (!createdDatabases.has(name)) return;
  await adminPool.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
  createdDatabases.delete(name);
}

async function withPool<T>(name: string, action: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: databaseUrl(name) });
  // Idle clients emit 'error' when teardown drops the database WITH (FORCE); an
  // unhandled 'error' event is fatal in Node and fails otherwise-green runs.
  pool.on('error', poolError => process.stderr.write(`[e2e] idle client error: ${(poolError as Error).message}\n`));
  try {
    return await action(pool);
  } finally {
    await pool.end();
  }
}

function runNode(script: string, environment: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    timeout: 60_000
  });
}

function runMigration(name: string, args: string[]) {
  return spawnSync(process.execPath, [migrationRunner, ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl(name) },
    encoding: 'utf8',
    timeout: 60_000
  });
}

async function bootstrapDatabase(name: string): Promise<void> {
  await createDatabase(name);
  const result = runMigration(name, ['--bootstrap', '--json']);
  expect(result.status, result.stderr).toBe(0);
}

async function provisionAppRole(name: string): Promise<string> {
  const roleState = await adminPool.query(
    `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'capmint_app'`
  );
  if (roleState.rows[0]?.rolcanlogin) {
    throw new Error('capmint_app already has LOGIN; refusing to replace an operator-managed credential.');
  }
  const password = crypto.randomBytes(36).toString('base64url');
  await adminPool.query(`ALTER ROLE capmint_app LOGIN PASSWORD '${password}'`);
  const url = new URL(databaseUrl(name));
  url.username = 'capmint_app';
  url.password = password;
  return url.toString();
}

async function deprovisionAppRole(): Promise<void> {
  await adminPool.query('ALTER ROLE capmint_app NOLOGIN PASSWORD NULL');
}

function generateKeyPair() {
  return crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
}

function strongPassword(): string {
  return `Q7!${crypto.randomBytes(18).toString('base64url')}`;
}

function adminEnvironment(name: string, password = strongPassword()) {
  return {
    DATABASE_URL: databaseUrl(name),
    CAPMINT_BOOTSTRAP_ADMIN_USERNAME: 'initial-admin',
    CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME: 'CapMint Initial Administration',
    CAPMINT_BOOTSTRAP_ADMIN_EMAIL: 'initial-operator@capmint.example',
    CAPMINT_BOOTSTRAP_ADMIN_PASSWORD: password
  };
}

function developmentEnvironment(
  name: string,
  keyPair = generateKeyPair(),
  password = strongPassword()
) {
  return {
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: 'integration',
    CAPMINT_ALLOW_DEVELOPMENT_SEED: '1',
    CAPMINT_DEVELOPMENT_SEED_PASSWORD: password,
    CAPMINT_DEVELOPMENT_CERTIFIER_PRIVATE_KEY: keyPair.privateKey,
    CAPMINT_DEVELOPMENT_CERTIFIER_PUBLIC_KEY: keyPair.publicKey
  };
}

async function rowCounts(name: string) {
  return withPool(name, async pool => (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM organizations) AS organizations,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM certifiers) AS certifiers,
      (SELECT count(*)::int FROM producers) AS producers,
      (SELECT count(*)::int FROM budgets) AS budgets,
      (SELECT count(*)::int FROM log_entries) AS log_entries
  `)).rows[0]);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a loopback port.'));
        return;
      }
      const { port } = address;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function startService(
  sourcePath: string,
  port: number,
  environment: Record<string, string>
): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(tsxPath, [sourcePath], {
    cwd: ROOT,
    env: { ...process.env, ...environment, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Service exited before becoming healthy: ${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return child;
    } catch {
      // Service is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Service did not become healthy: ${output}`);
}

async function stopService(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise<void>(resolve => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  children.delete(child);
}

const suite = RUN_INTEGRATION ? describe : describe.skip;

suite('F2 secure bootstrap and development seed', () => {
  beforeAll(async () => {
    if (!/^[a-z0-9_]+$/.test(RUN_ID)) {
      throw new Error('F2_TEST_RUN_ID must contain lowercase letters, digits, or underscores.');
    }
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
      throw new Error('DATABASE_URL and REDIS_URL are required without exposing their values.');
    }
    sourceUrl = new URL(process.env.DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(sourceUrl.hostname)) {
      throw new Error('F2 integration tests require a local disposable PostgreSQL server.');
    }
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
    // Idle clients emit 'error' when teardown drops the database WITH (FORCE); an
    // unhandled 'error' event is fatal in Node and fails otherwise-green runs.
    adminPool.on('error', poolError => process.stderr.write(`[e2e] idle client error: ${(poolError as Error).message}\n`));
  });

  afterAll(async () => {
    for (const child of [...children]) await stopService(child);
    for (const name of [...createdDatabases]) await dropDatabase(name);
    if (adminPool) await adminPool.end();
  }, 60_000);

  it('creates one audited first admin and refuses an exact rerun without mutation', async () => {
    const name = databaseName('admin_once');
    await bootstrapDatabase(name);
    try {
      const password = strongPassword();
      const environment = adminEnvironment(name, password);
      const first = runNode(bootstrapAdminScript, environment);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({
        success: true,
        code: 'ADMIN_BOOTSTRAPPED'
      });

      const before = await rowCounts(name);
      const second = runNode(bootstrapAdminScript, environment);
      expect(second.status).toBe(1);
      expect(JSON.parse(second.stderr)).toMatchObject({
        success: false,
        code: 'ADMIN_ALREADY_EXISTS'
      });
      expect(await rowCounts(name)).toEqual(before);

      await withPool(name, async pool => {
        const user = (await pool.query(
          `SELECT u.password_hash, u.role, u.status, o.type, o.status AS organization_status
           FROM users u JOIN organizations o ON o.id = u.organization_id`
        )).rows[0];
        expect(user).toMatchObject({
          role: 'ADMIN',
          status: 'ACTIVE',
          type: 'SYSTEM_ADMINISTRATOR',
          organization_status: 'ACTIVATED'
        });
        expect(user.password_hash).not.toContain(password);
        expect(bcrypt.compareSync(password, user.password_hash)).toBe(true);

        const logs = (await pool.query(
          `SELECT entity_type, entity_id, event_type, payload_hash,
                  previous_hash, current_hash
           FROM log_entries ORDER BY created_at, id`
        )).rows;
        expect(logs.map(row => row.event_type)).toEqual([
          'GENESIS_BLOCK_ANCHOR',
          'SYSTEM_ADMIN_BOOTSTRAPPED'
        ]);
        const audit = logs[1];
        expect(audit.previous_hash).toBe(logs[0].current_hash);
        expect(audit.current_hash).toBe(crypto.createHash('sha256').update(
          audit.entity_type
          + audit.entity_id
          + audit.event_type
          + audit.payload_hash
          + audit.previous_hash
        ).digest('hex'));
      });
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('rejects missing and weak bootstrap secrets before any database write', async () => {
    const name = databaseName('weak_secret');
    await bootstrapDatabase(name);
    try {
      const missing = adminEnvironment(name);
      delete (missing as Partial<typeof missing>).CAPMINT_BOOTSTRAP_ADMIN_PASSWORD;
      const missingResult = runNode(bootstrapAdminScript, missing as Record<string, string>);
      expect(missingResult.status).toBe(1);
      expect(JSON.parse(missingResult.stderr).code).toBe('INVALID_CONFIGURATION');

      const weakResult = runNode(bootstrapAdminScript, adminEnvironment(name, 'Password123!'));
      expect(weakResult.status).toBe(1);
      expect(JSON.parse(weakResult.stderr).code).toBe('WEAK_PASSWORD');
      expect(await rowCounts(name)).toMatchObject({
        organizations: 0,
        users: 0,
        log_entries: 0
      });
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('refuses legacy-0006, existing-admin, and partial-admin states without mutation', async () => {
    for (const scenario of ['legacy', 'existing', 'partial', 'mixed']) {
      const name = databaseName(`admin_${scenario}`);
      await bootstrapDatabase(name);
      try {
        if (scenario === 'legacy') {
          const sql = await fs.readFile(legacySeedPath, 'utf8');
          await withPool(name, async pool => {
            await pool.query(
              `DROP POLICY IF EXISTS lab_results_tenant_select ON lab_results;
               DROP POLICY IF EXISTS lab_results_tenant_insert ON lab_results;
               DROP POLICY IF EXISTS lab_results_tenant_update ON lab_results;
               DROP POLICY IF EXISTS investigations_tenant_select ON investigations;
               DROP POLICY IF EXISTS investigations_tenant_insert ON investigations;
               DROP POLICY IF EXISTS investigations_tenant_update ON investigations;
               DROP POLICY IF EXISTS scan_events_tenant_select ON scan_events;
               DROP POLICY IF EXISTS scan_events_tenant_insert ON scan_events;
               DROP POLICY IF EXISTS plots_or_hive_clusters_tenant_select ON plots_or_hive_clusters;
               DROP POLICY IF EXISTS plots_or_hive_clusters_tenant_insert ON plots_or_hive_clusters;
               DROP POLICY IF EXISTS plots_or_hive_clusters_tenant_update ON plots_or_hive_clusters;
               DROP POLICY IF EXISTS producer_brandings_tenant_select ON producer_brandings;
               DROP POLICY IF EXISTS producer_brandings_tenant_insert ON producer_brandings;
               DROP POLICY IF EXISTS producer_brandings_tenant_update ON producer_brandings;
               DROP FUNCTION IF EXISTS capmint_rls_unit_code_actor(uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_unit_certifier(uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_registered_unit_code(uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_producer_has_public_code(uuid);
               DROP FUNCTION IF EXISTS capmint_rls_lab_result_writer(uuid, uuid, uuid);
               DROP POLICY IF EXISTS budgets_tenant_select ON budgets;
               DROP POLICY IF EXISTS budgets_tenant_insert ON budgets;
               DROP POLICY IF EXISTS budgets_tenant_update ON budgets;
               DROP POLICY IF EXISTS lots_tenant_select ON lots;
               DROP POLICY IF EXISTS lots_tenant_insert ON lots;
               DROP POLICY IF EXISTS lots_tenant_update ON lots;
               DROP POLICY IF EXISTS unit_codes_tenant_select ON unit_codes;
               DROP POLICY IF EXISTS unit_codes_tenant_insert ON unit_codes;
               DROP POLICY IF EXISTS unit_codes_tenant_update ON unit_codes;
               DROP FUNCTION IF EXISTS capmint_rls_unit_actor(uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_lot_producer(uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_lot_actor(uuid, uuid, uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_has_public_code(uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_budget_actor(uuid, uuid, uuid);
               DROP FUNCTION IF EXISTS capmint_rls_producer_owns(uuid, uuid);
               DROP POLICY IF EXISTS producers_tenant_select ON producers;
               DROP POLICY IF EXISTS certifiers_tenant_select ON certifiers;
               DROP POLICY IF EXISTS certifiers_tenant_insert ON certifiers;
               DROP POLICY IF EXISTS certifiers_tenant_update ON certifiers;
               DROP POLICY IF EXISTS certifiers_tenant_delete ON certifiers;
               ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
               ALTER TABLE producers DISABLE ROW LEVEL SECURITY;
               ALTER TABLE certifiers DISABLE ROW LEVEL SECURITY;
               ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;
               ALTER TABLE lots DISABLE ROW LEVEL SECURITY;
               ALTER TABLE unit_codes DISABLE ROW LEVEL SECURITY`
            );
            await pool.query(
              'ALTER TABLE certifiers DROP COLUMN organization_id'
            );
            await pool.query(sql);
          });
        } else if (scenario === 'mixed') {
          await withPool(name, async pool => {
            await pool.query(
              `INSERT INTO organizations
                 (id, name, type, official_email, status)
               VALUES ('00000000-0000-0000-0000-000000000001',
                       'Conflicting Legacy Certifier',
                       'CERTIFICATION_BODY',
                       'legacy-conflict@f2.example',
                       'ACTIVATED')`
            );
            await pool.query(
              `INSERT INTO users
                 (id, organization_id, username, password_hash, role, status)
               VALUES ('00000000-0000-0000-0000-000000000002',
                       '00000000-0000-0000-0000-000000000001',
                       'sysadmin',
                       'not-a-login-fixture',
                       'ADMIN',
                       'ACTIVE')`
            );
          });
        } else {
          await withPool(name, async pool => {
            await pool.query(
              `INSERT INTO organizations
                 (name, type, official_email, status)
               VALUES ($1, 'SYSTEM_ADMINISTRATOR', $2, 'ACTIVATED')`,
              [`${scenario} administration`, `${scenario}@f2.example`]
            );
            if (scenario === 'existing') {
              await pool.query(
                `INSERT INTO users
                   (organization_id, username, password_hash, role, status)
                 SELECT id, 'existing-admin', 'not-a-login-fixture', 'ADMIN', 'ACTIVE'
                 FROM organizations WHERE official_email = $1`,
                [`${scenario}@f2.example`]
              );
            }
          });
        }

        const before = await rowCounts(name);
        const result = runNode(bootstrapAdminScript, adminEnvironment(name));
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stderr).code).toBe(
          scenario === 'legacy'
            ? 'MIGRATION_STATE_UNSAFE'
            : (['partial', 'mixed'].includes(scenario)
              ? 'AMBIGUOUS_BOOTSTRAP_STATE'
              : 'ADMIN_ALREADY_EXISTS')
        );
        expect(await rowCounts(name)).toEqual(before);
      } finally {
        await dropDatabase(name);
      }
    }
  }, 120_000);

  it('gates development fixtures, validates keys, signs the budget, and is idempotent', async () => {
    const name = databaseName('development');
    await bootstrapDatabase(name);
    let appRoleProvisioned = false;
    try {
      const keyPair = generateKeyPair();
      const password = strongPassword();
      const environment = developmentEnvironment(name, keyPair, password);
      for (const nodeEnvironment of ['', 'production', 'staging']) {
        const result = runNode(developmentSeedScript, {
          ...environment,
          NODE_ENV: nodeEnvironment
        });
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stderr).code).toBe('DEVELOPMENT_SEED_FORBIDDEN');
      }
      const flagMissing = { ...environment };
      delete (flagMissing as Partial<typeof flagMissing>).CAPMINT_ALLOW_DEVELOPMENT_SEED;
      const flagResult = runNode(developmentSeedScript, flagMissing as Record<string, string>);
      expect(flagResult.status).toBe(1);
      expect(JSON.parse(flagResult.stderr).code).toBe('DEVELOPMENT_SEED_FORBIDDEN');
      expect(await rowCounts(name)).toMatchObject({ organizations: 0, users: 0, budgets: 0 });

      const first = runNode(developmentSeedScript, environment);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout).code).toBe('DEVELOPMENT_FIXTURES_SEEDED');
      const before = await rowCounts(name);
      const second = runNode(developmentSeedScript, environment);
      expect(second.status, second.stderr).toBe(0);
      expect(JSON.parse(second.stdout).code).toBe('DEVELOPMENT_FIXTURES_ALREADY_PRESENT');
      expect(await rowCounts(name)).toEqual(before);

      await withPool(name, async pool => {
        const budget = (await pool.query(
          'SELECT id, approved_quantity, signature_bundle FROM budgets'
        )).rows[0];
        expect(crypto.verify(
          null,
          Buffer.from(`budget_id:${budget.id};approved_quantity:${budget.approved_quantity}`),
          keyPair.publicKey,
          Buffer.from(budget.signature_bundle, 'hex')
        )).toBe(true);
        const auditCount = Number((await pool.query(
          `SELECT count(*)::int AS count FROM log_entries
           WHERE event_type = 'DEVELOPMENT_FIXTURES_SEEDED'`
        )).rows[0].count);
        expect(auditCount).toBe(1);
        const profileOwnership = (await pool.query(`
          SELECT 'certifier' AS profile_type, id, organization_id
          FROM certifiers
          UNION ALL
          SELECT 'producer' AS profile_type, id, organization_id
          FROM producers
          ORDER BY profile_type
        `)).rows;
        expect(profileOwnership).toEqual([
          {
            profile_type: 'certifier',
            id: '00000000-0000-0000-0000-000000000001',
            organization_id: '00000000-0000-0000-0000-000000000001'
          },
          {
            profile_type: 'producer',
            id: '00000000-0000-0000-0000-000000000002',
            organization_id: '00000000-0000-0000-0000-000000000002'
          }
        ]);
        const laboratoryFixtures = (await pool.query(`
          SELECT
            (SELECT count(*)::int
             FROM organizations
             WHERE type = 'NABL_LABORATORY'
               AND status = 'ACTIVATED') AS laboratories,
            (SELECT assigned_laboratory_organization_id
             FROM lots
             WHERE id = '00000000-0000-0000-0000-000000000050') AS assigned_laboratory
        `)).rows[0];
        expect(laboratoryFixtures).toEqual({
          laboratories: 2,
          assigned_laboratory: '00000000-0000-0000-0000-000000000004'
        });
      });

      const appDatabaseUrl = await provisionAppRole(name);
      appRoleProvisioned = true;
      const appPool = new pg.Pool({
        connectionString: appDatabaseUrl,
        max: 1
      });
      // Idle clients emit 'error' when teardown drops the database WITH (FORCE); an
      // unhandled 'error' event is fatal in Node and fails otherwise-green runs.
      appPool.on('error', poolError => process.stderr.write(`[e2e] idle client error: ${(poolError as Error).message}\n`));
      try {
        await withTenantTx(
          appPool,
          PUBLIC_TENANT_CONTEXT,
          async client => {
            expect((await client.query(
              'SELECT count(*)::int AS count FROM organizations'
            )).rows[0].count).toBe(3);
          }
        );
        await withTenantTx(
          appPool,
          {
            access: 'authenticated',
            orgId: '00000000-0000-0000-0000-000000000002',
            isSystemAdmin: false
          },
          async client => {
            expect((await client.query(
              'SELECT count(*)::int AS count FROM organizations'
            )).rows[0].count).toBe(4);
          }
        );
        await withTenantTx(
          appPool,
          {
            access: 'authenticated',
            orgId: crypto.randomUUID(),
            isSystemAdmin: false
          },
          async client => {
            expect((await client.query(
              'SELECT count(*)::int AS count FROM organizations'
            )).rows[0].count).toBe(3);
          }
        );
      } finally {
        await appPool.end();
      }
    } finally {
      if (appRoleProvisioned) await deprovisionAppRole();
      await dropDatabase(name);
    }
  }, 120_000);

  it('accepts seed sentinel UUIDs through laboratory assignment and submission', async () => {
    const name = databaseName('sentinel_uuid_flow');
    await bootstrapDatabase(name);
    const authPort = await freePort();
    const verificationPort = await freePort();
    let auth: ChildProcessWithoutNullStreams | undefined;
    let verification: ChildProcessWithoutNullStreams | undefined;
    let appRoleProvisioned = false;
    try {
      const keyPair = generateKeyPair();
      const password = strongPassword();
      const seed = runNode(
        developmentSeedScript,
        developmentEnvironment(name, keyPair, password)
      );
      expect(seed.status, seed.stderr).toBe(0);

      const appDatabaseUrl = await provisionAppRole(name);
      appRoleProvisioned = true;
      const commonEnvironment = {
        NODE_ENV: 'integration',
        DATABASE_URL: appDatabaseUrl,
        REDIS_URL: process.env.REDIS_URL!,
        JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
        TRANSPARENCY_SERVICE_URL: 'http://127.0.0.1:9'
      };
      auth = await startService(
        'backend/auth-service/src/index.ts',
        authPort,
        commonEnvironment
      );
      verification = await startService(
        'backend/verification-service/src/index.ts',
        verificationPort,
        commonEnvironment
      );

      const login = async (username: string): Promise<string> => {
        const response = await fetch(
          `http://127.0.0.1:${authPort}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          }
        );
        expect(response.status).toBe(200);
        return (await response.json() as any).data.token;
      };
      const certifierToken = await login('certifier');
      const laboratoryToken = await login('lab');
      const isolationToken = await login('lab-isolation');
      const lotId = '00000000-0000-0000-0000-000000000050';
      const laboratoryId = '00000000-0000-0000-0000-000000000004';

      const assignment = await fetch(
        `http://127.0.0.1:${verificationPort}/api/v1/lots/${lotId}/assign-laboratory`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${certifierToken}`
          },
          body: JSON.stringify({
            laboratory_organization_id: laboratoryId
          })
        }
      );
      expect(assignment.status).toBe(200);
      expect((await assignment.json() as any).data.lot).toEqual({
        id: lotId,
        assigned_laboratory_organization_id: laboratoryId
      });

      const pdf = Buffer.from('%PDF-1.4 sentinel UUID laboratory report');
      const labResultBody = {
        lot_id: lotId,
        lab_name: 'NABL Accredited Labs India',
        test_type: 'Purity',
        result_summary: 'PASSED',
        report_hash: crypto.createHash('sha256').update(pdf).digest('hex'),
        report_reference: 'sentinel-report.pdf',
        pdf_content: pdf.toString('base64')
      };
      const accepted = await fetch(
        `http://127.0.0.1:${verificationPort}/api/v1/verify/lab-results`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${laboratoryToken}`
          },
          body: JSON.stringify(labResultBody)
        }
      );
      expect(accepted.status).toBe(200);

      const isolated = await fetch(
        `http://127.0.0.1:${verificationPort}/api/v1/verify/lab-results`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${isolationToken}`
          },
          body: JSON.stringify(labResultBody)
        }
      );
      expect(isolated.status).toBe(403);
      expect((await isolated.json() as any).error.code)
        .toBe('LAB_ASSIGNMENT_REQUIRED');

      const sentinelPublicIdentifier = await fetch(
        `http://127.0.0.1:${verificationPort}/api/v1/verify/v/${lotId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      );
      expect(sentinelPublicIdentifier.status).toBe(404);
    } finally {
      if (verification) await stopService(verification);
      if (auth) await stopService(auth);
      if (appRoleProvisioned) await deprovisionAppRole();
      await dropDatabase(name);
    }
  }, 120_000);

  it('rejects mismatched and compromised development keys before database writes', async () => {
    const name = databaseName('key_rejection');
    await bootstrapDatabase(name);
    try {
      const firstPair = generateKeyPair();
      const secondPair = generateKeyPair();
      const mismatch = runNode(developmentSeedScript, developmentEnvironment(name, {
        privateKey: firstPair.privateKey,
        publicKey: secondPair.publicKey
      }));
      expect(mismatch.status).toBe(1);
      expect(JSON.parse(mismatch.stderr).code).toBe('INVALID_DEVELOPMENT_KEYPAIR');

      const legacySource = await fs.readFile(legacySeedPath, 'utf8');
      const encodedKey = legacySource.match(/MCowBQYDK2VwAyEA[A-Za-z0-9+/=]+/)?.[0];
      expect(encodedKey).toBeTruthy();
      const compromisedPublicKey =
        `-----BEGIN PUBLIC KEY-----\n${encodedKey}\n-----END PUBLIC KEY-----`;
      const compromised = runNode(developmentSeedScript, developmentEnvironment(name, {
        privateKey: firstPair.privateKey,
        publicKey: compromisedPublicKey
      }));
      expect(compromised.status).toBe(1);
      expect(JSON.parse(compromised.stderr).code).toBe('COMPROMISED_DEVELOPMENT_KEY');
      expect(await rowCounts(name)).toMatchObject({
        organizations: 0,
        users: 0,
        certifiers: 0,
        budgets: 0,
        log_entries: 0
      });
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('fails closed on partial development fixture state', async () => {
    const name = databaseName('partial_development');
    await bootstrapDatabase(name);
    try {
      await withPool(name, pool => pool.query(
        `INSERT INTO organizations (id, name, type, status, official_email)
         VALUES ('00000000-0000-0000-0000-000000000001',
                 'Conflicting Identity',
                 'SYSTEM_ADMINISTRATOR',
                 'ACTIVATED',
                 'conflict@f2.example')`
      ).then(() => undefined));
      const before = await rowCounts(name);
      const result = runNode(developmentSeedScript, developmentEnvironment(name));
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr).code).toBe('DEVELOPMENT_SEED_STATE_MISMATCH');
      expect(await rowCounts(name)).toEqual(before);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('starts auth and CPQ without seed DML and writes profile ownership on activation', async () => {
    const name = databaseName('production_start');
    await bootstrapDatabase(name);
    const authPort = await freePort();
    const cpqPort = await freePort();
    let auth: ChildProcessWithoutNullStreams | undefined;
    let cpq: ChildProcessWithoutNullStreams | undefined;
    let appRoleProvisioned = false;
    try {
      const appDatabaseUrl = await provisionAppRole(name);
      appRoleProvisioned = true;
      const commonEnvironment = {
        NODE_ENV: 'production',
        CAPMINT_ALLOW_DEVELOPMENT_SEED: '1',
        DATABASE_URL: appDatabaseUrl,
        REDIS_URL: process.env.REDIS_URL!,
        JWT_SECRET: crypto.randomBytes(48).toString('base64url')
      };
      auth = await startService('backend/auth-service/src/index.ts', authPort, commonEnvironment);
      cpq = await startService('backend/cpq-service/src/index.ts', cpqPort, commonEnvironment);
      expect(await rowCounts(name)).toMatchObject({
        organizations: 0,
        users: 0,
        certifiers: 0,
        producers: 0,
        budgets: 0,
        log_entries: 0
      });

      const adminPassword = strongPassword();
      const bootstrap = runNode(bootstrapAdminScript, adminEnvironment(name, adminPassword));
      expect(bootstrap.status, bootstrap.stderr).toBe(0);
      const login = await fetch(`http://127.0.0.1:${authPort}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'initial-admin', password: adminPassword })
      });
      expect(login.status).toBe(200);
      const adminToken = (await login.json() as any).data.token;

      const activatedOrganizations: Record<string, string> = {};
      for (const type of ['PRODUCER', 'CERTIFICATION_BODY']) {
        const suffix = type.toLowerCase().replaceAll('_', '-');
        const registrationBody = {
          name: `F2 Activation ${type}`,
          type,
          business_reg_details: {
            tax_id: `F2-TAX-${type}`,
            registration_number: `F2-REG-${type}`
          },
          official_email: `${suffix}@f2-activation.example`,
          contact_info: {},
          admin_username: `f2-${suffix}`,
          admin_password: 'Activation9!'
        };
        const registration = await fetch(`http://127.0.0.1:${authPort}/api/v1/auth/register-org`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registrationBody)
        });
        expect(registration.status).toBe(201);
        const organizationId = (await registration.json() as any).data.organization.id;
        activatedOrganizations[type] = organizationId;

        if (type === 'PRODUCER') {
          const duplicateTaxId = await fetch(
            `http://127.0.0.1:${authPort}/api/v1/auth/register-org`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...registrationBody,
                name: 'F2 Duplicate Tax ID',
                business_reg_details: {
                  tax_id: registrationBody.business_reg_details.tax_id,
                  registration_number: 'F2-REG-DUPLICATE-TAX'
                },
                official_email: 'duplicate-tax@f2-activation.example',
                admin_username: 'f2-duplicate-tax'
              })
            }
          );
          expect(duplicateTaxId.status).toBe(409);
          expect((await duplicateTaxId.json() as any).error.code)
            .toBe('REGISTRATION_EXISTS');

          const duplicateRegistrationNumber = await fetch(
            `http://127.0.0.1:${authPort}/api/v1/auth/register-org`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...registrationBody,
                name: 'F2 Duplicate Registration',
                business_reg_details: {
                  tax_id: 'F2-TAX-DUPLICATE-REGISTRATION',
                  registration_number:
                    registrationBody.business_reg_details.registration_number
                },
                official_email:
                  'duplicate-registration@f2-activation.example',
                admin_username: 'f2-duplicate-registration'
              })
            }
          );
          expect(duplicateRegistrationNumber.status).toBe(409);
          expect((await duplicateRegistrationNumber.json() as any).error.code)
            .toBe('REGISTRATION_EXISTS');
        }

        const pendingLogin = await fetch(
          `http://127.0.0.1:${authPort}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: registrationBody.admin_username,
              password: registrationBody.admin_password
            })
          }
        );
        expect(pendingLogin.status).toBe(403);
        expect((await pendingLogin.json() as any).error.code)
          .toBe('INACTIVE_ORGANIZATION');

        const activation = await fetch(
          `http://127.0.0.1:${authPort}/api/v1/auth/organizations/${organizationId}/status`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ status: 'ACTIVATED' })
          }
        );
        expect(activation.status).toBe(200);

        const activatedLogin = await fetch(
          `http://127.0.0.1:${authPort}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: registrationBody.admin_username,
              password: registrationBody.admin_password
            })
          }
        );
        expect(activatedLogin.status).toBe(200);
      }

      await withPool(name, async pool => {
        const producer = (await pool.query(
          'SELECT id, organization_id FROM producers WHERE id = $1',
          [activatedOrganizations.PRODUCER]
        )).rows[0];
        const certifier = (await pool.query(
          'SELECT id, organization_id FROM certifiers WHERE id = $1',
          [activatedOrganizations.CERTIFICATION_BODY]
        )).rows[0];
        expect(producer).toEqual({
          id: activatedOrganizations.PRODUCER,
          organization_id: activatedOrganizations.PRODUCER
        });
        expect(certifier).toEqual({
          id: activatedOrganizations.CERTIFICATION_BODY,
          organization_id: activatedOrganizations.CERTIFICATION_BODY
        });
        const systemAdminProfiles = Number((await pool.query(`
          SELECT count(*)::int AS count
          FROM organizations organization
          LEFT JOIN producers producer ON producer.organization_id = organization.id
          LEFT JOIN certifiers certifier ON certifier.organization_id = organization.id
          WHERE organization.type = 'SYSTEM_ADMINISTRATOR'
            AND (producer.id IS NOT NULL OR certifier.id IS NOT NULL)
        `)).rows[0].count);
        expect(systemAdminProfiles).toBe(0);
      });
    } finally {
      if (cpq) await stopService(cpq);
      if (auth) await stopService(auth);
      if (appRoleProvisioned) await deprovisionAppRole();
      await dropDatabase(name);
    }
  }, 60_000);

  it('contains no known credential or compromised key in new-environment paths', async () => {
    const files = [
      'scripts/bootstrap-admin.js',
      'database/seed/development.js',
      'backend/auth-service/src/index.ts',
      'backend/cpq-service/src/index.ts',
      'backend/e2e-tests/test/compliance-suite.test.ts',
      'playground/test_runner.js'
    ];
    const sources = await Promise.all(files.map(file => fs.readFile(path.join(ROOT, file), 'utf8')));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/-----BEGIN PUBLIC KEY-----\s+[A-Za-z0-9+/=]{32,}/);
    expect(combined).not.toMatch(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/);
    expect(combined).not.toMatch(/bcrypt\.hash\(\s*['"]password['"]/);
    expect(combined).not.toContain(['BEGIN', 'PRIVATE KEY'].join(' '));
    await expect(fs.access(path.join(ROOT, 'database/seed/seed.sql'))).rejects.toThrow();
  });
});
