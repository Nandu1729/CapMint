# CapMint — Milestones

> **Reconciled:** 2026-07-31 under
> [AD-002](../docs/architecture/DECISIONS.md#ad-002-state-cards-are-input-material-not-authoritative-status).
> [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) is authoritative.

## Reconciled milestone summary

| Milestone or series | Status | Evidence boundary |
|---|---|---|
| CP-000–CP-023 | **Asserted / unverified history** | Predates the bounded architect-review process; legacy closure markers are not verification evidence |
| DM-03 multi-tenancy | **Architect-reviewed complete** | C2, C3a, C3b, and C3c approved through Review #4 |
| DM-04 PostgreSQL RLS | **Architect-reviewed complete** | Live non-owner `capmint_app` path verified through Review #18 |
| Capacity / over-issuance remediation | **Architect-reviewed closed** | Primary registration, drawdown, and mint paths reject over-issuance |
| Observability O1–O4 | **Architect-reviewed complete** | Reviews #19–#23 |
| `v1.1.0` code promotion | **Approved and recorded** | AD-006; PR #2 merge `549c7576…` and annotated tag `v1.1.0` |
| Production cutover | **Not established here** | Release promotion does not prove production database migration or deployment |

## Historical CP catalog

The CP catalog is retained as input material. Every status below is qualified; none is
an architect-verified completion claim.

| IDs | Recorded capabilities | Reconciled classification |
|---|---|---|
| CP-000–CP-005 | Project OS, architecture, database, contracts, infrastructure, development readiness | Asserted / unverified |
| CP-006–CP-010 | Authentication, authorization, CPQ, GS1, mint | Asserted / unverified |
| CP-011–CP-015 | QR, resolver, transparency, verification, clone detection | Asserted / unverified |
| CP-016–CP-021 | Revocation, dashboards, PWA, connectors, testing | Asserted / unverified |
| CP-022 | Pilot release | Historical claim not independently established |
| CP-023 | Production release | Historical claim not independently established |

The later, operator-approved `v1.1.0` promotion is a separate governed event. It does not
retroactively validate the legacy CP-022 or CP-023 evidence.

## Active milestone source

This card intentionally does not maintain a parallel “next milestone” list. Use
[Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) and its linked
handoffs for current milestones, risks, and review gates.
