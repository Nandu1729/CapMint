const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOOL_VERSION = '2.0.0';
const LOCK_KEY_1 = 1128353869;
const LOCK_KEY_2 = 1229410872;
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'database/migrations');
const BASELINE_MANIFEST = path.join(ROOT, 'database/baselines/capmint-baseline-20260725.json');
const METADATA_SQL = path.join(ROOT, 'database/schema/migrations_log.sql');
const MIGRATION_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const EXPECTED_INVESTIGATION_STATUSES = [
  'CLOSED',
  'DISMISSED',
  'ESCALATED',
  'OPEN',
  'RESOLVED',
  'REVOKED',
  'UNDER_REVIEW'
];
const OLD_INVESTIGATION_STATUSES = [
  'DISMISSED',
  'OPEN',
  'REVOKED',
  'UNDER_REVIEW'
];
const KNOWN_ORPHAN_CERTIFIER_ID = '00000000-0000-0000-0000-000000000003';
const PROFILE_ORGANIZATION_STATE = [
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
];
const DERIVED_TENANCY_STATE = {
  columns: [
    { table: 'investigations', column: 'unit_code_id' },
    { table: 'lab_results', column: 'submitted_by_organization_id' },
    { table: 'lots', column: 'assigned_laboratory_organization_id' }
  ],
  constraints: [
    {
      table: 'budgets',
      name: 'budgets_id_producer_id_key',
      type: 'u',
      definition: 'UNIQUE (id, producer_id)'
    },
    {
      table: 'lots',
      name: 'lots_budget_id_producer_id_fkey',
      type: 'f',
      definition: 'FOREIGN KEY (budget_id, producer_id) REFERENCES budgets(id, producer_id) ON DELETE RESTRICT'
    },
    {
      table: 'investigations',
      name: 'investigations_unit_code_id_fkey',
      type: 'f',
      definition: 'FOREIGN KEY (unit_code_id) REFERENCES unit_codes(id) ON UPDATE CASCADE ON DELETE RESTRICT'
    },
    {
      table: 'lab_results',
      name: 'lab_results_submitted_by_organization_id_fkey',
      type: 'f',
      definition: 'FOREIGN KEY (submitted_by_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT'
    },
    {
      table: 'lots',
      name: 'lots_assigned_laboratory_organization_id_fkey',
      type: 'f',
      definition: 'FOREIGN KEY (assigned_laboratory_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT'
    }
  ],
  indexes: [
    {
      table: 'investigations',
      name: 'idx_investigations_unit_code_id',
      columns: ['unit_code_id']
    },
    {
      table: 'lab_results',
      name: 'idx_lab_results_submitted_by_organization_id',
      columns: ['submitted_by_organization_id']
    },
    {
      table: 'lots',
      name: 'idx_lots_assigned_laboratory_organization_id',
      columns: ['assigned_laboratory_organization_id']
    }
  ]
};
const TENANCY_TIGHTENING_STATE = {
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
    id: KNOWN_ORPHAN_CERTIFIER_ID,
    activeStatus: 'ACTIVE',
    quarantinedStatus: 'REVOKED'
  }
};
const CERTIFIER_NOT_NULL_STATE = {
  column: {
    table: 'certifiers',
    name: 'organization_id'
  },
  temporaryConstraint: 'certifiers_organization_id_not_null',
  orphanId: KNOWN_ORPHAN_CERTIFIER_ID
};
const CORE_TABLES = [
  'organizations',
  'users',
  'certifiers',
  'producers',
  'plots_or_hive_clusters',
  'budgets',
  'lots',
  'unit_codes',
  'lab_results',
  'scan_events',
  'log_entries',
  'investigations',
  'producer_brandings'
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function evidenceFingerprint(value) {
  return sha256(stableJson(value));
}

function validateMigrationOrdering(migrations) {
  const errors = [];
  const versions = new Map();
  for (const migration of migrations) {
    if (migration.error) errors.push(`${migration.filename}: ${migration.error}`);
    if (migration.version !== null) {
      if (versions.has(migration.version)) {
        errors.push(`Duplicate migration version ${String(migration.version).padStart(4, '0')}: ${versions.get(migration.version)} and ${migration.filename}.`);
      }
      versions.set(migration.version, migration.filename);
    }
  }
  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version >= migrations[index].version) {
      errors.push(`Migration ordering is non-monotonic at ${migrations[index].filename}.`);
    }
  }
  return errors;
}

function loadMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
  const migrations = files.map(filename => {
    const match = filename.match(MIGRATION_PATTERN);
    if (!match) {
      return { filename, version: null, error: 'Filename does not match NNNN_name.sql.' };
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    return {
      filename,
      version: Number(match[1]),
      sql,
      checksum: sha256(sql)
    };
  });

  const errors = validateMigrationOrdering(migrations);
  return { migrations, errors };
}

function loadBaseline() {
  const manifest = JSON.parse(fs.readFileSync(BASELINE_MANIFEST, 'utf8'));
  const sqlPath = path.join(path.dirname(BASELINE_MANIFEST), manifest.filename);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const actualChecksum = sha256(sql);
  const errors = [];
  if (actualChecksum !== manifest.checksum_sha256) {
    errors.push(`Baseline checksum mismatch for ${manifest.filename}: expected ${manifest.checksum_sha256}, found ${actualChecksum}.`);
  }
  if (!Number.isInteger(manifest.schema_cutoff) || !Number.isInteger(manifest.next_migration)) {
    errors.push('Baseline schema_cutoff and next_migration must be integers.');
  } else if (manifest.next_migration !== manifest.schema_cutoff + 1) {
    errors.push('Baseline next_migration must immediately follow schema_cutoff.');
  }
  return { manifest, sql, actualChecksum, errors };
}

function parseArgs(argv) {
  const modes = ['--check', '--plan', '--apply', '--adopt', '--bootstrap'];
  const selected = modes.filter(mode => argv.includes(mode));
  if (selected.length !== 1) {
    throw new Error(`Select exactly one mode: ${modes.join(', ')}.`);
  }
  const mode = selected[0].slice(2);
  const json = argv.includes('--json');
  const filenames = mode === 'adopt'
    ? argv.filter(value => !value.startsWith('--'))
    : [];
  if (mode === 'adopt' && filenames.length === 0) {
    throw new Error('--adopt requires one or more exact migration filenames.');
  }
  const unexpected = argv.filter(value => value.startsWith('--') && !modes.includes(value) && value !== '--json');
  if (unexpected.length > 0) throw new Error(`Unknown option(s): ${unexpected.join(', ')}.`);
  return { mode, json, filenames };
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1)::text AS name', [`public.${tableName}`]);
  return result.rows[0].name !== null;
}

