-- 0014: Resolve the approved zero-reference certifier orphan by deletion and
-- make certifier organization ownership mandatory.
--
-- lab_results.submitted_by_organization_id and
-- lots.assigned_laboratory_organization_id intentionally remain nullable.
-- PostgreSQL RLS is outside this migration and is not enabled here.

DO $capmint_0014_shape_preflight$
DECLARE
    producer_column RECORD;
    certifier_column RECORD;
    investigation_column RECORD;
    laboratory_submitter_column RECORD;
    laboratory_assignment_column RECORD;
    investigation_index RECORD;
    temporary_constraint_count INTEGER;
BEGIN
    SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
    INTO producer_column
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'producers'::regclass
      AND attribute.attname = 'organization_id'
      AND NOT attribute.attisdropped;

    IF NOT FOUND
       OR producer_column.data_type <> 'uuid'
       OR NOT producer_column.not_null
       OR producer_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0014_INCOMPATIBLE_PRODUCER_ORGANIZATION_ID: expected NOT NULL UUID without a default';
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
    INTO certifier_column
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'certifiers'::regclass
      AND attribute.attname = 'organization_id'
      AND NOT attribute.attisdropped;

    IF NOT FOUND
       OR certifier_column.data_type <> 'uuid'
       OR certifier_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0014_INCOMPATIBLE_CERTIFIER_ORGANIZATION_ID: expected UUID without a default';
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
    INTO investigation_column
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'investigations'::regclass
      AND attribute.attname = 'unit_code_id'
      AND NOT attribute.attisdropped;

    IF NOT FOUND
       OR investigation_column.data_type <> 'uuid'
       OR NOT investigation_column.not_null
       OR investigation_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0014_INCOMPATIBLE_INVESTIGATION_UNIT_CODE_ID: expected NOT NULL UUID without a default';
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
    INTO laboratory_submitter_column
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'lab_results'::regclass
      AND attribute.attname = 'submitted_by_organization_id'
      AND NOT attribute.attisdropped;

    IF NOT FOUND
       OR laboratory_submitter_column.data_type <> 'uuid'
       OR laboratory_submitter_column.not_null
       OR laboratory_submitter_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0014_INCOMPATIBLE_LAB_SUBMITTER: expected nullable UUID without a default';
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
    INTO laboratory_assignment_column
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'lots'::regclass
      AND attribute.attname = 'assigned_laboratory_organization_id'
      AND NOT attribute.attisdropped;

    IF NOT FOUND
       OR laboratory_assignment_column.data_type <> 'uuid'
       OR laboratory_assignment_column.not_null
       OR laboratory_assignment_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0014_INCOMPATIBLE_LAB_ASSIGNMENT: expected nullable UUID without a default';
    END IF;

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
    INTO investigation_index
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
      AND index_relation.relname = 'idx_investigations_unit_code_id';

    IF NOT FOUND
       OR investigation_index.table_name <> 'investigations'
       OR investigation_index.access_method <> 'btree'
       OR NOT investigation_index.is_unique
       OR NOT investigation_index.is_valid
       OR NOT investigation_index.is_ready
       OR NOT investigation_index.is_unfiltered
       OR NOT investigation_index.has_plain_columns
       OR investigation_index.key_columns <> 1
       OR investigation_index.total_columns <> 1
       OR investigation_index.first_column <> 'unit_code_id' THEN
        RAISE EXCEPTION
            '0014_INCOMPATIBLE_INVESTIGATION_UNIT_INDEX: expected a valid plain unique btree on investigations(unit_code_id)';
    END IF;

    SELECT count(*)::integer
    INTO temporary_constraint_count
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conname = 'certifiers_organization_id_not_null';

    IF temporary_constraint_count <> 0 THEN
        RAISE EXCEPTION
            '0014_PARTIAL_TIGHTENING: temporary certifier NOT NULL check must be absent in stable pre-0014 and post-0014 states';
    END IF;
END;
$capmint_0014_shape_preflight$;

DO $capmint_0014_delete_orphan$
DECLARE
    known_orphan_status TEXT;
    known_orphan_budget_count INTEGER;
    deleted_count INTEGER;
