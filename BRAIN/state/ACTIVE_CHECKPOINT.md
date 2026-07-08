# CapMint — Active Checkpoint

> **Last Updated:** 2026-07-08  
> **Active Checkpoint:** CP-001 (Architecture Lock) — ⏳ PENDING  
> **Previous Checkpoint:** CP-000 (Project Operating System) — ✅ COMPLETE

---

## Current Transition

```
CP-000 (Project Operating System)  ──✅──►  CP-001 (Architecture Lock)
          COMPLETE                                  PENDING
```

- **Transition Date:** 2026-07-08  
- **Sign-off:** AI Agent / Tech Lead  
- **Validation:** CP-000 acceptance criteria met and verified under git tag `CP-000`.

---

## Checkpoint Roadmap

| CP    | Name                     | Status        | Phase       | Target     | Dependencies |
|-------|--------------------------|---------------|-------------|------------|--------------|
| CP-000 | Project Operating System | ✅ COMPLETE    | Foundation  | 2026-07-08 | —            |
| CP-001 | Architecture Lock        | ⏳ PENDING     | Foundation  | TBD        | CP-000       |
| CP-002 | Database Design          | ⬜ NOT STARTED | Foundation  | TBD        | CP-001       |
| CP-003 | API Contracts            | ⬜ NOT STARTED | Foundation  | TBD        | CP-002       |
| CP-004 | Infrastructure           | ⬜ NOT STARTED | Foundation  | TBD        | CP-003       |
| CP-005 | Development Ready        | ⬜ NOT STARTED | Foundation  | TBD        | CP-004       |
| CP-006 | Authentication           | ⬜ NOT STARTED | Application | TBD        | CP-005       |
| CP-007 | Authorization            | ⬜ NOT STARTED | Application | TBD        | CP-006       |
| CP-008 | CPQ                      | ⬜ NOT STARTED | Application | TBD        | CP-005       |
| CP-009 | GS1 Engine               | ⬜ NOT STARTED | Application | TBD        | CP-005       |
| CP-010 | Mint Engine              | ⬜ NOT STARTED | Application | TBD        | CP-009       |
| CP-011 | QR Engine                | ⬜ NOT STARTED | Application | TBD        | CP-010       |
| CP-012 | Resolver                 | ⬜ NOT STARTED | Application | TBD        | CP-009, CP-011 |
| CP-013 | Transparency Log         | ⬜ NOT STARTED | Application | TBD        | CP-005       |
| CP-014 | Verification             | ⬜ NOT STARTED | Application | TBD        | CP-012       |
| CP-015 | Clone Detection          | ⬜ NOT STARTED | Application | TBD        | CP-012, CP-013 |
| CP-016 | Revocation               | ⬜ NOT STARTED | Application | TBD        | CP-011, CP-013 |
| CP-017 | Dashboards               | ⬜ NOT STARTED | Application | TBD        | CP-012, CP-013, CP-015 |
| CP-018 | PWA                      | ⬜ NOT STARTED | Application | TBD        | CP-012, CP-017 |
| CP-019 | TraceNet Integration     | ⬜ NOT STARTED | Application | TBD        | CP-013       |
| CP-020 | AgriStack Integration    | ⬜ NOT STARTED | Application | TBD        | CP-013       |
| CP-021 | Testing                  | ⬜ NOT STARTED | Application | TBD        | CP-005       |
| CP-022 | Pilot Release            | ⬜ NOT STARTED | Application | TBD        | CP-006 to CP-021 |
| CP-023 | Production Release       | ⬜ NOT STARTED | Application | TBD        | CP-022       |

---

## Transition Rules

### Checkpoint Completion Criteria

A checkpoint is considered **COMPLETE** when:
1. **All acceptance criteria** defined in the checkpoint specification are met.
2. **All required documents** are created and cross-referenced.
3. **No blocking issues** exist (see [BLOCKERS.md](BLOCKERS.md)).
4. **State tracking docs** are updated to reflect the new state.
5. **CHANGELOG.md** entry is added for the checkpoint.
6. **Code review** is approved and merged into the integration branch.

### Transition Process

```
1. Verify all acceptance criteria  →  Pass/Fail
2. Update CURRENT_STATE.md         →  New checkpoint status
3. Update this file                →  Mark previous ✅, new ⏳
4. Update PROGRESS.md              →  Increment completion count
5. Update CHANGELOG.md             →  Add checkpoint entry
6. Update NEXT_TASK.md             →  Load next checkpoint details
```

---

## Phase Overview

| Phase        | Checkpoints     | Description                              |
|--------------|-----------------|------------------------------------------|
| Foundation   | CP-000 — CP-005 | Project setup, governance, architecture lock, DB design, API contracts, infrastructure |
| Application  | CP-006 — CP-023 | Core Auth services, all business engine implementation, dashboards, integrations, testing, and production release |

---

## Cross-References

| Document                                        | Purpose                       |
|-------------------------------------------------|-------------------------------|
| [MASTER_PLAN.md](../../governance/MASTER_PLAN.md)| Full project roadmap          |
| [CURRENT_STATE.md](../CURRENT_STATE.md)         | Current project state         |
| [PROGRESS.md](PROGRESS.md)                      | Progress metrics              |
| [MILESTONES.md](MILESTONES.md)                  | Milestone descriptions        |
| [ROADMAP.md](ROADMAP.md)                        | Phased delivery plan          |
| [BLOCKERS.md](BLOCKERS.md)                      | Active blockers               |

---

*End of ACTIVE_CHECKPOINT.md*
