# CapMint — Legacy Product Roadmap

> **Reconciled:** 2026-07-31 under
> [AD-002](../docs/architecture/DECISIONS.md#ad-002-state-cards-are-input-material-not-authoritative-status).
> [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) owns the active
> roadmap and reviewed milestone state.

## Reconciled disposition

This six-phase roadmap was written as an aspirational plan and later marked fully
complete without bounded evidence. The completion markers are withdrawn.

| Legacy phase | Original intent | Reconciled disposition |
|---|---|---|
| 1. Local sandbox | Seven local services, frontend router, dashboard/scanner | Historical implementation scope; not a current release gate |
| 2. Migration and security hardening | Database integrity, lab controls, compliance | Superseded by the architect-reviewed DM-03/DM-04 and hardening record |
| 3. Infrastructure and scale | AWS, Kubernetes, Helm | **Not shipped as claimed**; container/orchestration artifacts were purged under D-003 |
| 4. Billing and monetization | SaaS billing, metering, Stripe lifecycle | **Not established**; branding schema and pricing documentation are not a billing engine |
| 5. Regulatory connectors | TraceNet and AgriStack integrations | **Partially asserted**; simulations/specifications are not proof of production regulator connectivity |
| 6. Pilot and public launch | Production rollout and stable release | Legacy launch claim unverified; the later `v1.1.0` code promotion is governed separately by AD-006 and does not prove deployment |

## Current roadmap rule

Do not add “complete” markers here from implementation activity alone. Current work,
accepted risks, and phase transitions belong in Architecture Status and require the
review evidence linked there. This file remains only to explain the disposition of the
legacy phases.
