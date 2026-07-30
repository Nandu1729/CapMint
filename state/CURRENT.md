# CapMint — Current State

> **Reconciled:** 2026-07-31 under
> [AD-002](../docs/architecture/DECISIONS.md#ad-002-state-cards-are-input-material-not-authoritative-status).
> [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) is the
> authoritative current-state record. If this summary drifts, the architect layer wins.

## Current reviewed baseline

| Property | Reconciled state |
|---|---|
| Development baseline | `develop`; active work uses short-lived feature branches |
| Released baseline | `v1.1.0` promoted to `main` at `549c7576ca7e9447705c6fbb5380ff24d30e1c33` under AD-006 |
| DM-03 | Application-layer tenant ownership and enforcement complete through Review #4 |
| DM-04 | PostgreSQL RLS complete and runtime-verified as non-owner `capmint_app` through Review #18 |
| Capacity enforcement | Primary issuance paths verified fail-closed against over-issuance |
| Observability O1–O4 | Architect-reviewed complete through Reviews #19–#23 |
| Production deployment | Not established by this card; a code promotion/tag is not proof of a production cutover |

Earlier statements that the baseline was `feat/dm03-tenant-column`, DM-04 was open, or
the capacity defect remained open are superseded by the reviewed record above.

## Current direction

The architect layer tracks post-release work and accepted risks. At the current recorded
boundary, these include transparency-ledger hardening follow-ups and ongoing operational
and architecture reconciliation. Do not infer closure from a task branch, a historical
sprint checkbox, or a state-card date.

## Resume checklist

1. Read [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md).
2. Confirm the checked-out branch and current review boundary from Git.
3. Read the relevant architect decision, task handoff, and acceptance criteria.
4. Run the repository's documented setup and verification commands.
