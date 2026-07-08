# CapMint — Module Status

> **Document**: `governance/MODULE_STATUS.md`
> **Created**: 2026-07-08
> **Last Updated**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Purpose

This document is the **single source of truth** for the implementation status of every
module in the CapMint platform. Update this file whenever a module transitions between
status states.

---

## 2. Status Definitions

| Status | Symbol | Meaning |
|--------|--------|---------|
| **NOT STARTED** | 🔴 | No work has begun. Branch does not yet exist. |
| **PLANNING** | 🟡 | Design / ADR in progress. Branch may be created. |
| **IN PROGRESS** | 🔵 | Active development on a feature branch. |
| **IN REVIEW** | 🟣 | Pull request open; awaiting code review. |
| **INTEGRATION** | 🟠 | Merged to `develop`; integration testing underway. |
| **COMPLETE** | 🟢 | Merged to `main` via release branch. Quality gate passed. |
| **BLOCKED** | ⛔ | Waiting on an unresolved dependency or external factor. |

---

## 3. Module Status Table

| # | Module | Branch | Checkpoint | Status | Dependencies | Last Updated |
|---|--------|--------|------------|--------|--------------|--------------|
| 1 | **Auth** | `feature/auth` | CP-002 | 🔴 NOT STARTED | CP-001 (Dev Env) | 2026-07-08 |
| 2 | **Authorization** | `feature/authz` | CP-003 | 🔴 NOT STARTED | CP-002 (Auth) | 2026-07-08 |
| 3 | **CPQ** | `feature/cpq` | CP-012 | 🔴 NOT STARTED | CP-005 (Foundation) | 2026-07-08 |
| 4 | **GS1 Engine** | `feature/gs1-engine` | CP-006 | 🔴 NOT STARTED | CP-005 (Foundation) | 2026-07-08 |
| 5 | **QR Generator** | `feature/qr-gen` | CP-007 | 🔴 NOT STARTED | CP-006 (GS1 Engine) | 2026-07-08 |
| 6 | **Resolver** | `feature/resolver` | CP-008 | 🔴 NOT STARTED | CP-006, CP-007 | 2026-07-08 |
| 7 | **Transparency Log** | `feature/transparency-log` | CP-009 | 🔴 NOT STARTED | CP-005 (Foundation) | 2026-07-08 |
| 8 | **Clone Detection** | `feature/clone-detect` | CP-010 | 🔴 NOT STARTED | CP-008, CP-009 | 2026-07-08 |
| 9 | **Revocation** | `feature/revocation` | CP-011 | 🔴 NOT STARTED | CP-007, CP-009 | 2026-07-08 |
| 10 | **Dashboard** | `feature/dashboard` | CP-013 | 🔴 NOT STARTED | CP-008, CP-009, CP-010 | 2026-07-08 |
| 11 | **PWA** | `feature/pwa` | CP-014 | 🔴 NOT STARTED | CP-008, CP-013 | 2026-07-08 |
| 12 | **TraceNet** | `feature/tracenet` | CP-016 | 🔴 NOT STARTED | CP-009, CP-015 | 2026-07-08 |
| 13 | **AgriStack** | `feature/agristack` | CP-017 | 🔴 NOT STARTED | CP-009, CP-015 | 2026-07-08 |
| 14 | **Security** | `feature/security` | CP-004 | 🔴 NOT STARTED | CP-002, CP-003 | 2026-07-08 |
| 15 | **Testing** | `feature/testing` | CP-018 | 🔴 NOT STARTED | CP-015 | 2026-07-08 |

---

## 4. Integration Checkpoints

These checkpoints are **cross-module milestones**, not standalone modules.

| Checkpoint | Branch | Status | Depends On | Last Updated |
|------------|--------|--------|------------|--------------|
| CP-000 — Project OS | `main` | 🟢 COMPLETE | — | 2026-07-08 |
| CP-001 — Dev Env | `feature/dev-env` | 🔴 NOT STARTED | CP-000 | 2026-07-08 |
| CP-005 — Foundation Integration | `release/v0.1` | 🔴 NOT STARTED | CP-002, CP-003, CP-004 | 2026-07-08 |
| CP-015 — Module Integration | `release/v0.5` | 🔴 NOT STARTED | CP-010 … CP-014 | 2026-07-08 |
| CP-019 — Pre-Launch | `release/v1.0-rc` | 🔴 NOT STARTED | CP-016, CP-017, CP-018 | 2026-07-08 |
| CP-020 — GA Release | `release/v1.0` | 🔴 NOT STARTED | CP-019 | 2026-07-08 |

---

## 5. Status Transition Rules

```
NOT STARTED ──► PLANNING ──► IN PROGRESS ──► IN REVIEW ──► INTEGRATION ──► COMPLETE
       │              │              │                              │
       └──► BLOCKED ◄─┴──► BLOCKED ◄─┴──────────► BLOCKED ◄───────┘
```

### Transition Requirements

| From → To | Required Action |
|-----------|-----------------|
| NOT STARTED → PLANNING | Design doc / ADR created; team assigned. |
| PLANNING → IN PROGRESS | Design approved; feature branch created. |
| IN PROGRESS → IN REVIEW | All unit tests pass; PR opened against `develop`. |
| IN REVIEW → INTEGRATION | Code review approved; merged to `develop`. |
| INTEGRATION → COMPLETE | Integration tests pass; quality gate satisfied; merged to `main`. |
| Any → BLOCKED | Blocking issue documented in risk register. |
| BLOCKED → Previous | Blocking issue resolved; documented in change log. |

---

## 6. Update Protocol

1. **Who**: The module lead updates this file.
2. **When**: On every status transition.
3. **How**: Edit the row in the table above; update the `Last Updated` column.
4. **Notify**: Post in the `#capmint-status` channel after each update.

---

## 7. Summary Statistics

| Metric | Value |
|--------|-------|
| Total Modules | 15 |
| Not Started | 15 |
| In Progress | 0 |
| Complete | 0 |
| Blocked | 0 |
| Completion % | 0 % |

> *Update this section each time the status table changes.*

---

## 8. Cross-References

| Document | Path |
|----------|------|
| Dependency Graph | [`DEPENDENCY_GRAPH.md`](file:///Users/nandyyy/project/CapMint/governance/DEPENDENCY_GRAPH.md) |
| Current State | [`../BRAIN/CURRENT_STATE.md`](file:///Users/nandyyy/project/CapMint/BRAIN/CURRENT_STATE.md) |
| Master Plan | [`MASTER_PLAN.md`](file:///Users/nandyyy/project/CapMint/governance/MASTER_PLAN.md) |
| Quality Gates | [`QUALITY_GATES.md`](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md) |

---

*End of MODULE_STATUS.md*
