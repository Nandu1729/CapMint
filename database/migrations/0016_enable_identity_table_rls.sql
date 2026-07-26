-- 0016: Enable DM-04 D2 row-level security on the three direct-organization
-- identity tables. Transactional and join-scoped tables remain a D3 concern.
--
-- RLS is deliberately ENABLED, never FORCED: capmint_app is subject to these
-- policies while the capmint_admin owner continues to run migrations,
-- bootstrap, and seed operations outside RLS.

DO $capmint_0016_preflight$
DECLARE
    app_role RECORD;
    rls_count INTEGER;
    forced_count INTEGER;
    target_policy_count INTEGER;
    unexpected_policy_count INTEGER;
    expected_policy_count INTEGER;
    incompatible_policy_count INTEGER;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM migrations_log
           WHERE filename = '0015_add_capmint_app_role.sql'
       ) THEN
        RAISE EXCEPTION
            '0016_D1_NOT_RECORDED: migration 0015 must be recorded before identity-table RLS';
    END IF;

    SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO app_role
    FROM pg_roles
    WHERE rolname = 'capmint_app';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            '0016_APP_ROLE_MISSING: capmint_app must exist before identity-table RLS';
    END IF;

    IF app_role.rolsuper
       OR app_role.rolcreaterole
       OR app_role.rolcreatedb
       OR app_role.rolreplication
       OR app_role.rolbypassrls THEN
        RAISE EXCEPTION
            '0016_APP_ROLE_INCOMPATIBLE: capmint_app has an RLS-bypassing or elevated attribute';
    END IF;

    IF to_regclass('public.organizations') IS NULL
       OR to_regclass('public.producers') IS NULL
       OR to_regclass('public.certifiers') IS NULL THEN
        RAISE EXCEPTION
            '0016_IDENTITY_TABLE_MISSING: organizations, producers, and certifiers must all exist';
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (WHERE relation.relforcerowsecurity)::integer
    INTO rls_count, forced_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('organizations', 'producers', 'certifiers')
      AND relation.relrowsecurity;

    SELECT count(*)::integer
    INTO target_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('organizations', 'producers', 'certifiers');

    SELECT count(*)::integer
    INTO unexpected_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT IN ('organizations', 'producers', 'certifiers');

    SELECT count(*)::integer
    INTO expected_policy_count
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

    SELECT count(*)::integer
    INTO incompatible_policy_count
    FROM pg_policy AS policy
    JOIN pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('organizations', 'producers', 'certifiers')
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
              OR
              (policy.polname LIKE '%_tenant_delete' AND policy.polcmd = 'd'
               AND policy.polqual IS NOT NULL AND policy.polwithcheck IS NULL)
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

    IF forced_count <> 0 THEN
        RAISE EXCEPTION
            '0016_FORCE_RLS_FORBIDDEN: % target table(s) force RLS',
            forced_count;
    END IF;

    IF unexpected_policy_count <> 0 THEN
        RAISE EXCEPTION
            '0016_UNEXPECTED_NON_TARGET_POLICIES: % policy/policies exist outside the D2 identity tables',
            unexpected_policy_count;
    END IF;

    IF NOT (
        (rls_count = 0 AND target_policy_count = 0)
        OR
        (rls_count = 3
         AND target_policy_count = 12
         AND expected_policy_count = 12
         AND incompatible_policy_count = 0)
    ) THEN
        RAISE EXCEPTION
            '0016_PARTIAL_RLS_STATE: enabled_targets=%, target_policies=%, expected_policies=%, incompatible_policies=%',
            rls_count,
            target_policy_count,
            expected_policy_count,
            incompatible_policy_count;
    END IF;
END;
$capmint_0016_preflight$;

ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certifiers ENABLE ROW LEVEL SECURITY;

