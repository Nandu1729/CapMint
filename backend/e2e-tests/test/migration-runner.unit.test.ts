import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const runner = require('../../../playground/run_migrations.js');

describe('migration runner metadata and planning primitives', () => {
  it('requires one explicit mode and exact adoption filenames', () => {
    expect(runner.parseArgs(['--check'])).toEqual({
      mode: 'check',
      json: false,
      filenames: []
    });
    expect(runner.parseArgs([
      '--adopt',
      '0007_add_producer_brandings_table.sql',
      '0009_widen_investigations_status_check.sql',
      '--json'
    ])).toEqual({
      mode: 'adopt',
      json: true,
      filenames: [
        '0007_add_producer_brandings_table.sql',
        '0009_widen_investigations_status_check.sql'
      ]
    });
    expect(() => runner.parseArgs([])).toThrow(/exactly one mode/);
    expect(() => runner.parseArgs(['--check', '--apply'])).toThrow(/exactly one mode/);
    expect(() => runner.parseArgs(['--adopt'])).toThrow(/requires one or more/);
  });

  it('loads a monotonic migration set ending in certifier-tightening migration 0014', () => {
    const result = runner.loadMigrations();
    expect(result.errors).toEqual([]);
    expect(result.migrations.at(-1)?.filename).toBe('0014_tighten_certifier_organization_id.sql');
    expect(result.migrations.map((migration: { version: number }) => migration.version))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    for (const migration of result.migrations) {
      expect(migration.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('rejects duplicate, non-monotonic, and malformed migration entries', () => {
    expect(runner.validateMigrationOrdering([
      { filename: '0002_second.sql', version: 2 },
      { filename: '0002_duplicate.sql', version: 2 },
      { filename: '0001_first.sql', version: 1 },
      { filename: 'bad.sql', version: null, error: 'Filename does not match NNNN_name.sql.' }
    ])).toEqual(expect.arrayContaining([
      expect.stringContaining('Duplicate migration version 0002'),
      expect.stringContaining('non-monotonic'),
      expect.stringContaining('bad.sql')
    ]));
  });

  it('validates the immutable baseline checksum and cutoff metadata', () => {
    const baseline = runner.loadBaseline();
    expect(baseline.errors).toEqual([]);
    expect(baseline.manifest).toMatchObject({
      identifier: 'capmint-baseline-20260725-cutoff-0009',
      schema_cutoff: 9,
      next_migration: 10,
      includes_seed_data: false
    });
    expect(baseline.actualChecksum).toBe(baseline.manifest.checksum_sha256);
  });

  it('normalizes constraint status values and evidence deterministically', () => {
    const definition = "CHECK (status::text = ANY (ARRAY['OPEN'::character varying, 'CLOSED'::character varying]::text[]))";
    expect(runner.extractStatusValues(definition)).toEqual(['CLOSED', 'OPEN']);
    expect(runner.stableJson({ b: 1, a: ['x'] })).toBe('{"a":["x"],"b":1}');
    expect(runner.evidenceFingerprint({ b: 1, a: ['x'] }))
      .toBe(runner.evidenceFingerprint({ a: ['x'], b: 1 }));
  });

  it('defines one canonical expected shape for profile organization ownership', () => {
    expect(runner.PROFILE_ORGANIZATION_STATE).toEqual([
      {
        table: 'producers',
        constraint: 'producers_organization_id_fkey',
        index: 'idx_producers_organization_id'
      },
      {
        table: 'certifiers',
        constraint: 'certifiers_organization_id_fkey',
        index: 'idx_certifiers_organization_id'
      }
    ]);
  });

  it('defines one canonical expected shape for C3a derived tenancy', () => {
    expect(runner.DERIVED_TENANCY_STATE.columns).toEqual([
      { table: 'investigations', column: 'unit_code_id' },
      { table: 'lab_results', column: 'submitted_by_organization_id' },
      { table: 'lots', column: 'assigned_laboratory_organization_id' }
    ]);
    expect(runner.DERIVED_TENANCY_STATE.constraints.map((constraint: { name: string }) => constraint.name))
      .toEqual([
        'budgets_id_producer_id_key',
        'lots_budget_id_producer_id_fkey',
        'investigations_unit_code_id_fkey',
        'lab_results_submitted_by_organization_id_fkey',
        'lots_assigned_laboratory_organization_id_fkey'
      ]);
    expect(runner.DERIVED_TENANCY_STATE.indexes.map((index: { name: string }) => index.name))
      .toEqual([
        'idx_investigations_unit_code_id',
        'idx_lab_results_submitted_by_organization_id',
        'idx_lots_assigned_laboratory_organization_id'
      ]);
  });

  it('defines one canonical expected shape for C3c tightening', () => {
    expect(runner.TENANCY_TIGHTENING_STATE).toEqual({
      columns: [
        { table: 'producers', column: 'organization_id', notNull: true },
        { table: 'certifiers', column: 'organization_id', notNull: false },
        { table: 'investigations', column: 'unit_code_id', notNull: true },
        { table: 'lab_results', column: 'submitted_by_organization_id', notNull: false },
        { table: 'lots', column: 'assigned_laboratory_organization_id', notNull: false }
      ],
      index: {
        table: 'investigations',
        name: 'idx_investigations_unit_code_id',
        columns: ['unit_code_id']
      },
      orphan: {
        id: '00000000-0000-0000-0000-000000000003',
        activeStatus: 'ACTIVE',
        quarantinedStatus: 'REVOKED'
      }
    });
  });

  it('defines the certifier NOT NULL successor state', () => {
    expect(runner.CERTIFIER_NOT_NULL_STATE).toEqual({
      column: {
        table: 'certifiers',
        name: 'organization_id'
      },
      temporaryConstraint: 'certifiers_organization_id_not_null',
      orphanId: '00000000-0000-0000-0000-000000000003'
    });
    expect(runner.verify0014).toBeTypeOf('function');
  });
});
