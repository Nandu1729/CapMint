# CapMint — Progress Record

> **Reconciled:** 2026-07-31 under
> [AD-002](../docs/architecture/DECISIONS.md#ad-002-state-cards-are-input-material-not-authoritative-status).
> This is a qualified historical summary. [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md)
> is authoritative for current and verified progress.

## Architect-reviewed progress

| Workstream | Reconciled status | Evidence boundary |
|---|---|---|
| DM-03 application tenancy | Architect-reviewed complete | Reviews #1–#4 |
| DM-04 database RLS | Architect-reviewed complete | Live non-owner path through Review #18 |
| Capacity enforcement | Architect-reviewed closed | Registration, drawdown, mint, and overfill checks |
| Observability O1–O4 | Architect-reviewed complete | Reviews #19–#23 |
| `develop` → `main` v1.1.0 promotion | Approved and recorded | AD-006 and PR #2 |

## Legacy capability register

The 2026-07-24 register previously labelled every capability “verified” from a single
day's self-report. Those labels are withdrawn. The entries remain useful as an inventory,
but require the architect layer or a bounded test report for any verification claim.

| Capability | Associated services | Reconciled classification |
|---|---|---|
| Authentication and RBAC | `auth-service` | Historical implementation claim; verification is bounded by later reviews |
| Budgeting and capacity | `cpq-service` | Historical claim; later tenancy and capacity controls were separately reviewed |
| Serialization and GS1 links | `mint-service`, `resolver-service` | Historical implementation claim |
| Laboratory reports and lot certification | `verification-service` | Historical claim; later lab isolation was separately reviewed |
| Transparency ledger | `transparency-service` | Historical claim; current verified properties are listed in Architecture Status |
| Clone detection and investigations | `verification-service` | Historical implementation claim |
| External integrations | `integration-service` | Historical simulation/implementation claim, not proof of live regulator integration |

## Superseded metrics and packaging claims

- The former `7/7 verified`, `52/52` compliance, and `8/8` migration totals were dated
  snapshots, not current governance evidence. Architecture Status records the later reviewed
  compliance and migration boundaries.
- The former claim that Docker images, Helm deployment, and Kubernetes infrastructure were
  production-packaged is withdrawn. Container/orchestration artifacts were purged by D-003.
- A release tag or CI configuration does not establish a live production deployment.
