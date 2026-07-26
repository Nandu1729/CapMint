import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
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
const tenantMigrationPath = path.join(ROOT, 'database/migrations/0011_add_profile_organization_id.sql');
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

  it('bootstraps empty PostgreSQL, records one baseline, applies 0010/0011, and becomes a no-op', async () => {
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
      expect(rows).toHaveLength(3);
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

      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);
      const count = await withPool(name, pool => pool.query('SELECT count(*)::int AS count FROM migrations_log').then(result => result.rows[0].count));
      expect(count).toBe(3);
    } finally {
      await dropDatabase(name);
    }
  }, 60_000);

  it('detects and adopts exact 0007/0009/0011 effects without application-schema DDL', async () => {
    const name = databaseName('adoption');
    await createDatabase(name);
    try {
      await applySqlFile(name, schemaPath);
      await createLegacyLog(name, preBrandingFiles);
      const before = await schemaFingerprint(name);

      const check = runRunner(name, ['--check']);
      const plan = runRunner(name, ['--plan']);
      expect(check.status).toBe(2);
      expect(plan.status).toBe(2);
      expect(check.parsed.report.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'ADOPT', target: '0007_add_producer_brandings_table.sql' }),
        expect.objectContaining({ action: 'ADOPT', target: '0009_widen_investigations_status_check.sql' }),
        expect.objectContaining({ action: 'ADOPT', target: '0011_add_profile_organization_id.sql' })
      ]));

      const adoption = runRunner(name, [
        '--adopt',
        '0007_add_producer_brandings_table.sql',
        '0009_widen_investigations_status_check.sql',
        '0011_add_profile_organization_id.sql'
      ]);
      expect(adoption.status, adoption.stderr).toBe(0);
      expect(await schemaFingerprint(name)).toBe(before);

      const adoptedRows = await withPool(name, pool => pool.query(
        `SELECT filename, application_mode, checksum_sha256, evidence_fingerprint
         FROM migrations_log
         WHERE filename IN ($1, $2, $3)
         ORDER BY filename`,
        [
          '0007_add_producer_brandings_table.sql',
          '0009_widen_investigations_status_check.sql',
          '0011_add_profile_organization_id.sql'
        ]
      ).then(result => result.rows));
      expect(adoptedRows).toHaveLength(3);
      for (const row of adoptedRows) {
        expect(row.application_mode).toBe('ADOPTED');
        expect(row.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(row.evidence_fingerprint).toMatch(/^[a-f0-9]{64}$/);
      }

      expect(runRunner(name, ['--apply']).status).toBe(0);
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
      await applySqlFile(name, schemaPath);
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

      expect(runRunner(name, ['--adopt', '0011_add_profile_organization_id.sql']).status).toBe(0);
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
      await applySqlFile(name, schemaPath);
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
        await applySqlFile(name, schemaPath);
        await createLegacyLog(name, allLegacyFiles);
        expect(runRunner(name, ['--adopt', '0011_add_profile_organization_id.sql']).status).toBe(0);
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
      await applySqlFile(name, schemaPath);
      await createLegacyLog(name, preBrandingFiles);
      expect(runRunner(name, [
        '--adopt',
        '0007_add_producer_brandings_table.sql',
        '0009_widen_investigations_status_check.sql',
        '0011_add_profile_organization_id.sql'
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
            ('10000000-0000-0000-0000-000000000013',
             'C2 Orphan Certifier',
             '{}'::jsonb,
             'c2-orphan-key',
             'ACTIVE')
        `);
      });

      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--apply']).status).toBe(0);
      expect(runRunner(name, ['--check']).status).toBe(0);

      const ownership = await withPool(name, pool => pool.query(`
        SELECT 'producer' AS profile_type, id, organization_id
        FROM producers
        UNION ALL
        SELECT 'certifier' AS profile_type, id, organization_id
        FROM certifiers
        ORDER BY profile_type, id
      `).then(result => result.rows));
      expect(ownership).toEqual([
        {
          profile_type: 'certifier',
          id: '10000000-0000-0000-0000-000000000012',
          organization_id: '10000000-0000-0000-0000-000000000012'
        },
        {
          profile_type: 'certifier',
          id: '10000000-0000-0000-0000-000000000013',
          organization_id: null
        },
        {
          profile_type: 'producer',
          id: '10000000-0000-0000-0000-000000000011',
          organization_id: '10000000-0000-0000-0000-000000000011'
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
      await applySqlFile(name, tenantMigrationPath);
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