DO $capmint_0016_organizations_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.organizations'::regclass
          AND polname = 'organizations_tenant_select'
    ) THEN
        CREATE POLICY organizations_tenant_select
            ON public.organizations
            FOR SELECT
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
                OR NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                ) IS NULL
                OR (
                    status = 'ACTIVATED'
                    AND type IN ('CERTIFICATION_BODY', 'NABL_LABORATORY')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.organizations'::regclass
          AND polname = 'organizations_tenant_insert'
    ) THEN
        CREATE POLICY organizations_tenant_insert
            ON public.organizations
            FOR INSERT
            TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND COALESCE(
                        current_setting('app.actor_is_system_admin', true),
                        'off'
                    ) <> 'on'
                    AND status = 'PENDING'
                    AND type IN (
                        'PRODUCER',
                        'NABL_LABORATORY',
                        'CERTIFICATION_BODY',
                        'EXPORTER'
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.organizations'::regclass
          AND polname = 'organizations_tenant_update'
    ) THEN
        CREATE POLICY organizations_tenant_update
            ON public.organizations
            FOR UPDATE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.organizations'::regclass
          AND polname = 'organizations_tenant_delete'
    ) THEN
        CREATE POLICY organizations_tenant_delete
            ON public.organizations
            FOR DELETE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;
END;
$capmint_0016_organizations_policies$;

DO $capmint_0016_producers_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.producers'::regclass
          AND polname = 'producers_tenant_select'
    ) THEN
        CREATE POLICY producers_tenant_select
            ON public.producers
            FOR SELECT
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.lots AS public_lot
                        JOIN public.unit_codes AS public_code
                          ON public_code.lot_id = public_lot.id
                        WHERE public_lot.producer_id = producers.id
                    )
                )
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.budgets AS controlled_budget
                        JOIN public.certifiers AS controlling_certifier
                          ON controlling_certifier.id =
                             controlled_budget.certifier_id
                        WHERE controlled_budget.producer_id = producers.id
                          AND controlling_certifier.organization_id =
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
        WHERE polrelid = 'public.producers'::regclass
          AND polname = 'producers_tenant_insert'
    ) THEN
        CREATE POLICY producers_tenant_insert
            ON public.producers
            FOR INSERT
            TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.producers'::regclass
          AND polname = 'producers_tenant_update'
    ) THEN
        CREATE POLICY producers_tenant_update
            ON public.producers
            FOR UPDATE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.producers'::regclass
          AND polname = 'producers_tenant_delete'
    ) THEN
        CREATE POLICY producers_tenant_delete
            ON public.producers
            FOR DELETE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;
END;
$capmint_0016_producers_policies$;

DO $capmint_0016_certifiers_policies$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.certifiers'::regclass
          AND polname = 'certifiers_tenant_select'
    ) THEN
        CREATE POLICY certifiers_tenant_select
            ON public.certifiers
            FOR SELECT
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
                OR (
                    NULLIF(
                        current_setting('app.current_organization_id', true),
                        ''
                    ) IS NOT NULL
                    AND key_status = 'ACTIVE'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.certifiers'::regclass
          AND polname = 'certifiers_tenant_insert'
    ) THEN
        CREATE POLICY certifiers_tenant_insert
            ON public.certifiers
            FOR INSERT
            TO capmint_app
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.certifiers'::regclass
          AND polname = 'certifiers_tenant_update'
    ) THEN
        CREATE POLICY certifiers_tenant_update
            ON public.certifiers
            FOR UPDATE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            )
            WITH CHECK (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.certifiers'::regclass
          AND polname = 'certifiers_tenant_delete'
    ) THEN
        CREATE POLICY certifiers_tenant_delete
            ON public.certifiers
            FOR DELETE
            TO capmint_app
            USING (
                current_setting('app.actor_is_system_admin', true) = 'on'
                OR organization_id = NULLIF(
                    current_setting('app.current_organization_id', true),
                    ''
                )::uuid
            );
    END IF;
END;
$capmint_0016_certifiers_policies$;
