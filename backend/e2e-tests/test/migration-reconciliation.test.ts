import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const RUN_INTEGRATION = process.env.RUN_C1_INTEGRATION === '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RUN_ID = process.env.C1_TEST_RUN_ID || 'local';
const PREFIX = `capmint_c1_test_${RUN_ID}`;
const runnerPath = path.join(ROOT, 'playground/run_migrations.js');
const schemaPath = path.join(ROOT, 'database/schema/schema.sql');
const baselinePath = path.join(ROOT, 'database/baselines/capmint-baseline-20260725.sql');
const tighteningMigrationPath = path.join(ROOT, 'database/migrations/0013_tighten_tenant_constraints.sql');
const certifierTighteningMigrationPath = path.join(ROOT, 'database/migrations/0014_tighten_certifier_organization_id.sql');
const allLegacyFiles = [
  '0001_add_certification_status_and_updated_at.sql',
  '0002_add_investigations_table.sql',
  '0003_add_auto_update_updated_at_trigger.sql',
  '0004_widen_key_fields_and_expand_scan_verdict.sql',
  '0005_add_performance_and_fk_indexes.sql',
  '0006_seed_initial_system_admin_and_certifiers.sql',
  '0007_add_producer_brandings_table.sql',
  '0008_add_workflow_gaps_columns.sql',
  '0009_widen_investigations_status_check.sql'
];
const preBrandingFiles = allLegacyFiles.filter(filename => !filename.startsWith('0007') && !filename.startsWith('0009'));

dotenv.config({ path: path.join(ROOT, '.env') });
const require = createRequire(import.meta.url);
const migrationRunner = require('../../../playground/run_migrations.js');

let adminPool: pg.Pool;
let sourceUrl: URL;
const createdDatabases = new Set<string>();

function quoteIdentifier(value: string): string {
  if (!/^capmint_c1_test_[a-z0-9_]+$/.test(value)) {
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
}

async function dropDatabase(name: string): Promise<void> {
  if (!createdDatabases.has(name)) return;
  await adminPool.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
  createdDatabases.delete(name);
}

async function withPool<T>(name: string, action: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: databaseUrl(name) });
  try {
    return await action(pool);
  } finally {
    await pool.end();
  }
}

function runRunner(name: string, args: string[]) {
  const commandArgs = args.includes('--json') ? args : [...args, '--json'];
  const result = spawnSync(process.execPath, [runnerPath, ...commandArgs], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl(name) },
    encoding: 'utf8',
    timeout: 30_000
  });
  let parsed: any = null;
  if (result.stdout.trim()) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = null;
    }
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed
  };
}

async function applySqlFile(name: string, filename: string): Promise<void> {
  const sql = await fs.readFile(filename, 'utf8');
  await withPool(name, pool => pool.query(sql).then(() => undefined));
}

async function applyPre0014SchemaSnapshot(name: string): Promise<void> {
  await applySqlFile(name, schemaPath);
  await withPool(name, pool =>
    pool.query('ALTER TABLE certifiers ALTER COLUMN organization_id DROP NOT NULL').then(() => undefined));
}

async function preparePre0013Snapshot(name: string): Promise<void> {
  await applyPre0014SchemaSnapshot(name);
  await withPool(name, async pool => {
    await pool.query('ALTER TABLE producers ALTER COLUMN organization_id DROP NOT NULL');
    await pool.query('ALTER TABLE investigations ALTER COLUMN unit_code_id DROP NOT NULL');
    await pool.query('DROP INDEX idx_investigations_unit_code_id');
    await pool.query('CREATE INDEX idx_investigations_unit_code_id ON investigations(unit_code_id)');
  });
}

