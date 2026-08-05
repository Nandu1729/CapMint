import { describe, expect, it, vi } from 'vitest';
import {
  reserveBudgetCapacity,
  reserveLotIssuance,
  verifyBudgetAuthority
} from '../../../packages/shared/capacity.js';

describe('budget authority capacity guards', () => {
  it('rejects a nullable draft signature without reading certifier key material', async () => {
    const client = { query: vi.fn() } as any;

    await expect(verifyBudgetAuthority(
      client,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '10.00',
      null
    )).resolves.toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects inactive budget capacity before checking its nullable signature', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: '00000000-0000-0000-0000-000000000001',
          status: 'DRAFT',
          signature_bundle: null
        }]
      })
    } as any;

    await expect(reserveBudgetCapacity(
      client,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      1
    )).resolves.toMatchObject({ ok: false, code: 'INACTIVE_BUDGET' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive lot issuance before checking its nullable signature', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: '00000000-0000-0000-0000-000000000003',
          revocation_status: 'ACTIVE',
          budget_status: 'DRAFT',
          signature_bundle: null
        }]
      })
    } as any;

    await expect(reserveLotIssuance(
      client,
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000002',
      1
    )).resolves.toMatchObject({ ok: false, code: 'INACTIVE_BUDGET' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
