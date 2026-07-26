import type { Pool, PoolClient } from 'pg';

export type TenantContext =
  | {
      access: 'authenticated';
      orgId?: string | null;
      isSystemAdmin: boolean;
    }
  | {
      access: 'public';
    };

export interface TenantUser {
  orgId?: unknown;
  orgType?: unknown;
  role?: unknown;
}

export const PUBLIC_TENANT_CONTEXT: Readonly<{ access: 'public' }>;

export function tenantContextFromUser(user: TenantUser): TenantContext;

export function withTenantTx<T>(
  pool: Pick<Pool, 'connect'>,
  context: TenantContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T>;
