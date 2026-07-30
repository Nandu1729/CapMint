-- 0010: Reconcile supported pre-DM-03 schema drift without rewriting history.
--
-- Supported repairs:
--   * producer_brandings is entirely absent;
--   * producer_brandings has the exact 0007 table shape but lacks its update
--     function/trigger, or the expected trigger is disabled;
--   * investigations has no status constraint;
--   * investigations has the original 0002 status constraint;
--   * investigations has the intended constraint under another name or in an
--     unvalidated state.
--
-- Refused states:
--   * partial or incompatible producer_brandings columns/constraints;
--   * an incompatible update function or additional branding triggers;
--   * multiple or unexpected investigations status constraints;
--   * investigation rows with statuses outside the intended set.

DO $capmint_function$
DECLARE
    function_language TEXT;
    function_source TEXT;
BEGIN
    SELECT l.lanname, p.prosrc
    INTO function_language, function_source
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.proname = 'update_updated_at_column'
      AND pg_get_function_identity_arguments(p.oid) = '';

    IF NOT FOUND THEN
        EXECUTE $create_function$
            CREATE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $function_body$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $function_body$ LANGUAGE plpgsql
        $create_function$;
    ELSIF function_language <> 'plpgsql'
       OR function_source !~* 'NEW\.updated_at\s*=\s*CURRENT_TIMESTAMP'
       OR function_source !~* 'RETURN\s+NEW' THEN
        RAISE EXCEPTION
            '0010_INCOMPATIBLE_UPDATE_FUNCTION: update_updated_at_column() exists with unexpected behavior';
    END IF;
END;
$capmint_function$;

DO $capmint_branding$
DECLARE
    actual_columns JSONB;
    expected_columns JSONB := '[
      {"position": 1, "name": "producer_id", "type": "uuid", "not_null": true, "default_expr": null},
      {"position": 2, "name": "logo_url", "type": "character varying(512)", "not_null": false, "default_expr": null},
      {"position": 3, "name": "primary_color", "type": "character varying(16)", "not_null": false, "default_expr": "''#10B981''::character varying"},
      {"position": 4, "name": "accent_color", "type": "character varying(16)", "not_null": false, "default_expr": "''#3B82F6''::character varying"},
      {"position": 5, "name": "brand_story", "type": "text", "not_null": false, "default_expr": null},
      {"position": 6, "name": "custom_banner_url", "type": "character varying(512)", "not_null": false, "default_expr": null},
      {"position": 7, "name": "cta_text", "type": "character varying(100)", "not_null": false, "default_expr": null},
      {"position": 8, "name": "cta_link", "type": "character varying(512)", "not_null": false, "default_expr": null},
      {"position": 9, "name": "cta_enabled", "type": "boolean", "not_null": false, "default_expr": "false"},
      {"position": 10, "name": "created_at", "type": "timestamp with time zone", "not_null": true, "default_expr": "CURRENT_TIMESTAMP"},
      {"position": 11, "name": "updated_at", "type": "timestamp with time zone", "not_null": true, "default_expr": "CURRENT_TIMESTAMP"}
    ]'::jsonb;
    constraint_count INTEGER;
    primary_key_count INTEGER;
    foreign_key_count INTEGER;
    trigger_count INTEGER;
    expected_trigger_count INTEGER;
    expected_trigger_enabled "char";
