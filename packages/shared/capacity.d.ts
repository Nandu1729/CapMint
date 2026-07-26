import type { PoolClient } from 'pg';
export type CapacityGuardFailure = { ok: false; statusCode: number; code: string; message: string };
export type BudgetReservation = { ok: true; budget: any; reservedQuantity: number };
export type LotIssuanceReservation = { ok: true; lot: any; issuedCount: number };
export function verifyBudgetAuthority(client: PoolClient, budgetId: string, certifierId: string, approvedQuantity: any, signatureBundle: string): Promise<boolean>;
export function reserveBudgetCapacity(client: PoolClient, budgetId: string, organizationId: string, requestedQuantity: number): Promise<BudgetReservation | CapacityGuardFailure>;
export function reserveLotIssuance(client: PoolClient, lotId: string, organizationId: string, requestedUnits: number): Promise<LotIssuanceReservation | CapacityGuardFailure>;
