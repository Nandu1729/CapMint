-- 0023: Keep hash-chain integrity public while tenant-scoping ledger contents.

DO $capmint_0023_preflight$
DECLARE
    current_select_policy text;
    current_insert_policy text;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.migrations_log
           WHERE filename = '0022_make_budget_signature_nullable.sql'
       ) THEN
        RAISE EXCEPTION '0023_PREDECESSOR_NOT_RECORDED: migration 0022 must be recorded';
    END IF;

    IF to_regclass('public.log_entries') IS NULL
       OR to_regclass('public.users') IS NULL
       OR to_regclass('public.organizations') IS NULL
       OR to_regclass('public.producers') IS NULL
       OR to_regclass('public.certifiers') IS NULL
       OR to_regclass('public.budgets') IS NULL
       OR to_regclass('public.lots') IS NULL
       OR to_regclass('public.unit_codes') IS NULL
       OR to_regclass('public.investigations') IS NULL THEN
        RAISE EXCEPTION '0023_REQUIRED_TABLE_MISSING';
    END IF;

    SELECT pg_get_expr(policy.polqual, policy.polrelid)
    INTO current_select_policy
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.log_entries'::regclass
      AND policy.polname = 'log_entries_tenant_select';

    IF current_select_policy IS NULL THEN
        RAISE EXCEPTION '0023_LEDGER_SELECT_POLICY_MISSING';
    END IF;

    IF current_select_policy <> 'true'
       AND current_select_policy <>
           '((current_setting(''app.actor_is_system_admin''::text, true) = ''on''::text) OR ((NULLIF(current_setting(''app.current_organization_id''::text, true), ''''::text) IS NOT NULL) AND capmint_rls_log_entry_actor(entity_type, entity_id, (NULLIF(current_setting(''app.current_organization_id''::text, true), ''''::text))::uuid)))' THEN
        RAISE EXCEPTION '0023_LEDGER_SELECT_POLICY_INCOMPATIBLE';
    END IF;

    SELECT pg_get_expr(policy.polwithcheck, policy.polrelid)
    INTO current_insert_policy
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.log_entries'::regclass
      AND policy.polname = 'log_entries_tenant_insert';

    IF current_insert_policy IS NULL
       OR position('GENESIS_BLOCK_ANCHOR' IN current_insert_policy) = 0
       OR position('ORGANIZATION_REGISTERED' IN current_insert_policy) = 0 THEN
        RAISE EXCEPTION '0023_LEDGER_INSERT_POLICY_INCOMPATIBLE';
    END IF;

    IF position('USER_LOGIN' IN current_insert_policy) = 0
       AND current_insert_policy <>
           '((current_setting(''app.actor_is_system_admin''::text, true) = ''on''::text) OR ((NULLIF(current_setting(''app.current_organization_id''::text, true), ''''::text))::uuid IS NOT NULL) OR (((NULLIF(current_setting(''app.current_organization_id''::text, true), ''''::text))::uuid IS NULL) AND ((((event_type)::text = ''GENESIS_BLOCK_ANCHOR''::text) AND ((entity_type)::text = ''SYSTEM''::text) AND (entity_id = ''00000000-0000-0000-0000-000000000000''::uuid)) OR (((event_type)::text = ''ORGANIZATION_REGISTERED''::text) AND ((entity_type)::text = ''ORGANIZATION''::text)))))' THEN
        RAISE EXCEPTION '0023_LEDGER_INSERT_POLICY_INCOMPATIBLE';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc AS routine
        JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'
          AND routine.proname IN (
              'capmint_rls_log_entry_actor',
              'capmint_ledger_tail_hash',
              'capmint_verify_ledger_integrity'
          )
          AND to_regprocedure(
              CASE routine.proname
                  WHEN 'capmint_rls_log_entry_actor'
                      THEN 'public.capmint_rls_log_entry_actor(character varying,uuid,uuid)'
                  WHEN 'capmint_ledger_tail_hash'
                      THEN 'public.capmint_ledger_tail_hash()'
                  ELSE 'public.capmint_verify_ledger_integrity()'
              END
          ) IS DISTINCT FROM routine.oid
    ) THEN
        RAISE EXCEPTION '0023_LEDGER_HELPER_OVERLOAD_INCOMPATIBLE';
    END IF;