function normalizeDefault(value) {
  if (value === null) return null;
  return value
    .replace(/::character varying/g, '')
    .replace(/::text/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function verify0007(client) {
  if (!(await tableExists(client, 'producer_brandings'))) {
    const evidence = { table: false };
    return { status: 'absent', summary: 'producer_brandings is absent.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }

  const columns = (await client.query(
    `SELECT a.attnum AS position,
            a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = 'producer_brandings'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
     ORDER BY a.attnum`
  )).rows.map(row => ({ ...row, default_expr: normalizeDefault(row.default_expr) }));
  const constraints = (await client.query(
    `SELECT c.conname AS name,
            c.contype AS type,
            c.convalidated AS validated,
            pg_get_constraintdef(c.oid, true) AS definition
     FROM pg_constraint c
     WHERE c.conrelid = 'producer_brandings'::regclass
     ORDER BY c.conname`
  )).rows;
  const indexes = (await client.query(
    `SELECT indexname AS name, indexdef AS definition
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'producer_brandings'
     ORDER BY indexname`
  )).rows;
  const triggers = (await client.query(
    `SELECT t.tgname AS name,
            t.tgenabled AS enabled,
            pg_get_triggerdef(t.oid, true) AS definition
     FROM pg_trigger t
     WHERE t.tgrelid = 'producer_brandings'::regclass
       AND NOT t.tgisinternal
     ORDER BY t.tgname`
  )).rows;
  const functions = (await client.query(
    `SELECT l.lanname AS language, p.prosrc AS source
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
       AND p.proname = 'update_updated_at_column'
       AND pg_get_function_identity_arguments(p.oid) = ''`
  )).rows;

  const expectedColumns = [
    ['producer_id', 'uuid', true, null],
    ['logo_url', 'character varying(512)', false, null],
    ['primary_color', 'character varying(16)', false, "'#10B981'"],
    ['accent_color', 'character varying(16)', false, "'#3B82F6'"],
    ['brand_story', 'text', false, null],
    ['custom_banner_url', 'character varying(512)', false, null],
    ['cta_text', 'character varying(100)', false, null],
    ['cta_link', 'character varying(512)', false, null],
    ['cta_enabled', 'boolean', false, 'false'],
    ['created_at', 'timestamp with time zone', true, 'CURRENT_TIMESTAMP'],
    ['updated_at', 'timestamp with time zone', true, 'CURRENT_TIMESTAMP']
  ];
  const columnErrors = [];
  if (columns.length !== expectedColumns.length) {
    columnErrors.push(`Expected ${expectedColumns.length} columns, found ${columns.length}.`);
  }
  expectedColumns.forEach(([name, type, notNull, defaultExpr], index) => {
    const actual = columns[index];
    if (!actual || actual.name !== name || actual.type !== type || actual.not_null !== notNull || actual.default_expr !== defaultExpr) {
      columnErrors.push(`Column ${name} does not match the expected position/type/nullability/default.`);
    }
  });

  const expectedConstraintDefinitions = new Map([
    ['producer_brandings_pkey', 'PRIMARY KEY (producer_id)'],
    ['producer_brandings_producer_id_fkey', 'FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE CASCADE']
  ]);
  const constraintErrors = [];
  if (constraints.length !== expectedConstraintDefinitions.size) {
    constraintErrors.push(`Expected exactly ${expectedConstraintDefinitions.size} constraints, found ${constraints.length}.`);
  }
  for (const [name, definition] of expectedConstraintDefinitions) {
    const actual = constraints.find(row => row.name === name);
    if (!actual || actual.definition !== definition || !actual.validated) {
      constraintErrors.push(`Constraint ${name} is missing, unvalidated, or incompatible.`);
    }
  }
  const primaryIndex = indexes.find(index => index.name === 'producer_brandings_pkey');
  if (!primaryIndex || !/UNIQUE INDEX .* USING btree \(producer_id\)$/.test(primaryIndex.definition)) {
    constraintErrors.push('Expected producer_brandings primary-key index is missing or incompatible.');
  }

  const functionExact = functions.length === 1
    && functions[0].language === 'plpgsql'
    && /NEW\.updated_at\s*=\s*CURRENT_TIMESTAMP/i.test(functions[0].source)
    && /RETURN\s+NEW/i.test(functions[0].source);
  const triggerExact = triggers.length === 1
    && triggers[0].name === 'trigger_update_producer_brandings_updated_at'
    && triggers[0].enabled === 'O'
    && /BEFORE UPDATE ON producer_brandings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column\(\)$/.test(triggers[0].definition);

  const evidence = { columns, constraints, indexes, triggers, functions };
  const incompatible = columnErrors.concat(constraintErrors);
  if (incompatible.length > 0) {
    return {
      status: 'incompatible',
      summary: incompatible.join(' '),
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }
  if (!functionExact || !triggerExact) {
    const missing = [];
    if (!functionExact) missing.push('update function');
    if (!triggerExact) missing.push('enabled branding trigger');
    return {
      status: 'repairable',
      summary: `Exact table shape exists, but the ${missing.join(' and ')} is missing or incompatible.`,
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }
  return {
    status: 'exact',
    summary: 'producer_brandings table, constraints, index, function, and enabled trigger are exact.',
    evidence,
    fingerprint: evidenceFingerprint(evidence)
  };
}

function extractStatusValues(definition) {
  const values = [];
  for (const match of definition.matchAll(/'([A-Z_]+)'/g)) values.push(match[1]);
  return [...new Set(values)].sort();
}

async function verify0009(client) {
  if (!(await tableExists(client, 'investigations'))) {
    const evidence = { table: false };
    return { status: 'incompatible', summary: 'investigations is absent.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }
  const columnResult = await client.query(
    `SELECT a.attnum AS position,
            format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS not_null
     FROM pg_attribute a
     WHERE a.attrelid = 'investigations'::regclass
       AND a.attname = 'status'
       AND NOT a.attisdropped`
  );
  if (columnResult.rowCount !== 1 || columnResult.rows[0].type !== 'character varying(32)' || !columnResult.rows[0].not_null) {
    const evidence = { status_column: columnResult.rows };
    return { status: 'incompatible', summary: 'investigations.status is missing or incompatible.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }
  const position = columnResult.rows[0].position;
  const constraints = (await client.query(
    `SELECT c.conname AS name,
            c.convalidated AS validated,
            pg_get_constraintdef(c.oid, true) AS definition
     FROM pg_constraint c
     WHERE c.conrelid = 'investigations'::regclass
       AND c.contype = 'c'
       AND c.conkey @> ARRAY[$1::smallint]
     ORDER BY c.conname`,
    [position]
  )).rows.map(row => ({ ...row, values: extractStatusValues(row.definition) }));
  const violatingRows = Number((await client.query(
    `SELECT count(*)::int AS count
     FROM investigations
     WHERE status <> ALL($1::text[])`,
    [EXPECTED_INVESTIGATION_STATUSES]
  )).rows[0].count);
  const evidence = { status_column: columnResult.rows[0], constraints, violating_rows: violatingRows };

  if (constraints.length > 1) {
    return { status: 'incompatible', summary: 'Multiple status constraints create ambiguous or contradictory behavior.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }
  if (violatingRows > 0) {
    return { status: 'incompatible', summary: `${violatingRows} investigation row(s) use unsupported status values.`, evidence, fingerprint: evidenceFingerprint(evidence) };
  }
  if (constraints.length === 0) {
    return { status: 'repairable', summary: 'The investigations status constraint is missing.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }

  const constraint = constraints[0];
  const valuesExact = stableJson(constraint.values) === stableJson(EXPECTED_INVESTIGATION_STATUSES);
  if (valuesExact && constraint.name === 'chk_investigations_status' && constraint.validated) {
    return { status: 'exact', summary: 'The validated investigations status constraint has the exact intended status set.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }
  const oldValues = stableJson(constraint.values) === stableJson(OLD_INVESTIGATION_STATUSES);
  if (oldValues || valuesExact) {
    return { status: 'repairable', summary: 'The investigations constraint is a supported old or unvalidated state.', evidence, fingerprint: evidenceFingerprint(evidence) };
  }
  return { status: 'incompatible', summary: `Unexpected investigation status set: ${constraint.values.join(', ')}.`, evidence, fingerprint: evidenceFingerprint(evidence) };
}

async function readProfileOrganizationState(client, expected) {
  const columnResult = await client.query(
    `SELECT a.attnum AS position,
            format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d
       ON d.adrelid = a.attrelid
      AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass
       AND a.attname = 'organization_id'
       AND NOT a.attisdropped`,
    [expected.table]
  );
  const column = columnResult.rows[0] || null;
  const constraints = column
    ? (await client.query(
        `SELECT c.conname AS name,
                c.contype AS type,
                c.convalidated AS validated,
                pg_get_constraintdef(c.oid, true) AS definition
         FROM pg_constraint c
         WHERE c.conrelid = $1::regclass
           AND c.contype = 'f'
           AND c.conkey @> ARRAY[$2::smallint]
         ORDER BY c.conname`,
        [expected.table, column.position]
      )).rows
    : [];
  const indexes = (await client.query(
    `SELECT index_relation.relname AS name,
            table_relation.relname AS table_name,
            access_method.amname AS access_method,
            index_state.indisunique AS unique,
            index_state.indisvalid AS valid,
            index_state.indisready AS ready,
            index_state.indpred IS NULL AS unfiltered,
            index_state.indexprs IS NULL AS plain_columns,
            index_state.indnkeyatts AS key_columns,
            index_state.indnatts AS total_columns,
            ARRAY(
              SELECT pg_get_indexdef(index_state.indexrelid, position, true)
              FROM generate_series(1, index_state.indnatts) AS position
              ORDER BY position
            ) AS columns
     FROM pg_class index_relation
     JOIN pg_namespace namespace
       ON namespace.oid = index_relation.relnamespace
     JOIN pg_index index_state
       ON index_state.indexrelid = index_relation.oid
     JOIN pg_class table_relation
       ON table_relation.oid = index_state.indrelid
     JOIN pg_am access_method
       ON access_method.oid = index_relation.relam
     WHERE namespace.nspname = 'public'
       AND index_relation.relname = $1`,
    [expected.index]
  )).rows;
  return { column, constraints, indexes };
}

async function verify0011(client) {
  const evidence = {};
  for (const expected of PROFILE_ORGANIZATION_STATE) {
    if (!(await tableExists(client, expected.table))) {
      evidence[expected.table] = { table: false, column: null, constraints: [], indexes: [] };
      continue;
    }
    evidence[expected.table] = {
      table: true,
      ...(await readProfileOrganizationState(client, expected))
    };
  }

  const completelyAbsent = PROFILE_ORGANIZATION_STATE.every(expected => {
    const actual = evidence[expected.table];
    return actual.table && actual.column === null && actual.constraints.length === 0 && actual.indexes.length === 0;
  });
  if (completelyAbsent) {
    return {
      status: 'absent',
      summary: 'Profile organization columns, foreign keys, and indexes are absent.',
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }

  const ownershipShapeExact = PROFILE_ORGANIZATION_STATE.every(expected => {
    const actual = evidence[expected.table];
    if (!actual.table
      || !actual.column
      || actual.column.type !== 'uuid'
      || actual.column.default_expr !== null
      || actual.constraints.length !== 1
      || actual.indexes.length !== 1) {
      return false;
    }
    const constraint = actual.constraints[0];
    const index = actual.indexes[0];
    return constraint.name === expected.constraint
      && constraint.type === 'f'
      && constraint.validated
      && constraint.definition === 'FOREIGN KEY (organization_id) REFERENCES organizations(id)'
      && index.name === expected.index
      && index.table_name === expected.table
      && index.access_method === 'btree'
      && !index.unique
      && index.valid
      && index.ready
      && index.unfiltered
      && index.plain_columns
      && Number(index.key_columns) === 1
      && Number(index.total_columns) === 1
      && stableJson(index.columns) === stableJson(['organization_id']);
  });
  const producerNullable = evidence.producers.column && !evidence.producers.column.not_null;
  const certifierNullable = evidence.certifiers.column && !evidence.certifiers.column.not_null;
  const tighteningEvidence = ownershipShapeExact && !producerNullable
    ? await readTenancyTighteningEvidence(client)
    : null;
  const successorExact = tighteningEvidence
    ? tenancyTighteningSchemaExact(tighteningEvidence)
    : false;
  const certifierSuccessorEvidence = tighteningEvidence && !certifierNullable
    ? await readCertifierNotNullEvidence(client, tighteningEvidence)
    : null;
  const certifierSuccessorExact = certifierSuccessorEvidence
    ? certifierSuccessorEvidence.data.migration_recorded
      && certifierNotNullExact(certifierSuccessorEvidence)
    : false;
  if (ownershipShapeExact
    && ((certifierNullable && (producerNullable || successorExact)) || certifierSuccessorExact)) {
    const resultEvidence = certifierSuccessorExact
      ? { ownership: evidence, successor: certifierSuccessorEvidence }
      : evidence;
    return {
      status: 'exact',
      summary: certifierSuccessorExact
        ? 'Profile organization ownership is exact with the recorded 0014 certifier tightening.'
        : successorExact
          ? 'Profile organization ownership is exact with the approved 0013 producer tightening.'
        : 'Nullable profile organization columns, validated foreign keys, and indexes are exact.',
      evidence: resultEvidence,
      fingerprint: evidenceFingerprint(resultEvidence)
    };
  }
  return {
    status: 'incompatible',
    summary: 'Profile organization ownership is partially present or incompatible.',
    evidence,
    fingerprint: evidenceFingerprint(evidence)
  };
}

async function readDerivedTenancyColumn(client, expected) {
  const result = await client.query(
    `SELECT format_type(attribute.atttypid, attribute.atttypmod) AS type,
            attribute.attnotnull AS not_null,
            pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
     FROM pg_attribute AS attribute
     LEFT JOIN pg_attrdef AS attribute_default
       ON attribute_default.adrelid = attribute.attrelid
      AND attribute_default.adnum = attribute.attnum
     WHERE attribute.attrelid = $1::regclass
       AND attribute.attname = $2
       AND NOT attribute.attisdropped`,
    [expected.table, expected.column]
  );
  return result.rows[0] || null;
}

async function readDerivedTenancyConstraint(client, expected) {
  const result = await client.query(
    `SELECT table_relation.relname AS table_name,
            constraint_record.contype AS type,
            constraint_record.convalidated AS validated,
            pg_get_constraintdef(constraint_record.oid, true) AS definition
     FROM pg_constraint AS constraint_record
     JOIN pg_class AS table_relation
       ON table_relation.oid = constraint_record.conrelid
     JOIN pg_namespace AS namespace
       ON namespace.oid = table_relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND constraint_record.conname = $1`,
    [expected.name]
  );
  return result.rows;
}

async function readDerivedTenancyIndex(client, expected) {
  return (await client.query(
    `SELECT table_relation.relname AS table_name,
            access_method.amname AS access_method,
            index_state.indisunique AS unique,
            index_state.indisvalid AS valid,
            index_state.indisready AS ready,
            index_state.indpred IS NULL AS unfiltered,
            index_state.indexprs IS NULL AS plain_columns,
            index_state.indnkeyatts AS key_columns,
            index_state.indnatts AS total_columns,
            ARRAY(
              SELECT pg_get_indexdef(index_state.indexrelid, position, true)
              FROM generate_series(1, index_state.indnatts) AS position
              ORDER BY position
            ) AS columns
     FROM pg_class AS index_relation
     JOIN pg_namespace AS namespace
       ON namespace.oid = index_relation.relnamespace
     JOIN pg_index AS index_state
       ON index_state.indexrelid = index_relation.oid
     JOIN pg_class AS table_relation
       ON table_relation.oid = index_state.indrelid
     JOIN pg_am AS access_method
       ON access_method.oid = index_relation.relam
     WHERE namespace.nspname = 'public'
       AND index_relation.relname = $1`,
    [expected.name]
  )).rows;
}

async function readTenancyTighteningEvidence(client) {
  const evidence = {
    columns: {},
    index: [],
    data: {
      certifier_count: null,
      certifier_orphans: null,
      known_orphan_rows: null,
      known_orphan_status: null,
      known_orphan_budget_references: null,
      migration_recorded: false
    }
  };

  for (const expected of TENANCY_TIGHTENING_STATE.columns) {
    const key = `${expected.table}.${expected.column}`;
    if (!(await tableExists(client, expected.table))) {
      evidence.columns[key] = { table: false, column: null };
      continue;
    }
    evidence.columns[key] = {
      table: true,
      column: await readDerivedTenancyColumn(client, expected)
    };
  }

  evidence.index = await readDerivedTenancyIndex(client, TENANCY_TIGHTENING_STATE.index);

  if (await tableExists(client, 'certifiers')) {
    const certifierOrganizationColumn = evidence.columns['certifiers.organization_id'].column;
    const orphanExpression = certifierOrganizationColumn
      ? 'count(*) FILTER (WHERE organization_id IS NULL)::int'
      : 'NULL::int';
    evidence.data = (await client.query(
      `SELECT
         count(*)::int AS certifier_count,
         ${orphanExpression} AS certifier_orphans,
         count(*) FILTER (WHERE id = $1)::int AS known_orphan_rows,
         max(key_status) FILTER (WHERE id = $1) AS known_orphan_status,
         (SELECT count(*)::int
          FROM budgets
          WHERE certifier_id = $1) AS known_orphan_budget_references
       FROM certifiers`,
      [KNOWN_ORPHAN_CERTIFIER_ID]
    )).rows[0];
    if (await tableExists(client, 'migrations_log')) {
      evidence.data.migration_recorded = (await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM migrations_log
           WHERE filename = '0013_tighten_tenant_constraints.sql'
         ) AS recorded`
      )).rows[0].recorded;
    }
  }

  return evidence;
}

function tenancyTighteningSchemaExact(evidence, certifierNotNull = false) {
  const columnsExact = TENANCY_TIGHTENING_STATE.columns.every(expected => {
    const actual = evidence.columns[`${expected.table}.${expected.column}`];
    const expectedNotNull = expected.table === 'certifiers'
      ? certifierNotNull
      : expected.notNull;
    return actual
      && actual.table
      && actual.column
      && actual.column.type === 'uuid'
      && actual.column.not_null === expectedNotNull
      && actual.column.default_expr === null;
  });
  if (!columnsExact || evidence.index.length !== 1) return false;
  const index = evidence.index[0];
  return index.table_name === TENANCY_TIGHTENING_STATE.index.table
    && index.access_method === 'btree'
    && index.unique
    && index.valid
    && index.ready
    && index.unfiltered
    && index.plain_columns
    && Number(index.key_columns) === 1
    && Number(index.total_columns) === 1
    && stableJson(index.columns) === stableJson(TENANCY_TIGHTENING_STATE.index.columns);
}

function tenancyTighteningOrphanExact(evidence) {
  const data = evidence.data;
  if (Number(data.certifier_count) === 0) {
    return Number(data.known_orphan_rows) === 0
      && Number(data.known_orphan_budget_references) === 0;
  }
  if (Number(data.certifier_orphans) === 0 && Number(data.known_orphan_rows) === 0) {
    return data.migration_recorded;
  }
  return Number(data.certifier_orphans) === 1
    && Number(data.known_orphan_rows) === 1
    && data.known_orphan_status === TENANCY_TIGHTENING_STATE.orphan.quarantinedStatus
    && Number(data.known_orphan_budget_references) === 0;
}

function tenancyTighteningEffectsAbsent(evidence) {
  const producer = evidence.columns['producers.organization_id'];
  const investigation = evidence.columns['investigations.unit_code_id'];
  const noTightenedColumns = (!producer || !producer.column || !producer.column.not_null)
    && (!investigation || !investigation.column || !investigation.column.not_null);
  const noUniqueIndex = evidence.index.length === 0
    || (evidence.index.length === 1 && !evidence.index[0].unique);
  const data = evidence.data;
  const noQuarantine = Number(data.certifier_count) === 0
    || (Number(data.known_orphan_rows) === 1
      && data.known_orphan_status === TENANCY_TIGHTENING_STATE.orphan.activeStatus
      && Number(data.known_orphan_budget_references) === 0);
  return noTightenedColumns && noUniqueIndex && noQuarantine;
}

async function readCertifierNotNullEvidence(client, tenancyEvidence = null) {
  const evidence = {
    tenancy: tenancyEvidence || await readTenancyTighteningEvidence(client),
    temporary_constraint: [],
    data: {
      certifier_nulls: null,
      known_orphan_rows: null,
      known_orphan_budget_references: null,
      migration_recorded: false
    }
  };

  if (await tableExists(client, 'certifiers')) {
    evidence.temporary_constraint = (await client.query(
      `SELECT table_relation.relname AS table_name,
              constraint_record.contype AS type,
              constraint_record.convalidated AS validated,
              pg_get_constraintdef(constraint_record.oid, true) AS definition
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS table_relation
         ON table_relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace
         ON namespace.oid = table_relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND constraint_record.conname = $1`,
      [CERTIFIER_NOT_NULL_STATE.temporaryConstraint]
    )).rows;
  }

  if (await tableExists(client, 'certifiers')) {
    const certifierOrganizationColumn =
      evidence.tenancy.columns['certifiers.organization_id']?.column;
    const certifierNullExpression = certifierOrganizationColumn
      ? 'count(*) FILTER (WHERE organization_id IS NULL)::int'
      : 'NULL::int';
    evidence.data = (await client.query(
      `SELECT
         ${certifierNullExpression} AS certifier_nulls,
         count(*) FILTER (WHERE id = $1)::int AS known_orphan_rows,
         (SELECT count(*)::int
          FROM budgets
          WHERE certifier_id = $1) AS known_orphan_budget_references
       FROM certifiers`,
      [CERTIFIER_NOT_NULL_STATE.orphanId]
    )).rows[0];
    evidence.data.migration_recorded = false;
    if (await tableExists(client, 'migrations_log')) {
      evidence.data.migration_recorded = (await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM migrations_log
           WHERE filename = '0014_tighten_certifier_organization_id.sql'
         ) AS recorded`
      )).rows[0].recorded;
    }
  }

  return evidence;
}

function certifierNotNullExact(evidence) {
  return tenancyTighteningSchemaExact(evidence.tenancy, true)
    && evidence.temporary_constraint.length === 0
    && Number(evidence.data.certifier_nulls) === 0
    && Number(evidence.data.known_orphan_rows) === 0
    && Number(evidence.data.known_orphan_budget_references) === 0;
}

function certifierNotNullEffectsAbsent(evidence) {
  const certifierColumn =
    evidence.tenancy.columns['certifiers.organization_id']?.column;
  if (evidence.temporary_constraint.length !== 0) return false;
  if (!certifierColumn) return true;
  if (certifierColumn.not_null) return false;
  return tenancyTighteningEffectsAbsent(evidence.tenancy)
    || (tenancyTighteningSchemaExact(evidence.tenancy)
      && tenancyTighteningOrphanExact(evidence.tenancy));
}

async function verify0014(client) {
  const evidence = await readCertifierNotNullEvidence(client);

  if (certifierNotNullExact(evidence)) {
    return {
      status: 'exact',
      summary: 'Certifier organization ownership is mandatory and the approved zero-reference orphan is absent.',
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }

  if (certifierNotNullEffectsAbsent(evidence)) {
    return {
      status: 'absent',
      summary: 'Certifier organization ownership remains nullable and the approved 0013 orphan state is intact.',
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }

  return {
    status: 'incompatible',
    summary: 'Certifier NOT NULL enforcement or approved orphan deletion is partially present or incompatible.',
    evidence,
    fingerprint: evidenceFingerprint(evidence)
  };
}

async function verify0013(client) {
  const evidence = await readTenancyTighteningEvidence(client);

  if (tenancyTighteningSchemaExact(evidence) && tenancyTighteningOrphanExact(evidence)) {
    return {
      status: 'exact',
      summary: 'C3c producer/investigation constraints, unique provenance index, and orphan quarantine are exact.',
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }

  const successorEvidence = await readCertifierNotNullEvidence(client, evidence);
  if (successorEvidence.data.migration_recorded && certifierNotNullExact(successorEvidence)) {
    return {
      status: 'exact',
      summary: 'C3c constraints remain exact with the recorded 0014 certifier tightening and orphan deletion.',
      evidence: successorEvidence,
      fingerprint: evidenceFingerprint(successorEvidence)
    };
  }

  if (tenancyTighteningEffectsAbsent(evidence)) {
    return {
      status: 'absent',
      summary: 'C3c tightening and orphan quarantine effects are absent.',
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }

  return {
    status: 'incompatible',
    summary: 'C3c tightening or orphan quarantine is partially present or incompatible.',
    evidence,
    fingerprint: evidenceFingerprint(evidence)
  };
}

async function verify0012(client) {
  const evidence = {
    columns: {},
    constraints: {},
    indexes: {},
    data: null
  };

  for (const expected of DERIVED_TENANCY_STATE.columns) {
    if (!(await tableExists(client, expected.table))) {
      evidence.columns[`${expected.table}.${expected.column}`] = { table: false, column: null };
      continue;
    }
    evidence.columns[`${expected.table}.${expected.column}`] = {
      table: true,
      column: await readDerivedTenancyColumn(client, expected)
    };
  }
  for (const expected of DERIVED_TENANCY_STATE.constraints) {
    evidence.constraints[expected.name] = await readDerivedTenancyConstraint(client, expected);
  }
  for (const expected of DERIVED_TENANCY_STATE.indexes) {
    evidence.indexes[expected.name] = await readDerivedTenancyIndex(client, expected);
  }

  const completelyAbsent = DERIVED_TENANCY_STATE.columns.every(expected => {
    const actual = evidence.columns[`${expected.table}.${expected.column}`];
    return actual.table && actual.column === null;
  })
    && DERIVED_TENANCY_STATE.constraints.every(expected => evidence.constraints[expected.name].length === 0)
    && DERIVED_TENANCY_STATE.indexes.every(expected => evidence.indexes[expected.name].length === 0);
  if (completelyAbsent) {
    return {
      status: 'absent',
      summary: 'C3a relationship columns, constraints, and indexes are absent.',
      evidence,
      fingerprint: evidenceFingerprint(evidence)
    };
  }

  const nullableColumnsExact = DERIVED_TENANCY_STATE.columns.every(expected => {
    const actual = evidence.columns[`${expected.table}.${expected.column}`];
    return actual.table
      && actual.column
      && actual.column.type === 'uuid'
      && !actual.column.not_null
      && actual.column.default_expr === null;
  });
  const constraintsExact = DERIVED_TENANCY_STATE.constraints.every(expected => {
    const rows = evidence.constraints[expected.name];
    return rows.length === 1
      && rows[0].table_name === expected.table
      && rows[0].type === expected.type
      && rows[0].validated
      && rows[0].definition === expected.definition;
  });
  const plainIndexesExact = DERIVED_TENANCY_STATE.indexes.every(expected => {
    const rows = evidence.indexes[expected.name];
    if (rows.length !== 1) return false;
    const actual = rows[0];
    return actual.table_name === expected.table
      && actual.access_method === 'btree'
      && !actual.unique
      && actual.valid
      && actual.ready
      && actual.unfiltered
      && actual.plain_columns
      && Number(actual.key_columns) === expected.columns.length
      && Number(actual.total_columns) === expected.columns.length
      && stableJson(actual.columns) === stableJson(expected.columns);
  });
  const tighteningEvidence = (!nullableColumnsExact || !plainIndexesExact)
    ? await readTenancyTighteningEvidence(client)
    : null;
  const successorExact = tighteningEvidence
    ? tenancyTighteningSchemaExact(tighteningEvidence)
    : false;
  const certifierSuccessorEvidence = tighteningEvidence
    ? await readCertifierNotNullEvidence(client, tighteningEvidence)
    : null;
  const certifierSuccessorExact = certifierSuccessorEvidence
    ? certifierSuccessorEvidence.data.migration_recorded
      && certifierNotNullExact(certifierSuccessorEvidence)
    : false;

  if (constraintsExact
    && ((nullableColumnsExact && plainIndexesExact) || successorExact || certifierSuccessorExact)) {
    evidence.data = (await client.query(
      `SELECT
         (SELECT count(*)::int
          FROM lots AS lot
          JOIN budgets AS budget ON budget.id = lot.budget_id
          WHERE lot.producer_id <> budget.producer_id) AS lot_budget_producer_mismatches,
         (SELECT count(*)::int
          FROM investigations AS investigation
          LEFT JOIN unit_codes AS unit_code ON unit_code.id = investigation.unit_code_id
          WHERE investigation.unit_code_id IS NULL
             OR unit_code.public_identifier IS DISTINCT FROM investigation.public_identifier) AS investigation_link_mismatches`
    )).rows[0];

    if (Number(evidence.data.lot_budget_producer_mismatches) === 0
      && Number(evidence.data.investigation_link_mismatches) === 0) {
      const resultEvidence = certifierSuccessorExact
        ? { relationships: evidence, successor: certifierSuccessorEvidence }
        : evidence;
      return {
        status: 'exact',
        summary: certifierSuccessorExact
          ? 'C3a relationships remain exact with the recorded 0014 certifier tightening.'
          : successorExact
            ? 'C3a relationships remain exact with the approved 0013 investigation tightening.'
          : 'C3a nullable relationship columns, validated constraints, plain indexes, and deterministic links are exact.',
        evidence: resultEvidence,
        fingerprint: evidenceFingerprint(resultEvidence)
      };
    }
  }

  return {
    status: 'incompatible',
    summary: 'C3a relationship ownership is partially present, incompatible, or contains data drift.',
    evidence,
    fingerprint: evidenceFingerprint(evidence)
  };
}

const STATE_VERIFIERS = new Map([
  ['0007_add_producer_brandings_table.sql', verify0007],
  ['0009_widen_investigations_status_check.sql', verify0009],
  ['0011_add_profile_organization_id.sql', verify0011],
  ['0012_add_derived_tenant_relationships.sql', verify0012],
  ['0013_tighten_tenant_constraints.sql', verify0013],
  ['0014_tighten_certifier_organization_id.sql', verify0014]
]);

async function readMetadata(client) {
  if (!(await tableExists(client, 'migrations_log'))) {
    return { exists: false, rows: [], columns: [] };
  }
  const columns = (await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'migrations_log'
     ORDER BY ordinal_position`
  )).rows.map(row => row.column_name);
  const rows = (await client.query('SELECT to_jsonb(migrations_log.*) AS row FROM migrations_log ORDER BY filename'))
    .rows.map(item => item.row);
  return { exists: true, rows, columns };
}

async function readLockState(client) {
  const result = await client.query(
    `SELECT count(*)::int AS count
     FROM pg_locks
     WHERE locktype = 'advisory'
       AND classid = $1::oid
       AND objid = $2::oid
       AND granted`,
    [LOCK_KEY_1, LOCK_KEY_2]
  );
  return Number(result.rows[0].count);
}

async function coreObjectState(client) {
  const result = await client.query(
    `SELECT c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relname = ANY($1::text[])
     ORDER BY c.relname`,
    [CORE_TABLES]
  );
  return result.rows.map(row => row.name);
}

async function publicObjectState(client) {
  const result = await client.query(
    `SELECT object_name
     FROM (
       SELECT 'relation:' || c.relname AS object_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
       UNION ALL
       SELECT 'function:' || p.oid::regprocedure::text AS object_name
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
     ) objects
     ORDER BY object_name`
  );
  return result.rows.map(row => row.object_name);
}

function metadataRowMap(metadata) {
  return new Map(metadata.rows.map(row => [row.filename, row]));
}

async function inspect(client) {
  const migrationSet = loadMigrations();
  const baseline = loadBaseline();
  const metadata = await readMetadata(client);
  const rowMap = metadataRowMap(metadata);
  const coreObjects = await coreObjectState(client);
  const lockCount = await readLockState(client);
  const errors = [...migrationSet.errors, ...baseline.errors];
  const warnings = [];
  const actions = [];
  const states = {};

  if (coreObjects.length > 0 && metadata.rows.length === 0) {
    errors.push('CapMint core objects exist without migration history; normal apply is refused. Use an approved state-reconciliation procedure.');
  }

  const baselineRows = metadata.rows.filter(row => row.application_mode === 'BASELINE');
  let baselineCutoff = 0;
  if (baselineRows.length > 1) {
    errors.push('Multiple BASELINE records exist.');
  } else if (baselineRows.length === 1) {
    const row = baselineRows[0];
    baselineCutoff = Number(row.baseline_cutoff || 0);
    if (row.baseline_identifier !== baseline.manifest.identifier
      || row.checksum_sha256 !== baseline.actualChecksum
      || baselineCutoff !== baseline.manifest.schema_cutoff
      || Number(row.baseline_next_migration) !== baseline.manifest.next_migration) {
      errors.push('Stored BASELINE metadata does not match the immutable baseline manifest.');
    }
  }

  for (const [filename, verifier] of STATE_VERIFIERS) {
    states[filename] = await verifier(client);
  }

  const fileNames = new Set(migrationSet.migrations.map(migration => migration.filename));
  for (const row of metadata.rows) {
    if (row.application_mode === 'BASELINE') continue;
    if (!fileNames.has(row.filename)) {
      errors.push(`Logged migration file is missing: ${row.filename}.`);
      continue;
    }
    if (row.checksum_sha256) {
      const migration = migrationSet.migrations.find(item => item.filename === row.filename);
      if (migration.checksum !== row.checksum_sha256) {
        errors.push(`Checksum mismatch for ${row.filename}: stored ${row.checksum_sha256}, current ${migration.checksum}.`);
      }
    } else {
      warnings.push(`${row.filename} is LEGACY or otherwise lacks a verifiable checksum.`);
    }
  }

  if (coreObjects.length === 0 && baselineRows.length === 0) {
    actions.push({ action: 'BOOTSTRAP', target: baseline.manifest.filename, reason: 'No CapMint core tables exist.' });
  } else {
    for (const migration of migrationSet.migrations) {
      if (migration.version <= baselineCutoff) {
        actions.push({ action: 'NO_OP', target: migration.filename, reason: `Covered by baseline cutoff ${String(baselineCutoff).padStart(4, '0')}.` });
        continue;
      }
      const row = rowMap.get(migration.filename);
      const state = states[migration.filename];
      if (row) {
        if (state && state.status !== 'exact') {
          const reconciliationPending = migrationSet.migrations.some(item =>
            item.version > migration.version
            && /reconcile/.test(item.filename)
            && !rowMap.has(item.filename)
          );
          actions.push({
            action: reconciliationPending && state.status === 'repairable' ? 'RECONCILE' : 'BLOCK',
            target: migration.filename,
            reason: state.summary
          });
          if (!reconciliationPending || state.status === 'incompatible') errors.push(`${migration.filename} drift: ${state.summary}`);
        } else {
          actions.push({ action: 'NO_OP', target: migration.filename, reason: 'Recorded and state-compatible.' });
        }
        continue;
      }
      if (state?.status === 'exact') {
        actions.push({ action: 'ADOPT', target: migration.filename, reason: state.summary });
      } else if (state?.status === 'incompatible') {
        actions.push({ action: 'BLOCK', target: migration.filename, reason: state.summary });
        errors.push(`${migration.filename} incompatible state: ${state.summary}`);
      } else if (state?.status === 'repairable') {
        actions.push({ action: 'RECONCILE', target: migration.filename, reason: state.summary });
      } else {
        actions.push({
          action: /reconcile/.test(migration.filename) ? 'RECONCILE' : 'EXECUTE',
          target: migration.filename,
          reason: state?.summary || 'Pending forward migration.'
        });
      }
    }
  }

  const unsafeActions = actions.filter(item => ['BOOTSTRAP', 'ADOPT', 'EXECUTE', 'RECONCILE', 'BLOCK'].includes(item.action));
  return {
    tool_version: TOOL_VERSION,
    database: (await client.query('SELECT current_database() AS name')).rows[0].name,
    lock: { held: lockCount > 0, holders: lockCount },
    metadata: {
      exists: metadata.exists,
      columns: metadata.columns,
      baseline: baselineRows,
      legacy_without_checksums: warnings.length
    },
    baseline: {
      identifier: baseline.manifest.identifier,
      filename: baseline.manifest.filename,
      checksum_sha256: baseline.actualChecksum,
      schema_cutoff: baseline.manifest.schema_cutoff,
      next_migration: baseline.manifest.next_migration
    },
    core_objects: coreObjects,
    states,
    actions,
    warnings,
    errors,
    safe: errors.length === 0 && unsafeActions.length === 0
  };
}

function formatReport(report, mode) {
  const lines = [
    `CapMint migration ${mode} (${report.tool_version})`,
    `Database: ${report.database}`,
    `Migration lock: ${report.lock.held ? `held by ${report.lock.holders} session(s)` : 'free'}`,
    `Baseline: ${report.baseline.identifier} (cutoff ${String(report.baseline.schema_cutoff).padStart(4, '0')}, next ${String(report.baseline.next_migration).padStart(4, '0')})`
  ];
  for (const action of report.actions) lines.push(`${action.action.padEnd(9)} ${action.target}: ${action.reason}`);
  for (const warning of report.warnings) lines.push(`WARNING   ${warning}`);
  for (const error of report.errors) lines.push(`ERROR     ${error}`);
  lines.push(`Result: ${report.safe ? 'SAFE / NO PENDING ACTIONS' : 'ACTION OR REMEDIATION REQUIRED'}`);
  return lines.join('\n');
}

async function acquireLock(client) {
  const result = await client.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', [LOCK_KEY_1, LOCK_KEY_2]);
  if (!result.rows[0].acquired) throw new Error('Migration advisory lock is already held by another session.');
}

async function releaseLock(client) {
  await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_KEY_1, LOCK_KEY_2]);
}

async function ensureMetadata(client) {
  const sql = fs.readFileSync(METADATA_SQL, 'utf8');
  await client.query(sql);
}

async function recordMigration(client, migration, mode, fingerprint = null) {
  await client.query(
    `INSERT INTO migrations_log
       (filename, checksum_sha256, application_mode, evidence_fingerprint, applied_tool_version)
     VALUES ($1, $2, $3, $4, $5)`,
    [migration.filename, migration.checksum, mode, fingerprint, TOOL_VERSION]
  );
}

async function executeMigration(client, migration) {
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await recordMigration(client, migration, 'EXECUTED');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Migration ${migration.filename} failed and was rolled back: ${error.message}`);
  }
}

function validateApplyReport(report) {
  if (report.errors.length > 0) throw new Error(report.errors.join(' '));
  const adoption = report.actions.filter(action => action.action === 'ADOPT');
  if (adoption.length > 0) {
    throw new Error(`Exact effects are unlogged; adopt explicitly before apply: ${adoption.map(item => item.target).join(', ')}.`);
  }
  const blocked = report.actions.filter(action => action.action === 'BLOCK');
  if (blocked.length > 0) throw new Error(blocked.map(item => `${item.target}: ${item.reason}`).join(' '));
}

async function applyPending(client) {
  let report = await inspect(client);
  validateApplyReport(report);
  await ensureMetadata(client);
  report = await inspect(client);
  validateApplyReport(report);
  const { migrations } = loadMigrations();
  const rows = metadataRowMap(await readMetadata(client));
  const baselineRow = [...rows.values()].find(row => row.application_mode === 'BASELINE');
  const cutoff = Number(baselineRow?.baseline_cutoff || 0);

  for (const migration of migrations) {
    if (migration.version <= cutoff || rows.has(migration.filename)) continue;
    const state = report.states[migration.filename];
    if (state?.status === 'repairable' && migration.filename === '0007_add_producer_brandings_table.sql') {
      throw new Error(`${migration.filename} is partially present and must be repaired by a forward reconciliation migration.`);
    }
    await executeMigration(client, migration);
    rows.set(migration.filename, { filename: migration.filename, application_mode: 'EXECUTED' });
    report = await inspect(client);
    if (report.errors.length > 0) throw new Error(report.errors.join(' '));
  }
  return inspect(client);
}

async function adopt(client, filenames) {
  const { migrations, errors } = loadMigrations();
  if (errors.length > 0) throw new Error(errors.join(' '));
  const migrationMap = new Map(migrations.map(migration => [migration.filename, migration]));
  const uniqueFiles = [...new Set(filenames)];
  for (const filename of uniqueFiles) {
    if (!migrationMap.has(filename)) throw new Error(`Unknown migration filename: ${filename}.`);
    if (!STATE_VERIFIERS.has(filename)) throw new Error(`No deterministic state verifier exists for ${filename}; adoption is refused.`);
  }

  const preflight = await inspect(client);
  if (preflight.errors.length > 0) throw new Error(preflight.errors.join(' '));
  const metadata = await readMetadata(client);
  const rows = metadataRowMap(metadata);
  const verified = new Map();
  const adopted = [];
  const noOps = [];
  for (const filename of uniqueFiles) {
    const migration = migrationMap.get(filename);
    const state = await STATE_VERIFIERS.get(filename)(client);
    if (state.status !== 'exact') {
      throw new Error(`Adoption refused for ${filename}: ${state.summary}`);
    }
    if (rows.has(filename)) {
      const row = rows.get(filename);
      if (row.checksum_sha256 && row.checksum_sha256 !== migration.checksum) {
        throw new Error(`Adoption refused for ${filename}: stored checksum does not match the current file.`);
      }
      noOps.push({ filename, reason: 'Already recorded.' });
      continue;
    }
    verified.set(filename, state);
  }

  if (verified.size > 0) {
    await client.query('BEGIN');
    try {
      await ensureMetadata(client);
      for (const filename of uniqueFiles) {
        if (!verified.has(filename)) continue;
        const migration = migrationMap.get(filename);
        const state = verified.get(filename);
        await recordMigration(client, migration, 'ADOPTED', state.fingerprint);
        adopted.push({ filename, checksum: migration.checksum, evidence_fingerprint: state.fingerprint, summary: state.summary });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return { adopted, no_ops: noOps, report: await inspect(client) };
}

async function bootstrap(client) {
  const publicObjects = await publicObjectState(client);
  if (publicObjects.length > 0) {
    throw new Error(`Bootstrap refused: public schema is not empty (${publicObjects.join(', ')}).`);
  }
  const baseline = loadBaseline();
  if (baseline.errors.length > 0) throw new Error(baseline.errors.join(' '));

  await client.query('BEGIN');
  try {
    await client.query(baseline.sql);
    await ensureMetadata(client);
    await client.query(
      `INSERT INTO migrations_log
         (filename, checksum_sha256, application_mode, baseline_identifier,
          baseline_cutoff, baseline_next_migration, baseline_creation_version,
          applied_tool_version)
       VALUES ($1, $2, 'BASELINE', $3, $4, $5, $6, $7)`,
      [
        baseline.manifest.filename,
        baseline.actualChecksum,
        baseline.manifest.identifier,
        baseline.manifest.schema_cutoff,
        baseline.manifest.next_migration,
        baseline.manifest.creation_version,
        TOOL_VERSION
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Baseline bootstrap failed and was rolled back: ${error.message}`);
  }
  return applyPending(client);
}

async function run(options, dependencies = {}) {
  const connectionString = dependencies.connectionString || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required; no fallback is permitted.');
  const pg = dependencies.pg || await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = dependencies.pool || new Pool({
    connectionString,
    application_name: `capmint-migrations/${TOOL_VERSION}`
  });
  const client = await pool.connect();
  let lockHeld = false;
  try {
    if (options.mode === 'check' || options.mode === 'plan') {
      const report = await inspect(client);
      return { exitCode: report.safe ? 0 : 2, report };
    }

    await acquireLock(client);
    lockHeld = true;
    if (options.mode === 'apply') {
      const report = await applyPending(client);
      return { exitCode: report.safe ? 0 : 2, report };
    }
    if (options.mode === 'adopt') {
      const result = await adopt(client, options.filenames);
      return { exitCode: 0, adoption: result, report: result.report };
    }
    if (options.mode === 'bootstrap') {
      const report = await bootstrap(client);
      return { exitCode: report.safe ? 0 : 2, report };
    }
    throw new Error(`Unsupported mode: ${options.mode}.`);
  } finally {
    if (lockHeld) {
      try {
        await releaseLock(client);
      } catch {
        // Preserve the primary operation result; closing the connection also releases the lock.
      }
    }
    client.release();
    if (!dependencies.pool) await pool.end();
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await run(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    if (result.adoption) {
      for (const item of result.adoption.adopted) {
        process.stdout.write(`ADOPTED ${item.filename}\n  checksum: ${item.checksum}\n  evidence: ${item.evidence_fingerprint}\n  ${item.summary}\n`);
      }
      for (const item of result.adoption.no_ops) process.stdout.write(`NO_OP ${item.filename}: ${item.reason}\n`);
    }
    process.stdout.write(`${formatReport(result.report, options.mode)}\n`);
  }
  return result.exitCode;
}

if (require.main === module) {
  main()
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      console.error(`Migration command failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  EXPECTED_INVESTIGATION_STATUSES,
  LOCK_KEY_1,
  LOCK_KEY_2,
  DERIVED_TENANCY_STATE,
  CERTIFIER_NOT_NULL_STATE,
  PROFILE_ORGANIZATION_STATE,
  TENANCY_TIGHTENING_STATE,
  TOOL_VERSION,
  evidenceFingerprint,
  extractStatusValues,
  loadBaseline,
  loadMigrations,
  main,
  parseArgs,
  run,
  sha256,
  stableJson,
  validateMigrationOrdering,
  verify0007,
  verify0009,
  verify0011,
  verify0012,
  verify0013,
  verify0014
};