BEGIN
    IF to_regclass('public.producers') IS NULL THEN
        RAISE EXCEPTION '0010_MISSING_PREREQUISITE: producers table is required';
    END IF;

    IF to_regclass('public.producer_brandings') IS NULL THEN
        CREATE TABLE producer_brandings (
            producer_id UUID PRIMARY KEY REFERENCES producers(id) ON DELETE CASCADE,
            logo_url VARCHAR(512),
            primary_color VARCHAR(16) DEFAULT '#10B981',
            accent_color VARCHAR(16) DEFAULT '#3B82F6',
            brand_story TEXT,
            custom_banner_url VARCHAR(512),
            cta_text VARCHAR(100),
            cta_link VARCHAR(512),
            cta_enabled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ELSE
        SELECT jsonb_agg(
            jsonb_build_object(
                'position', a.attnum,
                'name', a.attname,
                'type', format_type(a.atttypid, a.atttypmod),
                'not_null', a.attnotnull,
                'default_expr', pg_get_expr(d.adbin, d.adrelid)
            )
            ORDER BY a.attnum
        )
        INTO actual_columns
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'producer_brandings'::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped;

        IF actual_columns IS DISTINCT FROM expected_columns THEN
            RAISE EXCEPTION
                '0010_INCOMPATIBLE_BRANDING_COLUMNS: producer_brandings is partial or incompatible';
        END IF;

        SELECT count(*)::int
        INTO constraint_count
        FROM pg_constraint
        WHERE conrelid = 'producer_brandings'::regclass;

        SELECT count(*)::int
        INTO primary_key_count
        FROM pg_constraint
        WHERE conrelid = 'producer_brandings'::regclass
          AND conname = 'producer_brandings_pkey'
          AND contype = 'p'
          AND convalidated
          AND pg_get_constraintdef(oid, true) = 'PRIMARY KEY (producer_id)';

        SELECT count(*)::int
        INTO foreign_key_count
        FROM pg_constraint
        WHERE conrelid = 'producer_brandings'::regclass
          AND conname = 'producer_brandings_producer_id_fkey'
          AND contype = 'f'
          AND convalidated
          AND pg_get_constraintdef(oid, true) =
              'FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE CASCADE';

        IF constraint_count <> 2 OR primary_key_count <> 1 OR foreign_key_count <> 1 THEN
            RAISE EXCEPTION
                '0010_INCOMPATIBLE_BRANDING_CONSTRAINTS: producer_brandings constraints are not equivalent to 0007';
        END IF;
    END IF;

    SELECT count(*)::int
    INTO trigger_count
    FROM pg_trigger
    WHERE tgrelid = 'producer_brandings'::regclass
      AND NOT tgisinternal;

    SELECT count(*)::int, max(tgenabled::text)::"char"
    INTO expected_trigger_count, expected_trigger_enabled
    FROM pg_trigger
    WHERE tgrelid = 'producer_brandings'::regclass
      AND NOT tgisinternal
      AND tgname = 'trigger_update_producer_brandings_updated_at'
      AND tgfoid = 'update_updated_at_column()'::regprocedure
      AND pg_get_triggerdef(oid, true) ~
          'BEFORE UPDATE ON producer_brandings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column\(\)$';

    IF trigger_count = 0 THEN
        CREATE TRIGGER trigger_update_producer_brandings_updated_at
            BEFORE UPDATE ON producer_brandings
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    ELSIF trigger_count <> 1 OR expected_trigger_count <> 1 THEN
        RAISE EXCEPTION
            '0010_INCOMPATIBLE_BRANDING_TRIGGERS: unexpected producer_brandings trigger configuration';
    ELSIF expected_trigger_enabled <> 'O' THEN
        ALTER TABLE producer_brandings
            ENABLE TRIGGER trigger_update_producer_brandings_updated_at;
    END IF;
END;
$capmint_branding$;

DO $capmint_investigations$
DECLARE
    status_attribute SMALLINT;
    status_constraint_count INTEGER;
    status_constraint_name TEXT;
    status_constraint_validated BOOLEAN;
    status_constraint_values TEXT[];
    unsupported_rows INTEGER;
    expected_values TEXT[] := ARRAY[
        'CLOSED', 'DISMISSED', 'ESCALATED', 'OPEN', 'RESOLVED', 'REVOKED', 'UNDER_REVIEW'
    ];
    old_values TEXT[] := ARRAY[
        'DISMISSED', 'OPEN', 'REVOKED', 'UNDER_REVIEW'
    ];
BEGIN
    IF to_regclass('public.investigations') IS NULL THEN
        RAISE EXCEPTION '0010_MISSING_PREREQUISITE: investigations table is required';
    END IF;

    SELECT attnum
    INTO status_attribute
    FROM pg_attribute
    WHERE attrelid = 'investigations'::regclass
      AND attname = 'status'
      AND NOT attisdropped
      AND format_type(atttypid, atttypmod) = 'character varying(32)'
      AND attnotnull;

    IF status_attribute IS NULL THEN
        RAISE EXCEPTION
            '0010_INCOMPATIBLE_INVESTIGATION_STATUS_COLUMN: investigations.status is missing or incompatible';
    END IF;

    SELECT count(*)::int
    INTO status_constraint_count
    FROM pg_constraint
    WHERE conrelid = 'investigations'::regclass
      AND contype = 'c'
      AND conkey @> ARRAY[status_attribute];

    IF status_constraint_count > 1 THEN
        RAISE EXCEPTION
            '0010_INCOMPATIBLE_INVESTIGATION_CONSTRAINTS: multiple status constraints are present';
    END IF;

    SELECT count(*)::int
    INTO unsupported_rows
    FROM investigations
    WHERE status <> ALL(expected_values);

    IF unsupported_rows > 0 THEN
        RAISE EXCEPTION
            '0010_UNSUPPORTED_INVESTIGATION_DATA: % row(s) have statuses outside the intended set',
            unsupported_rows;
    END IF;

    IF status_constraint_count = 1 THEN
        SELECT c.conname,
               c.convalidated,
               ARRAY(
                   SELECT DISTINCT captures[1]
                   FROM regexp_matches(pg_get_constraintdef(c.oid, true), '''([A-Z_]+)''', 'g') AS captures
                   ORDER BY captures[1]
               )
        INTO status_constraint_name, status_constraint_validated, status_constraint_values
        FROM pg_constraint c
        WHERE c.conrelid = 'investigations'::regclass
          AND c.contype = 'c'
          AND c.conkey @> ARRAY[status_attribute];

        IF status_constraint_values <> expected_values
           AND status_constraint_values <> old_values THEN
            RAISE EXCEPTION
                '0010_INCOMPATIBLE_INVESTIGATION_STATUS_SET: unexpected values %',
                status_constraint_values;
        END IF;

        IF status_constraint_values = old_values THEN
            EXECUTE format(
                'ALTER TABLE investigations DROP CONSTRAINT %I',
                status_constraint_name
            );
            status_constraint_count := 0;
        ELSIF status_constraint_name <> 'chk_investigations_status' THEN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = 'investigations'::regclass
                  AND conname = 'chk_investigations_status'
            ) THEN
                RAISE EXCEPTION
                    '0010_CONSTRAINT_NAME_CONFLICT: chk_investigations_status already exists';
            END IF;
            EXECUTE format(
                'ALTER TABLE investigations RENAME CONSTRAINT %I TO chk_investigations_status',
                status_constraint_name
            );
        ELSIF NOT status_constraint_validated THEN
            ALTER TABLE investigations
                VALIDATE CONSTRAINT chk_investigations_status;
        END IF;
    END IF;

    IF status_constraint_count = 0 THEN
        ALTER TABLE investigations
            ADD CONSTRAINT chk_investigations_status
            CHECK (status IN (
                'OPEN',
                'UNDER_REVIEW',
                'ESCALATED',
                'RESOLVED',
                'REVOKED',
                'DISMISSED',
                'CLOSED'
            )) NOT VALID;
        ALTER TABLE investigations
            VALIDATE CONSTRAINT chk_investigations_status;
    END IF;
END;
$capmint_investigations$;
