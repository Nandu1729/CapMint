-- 0018: Enable DM-04 D3b row-level security on supporting provenance tables.
--
-- RLS is ENABLED, never FORCED. The owner continues to bypass RLS for
-- migrations/bootstrap/seed, while capmint_app is constrained by these
-- policies. Boolean-only SECURITY DEFINER helpers avoid traversing the
-- already RLS-protected provenance chain from inside a policy.

DO $capmint_0018_preflight$
DECLARE
    app_role RECORD;
    prior_rls_count INTEGER;
    prior_forced_count INTEGER;
    prior_policy_count INTEGER;
    prior_expected_policy_count INTEGER;
    prior_helper_count INTEGER;
    prior_unsafe_helper_count INTEGER;
    target_rls_count INTEGER;
    target_forced_count INTEGER;
    target_policy_count INTEGER;
    expected_policy_count INTEGER;
    incompatible_policy_count INTEGER;
    new_helper_count INTEGER;
    unsafe_new_helper_count INTEGER;
    unexpected_rls_count INTEGER;
    unexpected_policy_count INTEGER;
    unexpected_helper_count INTEGER;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM migrations_log
           WHERE filename = '0017_enable_provenance_chain_rls.sql'
       ) THEN
        RAISE EXCEPTION
            '0018_D3A_NOT_RECORDED: migration 0017 must be recorded before supporting-table RLS';
    END IF;

    SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO app_role
    FROM pg_roles
    WHERE rolname = 'capmint_app';

    IF NOT FOUND
       OR app_role.rolsuper
       OR app_role.rolcreaterole
       OR app_role.rolcreatedb
       OR app_role.rolreplication
       OR app_role.rolbypassrls THEN
        RAISE EXCEPTION
            '0018_APP_ROLE_INCOMPATIBLE: capmint_app is missing or elevated';
    END IF;

    IF to_regclass('public.lab_results') IS NULL
       OR to_regclass('public.investigations') IS NULL
       OR to_regclass('public.scan_events') IS NULL
       OR to_regclass('public.plots_or_hive_clusters') IS NULL
       OR to_regclass('public.producer_brandings') IS NULL THEN
        RAISE EXCEPTION
            '0018_SUPPORTING_TABLE_MISSING: all five D3b tables must exist';
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE relation.relforcerowsecurity)::integer
    INTO prior_rls_count, prior_forced_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
          'organizations', 'producers', 'certifiers',
          'budgets', 'lots', 'unit_codes'
      )
      AND relation.relrowsecurity;

    SELECT count(*)::integer
    INTO prior_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'organizations', 'producers', 'certifiers',
          'budgets', 'lots', 'unit_codes'
      );

    SELECT count(*)::integer
    INTO prior_expected_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
          (tablename = 'organizations'
           AND policyname IN (
               'organizations_tenant_select',
               'organizations_tenant_insert',
               'organizations_tenant_update',
               'organizations_tenant_delete'
           ))
          OR
          (tablename = 'producers'
           AND policyname IN (
               'producers_tenant_select',
               'producers_tenant_insert',
               'producers_tenant_update',
               'producers_tenant_delete'
           ))
          OR
          (tablename = 'certifiers'
           AND policyname IN (
               'certifiers_tenant_select',
               'certifiers_tenant_insert',
               'certifiers_tenant_update',
               'certifiers_tenant_delete'
           ))
          OR
          (tablename = 'budgets'
           AND policyname IN (
               'budgets_tenant_select',
               'budgets_tenant_insert',
               'budgets_tenant_update'
           ))
          OR
          (tablename = 'lots'
           AND policyname IN (
               'lots_tenant_select',
               'lots_tenant_insert',
               'lots_tenant_update'
           ))
          OR
          (tablename = 'unit_codes'
           AND policyname IN (
               'unit_codes_tenant_select',
               'unit_codes_tenant_insert',
               'unit_codes_tenant_update'
           ))
      );

    SELECT count(*)::integer
    INTO prior_helper_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
          'capmint_rls_producer_owns',
          'capmint_rls_budget_actor',
          'capmint_rls_lot_actor',
          'capmint_rls_lot_producer',
          'capmint_rls_unit_actor',
          'capmint_rls_has_public_code'
      );

    SELECT count(*)::integer
    INTO prior_unsafe_helper_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    JOIN pg_language AS language
      ON language.oid = routine.prolang
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
          'capmint_rls_producer_owns',
          'capmint_rls_budget_actor',
          'capmint_rls_lot_actor',
          'capmint_rls_lot_producer',
          'capmint_rls_unit_actor',
          'capmint_rls_has_public_code'
      )
      AND (
          NOT routine.prosecdef
          OR routine.provolatile <> 's'
          OR language.lanname <> 'sql'
          OR routine.prorettype <> 'boolean'::regtype
          OR routine.proowner <> 'capmint_admin'::regrole
          OR NOT (
              COALESCE(routine.proconfig, ARRAY[]::text[])
              @> ARRAY['search_path=pg_catalog, public']
          )
          OR EXISTS (
              SELECT 1
              FROM aclexplode(
                  COALESCE(routine.proacl, acldefault('f', routine.proowner))
              ) AS privilege
              WHERE privilege.grantee = 0
                AND privilege.privilege_type = 'EXECUTE'
          )
          OR NOT has_function_privilege('capmint_app', routine.oid, 'EXECUTE')
      );

    IF prior_rls_count <> 6
       OR prior_forced_count <> 0
       OR prior_policy_count <> 21
       OR prior_expected_policy_count <> 21
       OR prior_helper_count <> 6
       OR prior_unsafe_helper_count <> 0 THEN
        RAISE EXCEPTION
            '0018_PRIOR_RLS_INCOMPATIBLE: tables=%, forced=%, policies=%, expected_policies=%, helpers=%, unsafe_helpers=%',
            prior_rls_count,
            prior_forced_count,
            prior_policy_count,
            prior_expected_policy_count,
            prior_helper_count,
            prior_unsafe_helper_count;
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE relation.relforcerowsecurity)::integer
    INTO target_rls_count, target_forced_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
          'lab_results',
          'investigations',
          'scan_events',
          'plots_or_hive_clusters',
          'producer_brandings'
      )
      AND relation.relrowsecurity;

    SELECT count(*)::integer
    INTO target_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'lab_results',
          'investigations',
          'scan_events',
          'plots_or_hive_clusters',
          'producer_brandings'
      );

    SELECT count(*)::integer
    INTO expected_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
          (tablename = 'lab_results'
           AND policyname IN (
               'lab_results_tenant_select',
               'lab_results_tenant_insert',
               'lab_results_tenant_update'
           ))
          OR
          (tablename = 'investigations'
           AND policyname IN (
               'investigations_tenant_select',
               'investigations_tenant_insert',
               'investigations_tenant_update'
           ))
          OR
          (tablename = 'scan_events'
           AND policyname IN (
               'scan_events_tenant_select',
               'scan_events_tenant_insert'
           ))
          OR
          (tablename = 'plots_or_hive_clusters'
           AND policyname IN (
               'plots_or_hive_clusters_tenant_select',
               'plots_or_hive_clusters_tenant_insert',
               'plots_or_hive_clusters_tenant_update'
           ))
          OR
          (tablename = 'producer_brandings'
           AND policyname IN (
               'producer_brandings_tenant_select',
               'producer_brandings_tenant_insert',
               'producer_brandings_tenant_update'
           ))
      );

    SELECT count(*)::integer
    INTO incompatible_policy_count
    FROM pg_policy AS policy
    JOIN pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
          'lab_results',
          'investigations',
          'scan_events',
          'plots_or_hive_clusters',
          'producer_brandings'
      )
      AND (
          NOT policy.polpermissive
          OR policy.polroles <> ARRAY['capmint_app'::regrole::oid]
          OR NOT (
              (policy.polname LIKE '%_tenant_select'
               AND policy.polcmd = 'r'
               AND policy.polqual IS NOT NULL
               AND policy.polwithcheck IS NULL)
              OR
              (policy.polname LIKE '%_tenant_insert'
               AND policy.polcmd = 'a'
               AND policy.polqual IS NULL
               AND policy.polwithcheck IS NOT NULL)
              OR
              (policy.polname LIKE '%_tenant_update'
               AND policy.polcmd = 'w'
               AND policy.polqual IS NOT NULL
               AND policy.polwithcheck IS NOT NULL)
          )
          OR position(
              'current_setting(''app.actor_is_system_admin'', true) = ''on'''
              IN replace(
                  concat_ws(
                      ' ',
                      pg_get_expr(policy.polqual, policy.polrelid),
                      pg_get_expr(policy.polwithcheck, policy.polrelid)
                  ),
                  '::text',
                  ''
              )
          ) = 0
          OR position(
              'NULLIF(current_setting(''app.current_organization_id'', true), '''')'
              IN replace(
                  concat_ws(
                      ' ',
                      pg_get_expr(policy.polqual, policy.polrelid),
                      pg_get_expr(policy.polwithcheck, policy.polrelid)
                  ),
                  '::text',
                  ''
              )
          ) = 0
      );

    SELECT count(*)::integer
    INTO new_helper_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND (
          (routine.proname = 'capmint_rls_registered_unit_code'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_unit_code_id uuid, p_public_identifier uuid')
          OR
          (routine.proname = 'capmint_rls_unit_certifier'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_unit_code_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_unit_code_actor'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_unit_code_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_lab_result_writer'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_lot_id uuid, p_submitter_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_producer_has_public_code'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_producer_id uuid')
      );

    SELECT count(*)::integer
    INTO unsafe_new_helper_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    JOIN pg_language AS language
      ON language.oid = routine.prolang
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
          'capmint_rls_registered_unit_code',
          'capmint_rls_unit_certifier',
          'capmint_rls_unit_code_actor',
          'capmint_rls_lab_result_writer',
          'capmint_rls_producer_has_public_code'
      )
      AND (
          NOT routine.prosecdef
          OR routine.provolatile <> 's'
          OR language.lanname <> 'sql'
          OR routine.prorettype <> 'boolean'::regtype
          OR routine.proowner <> 'capmint_admin'::regrole
          OR NOT (
              COALESCE(routine.proconfig, ARRAY[]::text[])
              @> ARRAY['search_path=pg_catalog, public']
          )
          OR EXISTS (
              SELECT 1
              FROM aclexplode(
                  COALESCE(routine.proacl, acldefault('f', routine.proowner))
              ) AS privilege
              WHERE privilege.grantee = 0
                AND privilege.privilege_type = 'EXECUTE'
          )
          OR NOT has_function_privilege('capmint_app', routine.oid, 'EXECUTE')
      );

    SELECT count(*)::integer
    INTO unexpected_rls_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND (relation.relrowsecurity OR relation.relforcerowsecurity)
      AND relation.relname NOT IN (
          'organizations', 'producers', 'certifiers',
          'budgets', 'lots', 'unit_codes',
          'lab_results', 'investigations', 'scan_events',
          'plots_or_hive_clusters', 'producer_brandings'
      );

    SELECT count(*)::integer
    INTO unexpected_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT IN (
          'organizations', 'producers', 'certifiers',
          'budgets', 'lots', 'unit_codes',
          'lab_results', 'investigations', 'scan_events',
          'plots_or_hive_clusters', 'producer_brandings'
      );

    SELECT count(*)::integer
    INTO unexpected_helper_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname LIKE 'capmint_rls_%'
      AND routine.proname NOT IN (
          'capmint_rls_producer_owns',
          'capmint_rls_budget_actor',
          'capmint_rls_lot_actor',
          'capmint_rls_lot_producer',
          'capmint_rls_unit_actor',
          'capmint_rls_has_public_code',
          'capmint_rls_registered_unit_code',
          'capmint_rls_unit_certifier',
          'capmint_rls_unit_code_actor',
          'capmint_rls_lab_result_writer',
          'capmint_rls_producer_has_public_code'
      );

    IF target_forced_count <> 0 THEN
        RAISE EXCEPTION
            '0018_FORCE_RLS_FORBIDDEN: % supporting table(s) force RLS',
            target_forced_count;
    END IF;

    IF unexpected_rls_count <> 0
       OR unexpected_policy_count <> 0
       OR unexpected_helper_count <> 0 THEN
        RAISE EXCEPTION
            '0018_UNEXPECTED_SECURITY_SURFACE: rls=%, policies=%, helpers=%',
            unexpected_rls_count,
            unexpected_policy_count,
            unexpected_helper_count;
    END IF;

    IF NOT (
        (target_rls_count = 0
         AND target_policy_count = 0
         AND new_helper_count = 0
         AND unsafe_new_helper_count = 0)
        OR
        (target_rls_count = 5
         AND target_policy_count = 14
         AND expected_policy_count = 14
         AND incompatible_policy_count = 0
         AND new_helper_count = 5
         AND unsafe_new_helper_count = 0)
    ) THEN
        RAISE EXCEPTION
            '0018_PARTIAL_RLS_STATE: enabled_targets=%, target_policies=%, expected_policies=%, incompatible_policies=%, helpers=%, unsafe_helpers=%',
            target_rls_count,
            target_policy_count,
            expected_policy_count,
            incompatible_policy_count,
            new_helper_count,
            unsafe_new_helper_count;
    END IF;
END;
$capmint_0018_preflight$;

DO $capmint_0018_create_helpers$
BEGIN
    IF to_regprocedure(
        'public.capmint_rls_registered_unit_code(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_registered_unit_code(
                p_unit_code_id uuid,
                p_public_identifier uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT EXISTS (
                    SELECT 1
                    FROM public.unit_codes AS unit_code
                    WHERE unit_code.id = p_unit_code_id
                      AND (
                          p_public_identifier IS NULL
                          OR unit_code.public_identifier = p_public_identifier
                      )
                      AND unit_code.public_identifier IS NOT NULL
                      AND length(unit_code.serial) > 0
                      AND unit_code.gtin ~ '^[0-9]{14}$'
                      AND length(unit_code.digital_link_uri) > 0
                      AND length(unit_code.verification_url) > 0
                )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_unit_certifier(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_unit_certifier(
                p_unit_code_id uuid,
                p_organization_id uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT EXISTS (
                    SELECT 1
                    FROM public.unit_codes AS unit_code
                    JOIN public.lots AS lot
                      ON lot.id = unit_code.lot_id
                    JOIN public.budgets AS budget
                      ON budget.id = lot.budget_id
                    JOIN public.certifiers AS certifier
                      ON certifier.id = budget.certifier_id
                    WHERE unit_code.id = p_unit_code_id
                      AND certifier.organization_id = p_organization_id
                )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_unit_code_actor(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_unit_code_actor(
                p_unit_code_id uuid,
                p_organization_id uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT EXISTS (
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
                    WHERE unit_code.id = p_unit_code_id
                      AND (
                          producer.organization_id = p_organization_id
                          OR certifier.organization_id = p_organization_id
                          OR lot.assigned_laboratory_organization_id =
                             p_organization_id
                      )
                )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_lab_result_writer(uuid,uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_lab_result_writer(
                p_lot_id uuid,
                p_submitter_id uuid,
                p_organization_id uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT EXISTS (
                    SELECT 1
                    FROM public.lots AS lot
                    JOIN public.producers AS producer
                      ON producer.id = lot.producer_id
                    WHERE lot.id = p_lot_id
                      AND (
                          (
                              producer.organization_id = p_organization_id
                              AND p_submitter_id IS NULL
                          )
                          OR
                          (
                              lot.assigned_laboratory_organization_id =
                                  p_organization_id
                              AND p_submitter_id = p_organization_id
                          )
                      )
                )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_producer_has_public_code(uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_producer_has_public_code(
                p_producer_id uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT EXISTS (
                    SELECT 1
                    FROM public.lots AS lot
                    JOIN public.unit_codes AS unit_code
                      ON unit_code.lot_id = lot.id
                    WHERE lot.producer_id = p_producer_id
                      AND unit_code.public_identifier IS NOT NULL
                      AND length(unit_code.serial) > 0
                      AND unit_code.gtin ~ '^[0-9]{14}$'
                      AND length(unit_code.digital_link_uri) > 0
                      AND length(unit_code.verification_url) > 0
                )
            $body$
        $function$;
    END IF;
END;
$capmint_0018_create_helpers$;

ALTER FUNCTION public.capmint_rls_registered_unit_code(uuid, uuid)
    OWNER TO capmint_admin;
ALTER FUNCTION public.capmint_rls_unit_certifier(uuid, uuid)
    OWNER TO capmint_admin;
ALTER FUNCTION public.capmint_rls_unit_code_actor(uuid, uuid)
    OWNER TO capmint_admin;
ALTER FUNCTION public.capmint_rls_lab_result_writer(uuid, uuid, uuid)
    OWNER TO capmint_admin;
ALTER FUNCTION public.capmint_rls_producer_has_public_code(uuid)
    OWNER TO capmint_admin;

REVOKE ALL
    ON FUNCTION public.capmint_rls_registered_unit_code(uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_unit_certifier(uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_unit_code_actor(uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_lab_result_writer(uuid, uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_producer_has_public_code(uuid)
    FROM PUBLIC;

GRANT EXECUTE
    ON FUNCTION public.capmint_rls_registered_unit_code(uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_unit_certifier(uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_unit_code_actor(uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_lab_result_writer(uuid, uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_producer_has_public_code(uuid)
    TO capmint_app;

ALTER TABLE IF EXISTS public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plots_or_hive_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.producer_brandings ENABLE ROW LEVEL SECURITY;

DO $capmint_0018_lab_result_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.lab_results'::regclass
          AND polname = 'lab_results_tenant_select'
    ) THEN
        CREATE POLICY lab_results_tenant_select
            ON public.lab_results FOR SELECT TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_unit_actor(
                        lot_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_has_public_code(NULL, lot_id)
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.lab_results'::regclass
          AND polname = 'lab_results_tenant_insert'
    ) THEN
        CREATE POLICY lab_results_tenant_insert
            ON public.lab_results FOR INSERT TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_lab_result_writer(
                        lot_id,
                        submitted_by_organization_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.lab_results'::regclass
          AND polname = 'lab_results_tenant_update'
    ) THEN
        CREATE POLICY lab_results_tenant_update
            ON public.lab_results FOR UPDATE TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_unit_actor(
                        lot_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_lab_result_writer(
                        lot_id,
                        submitted_by_organization_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;
END;
$capmint_0018_lab_result_policies$;

DO $capmint_0018_investigation_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.investigations'::regclass
          AND polname = 'investigations_tenant_select'
    ) THEN
        CREATE POLICY investigations_tenant_select
            ON public.investigations FOR SELECT TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_unit_certifier(
                        unit_code_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_registered_unit_code(
                        unit_code_id,
                        public_identifier
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.investigations'::regclass
          AND polname = 'investigations_tenant_insert'
    ) THEN
        CREATE POLICY investigations_tenant_insert
            ON public.investigations FOR INSERT TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_registered_unit_code(
                        unit_code_id,
                        public_identifier
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.investigations'::regclass
          AND polname = 'investigations_tenant_update'
    ) THEN
        CREATE POLICY investigations_tenant_update
            ON public.investigations FOR UPDATE TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_unit_certifier(
                        unit_code_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_registered_unit_code(
                        unit_code_id,
                        public_identifier
                    )
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_unit_certifier(
                        unit_code_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_registered_unit_code(
                        unit_code_id,
                        public_identifier
                    )
                )
            );
    END IF;
END;
$capmint_0018_investigation_policies$;

DO $capmint_0018_scan_event_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.scan_events'::regclass
          AND polname = 'scan_events_tenant_select'
    ) THEN
        CREATE POLICY scan_events_tenant_select
            ON public.scan_events FOR SELECT TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_unit_code_actor(
                        unit_code_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_registered_unit_code(
                        unit_code_id,
                        NULL
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.scan_events'::regclass
          AND polname = 'scan_events_tenant_insert'
    ) THEN
        CREATE POLICY scan_events_tenant_insert
            ON public.scan_events FOR INSERT TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_registered_unit_code(
                        unit_code_id,
                        NULL
                    )
                )
            );
    END IF;
END;
$capmint_0018_scan_event_policies$;

DO $capmint_0018_plot_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.plots_or_hive_clusters'::regclass
          AND polname = 'plots_or_hive_clusters_tenant_select'
    ) THEN
        CREATE POLICY plots_or_hive_clusters_tenant_select
            ON public.plots_or_hive_clusters FOR SELECT TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.plots_or_hive_clusters'::regclass
          AND polname = 'plots_or_hive_clusters_tenant_insert'
    ) THEN
        CREATE POLICY plots_or_hive_clusters_tenant_insert
            ON public.plots_or_hive_clusters FOR INSERT TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.plots_or_hive_clusters'::regclass
          AND polname = 'plots_or_hive_clusters_tenant_update'
    ) THEN
        CREATE POLICY plots_or_hive_clusters_tenant_update
            ON public.plots_or_hive_clusters FOR UPDATE TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;
END;
$capmint_0018_plot_policies$;

DO $capmint_0018_branding_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.producer_brandings'::regclass
          AND polname = 'producer_brandings_tenant_select'
    ) THEN
        CREATE POLICY producer_brandings_tenant_select
            ON public.producer_brandings FOR SELECT TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '')::uuid IS NULL
                    AND public.capmint_rls_producer_has_public_code(producer_id)
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.producer_brandings'::regclass
          AND polname = 'producer_brandings_tenant_insert'
    ) THEN
        CREATE POLICY producer_brandings_tenant_insert
            ON public.producer_brandings FOR INSERT TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.producer_brandings'::regclass
          AND polname = 'producer_brandings_tenant_update'
    ) THEN
        CREATE POLICY producer_brandings_tenant_update
            ON public.producer_brandings FOR UPDATE TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(current_setting(
                        'app.current_organization_id', true
                    ), '') IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(current_setting(
                            'app.current_organization_id', true
                        ), '')::uuid
                    )
                )
            );
    END IF;
END;
$capmint_0018_branding_policies$;
