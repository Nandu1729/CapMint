-- 0019: Complete DM-04 RLS coverage for users and the append-only ledger.
DO $preflight$
DECLARE prior_rls int; prior_policies int; target_rls int; target_forced int;
  target_policies int; expected_policies int; bad_policies int; app record;
BEGIN
  IF to_regclass('public.migrations_log') IS NULL OR NOT EXISTS
     (SELECT 1 FROM migrations_log WHERE filename='0018_enable_supporting_table_rls.sql') THEN
    RAISE EXCEPTION '0019_D3B_NOT_RECORDED: migration 0018 must be recorded';
  END IF;
  SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls INTO app FROM pg_roles WHERE rolname='capmint_app';
  IF NOT FOUND OR app.rolsuper OR app.rolcreaterole OR app.rolcreatedb OR app.rolreplication OR app.rolbypassrls THEN
    RAISE EXCEPTION '0019_APP_ROLE_INCOMPATIBLE';
  END IF;
  IF to_regclass('public.users') IS NULL OR to_regclass('public.log_entries') IS NULL THEN RAISE EXCEPTION '0019_TARGET_TABLE_MISSING'; END IF;
  SELECT count(*) INTO prior_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('organizations','producers','certifiers','budgets','lots','unit_codes','lab_results','investigations','scan_events','plots_or_hive_clusters','producer_brandings') AND c.relrowsecurity AND NOT c.relforcerowsecurity;
  SELECT count(*) INTO prior_policies FROM pg_policies WHERE schemaname='public' AND tablename IN ('organizations','producers','certifiers','budgets','lots','unit_codes','lab_results','investigations','scan_events','plots_or_hive_clusters','producer_brandings');
  IF prior_rls<>11 OR prior_policies<>35 THEN RAISE EXCEPTION '0019_PRIOR_RLS_INCOMPATIBLE: tables=%, policies=%',prior_rls,prior_policies; END IF;
  SELECT count(*),count(*) FILTER(WHERE c.relforcerowsecurity) INTO target_rls,target_forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('users','log_entries') AND c.relrowsecurity;
  SELECT count(*) INTO target_policies FROM pg_policies WHERE schemaname='public' AND tablename IN ('users','log_entries');
  SELECT count(*) INTO expected_policies FROM pg_policies WHERE schemaname='public' AND ((tablename='users' AND policyname IN ('users_tenant_select','users_tenant_insert','users_tenant_update','users_tenant_delete')) OR (tablename='log_entries' AND policyname IN ('log_entries_tenant_select','log_entries_tenant_insert')));
  SELECT count(*) INTO bad_policies FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('users','log_entries') AND (NOT p.polpermissive OR p.polroles<>ARRAY['capmint_app'::regrole::oid] OR position('current_setting(''app.actor_is_system_admin'', true) = ''on''' IN replace(concat_ws(' ',pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)),'::text',''))=0 OR position('NULLIF(current_setting(''app.current_organization_id'', true), '''')' IN replace(concat_ws(' ',pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)),'::text',''))=0);
  IF target_forced<>0 THEN RAISE EXCEPTION '0019_FORCE_RLS_FORBIDDEN'; END IF;
  IF NOT ((target_rls=0 AND target_policies=0) OR (target_rls=2 AND target_policies=6 AND expected_policies=6 AND bad_policies=0)) THEN RAISE EXCEPTION '0019_PARTIAL_RLS_STATE: tables=%, policies=%, expected=%, bad=%',target_rls,target_policies,expected_policies,bad_policies; END IF;
END $preflight$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_entries ENABLE ROW LEVEL SECURITY;

DO $policies$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_select') THEN
  CREATE POLICY users_tenant_select ON public.users FOR SELECT TO capmint_app USING (
   current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid OR (NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL AND username IS NOT NULL AND length(password_hash)>0));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_insert') THEN
  CREATE POLICY users_tenant_insert ON public.users FOR INSERT TO capmint_app WITH CHECK (
   current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid OR (NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL AND role='ADMIN' AND status='ACTIVE' AND username IS NOT NULL AND length(password_hash)>0));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_update') THEN
  CREATE POLICY users_tenant_update ON public.users FOR UPDATE TO capmint_app USING (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid) WITH CHECK (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.users'::regclass AND polname='users_tenant_delete') THEN
  CREATE POLICY users_tenant_delete ON public.users FOR DELETE TO capmint_app USING (current_setting('app.actor_is_system_admin',true)='on' OR organization_id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.log_entries'::regclass AND polname='log_entries_tenant_select') THEN
  CREATE POLICY log_entries_tenant_select ON public.log_entries FOR SELECT TO capmint_app USING (current_setting('app.actor_is_system_admin',true)='on' OR NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL OR NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NOT NULL);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.log_entries'::regclass AND polname='log_entries_tenant_insert') THEN
  CREATE POLICY log_entries_tenant_insert ON public.log_entries FOR INSERT TO capmint_app WITH CHECK (
   current_setting('app.actor_is_system_admin',true)='on' OR NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NOT NULL OR (NULLIF(current_setting('app.current_organization_id',true),'')::uuid IS NULL AND ((event_type='GENESIS_BLOCK_ANCHOR' AND entity_type='SYSTEM' AND entity_id='00000000-0000-0000-0000-000000000000'::uuid) OR (event_type='USER_LOGIN' AND entity_type='USER') OR (event_type='ORGANIZATION_REGISTERED' AND entity_type='ORGANIZATION'))));
 END IF;
END $policies$;
