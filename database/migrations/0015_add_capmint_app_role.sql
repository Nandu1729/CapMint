-- 0015: Establish the non-owner application role used by the DM-04 RLS
-- connection lifecycle.
--
-- This migration is intentionally non-enforcing. It does not create policies
-- or enable/force row-level security on any table. LOGIN and credentials are
-- operator-managed after migration execution.

DO $capmint_0015_preflight$
DECLARE
    app_role RECORD;
    app_role_oid OID;
    unexpected_count INTEGER;
    missing_table_count INTEGER;
BEGIN
    SELECT oid,
           rolsuper,
           rolinherit,
           rolcreaterole,
           rolcreatedb,
           rolcanlogin,
           rolreplication,
           rolbypassrls
    INTO app_role
    FROM pg_roles
    WHERE rolname = 'capmint_app';

    IF FOUND THEN
        app_role_oid := app_role.oid;

        IF app_role.rolsuper
           OR app_role.rolinherit
           OR app_role.rolcreaterole
           OR app_role.rolcreatedb
           OR app_role.rolreplication
           OR app_role.rolbypassrls THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_APP_ROLE: capmint_app has elevated role attributes';
        END IF;

        SELECT count(*)::integer
        INTO unexpected_count
        FROM pg_auth_members
        WHERE member = app_role_oid;

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_APP_ROLE_MEMBERSHIP: capmint_app inherits % role membership(s)',
                unexpected_count;
        END IF;

        SELECT
            (SELECT count(*) FROM pg_database WHERE datdba = app_role_oid)
          + (SELECT count(*) FROM pg_namespace WHERE nspowner = app_role_oid)
          + (SELECT count(*) FROM pg_class WHERE relowner = app_role_oid)
          + (SELECT count(*) FROM pg_proc WHERE proowner = app_role_oid)
        INTO unexpected_count;

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_APP_ROLE_OWNERSHIP: capmint_app owns % database object(s)',
                unexpected_count;
        END IF;

        SELECT count(*)::integer
        INTO unexpected_count
        FROM pg_database AS database_record
        CROSS JOIN LATERAL aclexplode(database_record.datacl) AS privilege
        WHERE database_record.datname = current_database()
          AND privilege.grantee = app_role_oid
          AND privilege.privilege_type <> 'CONNECT';

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_DATABASE_GRANTS: capmint_app has unexpected database privileges';
        END IF;

        SELECT count(*)::integer
        INTO unexpected_count
        FROM pg_namespace AS namespace
        CROSS JOIN LATERAL aclexplode(namespace.nspacl) AS privilege
        WHERE namespace.nspname = 'public'
          AND privilege.grantee = app_role_oid
          AND privilege.privilege_type <> 'USAGE';

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_SCHEMA_GRANTS: capmint_app has unexpected public schema privileges';
        END IF;

        SELECT count(*)::integer
        INTO unexpected_count
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(relation.relacl) AS privilege
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND privilege.grantee = app_role_oid
          AND (
              relation.relname NOT IN (
                  'organizations',
                  'users',
                  'certifiers',
                  'producers',
                  'plots_or_hive_clusters',
                  'budgets',
                  'lots',
                  'unit_codes',
                  'lab_results',
                  'scan_events',
                  'log_entries',
                  'investigations',
                  'producer_brandings'
              )
              OR privilege.privilege_type NOT IN (
                  'SELECT',
                  'INSERT',
                  'UPDATE',
                  'DELETE'
              )
          );

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_TABLE_GRANTS: capmint_app has unexpected public table privileges';
        END IF;

        SELECT count(*)::integer
        INTO unexpected_count
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(relation.relacl) AS privilege
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'S'
          AND privilege.grantee = app_role_oid
          AND privilege.privilege_type NOT IN ('USAGE', 'SELECT');

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_SEQUENCE_GRANTS: capmint_app has unexpected public sequence privileges';
        END IF;

        SELECT count(*)::integer
        INTO unexpected_count
        FROM pg_default_acl AS default_acl
        CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) AS privilege
        WHERE privilege.grantee = app_role_oid
          AND (
              default_acl.defaclnamespace <> 'public'::regnamespace
              OR (
                  default_acl.defaclobjtype = 'r'
                  AND privilege.privilege_type NOT IN (
                      'SELECT',
                      'INSERT',
                      'UPDATE',
                      'DELETE'
                  )
              )
              OR (
                  default_acl.defaclobjtype = 'S'
                  AND privilege.privilege_type NOT IN ('USAGE', 'SELECT')
              )
              OR default_acl.defaclobjtype NOT IN ('r', 'S')
          );

        IF unexpected_count <> 0 THEN
            RAISE EXCEPTION
                '0015_INCOMPATIBLE_DEFAULT_GRANTS: capmint_app has unexpected default privileges';
        END IF;
    END IF;

    SELECT count(*)::integer
    INTO missing_table_count
    FROM unnest(ARRAY[
        'organizations',
        'users',
        'certifiers',
        'producers',
        'plots_or_hive_clusters',
        'budgets',
        'lots',
        'unit_codes',
        'lab_results',
        'scan_events',
        'log_entries',
        'investigations',
        'producer_brandings'
    ]) AS expected(table_name)
    WHERE to_regclass(format('public.%I', expected.table_name)) IS NULL;

    IF missing_table_count <> 0 THEN
        RAISE EXCEPTION
            '0015_MISSING_APPLICATION_TABLES: % expected application table(s) are absent',
            missing_table_count;
    END IF;

    SELECT count(*)::integer
    INTO unexpected_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND (relation.relrowsecurity OR relation.relforcerowsecurity);

    IF unexpected_count <> 0 THEN
        RAISE EXCEPTION
            '0015_RLS_ALREADY_ENABLED: % public table(s) already enable or force row-level security',
            unexpected_count;
    END IF;

    SELECT count(*)::integer
    INTO unexpected_count
    FROM pg_policy AS policy
    JOIN pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public';

    IF unexpected_count <> 0 THEN
        RAISE EXCEPTION
            '0015_POLICIES_ALREADY_PRESENT: % public row-level security policy/policies exist',
            unexpected_count;
    END IF;
END;
$capmint_0015_preflight$;

DO $capmint_0015_create_role$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'capmint_app'
    ) THEN
        CREATE ROLE capmint_app
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;
END;
$capmint_0015_create_role$;

DO $capmint_0015_database_grant$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_database AS database_record
        CROSS JOIN LATERAL aclexplode(database_record.datacl) AS privilege
        WHERE database_record.datname = current_database()
          AND privilege.grantee = 'capmint_app'::regrole
          AND privilege.privilege_type = 'CONNECT'
    ) THEN
        EXECUTE format(
            'GRANT CONNECT ON DATABASE %I TO capmint_app',
            current_database()
        );
    END IF;
END;
$capmint_0015_database_grant$;

GRANT USAGE ON SCHEMA public TO capmint_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE
        public.organizations,
        public.users,
        public.certifiers,
        public.producers,
        public.plots_or_hive_clusters,
        public.budgets,
        public.lots,
        public.unit_codes,
        public.lab_results,
        public.scan_events,
        public.log_entries,
        public.investigations,
        public.producer_brandings
    TO capmint_app;

GRANT USAGE, SELECT
    ON ALL SEQUENCES IN SCHEMA public
    TO capmint_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capmint_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO capmint_app;
