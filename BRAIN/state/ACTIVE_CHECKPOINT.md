# CapMint — Active Checkpoint

> **Last Updated:** 2026-07-08  
> **Active Checkpoint:** CP-001 (Brain Complete) — ⏳ PENDING  
> **Previous Checkpoint:** CP-000 (Foundation Initialized) — ✅ COMPLETE

---

## Current Transition

```
CP-000 (Foundation Initialized)  ──✅──►  CP-001 (Brain Complete)
         COMPLETE                              PENDING
```

**Transition Date:** 2026-07-08  
**Sign-off:** AI Agent (automated)  
**Validation:** All CP-000 acceptance criteria met.

---

## Checkpoint Roadmap

| CP    | Name                     | Status        | Phase       | Target     | Dependencies |
|-------|--------------------------|---------------|-------------|------------|--------------|
| CP-000 | Foundation Initialized  | ✅ COMPLETE    | Foundation  | 2026-07-08 | —            |
| CP-001 | Brain Complete          | ⏳ PENDING     | Foundation  | TBD        | CP-000       |
| CP-002 | Core Architecture       | ⬜ NOT STARTED | Design      | TBD        | CP-001       |
| CP-003 | Authentication Service  | ⬜ NOT STARTED | Core Build  | TBD        | CP-002       |
| CP-004 | Mint Engine             | ⬜ NOT STARTED | Core Build  | TBD        | CP-002       |
| CP-005 | Verification API        | ⬜ NOT STARTED | Core Build  | TBD        | CP-004       |
| CP-006 | Dashboard UI            | ⬜ NOT STARTED | Interface   | TBD        | CP-003, CP-005 |
| CP-007 | Blockchain Anchor       | ⬜ NOT STARTED | Core Build  | TBD        | CP-004       |
| CP-008 | ML Detection            | ⬜ NOT STARTED | Intelligence| TBD        | CP-005       |
| CP-009 | Supply Chain Tracker    | ⬜ NOT STARTED | Integration | TBD        | CP-005, CP-007 |
| CP-010 | Mobile SDK              | ⬜ NOT STARTED | Interface   | TBD        | CP-005       |
| CP-011 | Analytics Pipeline      | ⬜ NOT STARTED | Intelligence| TBD        | CP-009       |
| CP-012 | Notification Service    | ⬜ NOT STARTED | Integration | TBD        | CP-006       |
| CP-013 | Partner Integration     | ⬜ NOT STARTED | Integration | TBD        | CP-009       |
| CP-014 | Compliance Module       | ⬜ NOT STARTED | Governance  | TBD        | CP-009       |
| CP-015 | Infrastructure / CI/CD  | ⬜ NOT STARTED | Operations  | TBD        | CP-005       |
| CP-016 | Security Hardening      | ⬜ NOT STARTED | Operations  | TBD        | CP-015       |
| CP-017 | Performance Tuning      | ⬜ NOT STARTED | Operations  | TBD        | CP-015       |
| CP-018 | Documentation Site      | ⬜ NOT STARTED | Polish      | TBD        | CP-010       |
| CP-019 | Beta Program            | ⬜ NOT STARTED | Launch      | TBD        | CP-016, CP-017 |
| CP-020 | Production Launch       | ⬜ NOT STARTED | Launch      | TBD        | CP-019       |

---

## Transition Rules

### Checkpoint Completion Criteria

A checkpoint is considered **COMPLETE** when:

1. **All acceptance criteria** defined in the checkpoint spec are met
2. **All required documents** are created and cross-referenced
3. **No blocking issues** exist (see [BLOCKERS.md](BLOCKERS.md))
4. **State tracking docs** are updated to reflect the new state
5. **CHANGELOG.md** entry is added for the checkpoint
6. **Code review** (if applicable) is approved and merged

### Transition Process

```
1. Verify all acceptance criteria  →  Pass/Fail
2. Update CURRENT_STATE.md         →  New checkpoint status
3. Update this file                →  Mark previous ✅, new ⏳
4. Update PROGRESS.md              →  Increment completion count
5. Update CHANGELOG.md             →  Add checkpoint entry
6. Update NEXT_TASK.md             →  Load next checkpoint details
7. Merge branch (if applicable)    →  PR to develop/main
```

### Rollback Policy

If a checkpoint fails validation:
- Revert state docs to previous checkpoint
- Document failure reason in [BLOCKERS.md](BLOCKERS.md)
- Create remediation plan in [NEXT_TASK.md](../NEXT_TASK.md)
- Do **not** advance to the next checkpoint

### Parallel Checkpoint Rules

- Checkpoints within the same phase **may** run in parallel if dependencies allow
- Cross-phase checkpoints **must** be sequential
- The dependency column in the roadmap table is authoritative

---

## Phase Overview

| Phase        | Checkpoints     | Description                              |
|--------------|-----------------|------------------------------------------|
| Foundation   | CP-000 — CP-001 | Project setup, governance, brain system   |
| Design       | CP-002          | Architecture, API contracts, data models  |
| Core Build   | CP-003 — CP-005, CP-007 | Authentication, minting, verification, blockchain |
| Interface    | CP-006, CP-010  | Dashboard and mobile SDK                  |
| Intelligence | CP-008, CP-011  | ML detection and analytics                |
| Integration  | CP-009, CP-012 — CP-013 | Supply chain, notifications, partners |
| Governance   | CP-014          | Regulatory compliance                     |
| Operations   | CP-015 — CP-017 | CI/CD, security, performance              |
| Polish       | CP-018          | Documentation                             |
| Launch       | CP-019 — CP-020 | Beta and production release               |

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
