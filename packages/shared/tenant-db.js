const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUBLIC_TENANT_CONTEXT = Object.freeze({ access: 'public' });

export function tenantContextFromUser(user) {
  if (!user || typeof user !== 'object') {
    throw new Error('Authenticated database context requires a verified user.');
  }

  return {
    access: 'authenticated',
    orgId: typeof user.orgId === 'string' ? user.orgId : null,
    isSystemAdmin:
      user.orgType === 'SYSTEM_ADMINISTRATOR' && user.role === 'ADMIN'
  };
}

export async function assertRlsServiceRole(pool, serviceName) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('RLS service role assertion requires a PostgreSQL pool.');
  }
  if (typeof serviceName !== 'string' || serviceName.trim() === '') {
    throw new Error('RLS service role assertion requires a service name.');
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT current_user AS role_name,
             role.rolsuper,
             role.rolbypassrls,
             EXISTS (
               SELECT 1
               FROM pg_class AS relation
               WHERE relation.relrowsecurity
                 AND pg_get_userbyid(relation.relowner) = current_user
             ) AS owns_rls_table
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    const identity = result.rows[0];
    const unsafe =
      result.rowCount !== 1 ||
      identity.role_name !== 'capmint_app' ||
      identity.rolsuper === true ||
      identity.rolbypassrls === true ||
      identity.owns_rls_table === true;

    if (unsafe) {
      const roleName = identity?.role_name || 'unknown';
      throw new Error(
        `${serviceName} refuses unsafe database role "${roleName}"; ` +
        'runtime services require the non-owner, non-bypass role capmint_app.'
      );
    }

    return Object.freeze({
      roleName: identity.role_name,
      isSuperuser: false,
      bypassesRls: false,
      ownsRlsTable: false
    });
  } finally {
    client.release();
  }
}

function resolveContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('Tenant database context is required.');
  }

  if (context.access === 'public') {
    return { orgId: '', actorIsSystemAdmin: 'off' };
  }

  if (context.access !== 'authenticated') {
    throw new Error('Tenant database context access must be authenticated or public.');
  }

  const isSystemAdmin = context.isSystemAdmin === true;
  const orgId =
    typeof context.orgId === 'string' && context.orgId.trim() !== ''
      ? context.orgId.trim()
      : '';

  if (!orgId && !isSystemAdmin) {
    throw new Error(
      'Authenticated database context requires an organization unless the actor is a system administrator.'
    );
  }
  if (orgId && !UUID_PATTERN.test(orgId)) {
    throw new Error('Authenticated database context organization must be a UUID.');
  }

  return {
    orgId,
    actorIsSystemAdmin: isSystemAdmin ? 'on' : 'off'
  };
}

export async function withTenantTx(pool, context, fn) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('withTenantTx requires a PostgreSQL pool.');
  }
  if (typeof fn !== 'function') {
    throw new Error('withTenantTx requires a transaction callback.');
  }

  const resolved = resolveContext(context);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(
      `SELECT
         set_config('app.current_organization_id', $1, true),
         set_config('app.actor_is_system_admin', $2, true)`,
      [resolved.orgId, resolved.actorIsSystemAdmin]
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
