-- 0020: Remove the blanket public organizations read while preserving public
-- self-registration through one owner-executed, narrowly granted function.

DO $capmint_0020_preflight$
DECLARE
    app_role record;
    registration_function_count integer;
    expected_registration_function_count integer;
    target_index_count integer;
    exact_target_index_count integer;
    organization_policy_count integer;
    predecessor_policy_count integer;
    successor_policy_count integer;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.migrations_log
           WHERE filename = '0019_enable_users_and_ledger_rls.sql'
       ) THEN
        RAISE EXCEPTION
            '0020_D3C_NOT_RECORDED: migration 0019 must be recorded';
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
        RAISE EXCEPTION '0020_APP_ROLE_INCOMPATIBLE';
    END IF;

    IF to_regclass('public.organizations') IS NULL
       OR to_regclass('public.users') IS NULL
       OR to_regclass('public.log_entries') IS NULL THEN
        RAISE EXCEPTION '0020_TARGET_TABLE_MISSING';
    END IF;

    SELECT count(*)::integer
    INTO registration_function_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'capmint_register_organization';

    SELECT count(*)::integer
    INTO expected_registration_function_count
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    JOIN pg_language AS language
      ON language.oid = routine.prolang
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'capmint_register_organization'
      AND pg_get_function_identity_arguments(routine.oid) =
          'p_name text, p_type text, p_business_reg_details jsonb, p_official_email text, p_contact_info jsonb, p_admin_username text, p_admin_password_hash text'
      AND pg_get_function_result(routine.oid) =
          'TABLE(organization jsonb, admin_user jsonb)'
      AND routine.prosecdef
      AND routine.provolatile = 'v'
      AND pg_get_userbyid(routine.proowner) = 'capmint_admin'
      AND language.lanname = 'plpgsql'
      AND routine.proconfig = ARRAY['search_path=public']::text[]
      AND encode(
          sha256(
              convert_to(
                  regexp_replace(
                      btrim(routine.prosrc, E' \n\r\t'),
                      '[[:space:]]+',
                      ' ',
                      'g'
                  ),
                  'UTF8'
              )
          ),
          'hex'
      ) = 'ff3b8a0f3ef80e9653f292a044f381dddef7a3275879d357d03361bcfeb8ef7c'
      AND EXISTS (
          SELECT 1
          FROM aclexplode(
              COALESCE(
                  routine.proacl,
                  acldefault('f', routine.proowner)
              )
          ) AS privilege
          WHERE privilege.grantee = 'capmint_app'::regrole::oid
            AND privilege.privilege_type = 'EXECUTE'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM aclexplode(
              COALESCE(
                  routine.proacl,
                  acldefault('f', routine.proowner)
              )
          ) AS privilege
          WHERE privilege.grantee = 0
             OR privilege.grantee NOT IN (
                 routine.proowner,
                 'capmint_app'::regrole::oid
             )
             OR privilege.privilege_type <> 'EXECUTE'
      );

    IF registration_function_count NOT IN (0, 1)
       OR expected_registration_function_count <> registration_function_count THEN
        RAISE EXCEPTION
            '0020_REGISTRATION_FUNCTION_INCOMPATIBLE: functions=%, exact_shape=%',
            registration_function_count,
            expected_registration_function_count;
    END IF;

    SELECT count(*)::integer
    INTO target_index_count
    FROM pg_class AS index_relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND index_relation.relname IN (
          'organizations_tax_id_unique',
          'organizations_registration_number_unique'
      );

    SELECT count(*)::integer
    INTO exact_target_index_count
    FROM pg_index AS index_state
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_state.indexrelid
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_state.indrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_relation.oid = 'public.organizations'::regclass
      AND index_state.indisunique
      AND index_state.indisvalid
      AND index_state.indisready
      AND (
          (
              index_relation.relname = 'organizations_tax_id_unique'
              AND pg_get_expr(
                  index_state.indexprs,
                  index_state.indrelid
              ) = '(business_reg_details ->> ''tax_id''::text)'
              AND pg_get_expr(
                  index_state.indpred,
                  index_state.indrelid
              ) = '(business_reg_details ? ''tax_id''::text)'
          )
          OR
          (
              index_relation.relname =
                  'organizations_registration_number_unique'
              AND pg_get_expr(
                  index_state.indexprs,
                  index_state.indrelid
              ) =
                  '(business_reg_details ->> ''registration_number''::text)'
              AND pg_get_expr(
                  index_state.indpred,
                  index_state.indrelid
              ) =
                  '(business_reg_details ? ''registration_number''::text)'
          )
      );

    IF target_index_count NOT IN (0, 2)
       OR exact_target_index_count <> target_index_count THEN
        RAISE EXCEPTION
            '0020_UNIQUE_INDEX_STATE_INCOMPATIBLE: indexes=%, exact=%',
            target_index_count,
            exact_target_index_count;
    END IF;

    SELECT count(*)::integer,
           count(*) FILTER (
               WHERE encode(
                   sha256(
                       convert_to(
                           'SELECT|'
                           || regexp_replace(
                               replace(
                                   btrim(
                                       pg_get_expr(
                                           policy.polqual,
                                           policy.polrelid
                                       ),
                                       E' \n\r\t'
                                   ),
                                   '::text',
                                   ''
                               ),
                               '[[:space:]]+',
                               ' ',
                               'g'
                           )
                           || '|',
                           'UTF8'
                       )
                   ),
                   'hex'
               ) =
                   'bb7d4d8f8246bc5b4bbb870081df7fbde9ed50fe8537c532fe16446c0a716c28'
           )::integer,
           count(*) FILTER (
               WHERE encode(
                   sha256(
                       convert_to(
                           'SELECT|'
                           || regexp_replace(
                               replace(
                                   btrim(
                                       pg_get_expr(
                                           policy.polqual,
                                           policy.polrelid
                                       ),
                                       E' \n\r\t'
                                   ),
                                   '::text',
                                   ''
                               ),
                               '[[:space:]]+',
                               ' ',
                               'g'
                           )
                           || '|',
                           'UTF8'
                       )
                   ),
                   'hex'
               ) =
                   '15a8d09ca5e6a2673ae3399542d58ab70e7218ae39dc8cd659766fd096a04677'
           )::integer
    INTO organization_policy_count, predecessor_policy_count, successor_policy_count
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.organizations'::regclass
      AND policy.polname = 'organizations_tenant_select'
      AND policy.polpermissive
      AND policy.polroles = ARRAY['capmint_app'::regrole::oid]
      AND policy.polcmd = 'r'
      AND policy.polqual IS NOT NULL
      AND policy.polwithcheck IS NULL;

    IF organization_policy_count <> 1
       OR predecessor_policy_count + successor_policy_count <> 1 THEN
        RAISE EXCEPTION
            '0020_ORGANIZATIONS_POLICY_INCOMPATIBLE: policies=%, predecessor=%, successor=%',
            organization_policy_count,
            predecessor_policy_count,
            successor_policy_count;
    END IF;

    IF NOT (
        (
            registration_function_count = 0
            AND target_index_count = 0
            AND predecessor_policy_count = 1
        )
        OR
        (
            registration_function_count = 1
            AND target_index_count = 2
            AND successor_policy_count = 1
        )
    ) THEN
        RAISE EXCEPTION
            '0020_PARTIAL_STATE: functions=%, indexes=%, predecessor_policy=%, successor_policy=%',
            registration_function_count,
            target_index_count,
            predecessor_policy_count,
            successor_policy_count;
    END IF;

    IF target_index_count = 0
       AND EXISTS (
           SELECT business_reg_details->>'tax_id'
           FROM public.organizations
           WHERE business_reg_details ? 'tax_id'
           GROUP BY business_reg_details->>'tax_id'
           HAVING count(*) > 1
       ) THEN
        RAISE EXCEPTION '0020_DUPLICATE_TAX_ID';
    END IF;

    IF target_index_count = 0
       AND EXISTS (
           SELECT business_reg_details->>'registration_number'
           FROM public.organizations
           WHERE business_reg_details ? 'registration_number'
           GROUP BY business_reg_details->>'registration_number'
           HAVING count(*) > 1
       ) THEN
        RAISE EXCEPTION '0020_DUPLICATE_REGISTRATION_NUMBER';
    END IF;
