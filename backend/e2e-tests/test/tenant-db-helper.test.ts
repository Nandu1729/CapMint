import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  PUBLIC_TENANT_CONTEXT,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';

const RUN_INTEGRATION = process.env.RUN_D1_INTEGRATION === '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TEST_DATABASE_NAME = `capmint_d1_tenant_tx_${process.env.D1_TEST_RUN_ID || 'local'}`;
const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '20000000-0000-4000-8000-000000000002';

dotenv.config({ path: path.join(ROOT, '.env') });

function quoteDatabaseName(name: string): string {
  if (!/^capmint_d1_tenant_tx_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing unsafe disposable database name: ${name}`);
  }
  return `"${name}"`;
}

describe('withTenantTx fail-closed contract', () => {
  it('rejects an authenticated actor without an organization before checkout', async () => {
    const connect = vi.fn();

    await expect(
      withTenantTx(
        { connect } as any,
        { access: 'authenticated', orgId: null, isSystemAdmin: false },
        async () => undefined
      )
    ).rejects.toThrow('requires an organization');
    expect(connect).not.toHaveBeenCalled();
  });
});

const integrationSuite = RUN_INTEGRATION ? describe : describe.skip;

integrationSuite('withTenantTx PostgreSQL lifecycle', () => {
  let adminPool: pg.Pool;
  let tenantPool: pg.Pool;

  beforeAll(async () => {
    const sourceDatabaseUrl = process.env.DATABASE_URL;
    if (!sourceDatabaseUrl) {
      throw new Error('DATABASE_URL is required without exposing its value.');
    }
    const sourceUrl = new URL(sourceDatabaseUrl);
    if (!['localhost', '127.0.0.1', '::1'].includes(sourceUrl.hostname)) {
      throw new Error('D1 lifecycle integration tests require a local PostgreSQL URL.');
    }

    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new pg.Pool({ connectionString: adminUrl.toString() });

    const existing = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DATABASE_NAME]
    );
    if (existing.rowCount !== 0) {
      throw new Error(`Disposable database ${TEST_DATABASE_NAME} already exists.`);
    }
    await adminPool.query(
      `CREATE DATABASE ${quoteDatabaseName(TEST_DATABASE_NAME)} TEMPLATE template0`
    );

    const tenantUrl = new URL(sourceUrl);
    tenantUrl.pathname = `/${TEST_DATABASE_NAME}`;
    tenantPool = new pg.Pool({
      connectionString: tenantUrl.toString(),
      max: 1
    });
  });

  afterAll(async () => {
    if (tenantPool) await tenantPool.end();
    if (adminPool) {
      await adminPool.query(
        `DROP DATABASE ${quoteDatabaseName(TEST_DATABASE_NAME)} WITH (FORCE)`
      );
      await adminPool.end();
    }
  });

  it('sets both request GUCs on the transaction-bound connection', async () => {
    const settings = await withTenantTx(
      tenantPool,
      { access: 'authenticated', orgId: ORG_A, isSystemAdmin: false },
      async client => {
        const result = await client.query(`
          SELECT current_setting('app.current_organization_id') AS org_id,
                 current_setting('app.actor_is_system_admin') AS is_admin
        `);
        return result.rows[0];
      }
    );

    expect(settings).toEqual({ org_id: ORG_A, is_admin: 'off' });
  });

  it('does not leak tenant context to a later pooled request', async () => {
    await withTenantTx(
      tenantPool,
      { access: 'authenticated', orgId: ORG_A, isSystemAdmin: false },
      async client => client.query('SELECT 1')
    );

    const nextSettings = await withTenantTx(
      tenantPool,
      { access: 'authenticated', orgId: ORG_B, isSystemAdmin: false },
      async client => {
        const result = await client.query(`
          SELECT current_setting('app.current_organization_id') AS org_id,
                 current_setting('app.actor_is_system_admin') AS is_admin
        `);
        return result.rows[0];
      }
    );

    expect(nextSettings).toEqual({ org_id: ORG_B, is_admin: 'off' });
  });

  it('clears SET LOCAL values after COMMIT', async () => {
    await withTenantTx(
      tenantPool,
      { access: 'authenticated', orgId: ORG_A, isSystemAdmin: false },
      async client => client.query('SELECT 1')
    );

    const client = await tenantPool.connect();
    try {
      const result = await client.query(`
        SELECT current_setting('app.current_organization_id', true) AS org_id,
               current_setting('app.actor_is_system_admin', true) AS is_admin
      `);
      expect(result.rows[0].org_id || null).toBeNull();
      expect(result.rows[0].is_admin || null).toBeNull();
    } finally {
      client.release();
    }
  });

  it('supports the explicit public path without carrying tenant identity', async () => {
    const settings = await withTenantTx(
      tenantPool,
      PUBLIC_TENANT_CONTEXT,
      async client => {
        const result = await client.query(`
          SELECT current_setting('app.current_organization_id') AS org_id,
                 current_setting('app.actor_is_system_admin') AS is_admin
        `);
        return result.rows[0];
      }
    );

    expect(settings).toEqual({ org_id: '', is_admin: 'off' });
  });
});
