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
