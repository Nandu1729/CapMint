-- 0013: Tighten deterministic tenant/provenance relationships and quarantine
-- the known zero-reference legacy certifier.
--
-- certifiers.organization_id, lab_results.submitted_by_organization_id, and
-- lots.assigned_laboratory_organization_id intentionally remain nullable.
-- PostgreSQL RLS is outside DM-03 and is not enabled here.

DO $capmint_0013_shape_preflight$
DECLARE
    producer_column RECORD;
    investigation_column RECORD;
    certifier_column RECORD;
    laboratory_submitter_column RECORD;
    laboratory_assignment_column RECORD;
    investigation_index RECORD;
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
       OR producer_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0013_INCOMPATIBLE_PRODUCER_ORGANIZATION_ID: expected UUID without a default';
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
       OR investigation_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0013_INCOMPATIBLE_INVESTIGATION_UNIT_CODE_ID: expected UUID without a default';
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
       OR certifier_column.not_null
       OR certifier_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0013_INCOMPATIBLE_CERTIFIER_ORGANIZATION_ID: expected nullable UUID without a default';
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
            '0013_INCOMPATIBLE_LAB_SUBMITTER: expected nullable UUID without a default';
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
            '0013_INCOMPATIBLE_LAB_ASSIGNMENT: expected nullable UUID without a default';
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
       OR NOT investigation_index.is_valid
       OR NOT investigation_index.is_ready
       OR NOT investigation_index.is_unfiltered
       OR NOT investigation_index.has_plain_columns
       OR investigation_index.key_columns <> 1
       OR investigation_index.total_columns <> 1
       OR investigation_index.first_column <> 'unit_code_id' THEN
        RAISE EXCEPTION
            '0013_INCOMPATIBLE_INVESTIGATION_UNIT_INDEX: expected a valid plain btree on investigations(unit_code_id)';
    END IF;

    IF producer_column.not_null <> investigation_column.not_null
       OR producer_column.not_null <> investigation_index.is_unique THEN
        RAISE EXCEPTION
            '0013_PARTIAL_TIGHTENING: producer/investigation nullability and investigation uniqueness must be wholly pre-0013 or wholly tightened';
    END IF;
END;
$capmint_0013_shape_preflight$;

DO $capmint_0013_data_preflight$
DECLARE
    producer_null_count INTEGER;
    investigation_null_count INTEGER;
    investigation_duplicate_count INTEGER;
    certifier_count INTEGER;
    certifier_orphan_count INTEGER;
    known_orphan_budget_count INTEGER;
    known_orphan_status TEXT;
    tightening_applied BOOLEAN;
