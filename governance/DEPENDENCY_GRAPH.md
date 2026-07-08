# CapMint — Dependency Graph

> **Document**: `governance/DEPENDENCY_GRAPH.md`
> **Created**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Overview

This document maps every module-to-module and checkpoint-to-checkpoint dependency in
the CapMint platform. Use it to determine **build order**, identify the **critical path**,
and evaluate the blast radius of any delay.

---

## 2. Module Dependency Matrix

Rows depend on columns. **✓** = direct dependency, **(i)** = indirect / transitive.

| Module | Auth | Authz | Security | GS1 Engine | QR Gen | Resolver | T-Log | Clone Det. | Revocation | CPQ | Dashboard | PWA | TraceNet | AgriStack | Testing |
|----------------|------|-------|----------|------------|--------|----------|-------|------------|------------|-----|-----------|-----|----------|-----------|---------|
| **Auth** | — | | | | | | | | | | | | | | |
| **Authz** | ✓ | — | | | | | | | | | | | | | |
| **Security** | ✓ | ✓ | — | | | | | | | | | | | | |
| **GS1 Engine** | (i) | (i) | (i) | — | | | | | | | | | | | |
| **QR Gen** | (i) | (i) | (i) | ✓ | — | | | | | | | | | | |
| **Resolver** | (i) | (i) | (i) | ✓ | ✓ | — | | | | | | | | | |
| **T-Log** | (i) | (i) | (i) | | | | — | | | | | | | | |
| **Clone Det.** | (i) | (i) | (i) | | | ✓ | ✓ | — | | | | | | | |
| **Revocation** | (i) | (i) | (i) | | ✓ | | ✓ | | — | | | | | | |
| **CPQ** | (i) | (i) | (i) | | | | | | | — | | | | | |
| **Dashboard** | (i) | (i) | (i) | | | ✓ | ✓ | ✓ | | | — | | | | |
| **PWA** | (i) | (i) | (i) | | | ✓ | | | | | ✓ | — | | | |
| **TraceNet** | (i) | (i) | (i) | | | | ✓ | | | | | | — | | |
| **AgriStack** | (i) | (i) | (i) | | | | ✓ | | | | | | | — | |
| **Testing** | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | (i) | — |

> **(i)** — All modules transitively depend on the **Foundation** layer (Auth + Authz + Security)
> via the CP-005 integration checkpoint.

---

## 3. Build Order (Topological Sort)

The following is the recommended build sequence respecting all dependencies:

```
Tier 0 ─ Project OS (CP-000)
Tier 1 ─ Dev Environment (CP-001)
Tier 2 ─ Auth (CP-002)
Tier 3 ─ Authorization (CP-003)
Tier 4 ─ Security (CP-004)             CPQ (CP-012)*
Tier 5 ─ Foundation Integration (CP-005)
Tier 6 ─ GS1 Engine (CP-006)           Transparency Log (CP-009)
Tier 7 ─ QR Generator (CP-007)
Tier 8 ─ Resolver (CP-008)             Revocation (CP-011)
Tier 9 ─ Clone Detection (CP-010)
Tier 10 ─ Dashboard (CP-013)
Tier 11 ─ PWA (CP-014)
Tier 12 ─ Module Integration (CP-015)
Tier 13 ─ TraceNet (CP-016)            AgriStack (CP-017)    Testing (CP-018)
Tier 14 ─ Pre-Launch Hardening (CP-019)
Tier 15 ─ GA Release (CP-020)
```

> *\* CPQ only depends on CP-005 and can be built in parallel with GS1 Engine / T-Log.*

---

## 4. Critical Path

The **longest dependency chain** determines the minimum calendar time to GA:

```
CP-000 → CP-001 → CP-002 → CP-003 → CP-004 → CP-005
  → CP-006 → CP-007 → CP-008
    → CP-010 → CP-013 → CP-014 → CP-015
      → CP-016 → CP-019 → CP-020
```

**Total estimated duration on critical path: ~34 weeks**

Any delay to a checkpoint on this chain delays GA by the same amount.

---

## 5. Text Dependency Diagram

