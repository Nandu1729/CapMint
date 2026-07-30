-- 0012: Add nullable relationship columns used to derive tenant ownership.
--
-- This migration does not enable RLS, tighten nullable columns, assign
-- laboratories, or change application authorization by itself. Investigation
-- ownership is backfilled only from an exact public_identifier match.

ALTER TABLE investigations
    ADD COLUMN IF NOT EXISTS unit_code_id UUID;

ALTER TABLE lab_results
    ADD COLUMN IF NOT EXISTS submitted_by_organization_id UUID;

ALTER TABLE lots
    ADD COLUMN IF NOT EXISTS assigned_laboratory_organization_id UUID;

DO $capmint_0012_columns$
DECLARE
    expected RECORD;
    actual RECORD;
BEGIN
    FOR expected IN
        SELECT *
        FROM (VALUES
            ('investigations', 'unit_code_id'),
            ('lab_results', 'submitted_by_organization_id'),
            ('lots', 'assigned_laboratory_organization_id')
        ) AS values_table(table_name, column_name)
    LOOP
        SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
               attribute.attnotnull AS not_null,
               pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
        INTO actual
        FROM pg_attribute AS attribute
        LEFT JOIN pg_attrdef AS attribute_default
          ON attribute_default.adrelid = attribute.attrelid
         AND attribute_default.adnum = attribute.attnum
        WHERE attribute.attrelid = expected.table_name::regclass
          AND attribute.attname = expected.column_name
          AND NOT attribute.attisdropped;

        IF NOT FOUND
           OR actual.data_type <> 'uuid'
           OR actual.not_null
           OR actual.default_expr IS NOT NULL THEN
            RAISE EXCEPTION
                '0012_INCOMPATIBLE_COLUMN: %.% must be nullable UUID without a default',
                expected.table_name,
                expected.column_name;
        END IF;
    END LOOP;
END;
$capmint_0012_columns$;

DO $capmint_0012_budget_support$
DECLARE
    constraint_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(constraint_record.oid, true)
    INTO constraint_definition
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'budgets'::regclass
      AND constraint_record.conname = 'budgets_id_producer_id_key';

    IF NOT FOUND THEN
        ALTER TABLE budgets
            ADD CONSTRAINT budgets_id_producer_id_key
            UNIQUE (id, producer_id);
    ELSIF constraint_definition <> 'UNIQUE (id, producer_id)' THEN
        RAISE EXCEPTION
            '0012_INCOMPATIBLE_BUDGET_UNIQUE_SUPPORT: %',
            constraint_definition;
    END IF;
END;
$capmint_0012_budget_support$;

DO $capmint_0012_data_preflight$
DECLARE
    lot_budget_mismatch_count INTEGER;
    unmatched_investigation_count INTEGER;
    ambiguous_investigation_count INTEGER;
    conflicting_investigation_count INTEGER;
BEGIN
    SELECT count(*)::integer
    INTO lot_budget_mismatch_count
    FROM lots AS lot
    JOIN budgets AS budget
      ON budget.id = lot.budget_id
    WHERE lot.producer_id <> budget.producer_id;

    IF lot_budget_mismatch_count <> 0 THEN
        RAISE EXCEPTION
            '0012_LOT_BUDGET_PRODUCER_DRIFT: % lot row(s) disagree with their budget producer',
            lot_budget_mismatch_count;
    END IF;

    SELECT count(*)::integer
    INTO unmatched_investigation_count
    FROM investigations AS investigation
    WHERE NOT EXISTS (
        SELECT 1
        FROM unit_codes AS unit_code
        WHERE unit_code.public_identifier = investigation.public_identifier
    );

    IF unmatched_investigation_count <> 0 THEN
        RAISE EXCEPTION
            '0012_UNMATCHED_INVESTIGATIONS: % investigation row(s) lack an exact unit-code match',
            unmatched_investigation_count;
    END IF;

    SELECT count(*)::integer
    INTO ambiguous_investigation_count
    FROM investigations AS investigation
    WHERE (
        SELECT count(*)
        FROM unit_codes AS unit_code
        WHERE unit_code.public_identifier = investigation.public_identifier
    ) <> 1;

    IF ambiguous_investigation_count <> 0 THEN
        RAISE EXCEPTION
            '0012_AMBIGUOUS_INVESTIGATIONS: % investigation row(s) do not resolve to exactly one unit code',
            ambiguous_investigation_count;
    END IF;

    SELECT count(*)::integer
    INTO conflicting_investigation_count
    FROM investigations AS investigation
    JOIN unit_codes AS unit_code
      ON unit_code.public_identifier = investigation.public_identifier
    WHERE investigation.unit_code_id IS NOT NULL
      AND investigation.unit_code_id <> unit_code.id;

    IF conflicting_investigation_count <> 0 THEN
        RAISE EXCEPTION
            '0012_CONFLICTING_INVESTIGATION_LINKS: % investigation row(s) have an incompatible unit_code_id',
            conflicting_investigation_count;
    END IF;
END;
$capmint_0012_data_preflight$;

UPDATE investigations AS investigation
SET unit_code_id = unit_code.id
FROM unit_codes AS unit_code
WHERE investigation.unit_code_id IS NULL
  AND unit_code.public_identifier = investigation.public_identifier;