END;
$capmint_0023_preflight$;

CREATE OR REPLACE FUNCTION public.capmint_rls_log_entry_actor(
    p_entity_type character varying,
    p_entity_id uuid,
    p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
    SELECT CASE p_entity_type
        WHEN 'USER' THEN EXISTS (
            SELECT 1
            FROM public.users AS app_user
            WHERE app_user.id = p_entity_id
              AND app_user.organization_id = p_organization_id
        )
        WHEN 'ORGANIZATION' THEN p_entity_id = p_organization_id
        WHEN 'BUDGET' THEN EXISTS (
            SELECT 1
            FROM public.budgets AS budget
            JOIN public.producers AS producer
              ON producer.id = budget.producer_id
            JOIN public.certifiers AS certifier
              ON certifier.id = budget.certifier_id
            WHERE budget.id = p_entity_id
              AND (
                  producer.organization_id = p_organization_id
                  OR certifier.organization_id = p_organization_id
              )
        )
        WHEN 'LOT' THEN EXISTS (
            SELECT 1
            FROM public.lots AS lot
            JOIN public.producers AS producer
              ON producer.id = lot.producer_id
            JOIN public.budgets AS budget
              ON budget.id = lot.budget_id
            JOIN public.certifiers AS certifier
              ON certifier.id = budget.certifier_id
            WHERE lot.id = p_entity_id
              AND (
                  producer.organization_id = p_organization_id
                  OR certifier.organization_id = p_organization_id
                  OR lot.assigned_laboratory_organization_id = p_organization_id
              )
        )
        WHEN 'PRODUCT' THEN EXISTS (
            SELECT 1
            FROM public.unit_codes AS unit_code
            JOIN public.lots AS lot
              ON lot.id = unit_code.lot_id
            JOIN public.producers AS producer
              ON producer.id = lot.producer_id
            JOIN public.budgets AS budget
              ON budget.id = lot.budget_id
            JOIN public.certifiers AS certifier
              ON certifier.id = budget.certifier_id
            WHERE unit_code.public_identifier = p_entity_id
              AND (
                  producer.organization_id = p_organization_id
                  OR certifier.organization_id = p_organization_id
                  OR lot.assigned_laboratory_organization_id = p_organization_id
              )
        )
        WHEN 'INVESTIGATION' THEN EXISTS (
            SELECT 1
            FROM public.investigations AS investigation
            JOIN public.unit_codes AS unit_code
              ON unit_code.id = investigation.unit_code_id
            JOIN public.lots AS lot
              ON lot.id = unit_code.lot_id
            JOIN public.producers AS producer
              ON producer.id = lot.producer_id
            JOIN public.budgets AS budget
              ON budget.id = lot.budget_id
            JOIN public.certifiers AS certifier
              ON certifier.id = budget.certifier_id
            WHERE (
                    investigation.id = p_entity_id
                    OR investigation.public_identifier = p_entity_id
                    OR unit_code.public_identifier = p_entity_id
                  )
              AND (
                  producer.organization_id = p_organization_id
                  OR certifier.organization_id = p_organization_id
                  OR lot.assigned_laboratory_organization_id = p_organization_id
              )
        )
        ELSE false
    END
$body$;

CREATE OR REPLACE FUNCTION public.capmint_ledger_tail_hash()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
    SELECT ledger.current_hash
    FROM public.log_entries AS ledger
    ORDER BY ledger.created_at DESC, ledger.id DESC
    LIMIT 1
$body$;

CREATE OR REPLACE FUNCTION public.capmint_verify_ledger_integrity()
RETURNS TABLE (
    unbroken boolean,
    log_count bigint,
    error text,
    errors text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
DECLARE
    ledger_entry record;
    entry_index bigint := 0;
    expected_previous text := '00000000-0000-0000-0000-000000000000';
    calculated_current text;
    chain_errors text[] := ARRAY[]::text[];
BEGIN
    FOR ledger_entry IN
        SELECT ledger.id,
               ledger.entity_type,
               ledger.entity_id,
               ledger.event_type,
               ledger.payload_hash,
               ledger.previous_hash,
               ledger.current_hash
        FROM public.log_entries AS ledger
        ORDER BY ledger.created_at ASC, ledger.id ASC
    LOOP
        IF ledger_entry.event_type = 'GENESIS_BLOCK_ANCHOR' THEN
            expected_previous := ledger_entry.current_hash;
            entry_index := entry_index + 1;
            CONTINUE;
        END IF;

        IF ledger_entry.previous_hash <> expected_previous THEN
            chain_errors := array_append(
                chain_errors,
                format(
                    'Chain link broken at entry index %s (ID: %s). Expected previous hash %s, got %s.',
                    entry_index,
                    ledger_entry.id,
                    expected_previous,
                    ledger_entry.previous_hash
                )
            );
        END IF;

        calculated_current := encode(
            sha256(convert_to(
                ledger_entry.entity_type
                || ledger_entry.entity_id::text
                || ledger_entry.event_type
                || ledger_entry.payload_hash
                || ledger_entry.previous_hash,
                'UTF8'
            )),
            'hex'
        );

        IF ledger_entry.current_hash <> calculated_current THEN
            chain_errors := array_append(
                chain_errors,
                format(
                    'Hash mismatch at entry index %s (ID: %s). Calculated current hash %s, database has %s.',
                    entry_index,
                    ledger_entry.id,
                    calculated_current,
                    ledger_entry.current_hash
                )
            );
        END IF;

        expected_previous := ledger_entry.current_hash;
        entry_index := entry_index + 1;
    END LOOP;

    unbroken := cardinality(chain_errors) = 0;
    log_count := entry_index;
    errors := chain_errors;
    error := CASE
        WHEN cardinality(chain_errors) = 0 THEN NULL
        ELSE array_to_string(chain_errors, '; ')
    END;
    RETURN NEXT;
END
$body$;

ALTER FUNCTION public.capmint_rls_log_entry_actor(character varying, uuid, uuid)
    OWNER TO capmint_admin;
ALTER FUNCTION public.capmint_ledger_tail_hash()
    OWNER TO capmint_admin;
ALTER FUNCTION public.capmint_verify_ledger_integrity()
    OWNER TO capmint_admin;

REVOKE ALL
    ON FUNCTION public.capmint_rls_log_entry_actor(character varying, uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_ledger_tail_hash()
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_verify_ledger_integrity()
    FROM PUBLIC;

GRANT EXECUTE
    ON FUNCTION public.capmint_rls_log_entry_actor(character varying, uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_ledger_tail_hash()
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_verify_ledger_integrity()
    TO capmint_app;

DO $capmint_0023_scope_ledger$
DECLARE
    current_select_policy text;
    current_insert_policy text;
BEGIN
    SELECT pg_get_expr(policy.polqual, policy.polrelid)
    INTO current_select_policy
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.log_entries'::regclass
      AND policy.polname = 'log_entries_tenant_select';

    IF current_select_policy = 'true' THEN
        DROP POLICY log_entries_tenant_select ON public.log_entries;
        CREATE POLICY log_entries_tenant_select
            ON public.log_entries FOR SELECT TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_log_entry_actor(
                        entity_type,
                        entity_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;

    SELECT pg_get_expr(policy.polwithcheck, policy.polrelid)
    INTO current_insert_policy
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.log_entries'::regclass
      AND policy.polname = 'log_entries_tenant_insert';

    IF position('USER_LOGIN' IN current_insert_policy) > 0 THEN
        DROP POLICY log_entries_tenant_insert ON public.log_entries;
        CREATE POLICY log_entries_tenant_insert
            ON public.log_entries FOR INSERT TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR NULLIF(current_setting(
                    'app.current_organization_id', true
                ), '')::uuid IS NOT NULL
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND (
                        (
                            event_type = 'GENESIS_BLOCK_ANCHOR'
                            AND entity_type = 'SYSTEM'
                            AND entity_id =
                                '00000000-0000-0000-0000-000000000000'::uuid
                        )
                        OR (
                            event_type = 'ORGANIZATION_REGISTERED'
                            AND entity_type = 'ORGANIZATION'
                        )
                    )
                )
            );
    END IF;
END;
$capmint_0023_scope_ledger$;