BEGIN
    SELECT count(*)::integer
    INTO producer_null_count
    FROM producers
    WHERE organization_id IS NULL;

    IF producer_null_count <> 0 THEN
        RAISE EXCEPTION
            '0013_PRODUCER_NULL_ORG: % producer row(s) have no organization',
            producer_null_count;
    END IF;

    SELECT count(*)::integer
    INTO investigation_null_count
    FROM investigations
    WHERE unit_code_id IS NULL;

    IF investigation_null_count <> 0 THEN
        RAISE EXCEPTION
            '0013_INVESTIGATION_NULL_UNIT: % investigation row(s) have no unit code',
            investigation_null_count;
    END IF;

    SELECT count(*)::integer
    INTO investigation_duplicate_count
    FROM (
        SELECT unit_code_id
        FROM investigations
        GROUP BY unit_code_id
        HAVING count(*) > 1
    ) AS duplicate_unit_codes;

    IF investigation_duplicate_count <> 0 THEN
        RAISE EXCEPTION
            '0013_INVESTIGATION_DUPLICATE_UNIT: % unit code(s) map to multiple investigations',
            investigation_duplicate_count;
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE organization_id IS NULL)::integer
    INTO certifier_count,
         certifier_orphan_count
    FROM certifiers;

    -- The immutable schema-only baseline contains no certifier seed. The
    -- operator-approved empty-bootstrap exception permits exactly that state.
    IF certifier_count = 0 THEN
        IF certifier_orphan_count <> 0 THEN
            RAISE EXCEPTION
                '0013_UNEXPECTED_CERTIFIER_ORPHANS: empty certifier table reported % orphan(s)',
                certifier_orphan_count;
        END IF;
    ELSIF certifier_orphan_count <> 1 THEN
        RAISE EXCEPTION
            '0013_UNEXPECTED_CERTIFIER_ORPHANS: expected exactly 1 orphan in a non-empty environment, found %',
            certifier_orphan_count;
    ELSE
        SELECT key_status
        INTO known_orphan_status
        FROM certifiers
        WHERE id = '00000000-0000-0000-0000-000000000003'
          AND organization_id IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                '0013_UNEXPECTED_CERTIFIER_ORPHANS: the sole orphan is not the approved certifier 00000000-0000-0000-0000-000000000003';
        END IF;

        SELECT count(*)::integer
        INTO known_orphan_budget_count
        FROM budgets
        WHERE certifier_id = '00000000-0000-0000-0000-000000000003';

        IF known_orphan_budget_count <> 0 THEN
            RAISE EXCEPTION
                '0013_ORPHAN_CERTIFIER_REFERENCED: approved orphan has % budget reference(s)',
                known_orphan_budget_count;
        END IF;

        SELECT attribute.attnotnull
        INTO tightening_applied
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'producers'::regclass
          AND attribute.attname = 'organization_id'
          AND NOT attribute.attisdropped;

        IF (NOT tightening_applied AND known_orphan_status <> 'ACTIVE')
           OR (tightening_applied AND known_orphan_status <> 'REVOKED') THEN
            RAISE EXCEPTION
                '0013_INCOMPATIBLE_ORPHAN_QUARANTINE: expected % status, found %',
                CASE WHEN tightening_applied THEN 'REVOKED' ELSE 'ACTIVE' END,
                known_orphan_status;
        END IF;
    END IF;

    RAISE NOTICE
        '0013_PREFLIGHT producer_nulls=%, investigation_nulls=%, investigation_duplicate_groups=%, certifier_orphans=%',
        producer_null_count,
        investigation_null_count,
        investigation_duplicate_count,
        certifier_orphan_count;
END;
$capmint_0013_data_preflight$;

ALTER TABLE producers
    ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE investigations
    ALTER COLUMN unit_code_id SET NOT NULL;

DO $capmint_0013_replace_investigation_index$
DECLARE
    index_is_unique BOOLEAN;
BEGIN
    SELECT index_state.indisunique
    INTO index_is_unique
    FROM pg_class AS index_relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    JOIN pg_index AS index_state
      ON index_state.indexrelid = index_relation.oid
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = 'idx_investigations_unit_code_id';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            '0013_INCOMPATIBLE_INVESTIGATION_UNIT_INDEX: expected the 0012 support index';
    END IF;

    IF NOT index_is_unique THEN
        DROP INDEX idx_investigations_unit_code_id;
    END IF;
END;
$capmint_0013_replace_investigation_index$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_investigations_unit_code_id
    ON investigations(unit_code_id);

DO $capmint_0013_quarantine_orphan$
DECLARE
    certifier_count INTEGER;
    updated_count INTEGER;
BEGIN
    SELECT count(*)::integer
    INTO certifier_count
    FROM certifiers;

    IF certifier_count = 0 THEN
        RETURN;
    END IF;

    UPDATE certifiers
    SET key_status = 'REVOKED',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = '00000000-0000-0000-0000-000000000003'
      AND organization_id IS NULL
      AND key_status = 'ACTIVE'
      AND NOT EXISTS (
          SELECT 1
          FROM budgets
          WHERE certifier_id = '00000000-0000-0000-0000-000000000003'
      );

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0
       AND NOT EXISTS (
           SELECT 1
           FROM certifiers
           WHERE id = '00000000-0000-0000-0000-000000000003'
             AND organization_id IS NULL
             AND key_status = 'REVOKED'
       ) THEN
        RAISE EXCEPTION
            '0013_ORPHAN_QUARANTINE_FAILED: approved orphan was not safely quarantined';
    END IF;
END;
$capmint_0013_quarantine_orphan$;