DO $capmint_0012_foreign_keys$
DECLARE
    constraint_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(constraint_record.oid, true)
    INTO constraint_definition
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'lots'::regclass
      AND constraint_record.conname = 'lots_budget_id_producer_id_fkey';

    IF NOT FOUND THEN
        ALTER TABLE lots
            ADD CONSTRAINT lots_budget_id_producer_id_fkey
            FOREIGN KEY (budget_id, producer_id)
            REFERENCES budgets(id, producer_id)
            ON DELETE RESTRICT
            NOT VALID;
    ELSIF constraint_definition <>
          'FOREIGN KEY (budget_id, producer_id) REFERENCES budgets(id, producer_id) ON DELETE RESTRICT' THEN
        RAISE EXCEPTION
            '0012_INCOMPATIBLE_LOT_BUDGET_PRODUCER_FK: %',
            constraint_definition;
    END IF;

    SELECT pg_get_constraintdef(constraint_record.oid, true)
    INTO constraint_definition
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'investigations'::regclass
      AND constraint_record.conname = 'investigations_unit_code_id_fkey';

    IF NOT FOUND THEN
        ALTER TABLE investigations
            ADD CONSTRAINT investigations_unit_code_id_fkey
            FOREIGN KEY (unit_code_id)
            REFERENCES unit_codes(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE
            NOT VALID;
    ELSIF constraint_definition <>
          'FOREIGN KEY (unit_code_id) REFERENCES unit_codes(id) ON UPDATE CASCADE ON DELETE RESTRICT' THEN
        RAISE EXCEPTION
            '0012_INCOMPATIBLE_INVESTIGATION_UNIT_FK: %',
            constraint_definition;
    END IF;

    SELECT pg_get_constraintdef(constraint_record.oid, true)
    INTO constraint_definition
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'lab_results'::regclass
      AND constraint_record.conname = 'lab_results_submitted_by_organization_id_fkey';

    IF NOT FOUND THEN
        ALTER TABLE lab_results
            ADD CONSTRAINT lab_results_submitted_by_organization_id_fkey
            FOREIGN KEY (submitted_by_organization_id)
            REFERENCES organizations(id)
            ON DELETE RESTRICT
            NOT VALID;
    ELSIF constraint_definition <>
          'FOREIGN KEY (submitted_by_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT' THEN
        RAISE EXCEPTION
            '0012_INCOMPATIBLE_LAB_SUBMITTER_FK: %',
            constraint_definition;
    END IF;

    SELECT pg_get_constraintdef(constraint_record.oid, true)
    INTO constraint_definition
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'lots'::regclass
      AND constraint_record.conname = 'lots_assigned_laboratory_organization_id_fkey';

    IF NOT FOUND THEN
        ALTER TABLE lots
            ADD CONSTRAINT lots_assigned_laboratory_organization_id_fkey
            FOREIGN KEY (assigned_laboratory_organization_id)
            REFERENCES organizations(id)
            ON DELETE RESTRICT
            NOT VALID;
    ELSIF constraint_definition <>
          'FOREIGN KEY (assigned_laboratory_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT' THEN
        RAISE EXCEPTION
            '0012_INCOMPATIBLE_LOT_LAB_ASSIGNMENT_FK: %',
            constraint_definition;
    END IF;
END;
$capmint_0012_foreign_keys$;

ALTER TABLE lots
    VALIDATE CONSTRAINT lots_budget_id_producer_id_fkey;

ALTER TABLE investigations
    VALIDATE CONSTRAINT investigations_unit_code_id_fkey;

ALTER TABLE lab_results
    VALIDATE CONSTRAINT lab_results_submitted_by_organization_id_fkey;

ALTER TABLE lots
    VALIDATE CONSTRAINT lots_assigned_laboratory_organization_id_fkey;

CREATE INDEX IF NOT EXISTS idx_investigations_unit_code_id
    ON investigations(unit_code_id);

CREATE INDEX IF NOT EXISTS idx_lab_results_submitted_by_organization_id
    ON lab_results(submitted_by_organization_id);

CREATE INDEX IF NOT EXISTS idx_lots_assigned_laboratory_organization_id
    ON lots(assigned_laboratory_organization_id);

DO $capmint_0012_indexes$
DECLARE
    expected RECORD;
    actual RECORD;
BEGIN
    FOR expected IN
        SELECT *
        FROM (VALUES
            ('investigations', 'idx_investigations_unit_code_id', 'unit_code_id'),
            ('lab_results', 'idx_lab_results_submitted_by_organization_id', 'submitted_by_organization_id'),
            ('lots', 'idx_lots_assigned_laboratory_organization_id', 'assigned_laboratory_organization_id')
        ) AS values_table(table_name, index_name, column_name)
    LOOP
        SELECT table_relation.relname AS table_name,
               access_method.amname AS access_method,
               index_state.indisunique AS is_unique,
               index_state.indisvalid AS is_valid,
               index_state.indisready AS is_ready,
               index_state.indpred IS NULL AS is_unfiltered,
               index_state.indexprs IS NULL AS has_plain_columns,
               index_state.indnkeyatts AS key_columns,
               index_state.indnatts AS total_columns,
               pg_get_indexdef(index_state.indexrelid, 1, true) AS first_column
        INTO actual
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
          AND index_relation.relname = expected.index_name;

        IF NOT FOUND
           OR actual.table_name <> expected.table_name
           OR actual.access_method <> 'btree'
           OR actual.is_unique
           OR NOT actual.is_valid
           OR NOT actual.is_ready
           OR NOT actual.is_unfiltered
           OR NOT actual.has_plain_columns
           OR actual.key_columns <> 1
           OR actual.total_columns <> 1
           OR actual.first_column <> expected.column_name THEN
            RAISE EXCEPTION
                '0012_INCOMPATIBLE_INDEX: % must be a valid plain non-unique btree on %.%(%)',
                expected.index_name,
                'public',
                expected.table_name,
                expected.column_name;
        END IF;
    END LOOP;
END;
$capmint_0012_indexes$;
