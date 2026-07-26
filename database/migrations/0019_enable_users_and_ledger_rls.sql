-- 0019: Complete DM-04 RLS coverage for users and the append-only ledger.
--
-- log_entries is one global hash chain. Full-chain public reads are required
-- for transparency integrity verification, so its SELECT policy is deliberately
-- global (`USING (true)`), not tenant-scoped. Appends are controlled; no UPDATE
-- or DELETE policy exists for capmint_app. The owner retains maintenance access
-- because RLS is ENABLED, never FORCED.

DO $capmint_0019_preflight$
DECLARE
    prior_rls_count integer;
    prior_policy_count integer;
    target_rls_count integer;
    target_forced_count integer;
    target_policy_count integer;
    expected_policy_count integer;
    incompatible_policy_count integer;
    global_read_count integer;
    app_role record;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (SELECT 1 FROM migrations_log WHERE filename = '0018_enable_supporting_table_rls.sql') THEN
        RAISE EXCEPTION '0019_D3B_NOT_RECORDED: migration 0018 must be recorded';
    END IF;
    SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
      INTO app_role FROM pg_roles WHERE rolname = 'capmint_app';
    IF NOT FOUND OR app_role.rolsuper OR app_role.rolcreaterole OR app_role.rolcreatedb
       OR app_role.rolreplication OR app_role.rolbypassrls THEN
        RAISE EXCEPTION '0019_APP_ROLE_INCOMPATIBLE';
    END IF;
    IF to_regclass('public.users') IS NULL OR to_regclass('public.log_entries') IS NULL THEN
        RAISE EXCEPTION '0019_TARGET_TABLE_MISSING';
    END IF;
    SELECT count(*) INTO prior_rls_count
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('organizations','producers','certifiers','budgets','lots','unit_codes','lab_results','investigations','scan_events','plots_or_hive_clusters','producer_brandings')
       AND c.relrowsecurity AND NOT c.relforcerowsecurity;
    SELECT count(*) INTO prior_policy_count FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('organizations','producers','certifiers','budgets','lots','unit_codes','lab_results','investigations','scan_events','plots_or_hive_clusters','producer_brandings');
    IF prior_rls_count <> 11 OR prior_policy_count <> 35 THEN
        RAISE EXCEPTION '0019_PRIOR_RLS_INCOMPATIBLE: tables=%, policies=%', prior_rls_count, prior_policy_count;
    END IF;
    SELECT count(*), count(*) FILTER (WHERE c.relforcerowsecurity)
      INTO target_rls_count, target_forced_count
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('users','log_entries') AND c.relrowsecurity;
    SELECT count(*) INTO target_policy_count FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('users','log_entries');
    SELECT count(*) INTO expected_policy_count FROM pg_policies
     WHERE schemaname = 'public' AND ((tablename='users' AND policyname IN ('users_tenant_select','users_tenant_insert','users_tenant_update','users_tenant_delete')) OR (tablename='log_entries' AND policyname IN ('log_entries_tenant_select','log_entries_tenant_insert')));
    -- Documented global-read exemption: exactly permissive capmint_app SELECT USING (true).
    SELECT count(*) INTO global_read_count FROM pg_policy p
     WHERE p.polrelid = 'public.log_entries'::regclass AND p.polname = 'log_entries_tenant_select'
       AND p.polpermissive AND p.polroles = ARRAY['capmint_app'::regrole::oid]
       AND p.polcmd = 'r' AND pg_get_expr(p.polqual, p.polrelid) = 'true' AND p.polwithcheck IS NULL;
    -- Every other 0019 policy must carry real safe-tenant and admin branches and command shape.
    SELECT count(*) INTO incompatible_policy_count
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname IN ('users','log_entries')
       AND NOT (c.relname = 'log_entries' AND p.polname = 'log_entries_tenant_select')
       AND (NOT p.polpermissive OR p.polroles <> ARRAY['capmint_app'::regrole::oid]
            OR NOT ((p.polname LIKE '%_select' AND p.polcmd='r' AND p.polqual IS NOT NULL AND p.polwithcheck IS NULL)
                 OR (p.polname LIKE '%_insert' AND p.polcmd='a' AND p.polqual IS NULL AND p.polwithcheck IS NOT NULL)
                 OR (p.polname LIKE '%_update' AND p.polcmd='w' AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL)
                 OR (p.polname LIKE '%_delete' AND p.polcmd='d' AND p.polqual IS NOT NULL AND p.polwithcheck IS NULL))
            OR position('current_setting(''app.actor_is_system_admin'', true) = ''on''' IN replace(concat_ws(' ',pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)),'::text',''))=0
            OR position('NULLIF(current_setting(''app.current_organization_id'', true), '''')' IN replace(concat_ws(' ',pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)),'::text',''))=0);
    IF target_forced_count <> 0 THEN RAISE EXCEPTION '0019_FORCE_RLS_FORBIDDEN'; END IF;
    IF NOT ((target_rls_count=0 AND target_policy_count=0)
         OR (target_rls_count=2 AND target_policy_count=6 AND expected_policy_count=6
             AND incompatible_policy_count=0
             AND global_read_count=1)) THEN
        RAISE EXCEPTION '0019_PARTIAL_RLS_STATE: tables=%, policies=%, expected=%, incompatible=%', target_rls_count,target_policy_count,expected_policy_count,incompatible_policy_count;
    END IF;
END;
$capmint_0019_preflight$;

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.log_entries ENABLE ROW LEVEL SECURITY;

DO $capmint_0019_policies$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_select') THEN
        CREATE POLICY users_tenant_select ON public.users FOR SELECT TO capmint_app USING (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid OR (NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL AND username IS NOT NULL AND length(password_hash)>0));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_insert') THEN
        CREATE POLICY users_tenant_insert ON public.users FOR INSERT TO capmint_app WITH CHECK (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid OR (NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL AND role='ADMIN' AND status='ACTIVE' AND username IS NOT NULL AND length(password_hash)>0));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_update') THEN
        CREATE POLICY users_tenant_update ON public.users FOR UPDATE TO capmint_app USING (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid) WITH CHECK (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_delete') THEN
        CREATE POLICY users_tenant_delete ON public.users FOR DELETE TO capmint_app USING (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid);
    END IF;
    -- Replace only the former tautological D3c read policy with the honest global policy.
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.log_entries'::regclass AND polname='log_entries_tenant_select' AND pg_get_expr(polqual, polrelid) <> 'true') THEN
        DROP POLICY log_entries_tenant_select ON public.log_entries;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.log_entries'::regclass AND polname='log_entries_tenant_select') THEN
        CREATE POLICY log_entries_tenant_select ON public.log_entries FOR SELECT TO capmint_app USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.log_entries'::regclass AND polname='log_entries_tenant_insert') THEN
        CREATE POLICY log_entries_tenant_insert ON public.log_entries FOR INSERT TO capmint_app WITH CHECK (current_setting('app.actor_is_system_admin',true)='on' OR NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NOT NULL OR (NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL AND ((event_type='GENESIS_BLOCK_ANCHOR' AND entity_type='SYSTEM' AND entity_id='00000000-0000-0000-0000-000000000000'::uuid) OR (event_type='USER_LOGIN' AND entity_type='USER') OR (event_type='ORGANIZATION_REGISTERED' AND entity_type='ORGANIZATION'))));
    END IF;
END;
$capmint_0019_policies$;