BEGIN
    SELECT key_status
    INTO known_orphan_status
    FROM certifiers
    WHERE id = '00000000-0000-0000-0000-000000000003'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF known_orphan_status <> 'REVOKED' THEN
        RAISE EXCEPTION
            '0014_ORPHAN_NOT_REVOKED: approved certifier has status %, expected REVOKED',
            known_orphan_status;
    END IF;

    SELECT count(*)::integer
    INTO known_orphan_budget_count
    FROM budgets
    WHERE certifier_id = '00000000-0000-0000-0000-000000000003';

    IF known_orphan_budget_count <> 0 THEN
        RAISE EXCEPTION
            '0014_ORPHAN_CERTIFIER_REFERENCED: approved certifier has % budget reference(s)',
            known_orphan_budget_count;
    END IF;

    DELETE FROM certifiers
    WHERE id = '00000000-0000-0000-0000-000000000003'
      AND key_status = 'REVOKED'
      AND NOT EXISTS (
          SELECT 1
          FROM budgets
          WHERE certifier_id = '00000000-0000-0000-0000-000000000003'
      );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count <> 1 THEN
        RAISE EXCEPTION
            '0014_ORPHAN_DELETE_FAILED: approved certifier was not safely deleted';
    END IF;
END;
$capmint_0014_delete_orphan$;

DO $capmint_0014_data_preflight$
DECLARE
    certifier_null_count INTEGER;
BEGIN
    SELECT count(*)::integer
    INTO certifier_null_count
    FROM certifiers
    WHERE organization_id IS NULL;

    IF certifier_null_count <> 0 THEN
        RAISE EXCEPTION
            '0014_CERTIFIER_NULL_ORG: % unexpected certifier row(s) have no organization',
            certifier_null_count;
    END IF;

    RAISE NOTICE
        '0014_PREFLIGHT certifier_nulls=%, approved_orphan_rows=0, approved_orphan_budget_references=0',
        certifier_null_count;
END;
$capmint_0014_data_preflight$;

DO $capmint_0014_add_not_null_check$
DECLARE
    certifier_not_null BOOLEAN;
BEGIN
    SELECT attribute.attnotnull
    INTO certifier_not_null
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'certifiers'::regclass
      AND attribute.attname = 'organization_id'
      AND NOT attribute.attisdropped;

    IF NOT certifier_not_null
       AND NOT EXISTS (
           SELECT 1
           FROM pg_constraint AS constraint_record
           WHERE constraint_record.conrelid = 'certifiers'::regclass
             AND constraint_record.conname = 'certifiers_organization_id_not_null'
       ) THEN
        ALTER TABLE certifiers
            ADD CONSTRAINT certifiers_organization_id_not_null
            CHECK (organization_id IS NOT NULL)
            NOT VALID;
    END IF;
END;
$capmint_0014_add_not_null_check$;

DO $capmint_0014_validate_not_null_check$
DECLARE
    check_constraint RECORD;
BEGIN
    SELECT constraint_record.contype AS constraint_type,
           constraint_record.convalidated AS validated,
           pg_get_expr(
               constraint_record.conbin,
               constraint_record.conrelid,
               true
           ) AS expression
    INTO check_constraint
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'certifiers'::regclass
      AND constraint_record.conname = 'certifiers_organization_id_not_null';

    IF FOUND THEN
        IF check_constraint.constraint_type <> 'c'
           OR check_constraint.expression <> 'organization_id IS NOT NULL' THEN
            RAISE EXCEPTION
                '0014_INCOMPATIBLE_NOT_NULL_CHECK: unexpected certifiers_organization_id_not_null definition';
        END IF;

        IF NOT check_constraint.validated THEN
            ALTER TABLE certifiers
                VALIDATE CONSTRAINT certifiers_organization_id_not_null;
        END IF;
    END IF;
END;
$capmint_0014_validate_not_null_check$;

DO $capmint_0014_set_not_null$
DECLARE
    certifier_not_null BOOLEAN;
BEGIN
    SELECT attribute.attnotnull
    INTO certifier_not_null
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'certifiers'::regclass
      AND attribute.attname = 'organization_id'
      AND NOT attribute.attisdropped;

    IF NOT certifier_not_null THEN
        ALTER TABLE certifiers
            ALTER COLUMN organization_id SET NOT NULL;
    END IF;
END;
$capmint_0014_set_not_null$;

DO $capmint_0014_drop_not_null_check$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = 'certifiers'::regclass
          AND constraint_record.conname = 'certifiers_organization_id_not_null'
    ) THEN
        ALTER TABLE certifiers
            DROP CONSTRAINT certifiers_organization_id_not_null;
    END IF;
END;
$capmint_0014_drop_not_null_check$;