END;
$capmint_0020_preflight$;

CREATE OR REPLACE FUNCTION public.capmint_register_organization(
    p_name text,
    p_type text,
    p_business_reg_details jsonb,
    p_official_email text,
    p_contact_info jsonb,
    p_admin_username text,
    p_admin_password_hash text
)
RETURNS TABLE(organization jsonb, admin_user jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $capmint_0020_function$
DECLARE
    new_organization public.organizations%ROWTYPE;
    new_admin_user jsonb;
    normalized_business_details jsonb :=
        COALESCE(p_business_reg_details, '{}'::jsonb);
    normalized_contact_info jsonb :=
        COALESCE(p_contact_info, '{}'::jsonb);
    previous_hash text :=
        '0000000000000000000000000000000000000000000000000000000000000000';
    payload_hash text;
    current_hash text;
BEGIN
    IF p_name IS NULL
       OR btrim(p_name) = ''
       OR p_official_email IS NULL
       OR btrim(p_official_email) = ''
       OR p_admin_username IS NULL
       OR btrim(p_admin_username) = ''
       OR p_admin_password_hash IS NULL
       OR p_admin_password_hash = '' THEN
        RAISE EXCEPTION
            USING ERRCODE = '22023',
                  MESSAGE = 'REGISTRATION_INVALID_INPUT';
    END IF;

    IF p_type IS NULL
       OR p_type NOT IN (
           'PRODUCER',
           'NABL_LABORATORY',
           'CERTIFICATION_BODY',
           'EXPORTER'
       ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '22023',
                  MESSAGE = 'REGISTRATION_INVALID_TYPE';
    END IF;

    IF normalized_business_details ? 'tax_id'
       AND EXISTS (
           SELECT 1
           FROM public.organizations AS existing_organization
           WHERE existing_organization.business_reg_details->>'tax_id' =
                 normalized_business_details->>'tax_id'
       ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23505',
                  MESSAGE = 'REGISTRATION_EXISTS',
                  DETAIL = 'tax_id';
    END IF;

    IF normalized_business_details ? 'registration_number'
       AND EXISTS (
           SELECT 1
           FROM public.organizations AS existing_organization
           WHERE existing_organization.business_reg_details
                     ->>'registration_number' =
                 normalized_business_details->>'registration_number'
       ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23505',
                  MESSAGE = 'REGISTRATION_EXISTS',
                  DETAIL = 'registration_number';
    END IF;

    BEGIN
        INSERT INTO public.organizations (
            name,
            type,
            business_reg_details,
            official_email,
            contact_info,
            status
        )
        VALUES (
            p_name,
            p_type,
            normalized_business_details,
            p_official_email,
            normalized_contact_info,
            'PENDING'
        )
        RETURNING *
        INTO new_organization;

        INSERT INTO public.users (
            organization_id,
            username,
            password_hash,
            role,
            status
        )
        VALUES (
            new_organization.id,
            p_admin_username,
            p_admin_password_hash,
            'ADMIN',
            'ACTIVE'
        )
        RETURNING jsonb_build_object(
            'id', id,
            'username', username,
            'role', role,
            'status', status,
            'created_at', created_at
        )
        INTO new_admin_user;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION
                USING ERRCODE = '23505',
                      MESSAGE = 'REGISTRATION_EXISTS',
                      DETAIL = 'organization or administrator uniqueness';
    END;

    LOCK TABLE public.log_entries IN SHARE ROW EXCLUSIVE MODE;

    SELECT ledger.current_hash
    INTO previous_hash
    FROM public.log_entries AS ledger
    ORDER BY ledger.created_at DESC, ledger.id DESC
    LIMIT 1;

    previous_hash := COALESCE(
        previous_hash,
        '0000000000000000000000000000000000000000000000000000000000000000'
    );
    payload_hash := encode(
        sha256(
            convert_to(
                jsonb_build_object(
                    'organization_id',
                    new_organization.id
                )::text,
                'UTF8'
            )
        ),
        'hex'
    );
    current_hash := encode(
        sha256(
            convert_to(
                'ORGANIZATION'
                || new_organization.id::text
                || 'ORGANIZATION_REGISTERED'
                || payload_hash
                || previous_hash,
                'UTF8'
            )
        ),
        'hex'
    );

    INSERT INTO public.log_entries (
        entity_type,
        entity_id,
        event_type,
        payload_hash,
        previous_hash,
        current_hash
    )
    VALUES (
        'ORGANIZATION',
        new_organization.id,
        'ORGANIZATION_REGISTERED',
        payload_hash,
        previous_hash,
        current_hash
    );

    RETURN QUERY
    SELECT to_jsonb(new_organization), new_admin_user;
END;
$capmint_0020_function$;

ALTER FUNCTION public.capmint_register_organization(
    text,
    text,
    jsonb,
    text,
    jsonb,
    text,
    text
)
OWNER TO capmint_admin;

REVOKE ALL
ON FUNCTION public.capmint_register_organization(
    text,
    text,
    jsonb,
    text,
    jsonb,
    text,
    text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.capmint_register_organization(
    text,
    text,
    jsonb,
    text,
    jsonb,
    text,
    text
)
TO capmint_app;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_tax_id_unique
    ON public.organizations (
        (business_reg_details->>'tax_id')
    )
    WHERE business_reg_details ? 'tax_id';

CREATE UNIQUE INDEX IF NOT EXISTS organizations_registration_number_unique
    ON public.organizations (
        (business_reg_details->>'registration_number')
    )
    WHERE business_reg_details ? 'registration_number';

DROP POLICY IF EXISTS organizations_tenant_select
    ON public.organizations;

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
        OR (
            status = 'ACTIVATED'
            AND type IN ('CERTIFICATION_BODY', 'NABL_LABORATORY')
        )
    );