async function createLegacyLog(name: string, filenames: string[]): Promise<void> {
  await withPool(name, async pool => {
    await pool.query(`
      CREATE TABLE migrations_log (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const filename of filenames) {
      await pool.query('INSERT INTO migrations_log (filename) VALUES ($1)', [filename]);
    }
  });
}

async function schemaFingerprint(name: string): Promise<string> {
  return withPool(name, async pool => {
    const result = await pool.query(`
      SELECT jsonb_build_object(
        'columns', (
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name, x.position)
          FROM (
            SELECT c.relname AS table_name,
                   row_number() OVER (
                     PARTITION BY c.oid
                     ORDER BY a.attnum
                   ) AS position,
                   a.attname AS column_name,
                   format_type(a.atttypid, a.atttypmod) AS data_type,
                   a.attnotnull AS not_null,
                   pg_get_expr(d.adbin, d.adrelid) AS default_expr
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
            LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'
              AND c.relname <> 'migrations_log'
              AND a.attnum > 0
              AND NOT a.attisdropped
          ) x
        ),
        'constraints', (
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name, x.constraint_name)
          FROM (
            SELECT rel.relname AS table_name,
                   con.conname AS constraint_name,
                   con.contype AS constraint_type,
                   con.convalidated AS validated,
                   pg_get_constraintdef(con.oid, true) AS definition
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
            WHERE n.nspname = 'public'
              AND rel.relname <> 'migrations_log'
          ) x
        ),
        'indexes', (
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.tablename, x.indexname)
          FROM (
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename <> 'migrations_log'
          ) x
        ),
        'triggers', (
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name, x.trigger_name)
          FROM (
            SELECT rel.relname AS table_name,
                   trg.tgname AS trigger_name,
                   trg.tgenabled AS enabled,
                   pg_get_triggerdef(trg.oid, true) AS definition
            FROM pg_trigger trg
            JOIN pg_class rel ON rel.oid = trg.tgrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
            WHERE n.nspname = 'public'
              AND NOT trg.tgisinternal
              AND rel.relname <> 'migrations_log'
          ) x
        ),
        'functions', (
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.function_name)
          FROM (
            SELECT p.proname AS function_name,
                   l.lanname AS language,
                   p.prosrc AS source
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            JOIN pg_language l ON l.oid = p.prolang
            WHERE n.nspname = 'public'
              AND p.proname = 'update_updated_at_column'
          ) x
        )
      ) AS fingerprint
    `);
    return JSON.stringify(result.rows[0].fingerprint);
  });
}

const suite = RUN_INTEGRATION ? describe : describe.skip;

suite('C1 migration reconciliation', () => {
  beforeAll(async () => {
    if (!/^[a-z0-9_]+$/.test(RUN_ID)) throw new Error('C1_TEST_RUN_ID must contain only lowercase letters, digits, or underscores.');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required without exposing its value.');
    sourceUrl = new URL(process.env.DATABASE_URL);
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
  });

  afterAll(async () => {
    for (const name of [...createdDatabases]) await dropDatabase(name);
    if (adminPool) await adminPool.end();
  }, 60_000);

  it('bootstraps empty PostgreSQL, records one baseline, applies 0010 through 0014, and becomes a no-op', async () => {
    const name = databaseName('bootstrap');
    await createDatabase(name);
    try {
      await withPool(name, pool => pool.query('CREATE TABLE unrelated_bootstrap_blocker (id integer)').then(() => undefined));
      const refused = runRunner(name, ['--bootstrap']);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('public schema is not empty');
      await withPool(name, pool => pool.query('DROP TABLE unrelated_bootstrap_blocker').then(() => undefined));

      const bootstrap = runRunner(name, ['--bootstrap']);
      expect(bootstrap.status, bootstrap.stderr).toBe(0);

      const rows = await withPool(name, pool => pool.query(
        `SELECT filename, application_mode, checksum_sha256, baseline_identifier,
                baseline_cutoff, baseline_next_migration
         FROM migrations_log
         ORDER BY id`
      ).then(result => result.rows));
      expect(rows).toHaveLength(6);
      expect(rows[0]).toMatchObject({
        filename: 'capmint-baseline-20260725.sql',
        application_mode: 'BASELINE',
        baseline_identifier: 'capmint-baseline-20260725-cutoff-0009',
        baseline_cutoff: 9,
        baseline_next_migration: 10
      });
      expect(rows[0].checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(rows[1]).toMatchObject({
        filename: '0010_reconcile_pre_dm03_schema.sql',
        application_mode: 'EXECUTED'
      });
      expect(rows[2]).toMatchObject({
        filename: '0011_add_profile_organization_id.sql',
        application_mode: 'EXECUTED'
      });
      expect(rows[3]).toMatchObject({
        filename: '0012_add_derived_tenant_relationships.sql',
        application_mode: 'EXECUTED'
      });
      expect(rows[4]).toMatchObject({
        filename: '0013_tighten_tenant_constraints.sql',
        application_mode: 'EXECUTED'
      });
      expect(rows[5]).toMatchObject({
        filename: '0014_tighten_certifier_organization_id.sql',
        application_mode: 'EXECUTED'
      });
      const baselineState = await withPool(name, pool => pool.query(
        `SELECT
           EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') AS has_uuid_ossp,
           (SELECT count(*)::int FROM organizations) AS organization_count,
           (SELECT count(*)::int FROM users) AS user_count`
      ).then(result => result.rows[0]));
      expect(baselineState).toEqual({
        has_uuid_ossp: true,
        organization_count: 0,
        user_count: 0
      });

      const bootstrapNoOpApply = runRunner(name, ['--apply']);
      expect(bootstrapNoOpApply.status, bootstrapNoOpApply.stderr).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);
      const count = await withPool(name, pool => pool.query('SELECT count(*)::int AS count FROM migrations_log').then(result => result.rows[0].count));
      expect(count).toBe(6);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('detects and adopts exact 0007/0009/0011/0012/0013 effects without application-schema DDL', async () => {
    const name = databaseName('adoption');
    await createDatabase(name);
    try {
      await applyPre0014SchemaSnapshot(name);
      await createLegacyLog(name, preBrandingFiles);
      const before = await schemaFingerprint(name);

      const check = runRunner(name, ['--check']);
      const plan = runRunner(name, ['--plan']);
      expect(check.status).toBe(2);
      expect(plan.status).toBe(2);
      expect(check.parsed.report.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'ADOPT', target: '0007_add_producer_brandings_table.sql' }),
        expect.objectContaining({ action: 'ADOPT', target: '0009_widen_investigations_status_check.sql' }),
        expect.objectContaining({ action: 'ADOPT', target: '0011_add_profile_organization_id.sql' }),
        expect.objectContaining({ action: 'ADOPT', target: '0012_add_derived_tenant_relationships.sql' }),
        expect.objectContaining({ action: 'ADOPT', target: '0013_tighten_tenant_constraints.sql' })
      ]));

      const adoption = runRunner(name, [
        '--adopt',
        '0007_add_producer_brandings_table.sql',
        '0009_widen_investigations_status_check.sql',
        '0011_add_profile_organization_id.sql',
        '0012_add_derived_tenant_relationships.sql',
        '0013_tighten_tenant_constraints.sql'
      ]);
      expect(adoption.status, adoption.stderr).toBe(0);
      expect(await schemaFingerprint(name)).toBe(before);

      const adoptedRows = await withPool(name, pool => pool.query(
        `SELECT filename, application_mode, checksum_sha256, evidence_fingerprint
         FROM migrations_log
         WHERE filename IN ($1, $2, $3, $4, $5)
         ORDER BY filename`,
        [
          '0007_add_producer_brandings_table.sql',
          '0009_widen_investigations_status_check.sql',
          '0011_add_profile_organization_id.sql',
          '0012_add_derived_tenant_relationships.sql',
          '0013_tighten_tenant_constraints.sql'
        ]
      ).then(result => result.rows));
      expect(adoptedRows).toHaveLength(5);
      for (const row of adoptedRows) {
        expect(row.application_mode).toBe('ADOPTED');
        expect(row.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(row.evidence_fingerprint).toMatch(/^[a-f0-9]{64}$/);
      }

      const adoptionNoOpApply = runRunner(name, ['--apply']);
      expect(adoptionNoOpApply.status, adoptionNoOpApply.stderr).toBe(0);
      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('refuses adoption of logged old 0007 state and repairs it through 0010', async () => {
    const name = databaseName('old_0007');
    await createDatabase(name);
    try {
      await applyPre0014SchemaSnapshot(name);
      await withPool(name, pool => pool.query('DROP TRIGGER trigger_update_producer_brandings_updated_at ON producer_brandings').then(() => undefined));
      await createLegacyLog(name, allLegacyFiles);

      const check = runRunner(name, ['--check']);
      expect(check.status).toBe(2);
      expect(check.parsed.report.states['0007_add_producer_brandings_table.sql'].status).toBe('repairable');

      const columnsBeforeAdoption = await withPool(name, pool => pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'migrations_log'
         ORDER BY ordinal_position`
      ).then(result => result.rows));
      const adoption = runRunner(name, ['--adopt', '0007_add_producer_brandings_table.sql']);
      expect(adoption.status).toBe(1);
      expect(adoption.stderr).toContain('Adoption refused');
      const columnsAfterAdoption = await withPool(name, pool => pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'migrations_log'
         ORDER BY ordinal_position`
      ).then(result => result.rows));
      expect(columnsAfterAdoption).toEqual(columnsBeforeAdoption);

      expect(runRunner(name, [
        '--adopt',
        '0011_add_profile_organization_id.sql',
        '0012_add_derived_tenant_relationships.sql',
        '0013_tighten_tenant_constraints.sql'
      ]).status).toBe(0);
      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);

      const rows = await withPool(name, pool => pool.query(
        `SELECT filename, application_mode, checksum_sha256
         FROM migrations_log
         WHERE filename IN ('0007_add_producer_brandings_table.sql', '0010_reconcile_pre_dm03_schema.sql')
         ORDER BY filename`
      ).then(result => result.rows));
      expect(rows).toEqual([
        expect.objectContaining({ filename: '0007_add_producer_brandings_table.sql', application_mode: 'LEGACY', checksum_sha256: null }),
        expect.objectContaining({ filename: '0010_reconcile_pre_dm03_schema.sql', application_mode: 'EXECUTED' })
      ]);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('fails closed on a partial producer_brandings table without destructive repair', async () => {
    const name = databaseName('partial_branding');
    await createDatabase(name);
    try {
      await applyPre0014SchemaSnapshot(name);
      await withPool(name, pool => pool.query('ALTER TABLE producer_brandings DROP COLUMN cta_link').then(() => undefined));
      await createLegacyLog(name, allLegacyFiles);

      const check = runRunner(name, ['--check']);
      expect(check.status).toBe(2);
      expect(check.parsed.report.states['0007_add_producer_brandings_table.sql'].status).toBe('incompatible');
      expect(runRunner(name, ['--apply']).status).toBe(1);

      const column = await withPool(name, pool => pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'producer_brandings' AND column_name = 'cta_link'`
      ).then(result => result.rowCount));
      expect(column).toBe(0);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('repairs the supported old investigation constraint and refuses incompatible values', async () => {
    const supported = databaseName('old_constraint');
    const incompatible = databaseName('bad_constraint');
    await createDatabase(supported);
    await createDatabase(incompatible);
    try {
      for (const name of [supported, incompatible]) {
        await applyPre0014SchemaSnapshot(name);
        await createLegacyLog(name, allLegacyFiles);
        expect(runRunner(name, [
          '--adopt',
          '0011_add_profile_organization_id.sql',
          '0012_add_derived_tenant_relationships.sql',
          '0013_tighten_tenant_constraints.sql'
        ]).status).toBe(0);
      }
      await withPool(supported, async pool => {
        await pool.query('ALTER TABLE investigations DROP CONSTRAINT chk_investigations_status');
        await pool.query(`ALTER TABLE investigations ADD CONSTRAINT chk_investigations_status CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'REVOKED', 'DISMISSED'))`);
      });
      expect(runRunner(supported, ['--apply']).status).toBe(0);
      expect(runRunner(supported, ['--check']).status).toBe(0);

      await withPool(incompatible, async pool => {
        await pool.query('ALTER TABLE investigations DROP CONSTRAINT chk_investigations_status');
        await pool.query(`ALTER TABLE investigations ADD CONSTRAINT chk_investigations_status CHECK (status IN ('OPEN', 'ARCHIVED'))`);
      });
      const check = runRunner(incompatible, ['--check']);
      expect(check.status).toBe(2);
      expect(check.parsed.report.states['0009_widen_investigations_status_check.sql'].status).toBe('incompatible');
      expect(runRunner(incompatible, ['--apply']).status).toBe(1);
    } finally {
      await dropDatabase(supported);
      await dropDatabase(incompatible);
    }
  }, 60_000);

  it('refuses a stored checksum mismatch without overwriting it', async () => {
    const name = databaseName('checksum');
    await createDatabase(name);
    try {
      await applyPre0014SchemaSnapshot(name);
      await createLegacyLog(name, preBrandingFiles);
      expect(runRunner(name, [
        '--adopt',
        '0007_add_producer_brandings_table.sql',
        '0009_widen_investigations_status_check.sql',
        '0011_add_profile_organization_id.sql',
        '0012_add_derived_tenant_relationships.sql',
        '0013_tighten_tenant_constraints.sql'
      ]).status).toBe(0);
      const badChecksum = '0'.repeat(64);
      await withPool(name, pool => pool.query(
        'UPDATE migrations_log SET checksum_sha256 = $1 WHERE filename = $2',
        [badChecksum, '0007_add_producer_brandings_table.sql']
      ).then(() => undefined));
      await withPool(name, pool => pool.query(
        `INSERT INTO migrations_log (filename, application_mode)
         VALUES ('0099_missing_from_repository.sql', 'LEGACY')`
      ).then(() => undefined));

      const check = runRunner(name, ['--check']);
      expect(check.status).toBe(2);
      expect(check.parsed.report.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('Checksum mismatch for 0007_add_producer_brandings_table.sql'),
        expect.stringContaining('Logged migration file is missing: 0099_missing_from_repository.sql')
      ]));
      expect(runRunner(name, ['--apply']).status).toBe(1);
      const stored = await withPool(name, pool => pool.query(
        'SELECT checksum_sha256 FROM migrations_log WHERE filename = $1',
        ['0007_add_producer_brandings_table.sql']
      ).then(result => result.rows[0].checksum_sha256));
      expect(stored).toBe(badChecksum);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('prevents a concurrent apply while the migration advisory lock is held', async () => {
    const name = databaseName('lock');
    await createDatabase(name);
    try {
      expect(runRunner(name, ['--bootstrap']).status).toBe(0);
      await withPool(name, async pool => {
        const client = await pool.connect();
        try {
          await client.query('SELECT pg_advisory_lock($1, $2)', [1128353869, 1229410872]);
          const result = runRunner(name, ['--apply']);
          expect(result.status).toBe(1);
          expect(result.stderr).toContain('advisory lock');
        } finally {
          await client.query('SELECT pg_advisory_unlock($1, $2)', [1128353869, 1229410872]);
          client.release();
        }
      });
      expect(runRunner(name, ['--check']).status).toBe(0);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('fails closed before tightening on NULL data or an unexpected non-empty orphan state', async () => {
    const producerNull = databaseName('c3c_producer_null');
    const investigationNull = databaseName('c3c_investigation_null');
    const unexpectedOrphans = databaseName('c3c_unexpected_orphans');
    for (const name of [producerNull, investigationNull, unexpectedOrphans]) {
      await createDatabase(name);
      await preparePre0013Snapshot(name);
    }
    try {
      await withPool(producerNull, pool => pool.query(`
        INSERT INTO producers
          (id, name, type, registry_references, organization_id)
        VALUES
          ('30000000-0000-0000-0000-000000000001',
           'C3c Preflight Null Producer', 'FARMER', '{}'::jsonb, NULL)
      `).then(() => undefined));
      await expect(applySqlFile(producerNull, tighteningMigrationPath))
        .rejects.toThrow(/0013_PRODUCER_NULL_ORG/);

      await withPool(investigationNull, pool => pool.query(`
        INSERT INTO investigations
          (id, product_name, public_identifier, risk_level, status, detection_reason,
           manufacturer, current_product_status, evidence, unit_code_id)
        VALUES
          ('30000000-0000-0000-0000-000000000002',
           'C3c Preflight Null Investigation',
           '30000000-0000-0000-0000-000000000003',
           'HIGH', 'OPEN', 'C3c preflight', 'Unknown', 'ACTIVE', '{}'::jsonb, NULL)
      `).then(() => undefined));
      await expect(applySqlFile(investigationNull, tighteningMigrationPath))
        .rejects.toThrow(/0013_INVESTIGATION_NULL_UNIT/);

      await withPool(unexpectedOrphans, async pool => {
        await pool.query(`
          INSERT INTO organizations
            (id, name, type, official_email, status)
          VALUES
            ('30000000-0000-0000-0000-000000000004',
             'C3c Mapped Certifier', 'CERTIFICATION_BODY',
             'c3c-mapped-certifier@capmint.example', 'ACTIVATED')
        `);
        await pool.query(`
          INSERT INTO certifiers
            (id, organization_id, name, accreditation_details, public_key, key_status)
          VALUES
            ('30000000-0000-0000-0000-000000000005',
             '30000000-0000-0000-0000-000000000004',
             'C3c Mapped Certifier', '{}'::jsonb, 'c3c-key', 'ACTIVE')
        `);
      });
      await expect(applySqlFile(unexpectedOrphans, tighteningMigrationPath))
        .rejects.toThrow(/0013_UNEXPECTED_CERTIFIER_ORPHANS/);

      for (const name of [producerNull, investigationNull, unexpectedOrphans]) {
        const unchanged = await withPool(name, pool => pool.query(`
          SELECT
            (SELECT attnotnull
             FROM pg_attribute
             WHERE attrelid = 'producers'::regclass
               AND attname = 'organization_id'
               AND NOT attisdropped) AS producer_not_null,
            (SELECT attnotnull
             FROM pg_attribute
             WHERE attrelid = 'investigations'::regclass
               AND attname = 'unit_code_id'
               AND NOT attisdropped) AS investigation_not_null,
            (SELECT indisunique
             FROM pg_index
             WHERE indexrelid = 'idx_investigations_unit_code_id'::regclass) AS investigation_index_unique
        `).then(result => result.rows[0]));
        expect(unchanged).toEqual({
          producer_not_null: false,
          investigation_not_null: false,
          investigation_index_unique: false
        });
      }
    } finally {
      await dropDatabase(producerNull);
      await dropDatabase(investigationNull);
      await dropDatabase(unexpectedOrphans);
    }
  }, 90_000);

  it('backfills matching profiles, quarantines orphans, enforces the FK, and is idempotent', async () => {
    const name = databaseName('tenant_backfill');
    await createDatabase(name);
    try {
      await applySqlFile(name, baselinePath);
      await createLegacyLog(name, allLegacyFiles);
      await withPool(name, async pool => {
        await pool.query(`
          INSERT INTO organizations
            (id, name, type, official_email, status)
          VALUES
            ('10000000-0000-0000-0000-000000000011',
             'C2 Matching Producer',
             'PRODUCER',
             'c2-producer@capmint.example',
             'ACTIVATED'),
            ('10000000-0000-0000-0000-000000000012',
             'C2 Matching Certifier',
             'CERTIFICATION_BODY',
             'c2-certifier@capmint.example',
             'ACTIVATED')
        `);
        await pool.query(`
          INSERT INTO producers (id, name, type, registry_references)
          VALUES (
            '10000000-0000-0000-0000-000000000011',
            'C2 Matching Producer',
            'FARMER',
            '{}'::jsonb
          )
        `);
        await pool.query(`
          INSERT INTO certifiers
            (id, name, accreditation_details, public_key, key_status)
          VALUES
            ('10000000-0000-0000-0000-000000000012',
             'C2 Matching Certifier',
             '{}'::jsonb,
             'c2-matching-key',
             'ACTIVE'),
            ('00000000-0000-0000-0000-000000000003',
             'National Agricultural Quality Board',
             '{}'::jsonb,
             'c2-orphan-key',
             'ACTIVE')
        `);
      });

      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);

      const ownership = await withPool(name, pool => pool.query(`
        SELECT 'producer' AS profile_type, id, organization_id, NULL::text AS key_status
        FROM producers
        UNION ALL
        SELECT 'certifier' AS profile_type, id, organization_id, key_status
        FROM certifiers
        ORDER BY profile_type, id
      `).then(result => result.rows));
      expect(ownership).toEqual([
        {
          profile_type: 'certifier',
          id: '10000000-0000-0000-0000-000000000012',
          organization_id: '10000000-0000-0000-0000-000000000012',
          key_status: 'ACTIVE'
        },
        {
          profile_type: 'producer',
          id: '10000000-0000-0000-0000-000000000011',
          organization_id: '10000000-0000-0000-0000-000000000011',
          key_status: null
        }
      ]);

      const constraints = await withPool(name, pool => pool.query(`
        SELECT conname, convalidated
        FROM pg_constraint
        WHERE conname IN (
          'producers_organization_id_fkey',
          'certifiers_organization_id_fkey'
        )
        ORDER BY conname
      `).then(result => result.rows));
      expect(constraints).toEqual([
        { conname: 'certifiers_organization_id_fkey', convalidated: true },
        { conname: 'producers_organization_id_fkey', convalidated: true }
      ]);

      const indexes = await withPool(name, pool => pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'idx_producers_organization_id',
            'idx_certifiers_organization_id'
          )
        ORDER BY indexname
      `).then(result => result.rows.map(row => row.indexname)));
      expect(indexes).toEqual([
        'idx_certifiers_organization_id',
        'idx_producers_organization_id'
      ]);

      await expect(withPool(name, pool => pool.query(`
        INSERT INTO producers
          (id, organization_id, name, type, registry_references)
        VALUES
          ('10000000-0000-0000-0000-000000000014',
           '10000000-0000-0000-0000-000000000099',
           'C2 Invalid Owner',
           'FARMER',
           '{}'::jsonb)
      `))).rejects.toMatchObject({ code: '23503' });

      const beforeDirectRerun = await schemaFingerprint(name);
      await applySqlFile(name, certifierTighteningMigrationPath);
      expect(await schemaFingerprint(name)).toBe(beforeDirectRerun);

      await withPool(name, pool => pool.query(
        'DROP INDEX idx_certifiers_organization_id'
      ).then(() => undefined));
      const partial = runRunner(name, ['--check']);
      expect(partial.status).toBe(2);
      expect(partial.parsed.report.states['0011_add_profile_organization_id.sql'].status)
        .toBe('incompatible');
      expect(runRunner(name, ['--apply']).status).toBe(1);
    } finally {
      await dropDatabase(name);
    }
  }, 90_000);

  it('backfills exact investigation links, validates C3a relationships, rejects drift, and is idempotent', async () => {
    const name = databaseName('derived_tenancy');
    const unmatchedName = databaseName('derived_unmatched');
    await createDatabase(name);
    await createDatabase(unmatchedName);
    try {
      await applySqlFile(name, baselinePath);
      await createLegacyLog(name, allLegacyFiles);
      await withPool(name, async pool => {
        await pool.query(`
          INSERT INTO organizations
            (id, name, type, official_email, status)
          VALUES
            ('20000000-0000-0000-0000-000000000001', 'C3a Producer Org', 'PRODUCER', 'c3a-producer@capmint.example', 'ACTIVATED'),
            ('20000000-0000-0000-0000-000000000002', 'C3a Certifier Org', 'CERTIFICATION_BODY', 'c3a-certifier@capmint.example', 'ACTIVATED'),
            ('20000000-0000-0000-0000-000000000003', 'C3a Other Producer Org', 'PRODUCER', 'c3a-other-producer@capmint.example', 'ACTIVATED')
        `);
        await pool.query(`
          INSERT INTO producers (id, name, type, registry_references)
          VALUES
            ('20000000-0000-0000-0000-000000000001', 'C3a Producer', 'FARMER', '{}'::jsonb),
            ('20000000-0000-0000-0000-000000000003', 'C3a Other Producer', 'FARMER', '{}'::jsonb)
        `);
        await pool.query(`
          INSERT INTO certifiers (id, name, accreditation_details, public_key, key_status)
          VALUES
            ('20000000-0000-0000-0000-000000000002', 'C3a Certifier', '{}'::jsonb, 'c3a-key', 'ACTIVE'),
            ('00000000-0000-0000-0000-000000000003', 'National Agricultural Quality Board', '{}'::jsonb, 'legacy-key', 'ACTIVE')
        `);
        await pool.query(`
          INSERT INTO budgets
            (id, producer_id, certifier_id, source_unit_type, approved_quantity,
             yield_assumptions, signature_bundle, effective_start_date, effective_end_date, status)
          VALUES
            ('20000000-0000-0000-0000-000000000010',
             '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000002',
             'UNIT_COUNT', 10, '{}'::jsonb, 'c3a-signature',
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', 'ACTIVE')
        `);
        await pool.query(`
          INSERT INTO lots
            (id, producer_id, budget_id, product_metadata, batch_size, processing_dates)
          VALUES
            ('20000000-0000-0000-0000-000000000020',
             '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000010',
             '{}'::jsonb, 10, '{}'::jsonb)
        `);
        await pool.query(`
          INSERT INTO unit_codes
            (id, lot_id, serial, gtin, digital_link_uri, public_identifier, verification_url)
          VALUES
            ('20000000-0000-0000-0000-000000000030',
             '20000000-0000-0000-0000-000000000020',
             'C3A-UNIT', '00000000000000', 'https://id.c3a/unit',
             '20000000-0000-0000-0000-000000000031', 'https://verify.c3a/unit')
        `);
        await pool.query(`
          INSERT INTO investigations
            (id, product_name, public_identifier, risk_level, status, detection_reason,
             manufacturer, current_product_status, evidence)
          VALUES
            ('20000000-0000-0000-0000-000000000040', 'C3a Product',
             '20000000-0000-0000-0000-000000000031', 'HIGH', 'OPEN',
             'C3a test', 'C3a Producer', 'ACTIVE', '{}'::jsonb)
        `);
        await pool.query(`
          INSERT INTO lab_results
            (lot_id, lab_name, test_type, result_summary, report_hash, report_reference)
          VALUES
            ('20000000-0000-0000-0000-000000000020', 'Legacy Lab', 'Purity',
             'PASS', 'c3a-hash', 'c3a-report')
        `);
      });

      const relationshipApply = runRunner(name, ['--apply']);
      expect(relationshipApply.status, relationshipApply.stderr).toBe(0);
      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);

      const state = await withPool(name, pool => pool.query(`
        SELECT
          (SELECT unit_code_id FROM investigations WHERE id = '20000000-0000-0000-0000-000000000040') AS unit_code_id,
          (SELECT submitted_by_organization_id FROM lab_results WHERE lot_id = '20000000-0000-0000-0000-000000000020') AS submitted_by,
          (SELECT assigned_laboratory_organization_id FROM lots WHERE id = '20000000-0000-0000-0000-000000000020') AS assigned_laboratory,
          (SELECT count(*)::int FROM pg_constraint
           WHERE conname = ANY(ARRAY[
             'budgets_id_producer_id_key',
             'lots_budget_id_producer_id_fkey',
             'investigations_unit_code_id_fkey',
             'lab_results_submitted_by_organization_id_fkey',
             'lots_assigned_laboratory_organization_id_fkey'
           ]) AND convalidated) AS validated_constraints,
          (SELECT count(*)::int FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname = ANY(ARRAY[
               'idx_investigations_unit_code_id',
               'idx_lab_results_submitted_by_organization_id',
               'idx_lots_assigned_laboratory_organization_id'
             ])) AS relationship_indexes,
          (SELECT indisunique
           FROM pg_index
           WHERE indexrelid = 'idx_investigations_unit_code_id'::regclass) AS investigation_index_unique,
          (SELECT attnotnull
           FROM pg_attribute
           WHERE attrelid = 'producers'::regclass
             AND attname = 'organization_id'
             AND NOT attisdropped) AS producer_organization_not_null,
          (SELECT attnotnull
           FROM pg_attribute
           WHERE attrelid = 'certifiers'::regclass
             AND attname = 'organization_id'
             AND NOT attisdropped) AS certifier_organization_not_null,
          (SELECT attnotnull
           FROM pg_attribute
           WHERE attrelid = 'investigations'::regclass
             AND attname = 'unit_code_id'
             AND NOT attisdropped) AS investigation_unit_not_null,
          (SELECT key_status
           FROM certifiers
           WHERE id = '00000000-0000-0000-0000-000000000003') AS orphan_key_status,
          (SELECT count(*)::int
           FROM certifiers
           WHERE id = '00000000-0000-0000-0000-000000000003'
             AND key_status = 'ACTIVE') AS orphan_active_selection_count,
          (SELECT count(*)::int
           FROM budgets
           WHERE certifier_id = '00000000-0000-0000-0000-000000000003') AS orphan_budget_references
      `).then(result => result.rows[0]));
      expect(state).toEqual({
        unit_code_id: '20000000-0000-0000-0000-000000000030',
        submitted_by: null,
        assigned_laboratory: null,
        validated_constraints: 5,
        relationship_indexes: 3,
        investigation_index_unique: true,
        producer_organization_not_null: true,
        certifier_organization_not_null: true,
        investigation_unit_not_null: true,
        orphan_key_status: null,
        orphan_active_selection_count: 0,
        orphan_budget_references: 0
      });

      await expect(withPool(name, pool => pool.query(`
        INSERT INTO producers
          (id, name, type, registry_references, organization_id)
        VALUES
          ('20000000-0000-0000-0000-000000000004',
           'C3c Null Producer', 'FARMER', '{}'::jsonb, NULL)
      `))).rejects.toMatchObject({ code: '23502' });

      await expect(withPool(name, pool => pool.query(`
        INSERT INTO investigations
          (id, product_name, public_identifier, risk_level, status, detection_reason,
           manufacturer, current_product_status, evidence, unit_code_id)
        VALUES
          ('20000000-0000-0000-0000-000000000041', 'C3c Null Investigation',
           '20000000-0000-0000-0000-000000000041', 'HIGH', 'OPEN',
           'C3c null test', 'C3a Producer', 'ACTIVE', '{}'::jsonb, NULL)
      `))).rejects.toMatchObject({ code: '23502' });

      await expect(withPool(name, pool => pool.query(`
        INSERT INTO investigations
          (id, product_name, public_identifier, risk_level, status, detection_reason,
           manufacturer, current_product_status, evidence, unit_code_id)
        VALUES
          ('20000000-0000-0000-0000-000000000042', 'C3c Duplicate Investigation',
           '20000000-0000-0000-0000-000000000042', 'HIGH', 'OPEN',
           'C3c duplicate test', 'C3a Producer', 'ACTIVE', '{}'::jsonb,
           '20000000-0000-0000-0000-000000000030')
      `))).rejects.toMatchObject({ code: '23505' });

      await expect(withPool(name, pool => pool.query(
        `UPDATE investigations
         SET unit_code_id = '20000000-0000-0000-0000-000000000099'
         WHERE id = '20000000-0000-0000-0000-000000000040'`
      ))).rejects.toMatchObject({ code: '23503' });
      await expect(withPool(name, pool => pool.query(
        `UPDATE lab_results
         SET submitted_by_organization_id = '20000000-0000-0000-0000-000000000099'
         WHERE lot_id = '20000000-0000-0000-0000-000000000020'`
      ))).rejects.toMatchObject({ code: '23503' });
      await expect(withPool(name, pool => pool.query(`
        INSERT INTO lots
          (id, producer_id, budget_id, product_metadata, batch_size, processing_dates)
        VALUES
          ('20000000-0000-0000-0000-000000000021',
           '20000000-0000-0000-0000-000000000003',
           '20000000-0000-0000-0000-000000000010',
           '{}'::jsonb, 1, '{}'::jsonb)
      `))).rejects.toMatchObject({ code: '23503' });

      const beforeDirectRerun = await schemaFingerprint(name);
      await applySqlFile(name, certifierTighteningMigrationPath);
      expect(await schemaFingerprint(name)).toBe(beforeDirectRerun);

      await applySqlFile(unmatchedName, baselinePath);
      await createLegacyLog(unmatchedName, allLegacyFiles);
      await withPool(unmatchedName, pool => pool.query(`
        INSERT INTO investigations
          (product_name, public_identifier, risk_level, status, detection_reason,
           manufacturer, current_product_status, evidence)
        VALUES
          ('Unmatched Product', '20000000-0000-0000-0000-000000000099',
           'HIGH', 'OPEN', 'Unmatched test', 'Unknown', 'ACTIVE', '{}'::jsonb)
      `).then(() => undefined));
      const unmatchedApply = runRunner(unmatchedName, ['--apply']);
      expect(unmatchedApply.status).toBe(1);
      expect(unmatchedApply.stderr).toContain('0012_UNMATCHED_INVESTIGATIONS');
      const unmatchedColumn = await withPool(unmatchedName, pool => pool.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'investigations'
          AND column_name = 'unit_code_id'
      `).then(result => result.rowCount));
      expect(unmatchedColumn).toBe(0);
    } finally {
      await dropDatabase(name);
      await dropDatabase(unmatchedName);
    }
  }, 120_000);

  it('rejects an unexpected NULL certifier and rolls back the approved orphan deletion', async () => {
    const name = databaseName('certifier_extra_null');
    await createDatabase(name);
    try {
      await applyPre0014SchemaSnapshot(name);
      await withPool(name, pool => pool.query(`
        INSERT INTO certifiers
          (id, name, accreditation_details, public_key, key_status, organization_id)
        VALUES
          ('00000000-0000-0000-0000-000000000003',
           'Approved Revoked Orphan', '{}'::jsonb, 'approved-orphan-key', 'REVOKED', NULL),
          ('40000000-0000-0000-0000-000000000001',
           'Unexpected Null Certifier', '{}'::jsonb, 'unexpected-null-key', 'REVOKED', NULL)
      `).then(() => undefined));

      await expect(applySqlFile(name, certifierTighteningMigrationPath))
        .rejects.toThrow(/0014_CERTIFIER_NULL_ORG/);

      const unchanged = await withPool(name, pool => pool.query(`
        SELECT
          (SELECT count(*)::int
           FROM certifiers
           WHERE id = '00000000-0000-0000-0000-000000000003') AS approved_orphan_rows,
          (SELECT count(*)::int
           FROM certifiers
           WHERE organization_id IS NULL) AS certifier_nulls,
          (SELECT attnotnull
           FROM pg_attribute
           WHERE attrelid = 'certifiers'::regclass
             AND attname = 'organization_id'
             AND NOT attisdropped) AS certifier_not_null
      `).then(result => result.rows[0]));
      expect(unchanged).toEqual({
        approved_orphan_rows: 1,
        certifier_nulls: 2,
        certifier_not_null: false
      });
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('refuses to delete the approved certifier unless it is revoked and unreferenced', async () => {
    const activeName = databaseName('certifier_active_orphan');
    const referencedName = databaseName('certifier_referenced_orphan');
    await createDatabase(activeName);
    await createDatabase(referencedName);
    try {
      await applyPre0014SchemaSnapshot(activeName);
      await withPool(activeName, pool => pool.query(`
        INSERT INTO certifiers
          (id, name, accreditation_details, public_key, key_status, organization_id)
        VALUES
          ('00000000-0000-0000-0000-000000000003',
           'Active Approved Orphan', '{}'::jsonb, 'active-orphan-key', 'ACTIVE', NULL)
      `).then(() => undefined));
      await expect(applySqlFile(activeName, certifierTighteningMigrationPath))
        .rejects.toThrow(/0014_ORPHAN_NOT_REVOKED/);

      await applyPre0014SchemaSnapshot(referencedName);
      await withPool(referencedName, async pool => {
        await pool.query(`
          INSERT INTO organizations
            (id, name, type, official_email, status)
          VALUES
            ('40000000-0000-0000-0000-000000000010',
             'Referenced Orphan Producer Org', 'PRODUCER',
             'referenced-orphan-producer@capmint.example', 'ACTIVATED')
        `);
        await pool.query(`
          INSERT INTO producers
            (id, organization_id, name, type, registry_references)
          VALUES
            ('40000000-0000-0000-0000-000000000011',
             '40000000-0000-0000-0000-000000000010',
             'Referenced Orphan Producer', 'FARMER', '{}'::jsonb)
        `);
        await pool.query(`
          INSERT INTO certifiers
            (id, name, accreditation_details, public_key, key_status, organization_id)
          VALUES
            ('00000000-0000-0000-0000-000000000003',
             'Referenced Approved Orphan', '{}'::jsonb, 'referenced-orphan-key', 'REVOKED', NULL)
        `);
        await pool.query(`
          INSERT INTO budgets
            (id, producer_id, certifier_id, source_unit_type, approved_quantity,
             yield_assumptions, signature_bundle, effective_start_date, effective_end_date, status)
          VALUES
            ('40000000-0000-0000-0000-000000000012',
             '40000000-0000-0000-0000-000000000011',
             '00000000-0000-0000-0000-000000000003',
             'UNIT_COUNT', 1, '{}'::jsonb, 'referenced-orphan-signature',
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day', 'ACTIVE')
        `);
      });
      await expect(applySqlFile(referencedName, certifierTighteningMigrationPath))
        .rejects.toThrow(/0014_ORPHAN_CERTIFIER_REFERENCED/);

      for (const name of [activeName, referencedName]) {
        const orphanRows = await withPool(name, pool => pool.query(`
          SELECT count(*)::int AS count
          FROM certifiers
          WHERE id = '00000000-0000-0000-0000-000000000003'
        `).then(result => result.rows[0].count));
        expect(orphanRows).toBe(1);
      }
    } finally {
      await dropDatabase(activeName);
      await dropDatabase(referencedName);
    }
  }, 90_000);

  it('rejects over-tightening of either nullable laboratory relationship', async () => {
    const submitterName = databaseName('certifier_lab_submitter_tight');
    const assignmentName = databaseName('certifier_lab_assignment_tight');
    await createDatabase(submitterName);
    await createDatabase(assignmentName);
    try {
      await applyPre0014SchemaSnapshot(submitterName);
      await withPool(submitterName, pool =>
        pool.query('ALTER TABLE lab_results ALTER COLUMN submitted_by_organization_id SET NOT NULL').then(() => undefined));
      await expect(applySqlFile(submitterName, certifierTighteningMigrationPath))
        .rejects.toThrow(/0014_INCOMPATIBLE_LAB_SUBMITTER/);

      await applyPre0014SchemaSnapshot(assignmentName);
      await withPool(assignmentName, pool =>
        pool.query('ALTER TABLE lots ALTER COLUMN assigned_laboratory_organization_id SET NOT NULL').then(() => undefined));
      await expect(applySqlFile(assignmentName, certifierTighteningMigrationPath))
        .rejects.toThrow(/0014_INCOMPATIBLE_LAB_ASSIGNMENT/);
    } finally {
      await dropDatabase(submitterName);
      await dropDatabase(assignmentName);
    }
  }, 60_000);

  it('classifies 0014 exact, absent, and incompatible states', async () => {
    const exactName = databaseName('certifier_verify_exact');
    const absentName = databaseName('certifier_verify_absent');
    const incompatibleName = databaseName('certifier_verify_incompatible');
    await createDatabase(exactName);
    await createDatabase(absentName);
    await createDatabase(incompatibleName);
    try {
      await applySqlFile(exactName, schemaPath);
      await applyPre0014SchemaSnapshot(absentName);
      await applyPre0014SchemaSnapshot(incompatibleName);
      await withPool(incompatibleName, pool => pool.query(`
        INSERT INTO certifiers
          (id, name, accreditation_details, public_key, key_status, organization_id)
        VALUES
          ('40000000-0000-0000-0000-000000000020',
           'Verifier Unexpected Orphan', '{}'::jsonb, 'verifier-orphan-key', 'REVOKED', NULL)
      `).then(() => undefined));

      const exact = await withPool(exactName, pool => migrationRunner.verify0014(pool));
      const absent = await withPool(absentName, pool => migrationRunner.verify0014(pool));
      const incompatible = await withPool(incompatibleName, pool => migrationRunner.verify0014(pool));
      expect(exact.status).toBe('exact');
      expect(absent.status).toBe('absent');
      expect(incompatible.status).toBe('incompatible');
    } finally {
      await dropDatabase(exactName);
      await dropDatabase(absentName);
      await dropDatabase(incompatibleName);
    }
  }, 90_000);

  it('anchors predecessor successor-awareness on the recorded 0014 migration', async () => {
    const name = databaseName('certifier_successor_anchor');
    await createDatabase(name);
    try {
      expect(runRunner(name, ['--bootstrap']).status).toBe(0);
      await withPool(name, async pool => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `DELETE FROM migrations_log
             WHERE filename = '0014_tighten_certifier_organization_id.sql'`
          );
          expect((await migrationRunner.verify0014(client)).status).toBe('exact');
          expect((await migrationRunner.verify0011(client)).status).toBe('incompatible');
          expect((await migrationRunner.verify0012(client)).status).toBe('incompatible');
          expect((await migrationRunner.verify0013(client)).status).toBe('incompatible');
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }
      });

      expect((await withPool(name, pool => migrationRunner.verify0011(pool))).status).toBe('exact');
      expect((await withPool(name, pool => migrationRunner.verify0012(pool))).status).toBe('exact');
      expect((await withPool(name, pool => migrationRunner.verify0013(pool))).status).toBe('exact');
      expect((await withPool(name, pool => migrationRunner.verify0014(pool))).status).toBe('exact');
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('produces identical normalized schemas from baseline and snapshot paths', async () => {
    const baseline = databaseName('compare_baseline');
    const snapshot = databaseName('compare_snapshot');
    await createDatabase(baseline);
    await createDatabase(snapshot);
    try {
      expect(runRunner(baseline, ['--bootstrap']).status).toBe(0);
      await applySqlFile(snapshot, schemaPath);
      expect(await schemaFingerprint(snapshot)).toBe(await schemaFingerprint(baseline));
    } finally {
      await dropDatabase(baseline);
      await dropDatabase(snapshot);
    }
  }, 60_000);

  it('matches baseline state after applying forward migrations from a legacy 0006 shape', async () => {
    const baseline = databaseName('forward_baseline');
    const forward = databaseName('forward_legacy');
    await createDatabase(baseline);
    await createDatabase(forward);
    try {
      expect(runRunner(baseline, ['--bootstrap']).status).toBe(0);
      await applySqlFile(forward, baselinePath);
      await withPool(forward, async pool => {
        await pool.query('DROP TABLE producer_brandings');
        await pool.query('ALTER TABLE organizations DROP COLUMN approval_notes, DROP COLUMN verification_evidence, DROP COLUMN uploaded_documents');
        await pool.query('ALTER TABLE budgets DROP COLUMN rejection_reason, DROP COLUMN status_history');
        await pool.query('ALTER TABLE investigations DROP COLUMN assigned_to, DROP COLUMN case_notes, DROP COLUMN evidence_timeline');
        await pool.query('ALTER TABLE investigations DROP CONSTRAINT chk_investigations_status');
        await pool.query(`ALTER TABLE investigations ADD CONSTRAINT chk_investigations_status CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'REVOKED', 'DISMISSED'))`);
      });
      await createLegacyLog(forward, allLegacyFiles.slice(0, 6));

      expect(runRunner(forward, ['--apply']).status).toBe(0);
      expect(runRunner(forward, ['--check']).status).toBe(0);
      expect(await schemaFingerprint(forward)).toBe(await schemaFingerprint(baseline));
    } finally {
      await dropDatabase(baseline);
      await dropDatabase(forward);
    }
  }, 90_000);
});