```
                          ┌──────────┐
                          │  CP-000  │  Project OS
                          └────┬─────┘
                               │
                          ┌────▼─────┐
                          │  CP-001  │  Dev Env
                          └────┬─────┘
                               │
                          ┌────▼─────┐
                          │  CP-002  │  Auth
                          └────┬─────┘
                               │
                          ┌────▼─────┐
                          │  CP-003  │  Authorization
                          └────┬─────┘
                       ┌───────┴───────┐
                  ┌────▼─────┐    ┌────▼─────┐
                  │  CP-004  │    │  CP-012  │  CPQ (parallel)
                  │ Security │    └──────────┘
                  └────┬─────┘
                       │
                  ┌────▼─────┐
                  │  CP-005  │  Foundation Integration
                  └────┬─────┘
              ┌────────┴────────┐
         ┌────▼─────┐     ┌────▼─────┐
         │  CP-006  │     │  CP-009  │  Transparency Log
         │ GS1 Eng  │     └────┬─────┘
         └────┬─────┘          │
         ┌────▼─────┐          │
         │  CP-007  │          │
         │  QR Gen  │          │
         └────┬─────┘          │
    ┌─────────┼────────────────┤
┌───▼────┐ ┌──▼──────┐  ┌─────▼────┐
│ CP-008 │ │ CP-011  │  │  CP-010  │
│Resolver│ │Revocatn │  │Clone Det │
└───┬────┘ └─────────┘  └────┬─────┘
    │                        │
    └──────────┬─────────────┘
          ┌────▼─────┐
          │  CP-013  │  Dashboard
          └────┬─────┘
          ┌────▼─────┐
          │  CP-014  │  PWA
          └────┬─────┘
          ┌────▼─────┐
          │  CP-015  │  Module Integration
          └────┬─────┘
    ┌──────────┼──────────┐
┌───▼────┐ ┌──▼──────┐ ┌─▼───────┐
│ CP-016 │ │ CP-017  │ │ CP-018  │
│TraceNet│ │AgriStack│ │ Testing │
└───┬────┘ └────┬────┘ └────┬────┘
    └────────────┼──────────┘
            ┌────▼─────┐
            │  CP-019  │  Pre-Launch
            └────┬─────┘
            ┌────▼─────┐
            │  CP-020  │  GA Release
            └──────────┘
```

---

## 6. Checkpoint Dependency Table

| Checkpoint | Direct Dependencies | Can Start After |
|------------|---------------------|-----------------|
| CP-000 | — | Immediately |
| CP-001 | CP-000 | CP-000 complete |
| CP-002 | CP-001 | CP-001 complete |
| CP-003 | CP-002 | CP-002 complete |
| CP-004 | CP-002, CP-003 | CP-003 complete |
| CP-005 | CP-002, CP-003, CP-004 | CP-004 complete |
| CP-006 | CP-005 | CP-005 complete |
| CP-007 | CP-006 | CP-006 complete |
| CP-008 | CP-006, CP-007 | CP-007 complete |
| CP-009 | CP-005 | CP-005 complete |
| CP-010 | CP-008, CP-009 | Both CP-008 & CP-009 complete |
| CP-011 | CP-007, CP-009 | Both CP-007 & CP-009 complete |
| CP-012 | CP-005 | CP-005 complete |
| CP-013 | CP-008, CP-009, CP-010 | CP-010 complete |
| CP-014 | CP-008, CP-013 | CP-013 complete |
| CP-015 | CP-010 … CP-014 | All Phase 3 modules complete |
| CP-016 | CP-009, CP-015 | CP-015 complete |
| CP-017 | CP-009, CP-015 | CP-015 complete |
| CP-018 | CP-015 | CP-015 complete |
| CP-019 | CP-016, CP-017, CP-018 | All Phase 4 connectors complete |
| CP-020 | CP-019 | CP-019 complete |

---

## 7. Parallelisation Opportunities

The following module pairs / groups **can be developed concurrently**:

| Parallel Group | Modules | Earliest Start |
|----------------|---------|----------------|
| A | GS1 Engine (CP-006) ∥ Transparency Log (CP-009) ∥ CPQ (CP-012) | After CP-005 |
| B | Resolver (CP-008) ∥ Revocation (CP-011) | After CP-007 + CP-009 |
| C | TraceNet (CP-016) ∥ AgriStack (CP-017) ∥ Testing (CP-018) | After CP-015 |

Maximising parallelism in Groups A and C offers the greatest schedule compression.

---

## 8. Cross-References

| Document | Path |
|----------|------|
| Master Plan | [`MASTER_PLAN.md`](file:///Users/nandyyy/project/CapMint/governance/MASTER_PLAN.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |
| BRAIN Dependencies | [`../BRAIN/DEPENDENCIES.md`](file:///Users/nandyyy/project/CapMint/BRAIN/DEPENDENCIES.md) |

---

*End of DEPENDENCY_GRAPH.md*
