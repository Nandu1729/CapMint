# CapMint — Dependency Graph

> **Document**: `governance/DEPENDENCY_GRAPH.md`
> **Created**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Overview

This document maps every module-to-module and checkpoint-to-checkpoint dependency in the CapMint platform. Use it to determine **build order**, identify the **critical path**, and evaluate the blast radius of any delay.

---

## 2. Module Dependency Matrix

Rows depend on columns. **✓** = direct dependency, **(i)** = indirect / transitive.

| Module | Auth (CP-006) | Authz (CP-007) | CPQ (CP-008) | GS1 Eng (CP-009) | Mint Eng (CP-010) | QR Eng (CP-011) | Resolver (CP-012) | T-Log (CP-013) | Verification (CP-014) | Clone Det (CP-015) | Revocatn (CP-016) | Dashbrds (CP-017) | PWA (CP-018) | TraceNet (CP-019) | AgriStack (CP-020) | Testing (CP-021) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Authentication** | — | | | | | | | | | | | | | | | |
| **Authorization** | ✓ | — | | | | | | | | | | | | | | |
| **CPQ** | (i) | | — | | | | | | | | | | | | | |
| **GS1 Engine** | (i) | | | — | | | | | | | | | | | | |
| **Mint Engine** | (i) | | | ✓ | — | | | | | | | | | | | |
| **QR Engine** | (i) | | | (i) | ✓ | — | | | | | | | | | | |
| **Resolver** | (i) | | | ✓ | (i) | ✓ | — | | | | | | | | | |
| **T-Log** | (i) | | | | | | | — | | | | | | | | |
| **Verification** | (i) | | | (i) | (i) | (i) | ✓ | | — | | | | | | | |
| **Clone Det.** | (i) | | | (i) | (i) | (i) | ✓ | ✓ | | — | | | | | | |
| **Revocation** | (i) | | | | (i) | ✓ | | ✓ | | | — | | | | | |
| **Dashboards** | (i) | | | (i) | (i) | (i) | ✓ | ✓ | | ✓ | | — | | | | |
| **PWA** | (i) | | | (i) | (i) | (i) | ✓ | | | | | ✓ | — | | | |
| **TraceNet** | (i) | | | | | | | ✓ | | | | | | — | | |
| **AgriStack** | (i) | | | | | | | ✓ | | | | | | | — | |
| **Testing** | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | — |

> **(i)** — All application-phase modules transitively depend on the **Foundation Phase** (CP-000 through CP-005) via the CP-005 Development Ready checkpoint.

---

## 3. Build Order (Topological Sort)

The following is the recommended build sequence respecting all dependencies:

```
Tier 0  ─ Project Operating System (CP-000)
Tier 1  ─ Architecture Lock (CP-001)
Tier 2  ─ Database Design (CP-002)
Tier 3  ─ API Contracts (CP-003)
Tier 4  ─ Infrastructure (CP-004)
Tier 5  ─ Development Ready (CP-005)
Tier 6  ─ Authentication (CP-006)       CPQ (CP-008)         GS1 Engine (CP-009)    Transparency Log (CP-013)  Testing (CP-021)
Tier 7  ─ Authorization (CP-007)        Mint Engine (CP-010)
Tier 8  ─ QR Engine (CP-011)
Tier 9  ─ Resolver (CP-012)            Revocation (CP-016)
Tier 10 ─ Verification (CP-014)        Clone Detection (CP-015)
Tier 11 ─ Dashboards (CP-017)          TraceNet Integration (CP-019)                AgriStack Integration (CP-020)
Tier 12 ─ PWA (CP-018)
Tier 13 ─ Pilot Release (CP-022)
Tier 14 ─ Production Release (CP-023)
```

---

## 4. Critical Path

The **longest dependency chain** determines the minimum calendar time to Release:

```
CP-000 → CP-001 → CP-002 → CP-003 → CP-004 → CP-005
  → CP-009 (GS1 Engine) → CP-010 (Mint Engine) → CP-011 (QR Engine) → CP-012 (Resolver)
    → CP-015 (Clone Detection) → CP-017 (Dashboards) → CP-018 (PWA)
      → CP-022 (Pilot) → CP-023 (Production)
```

Any delay to a checkpoint on this chain delays deployment by the same amount.

---

## 5. Checkpoint Dependency Table

| Checkpoint | Direct Dependencies | Can Start After |
|------------|---------------------|-----------------|
| CP-000 | — | Immediately |
| CP-001 | CP-000 | CP-000 complete |
| CP-002 | CP-001 | CP-001 complete |
| CP-003 | CP-002 | CP-002 complete |
| CP-004 | CP-003 | CP-003 complete |
| CP-005 | CP-004 | CP-004 complete |
| CP-006 | CP-005 | CP-005 complete |
| CP-007 | CP-006 | CP-006 complete |
| CP-008 | CP-005 | CP-005 complete |
| CP-009 | CP-005 | CP-005 complete |
| CP-010 | CP-009 | CP-009 complete |
| CP-011 | CP-010 | CP-010 complete |
| CP-012 | CP-009, CP-011 | Both CP-009 & CP-011 complete |
| CP-013 | CP-005 | CP-005 complete |
| CP-014 | CP-012 | CP-012 complete |
| CP-015 | CP-012, CP-013 | Both CP-012 & CP-013 complete |
| CP-016 | CP-011, CP-013 | Both CP-011 & CP-013 complete |
| CP-017 | CP-012, CP-013, CP-015 | CP-012, CP-013, & CP-015 complete |
| CP-018 | CP-012, CP-017 | Both CP-012 & CP-017 complete |
| CP-019 | CP-013 | CP-013 complete |
| CP-020 | CP-013 | CP-013 complete |
| CP-021 | CP-005 | CP-005 complete |
| CP-022 | CP-006 to CP-021 | All functional and integration testing complete |
| CP-023 | CP-022 | CP-022 pilot complete |

---

## 6. Parallelisation Opportunities

The following groups **can be developed concurrently**:

| Parallel Group | Modules / Checkpoints | Earliest Start |
|----------------|-----------------------|----------------|
| Group A | CP-006 (Authentication) ∥ CP-008 (CPQ) ∥ CP-009 (GS1 Engine) ∥ CP-013 (Transparency Log) ∥ CP-021 (Testing) | After CP-005 |
| Group B | CP-012 (Resolver) ∥ CP-016 (Revocation) | After CP-011 and CP-013 |
| Group C | CP-017 (Dashboards) ∥ CP-019 (TraceNet) ∥ CP-020 (AgriStack) | After CP-015 and CP-013 |

---

## 7. Cross-References

| Document | Path |
|----------|------|
| Master Plan | [`MASTER_PLAN.md`](file:///Users/nandyyy/project/CapMint/governance/MASTER_PLAN.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |
| BRAIN Dependencies | [`../BRAIN/DEPENDENCIES.md`](file:///Users/nandyyy/project/CapMint/BRAIN/DEPENDENCIES.md) |

---

*End of DEPENDENCY_GRAPH.md*
