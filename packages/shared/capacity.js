import crypto from 'crypto';

export function capacityFailure(statusCode, code, message) {
  return { ok: false, statusCode, code, message };
}

export async function verifyBudgetAuthority(client, budgetId, certifierId, approvedQuantity, signatureBundle) {
  if (typeof signatureBundle !== 'string' || signatureBundle.trim() === '') return false;
  const certRes = await client.query('SELECT public_key FROM certifiers WHERE id = $1', [certifierId]);
  if (certRes.rows.length === 0) return false;
  try {
    return crypto.verify(null, Buffer.from(`budget_id:${budgetId};approved_quantity:${approvedQuantity}`), certRes.rows[0].public_key, Buffer.from(signatureBundle, 'hex'));
  } catch {
    return false;
  }
}

export async function reserveBudgetCapacity(client, budgetId, organizationId, requestedQuantity) {
  const result = await client.query(`SELECT b.id, b.producer_id, b.status, b.approved_quantity, b.consumed_quantity, b.certifier_id, b.signature_bundle
    FROM budgets b JOIN producers p ON p.id = b.producer_id
    WHERE b.id = $1 AND p.organization_id = $2 FOR UPDATE OF b FOR SHARE OF p`, [budgetId, organizationId]);
  if (result.rowCount === 0) return capacityFailure(404, 'NOT_FOUND', 'Budget not found or unauthorized.');
  const budget = result.rows[0];
  if (budget.status !== 'ACTIVE') return capacityFailure(400, 'INACTIVE_BUDGET', 'Budget is not active.');
  if (!(await verifyBudgetAuthority(client, budget.id, budget.certifier_id, budget.approved_quantity, budget.signature_bundle))) return capacityFailure(400, 'INVALID_SIGNATURE', 'Budget supply authority could not be cryptographically verified.');
  const usage = await client.query(`SELECT (SELECT COALESCE(SUM(l.batch_size), 0)::numeric FROM lots l WHERE l.budget_id = $1) AS reserved_quantity,
    (SELECT COUNT(u.id)::int FROM lots l JOIN unit_codes u ON u.lot_id = l.id WHERE l.budget_id = $1) AS issued_count`, [budget.id]);
  const reservedQuantity = Math.max(Number(budget.consumed_quantity), Number(usage.rows[0].reserved_quantity), Number(usage.rows[0].issued_count));
  const approvedQuantity = Number(budget.approved_quantity);
  if (reservedQuantity + requestedQuantity > approvedQuantity) return capacityFailure(422, 'EXCEEDS_CAPACITY', `Requested quantity of ${requestedQuantity} exceeds remaining budget capacity of ${Math.max(approvedQuantity - reservedQuantity, 0)}.`);
  const next = reservedQuantity + requestedQuantity;
  await client.query(`UPDATE budgets SET consumed_quantity = $2, status = CASE WHEN $2 = approved_quantity THEN 'EXHAUSTED' ELSE 'ACTIVE' END, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [budget.id, next]);
  return { ok: true, budget, reservedQuantity: next };
}

export async function reserveLotIssuance(client, lotId, organizationId, requestedUnits) {
  const result = await client.query(`SELECT l.id, l.batch_size, l.budget_id, l.producer_id, l.revocation_status, b.status AS budget_status, b.approved_quantity, b.certifier_id, b.signature_bundle
    FROM lots l JOIN budgets b ON b.id = l.budget_id JOIN producers p ON p.id = l.producer_id
    WHERE l.id = $1 AND b.producer_id = l.producer_id AND p.organization_id = $2
    FOR UPDATE OF b, l FOR SHARE OF p`, [lotId, organizationId]);
  if (result.rowCount === 0 || result.rows[0].revocation_status !== 'ACTIVE') return capacityFailure(404, 'NOT_FOUND', 'Lot not found, revoked, or unauthorized.');
  const lot = result.rows[0];
  if (!['ACTIVE', 'EXHAUSTED'].includes(lot.budget_status)) return capacityFailure(400, 'INACTIVE_BUDGET', `Linked budget status is: ${lot.budget_status}. Cannot issue codes.`);
  if (!(await verifyBudgetAuthority(client, lot.budget_id, lot.certifier_id, lot.approved_quantity, lot.signature_bundle))) return capacityFailure(400, 'INVALID_SIGNATURE', 'Budget supply authority could not be cryptographically verified.');
  const usage = await client.query(`SELECT COUNT(*) FILTER (WHERE u.lot_id = $1)::int AS lot_issued_count, COUNT(u.id)::int AS budget_issued_count
    FROM lots l LEFT JOIN unit_codes u ON u.lot_id = l.id WHERE l.budget_id = $2`, [lot.id, lot.budget_id]);
  const lotIssued = Number(usage.rows[0].lot_issued_count);
  const budgetIssued = Number(usage.rows[0].budget_issued_count);
  if (lotIssued + requestedUnits > Number(lot.batch_size)) return capacityFailure(422, 'EXCEEDS_LOT_CAPACITY', `Requested ${requestedUnits} unit(s) exceed lot capacity: ${lotIssued}/${lot.batch_size} already issued.`);
  if (budgetIssued + requestedUnits > Number(lot.approved_quantity)) return capacityFailure(422, 'EXCEEDS_CAPACITY', `Requested ${requestedUnits} unit(s) exceed budget capacity: ${budgetIssued}/${lot.approved_quantity} already issued.`);
  return { ok: true, lot, issuedCount: lotIssued };
}
