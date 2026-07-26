-- 0017: Enable DM-04 D3a row-level security on the core provenance chain.
--
-- RLS is deliberately ENABLED, never FORCED. capmint_app is subject to the
-- policies while the capmint_admin owner continues to run migrations,
-- bootstrap, and seed operations outside RLS.
--
-- The boolean SECURITY DEFINER helpers are intentionally narrow. They return
-- no row data, have a fixed search_path, and exist to prevent policy recursion:
-- the D2 producers policy already traverses budgets for controlling-certifier
-- reads, so a budgets policy that directly traversed producers would recurse.

DO $capmint_0017_preflight$
DECLARE
    app_role RECORD;
    identity_rls_count INTEGER;
    identity_policy_count INTEGER;
    provenance_rls_count INTEGER;
    provenance_forced_count INTEGER;
    provenance_policy_count INTEGER;
    expected_policy_count INTEGER;
    incompatible_policy_count INTEGER;
    unexpected_rls_count INTEGER;
    unexpected_policy_count INTEGER;
    helper_count INTEGER;
    incompatible_helper_count INTEGER;
    unexpected_helper_count INTEGER;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM migrations_log
           WHERE filename = '0016_enable_identity_table_rls.sql'
       ) THEN
        RAISE EXCEPTION
            '0017_D2_NOT_RECORDED: migration 0016 must be recorded before provenance-chain RLS';
    END IF;

    SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO app_role
    FROM pg_roles
    WHERE rolname = 'capmint_app';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            '0017_APP_ROLE_MISSING: capmint_app must exist before provenance-chain RLS';
    END IF;

    IF app_role.rolsuper
       OR app_role.rolcreaterole
       OR app_role.rolcreatedb
       OR app_role.rolreplication
       OR app_role.rolbypassrls THEN
        RAISE EXCEPTION
            '0017_APP_ROLE_INCOMPATIBLE: capmint_app has an RLS-bypassing or elevated attribute';
    END IF;

    IF to_regclass('public.budgets') IS NULL
       OR to_regclass('public.lots') IS NULL
       OR to_regclass('public.unit_codes') IS NULL THEN
        RAISE EXCEPTION
            '0017_PROVENANCE_TABLE_MISSING: budgets, lots, and unit_codes must all exist';
    END IF;

    SELECT count(*)::integer
    INTO identity_rls_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('organizations', 'producers', 'certifiers')
      AND relation.relrowsecurity
      AND NOT relation.relforcerowsecurity;

    SELECT count(*)::integer
    INTO identity_policy_count
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
      );

    IF identity_rls_count <> 3 OR identity_policy_count <> 12 THEN
        RAISE EXCEPTION
            '0017_D2_PHYSICAL_STATE_INCOMPATIBLE: identity_rls=%, identity_policies=%',
            identity_rls_count,
            identity_policy_count;
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE relation.relforcerowsecurity)::integer
    INTO provenance_rls_count, provenance_forced_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('budgets', 'lots', 'unit_codes')
      AND relation.relrowsecurity;

    SELECT count(*)::integer
    INTO provenance_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('budgets', 'lots', 'unit_codes');

    SELECT count(*)::integer
    INTO expected_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
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
    INTO incompatible_policy_count
    FROM pg_policy AS policy
    JOIN pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('budgets', 'lots', 'unit_codes')
      AND (
          NOT policy.polpermissive
          OR policy.polroles <> ARRAY['capmint_app'::regrole::oid]
          OR NOT (
              (policy.polname LIKE '%_tenant_select' AND policy.polcmd = 'r'
               AND policy.polqual IS NOT NULL AND policy.polwithcheck IS NULL)
              OR
              (policy.polname LIKE '%_tenant_insert' AND policy.polcmd = 'a'
               AND policy.polqual IS NULL AND policy.polwithcheck IS NOT NULL)
              OR
              (policy.polname LIKE '%_tenant_update' AND policy.polcmd = 'w'
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
    INTO unexpected_rls_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND (relation.relrowsecurity OR relation.relforcerowsecurity)
      AND relation.relname NOT IN (
          'organizations',
          'producers',
          'certifiers',
          'budgets',
          'lots',
          'unit_codes'
      );

    SELECT count(*)::integer
    INTO unexpected_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT IN (
          'organizations',
          'producers',
          'certifiers',
          'budgets',
          'lots',
          'unit_codes'
      );

    SELECT count(*)::integer
    INTO helper_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND (
          (routine.proname = 'capmint_rls_producer_owns'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_producer_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_budget_actor'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_producer_id uuid, p_certifier_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_lot_actor'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_producer_id uuid, p_budget_id uuid, p_laboratory_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_lot_producer'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_lot_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_unit_actor'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_lot_id uuid, p_organization_id uuid')
          OR
          (routine.proname = 'capmint_rls_has_public_code'
           AND pg_get_function_identity_arguments(routine.oid) =
               'p_budget_id uuid, p_lot_id uuid')
      );

    SELECT count(*)::integer
    INTO incompatible_helper_count
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
          OR routine.proowner <> (
              SELECT relation.relowner
              FROM pg_class AS relation
              WHERE relation.oid = 'public.budgets'::regclass
          )
          OR NOT (
              COALESCE(routine.proconfig, ARRAY[]::text[])
              @> ARRAY['search_path=pg_catalog, public']
          )
          OR EXISTS (
              SELECT 1
              FROM aclexplode(
                  COALESCE(
                      routine.proacl,
                      acldefault('f', routine.proowner)
                  )
              ) AS privilege
              WHERE privilege.grantee = 0
                AND privilege.privilege_type = 'EXECUTE'
          )
          OR NOT has_function_privilege(
              'capmint_app',
              routine.oid,
              'EXECUTE'
          )
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
          'capmint_rls_has_public_code'
      );

    IF provenance_forced_count <> 0 THEN
        RAISE EXCEPTION
            '0017_FORCE_RLS_FORBIDDEN: % provenance table(s) force RLS',
            provenance_forced_count;
    END IF;

    IF unexpected_rls_count <> 0 OR unexpected_policy_count <> 0 THEN
        RAISE EXCEPTION
            '0017_UNEXPECTED_RLS_SURFACE: tables=%, policies=%',
            unexpected_rls_count,
            unexpected_policy_count;
    END IF;

    IF unexpected_helper_count <> 0 THEN
        RAISE EXCEPTION
            '0017_UNEXPECTED_HELPER_SURFACE: % unexpected capmint_rls_* routine(s)',
            unexpected_helper_count;
    END IF;

    IF NOT (
        (provenance_rls_count = 0
         AND provenance_policy_count = 0
         AND helper_count = 0
         AND incompatible_helper_count = 0)
        OR
        (provenance_rls_count = 3
         AND provenance_policy_count = 9
         AND expected_policy_count = 9
         AND incompatible_policy_count = 0
         AND helper_count = 6
         AND incompatible_helper_count = 0)
    ) THEN
        RAISE EXCEPTION
            '0017_PARTIAL_RLS_STATE: enabled_targets=%, target_policies=%, expected_policies=%, incompatible_policies=%, helpers=%, incompatible_helpers=%',
            provenance_rls_count,
            provenance_policy_count,
            expected_policy_count,
            incompatible_policy_count,
            helper_count,
            incompatible_helper_count;
    END IF;
END;
$capmint_0017_preflight$;

DO $capmint_0017_create_helpers$
BEGIN
    IF to_regprocedure(
        'public.capmint_rls_producer_owns(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_producer_owns(
                p_producer_id uuid,
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
                    FROM public.producers AS producer
                    WHERE producer.id = p_producer_id
                      AND producer.organization_id = p_organization_id
                )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_budget_actor(uuid,uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_budget_actor(
                p_producer_id uuid,
                p_certifier_id uuid,
                p_organization_id uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM public.producers AS producer
                        WHERE producer.id = p_producer_id
                          AND producer.organization_id = p_organization_id
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM public.certifiers AS certifier
                        WHERE certifier.id = p_certifier_id
                          AND certifier.organization_id = p_organization_id
                    )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_lot_actor(uuid,uuid,uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_lot_actor(
                p_producer_id uuid,
                p_budget_id uuid,
                p_laboratory_id uuid,
                p_organization_id uuid
            )
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $body$
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM public.producers AS producer
                        WHERE producer.id = p_producer_id
                          AND producer.organization_id = p_organization_id
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM public.budgets AS budget
                        JOIN public.certifiers AS certifier
                          ON certifier.id = budget.certifier_id
                        WHERE budget.id = p_budget_id
                          AND certifier.organization_id = p_organization_id
                    )
                    OR p_laboratory_id = p_organization_id
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_lot_producer(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_lot_producer(
                p_lot_id uuid,
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
                      AND producer.organization_id = p_organization_id
                )
            $body$
        $function$;
    END IF;

    IF to_regprocedure(
        'public.capmint_rls_unit_actor(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_unit_actor(
                p_lot_id uuid,
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
                    JOIN public.budgets AS budget
                      ON budget.id = lot.budget_id
                    JOIN public.certifiers AS certifier
                      ON certifier.id = budget.certifier_id
                    WHERE lot.id = p_lot_id
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
        'public.capmint_rls_has_public_code(uuid,uuid)'
    ) IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.capmint_rls_has_public_code(
                p_budget_id uuid,
                p_lot_id uuid
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
                    WHERE (
                        (p_budget_id IS NOT NULL
                         AND lot.budget_id = p_budget_id)
                        OR
                        (p_lot_id IS NOT NULL
                         AND lot.id = p_lot_id)
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
END;
$capmint_0017_create_helpers$;

REVOKE ALL
    ON FUNCTION public.capmint_rls_producer_owns(uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_budget_actor(uuid, uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_lot_actor(uuid, uuid, uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_lot_producer(uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_unit_actor(uuid, uuid)
    FROM PUBLIC;
REVOKE ALL
    ON FUNCTION public.capmint_rls_has_public_code(uuid, uuid)
    FROM PUBLIC;

GRANT EXECUTE
    ON FUNCTION public.capmint_rls_producer_owns(uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_budget_actor(uuid, uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_lot_actor(uuid, uuid, uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_lot_producer(uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_unit_actor(uuid, uuid)
    TO capmint_app;
GRANT EXECUTE
    ON FUNCTION public.capmint_rls_has_public_code(uuid, uuid)
    TO capmint_app;

ALTER TABLE IF EXISTS public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.unit_codes ENABLE ROW LEVEL SECURITY;

DO $capmint_0017_budget_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.budgets'::regclass
          AND polname = 'budgets_tenant_select'
    ) THEN
        CREATE POLICY budgets_tenant_select
            ON public.budgets
            FOR SELECT
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_budget_actor(
                        producer_id,
                        certifier_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND public.capmint_rls_has_public_code(id, NULL)
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.budgets'::regclass
          AND polname = 'budgets_tenant_insert'
    ) THEN
        CREATE POLICY budgets_tenant_insert
            ON public.budgets
            FOR INSERT
            TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.budgets'::regclass
          AND polname = 'budgets_tenant_update'
    ) THEN
        CREATE POLICY budgets_tenant_update
            ON public.budgets
            FOR UPDATE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_budget_actor(
                        producer_id,
                        certifier_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_budget_actor(
                        producer_id,
                        certifier_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            );
    END IF;
END;
$capmint_0017_budget_policies$;

DO $capmint_0017_lot_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.lots'::regclass
          AND polname = 'lots_tenant_select'
    ) THEN
        CREATE POLICY lots_tenant_select
            ON public.lots
            FOR SELECT
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_lot_actor(
                        producer_id,
                        budget_id,
                        assigned_laboratory_organization_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND public.capmint_rls_has_public_code(NULL, id)
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.lots'::regclass
          AND polname = 'lots_tenant_insert'
    ) THEN
        CREATE POLICY lots_tenant_insert
            ON public.lots
            FOR INSERT
            TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_producer_owns(
                        producer_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.lots'::regclass
          AND polname = 'lots_tenant_update'
    ) THEN
        CREATE POLICY lots_tenant_update
            ON public.lots
            FOR UPDATE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_lot_actor(
                        producer_id,
                        budget_id,
                        assigned_laboratory_organization_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_lot_actor(
                        producer_id,
                        budget_id,
                        assigned_laboratory_organization_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            );
    END IF;
END;
$capmint_0017_lot_policies$;

DO $capmint_0017_unit_code_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.unit_codes'::regclass
          AND polname = 'unit_codes_tenant_select'
    ) THEN
        CREATE POLICY unit_codes_tenant_select
            ON public.unit_codes
            FOR SELECT
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_unit_actor(
                        lot_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND public_identifier IS NOT NULL
                    AND length(serial) > 0
                    AND gtin ~ '^[0-9]{14}$'
                    AND length(digital_link_uri) > 0
                    AND length(verification_url) > 0
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.unit_codes'::regclass
          AND polname = 'unit_codes_tenant_insert'
    ) THEN
        CREATE POLICY unit_codes_tenant_insert
            ON public.unit_codes
            FOR INSERT
            TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_lot_producer(
                        lot_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.unit_codes'::regclass
          AND polname = 'unit_codes_tenant_update'
    ) THEN
        CREATE POLICY unit_codes_tenant_update
            ON public.unit_codes
            FOR UPDATE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_unit_actor(
                        lot_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND public_identifier IS NOT NULL
                    AND length(serial) > 0
                    AND gtin ~ '^[0-9]{14}$'
                    AND length(digital_link_uri) > 0
                    AND length(verification_url) > 0
                    AND current_state <> 'REVOKED'
                    AND revoked_at IS NULL
                )
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND public.capmint_rls_unit_actor(
                        lot_id,
                        NULLIF(
                            current_setting(
                                'app.current_organization_id',
                                true
                            ),
                            ''
                        )::uuid
                    )
                )
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND public_identifier IS NOT NULL
                    AND length(serial) > 0
                    AND gtin ~ '^[0-9]{14}$'
                    AND length(digital_link_uri) > 0
                    AND length(verification_url) > 0
                    AND current_state <> 'REVOKED'
                    AND revoked_at IS NULL
                )
            );
    END IF;
END;
$capmint_0017_unit_code_policies$;
