# CapMint — Sprint Tracking

> **Last Updated:** 2026-07-24  
> **Current Sprint:** Sprint 9 — Workflow Gap Closures ✅ COMPLETE  
> **Previous Sprint:** Sprint 8 — Production Release & Hardening ✅ COMPLETE  

---

## Sprint 9 — Workflow Gap Closures ✅ COMPLETE

| Property          | Value                                     |
|-------------------|-------------------------------------------|
| **Sprint**        | Sprint 9                                  |
| **Goal**          | Close core product workflow gaps (onboarding docs, certifier lifecycle, explicit lots, caseworker investigations) |
| **Start Date**    | 2026-07-24                                |
| **End Date**      | 2026-07-24                                |
| **Branch**        | `feature/workflow-gaps`                    |
| **Status**        | ✅ COMPLETE                                |

### Sprint 9 Completed Tasks

- [x] S9-01: Implement database schema migration `0008` to support document review fields, budget states history and caseworkers.
- [x] S9-02: Enhance `auth-service` onboarding with admin review options, document lists, and approval notes.
- [x] S9-03: Implement certifier co-signing lifecycle (review, request revisions, reject) on `cpq-service` budgets.
- [x] S9-04: Support explicit packaging lot creation separate from unit code simulation.
- [x] S9-05: Implement lab trust activation validation and cryptographically secured PDF uploads.
- [x] S9-06: Add CSV and print-ready PDF QR metadata package sheet download endpoints.
- [x] S9-07: Build caseworkers alerts management interface (assigned, notes, escalation, closure).

---

## Sprint 8 — Production Release & Hardening ✅ COMPLETE

| Property          | Value                                     |
|-------------------|-------------------------------------------|
| **Sprint**        | Sprint 8                                  |
| **Goal**          | Hardening, Kubernetes integration, SLA telemetry config, and final release packaging |
| **Checkpoint**    | CP-023                                    |
| **Start Date**    | 2026-07-20                                |
| **End Date**      | 2026-07-24                                |
| **Branch**        | `feature/security-hardening` / `feature/releases` |
| **Status**        | ✅ COMPLETE                                |

### Sprint 8 Completed Tasks

- [x] S8-01: Remove hardcoded connection pool fallbacks and assert environment configurations.
- [x] S8-02: Relocate Ed25519 co-signing certifier keys to strict environment lookups.
- [x] S8-03: Implement Redis-based sliding-window rate limiters on login and verify lookups.
- [x] S8-04: Lockdown CORS wildcard origins to a configurable target origin.
- [x] S8-05: Create Helm Charts for Kubernetes deployments.
- [x] S8-06: Create automated Docker image compilation utility and Github Actions release workflow.
- [x] S8-07: Setup Prometheus configuration to monitor microservices SLA `/health` endpoints.

---

## Sprint 7 — Quality Assurance & Testing ✅ COMPLETE

| Property          | Value                                     |
|-------------------|-------------------------------------------|
| **Sprint**        | Sprint 7                                  |
| **Goal**          | Complete CP-021: Quality Assurance & E2E Testing |
| **Checkpoint**    | CP-021                                    |
| **Start Date**    | 2026-07-11                                |
| **End Date**      | 2026-07-20                                |
| **Branch**        | `feature/qa`                              |
| **Status**        | ✅ COMPLETE                                |

### Sprint 7 Completed Tasks

- [x] S7-01: End-to-end integration E2E test runner validating happy-path QR minting, co-signing, and NABL reports.
- [x] S7-02: Concurrency database row lock validations under multi-drawdown simulations.
- [x] S7-03: 52-case (expanded to 58) API compliance test scenarios.

---

## Sprint 6 — Infrastructure & Integrations ✅ COMPLETE

---

## Sprint 5 — Frontend Implementation ✅ COMPLETE

---

## Sprint 4 — Backend Implementation ✅ COMPLETE

---

## Sprint 3 — API & Contract Design ✅ COMPLETE

---

## Sprint 2 — Domain & Database Design ✅ COMPLETE

---

## Sprint 1 — Architecture & AI OS ✅ COMPLETE

---

## Sprint 0 — Foundation ✅ COMPLETE
