# Governance Policies [GOVERNANCE_POLICIES]

This consolidated document defines the master roadmap, quality gates, change management approvals, module status tracking, package dependency matrices, and technical debt registers for CapMint.

---

## 1. Executive Summary [GOV-001]

CapMint is currently in the **Release Phase**, with checkpoint **CP-008 (Production Readiness)** actively in progress. The project overall health is green, with all foundational development milestones completed successfully.

---

## 2. Project Vision & Mission [GOV-002]

*   **Vision**: Build the world's most trusted AI-first anti-counterfeiting platform where every physical product carries a cryptographically verifiable digital identity.
*   **Mission**:
    1.  **Generate** GS1 Digital Link compliant identifiers and QR codes with zero dynamic vendors or third-party dependencies.
    2.  **Resolve** product links to rich provenance metadata in real time.
    3.  **Detect** clones using geovelocity and spatial-temporal heuristics.
    4.  **Log** events on an append-only event ledger using Merkle chains.
    5.  **Integrate** with government AgriStack and TraceNet registries.

---

## 3. Checkpoint Roadmap [GOV-003]

### Phase 1 — Foundation
*   **CP-000**: Project Operating System — Governance files, operating templates.
*   **CP-001**: Architecture Lock — System blueprints, STRIDE threat profiling, C4 diagrams.
*   **CP-002**: Database Design — Relational DB ERDs, schemas, state transitions, rules mapping.
*   **CP-003**: API & Contract Design — OpenAPI, Fastify JSON validation schemas.
*   **CP-004**: Backend Implementation — Implemented core modules M-001 to M-011.
*   **CP-005**: Frontend Implementation — Frontend dashboards and mobile PWA clients (M-012/M-013).
*   **CP-006**: Infrastructure — Cloud integrations and external registries (TraceNet/AgriStack).
*   **CP-007**: Quality Assurance — End-to-end integration and load testing suites.
*   **CP-008**: Production Readiness *(Active)* — Secrets audit, docker builds validation, release freeze approval.

### Phase 2 — Core Engines & APIs
(CP-006 to CP-014 details retained from master roadmap including authentication, CPQ, GS1 Engine, Mint Engine, QR Engine, Resolver, and Transparency Log).

### Phase 3 — Release
(CP-015 to CP-023 details retained from master roadmap including clone detection, revocation, dashboards, pilot and production release).

---

## 4. Branching & Change Approval Policies [GOV-004]

### 4.1 Branching Strategy
```
main ← develop ← feature branches
```
*   `main`: Stable production-ready code.
*   `develop`: Primary base working branch for integration.
*   `feature/*`: Individual feature branches.

### 4.2 Change Categories
*   **ARCH** (Architecture), **SCOPE** (Scope), **SEC** (Security), **INFRA** (Infrastructure), **DEPS** (Dependencies), **WAIVER** (Quality waiver), **PROC** (Process), **DATA** (Data schemas).

### 4.3 Change Log History
*   **CA-001**: Initialized project operating system, governance blueprints, and template frameworks.
*   **CA-002**: Refined operating system metrics, aligned checkpoints, and locked decisions.

---

## 5. Quality Gates Definition [GOV-005]

Quality gates are mandatory pass/fail criteria that every code promotion must satisfy:
*   **Gate 0 (Repository Foundation)**: Folder structure validation, tagged `CP-000`.
*   **Gate 1 (Architecture Locked)**: Complete C4 models, DB relational schemas, and OpenAPI contracts signed off.
*   **Gate 2 (Development Ready)**: Local dev environment runner (`docker compose up`) verified with zero errors.
*   **Gate 3 (Feature Complete)**: acceptance test verification, zero linter warnings, unit test coverage $\ge 80\%$.
*   **Gate 4 (Release Ready)**: E2E user-flow integration test suites pass, p95 latency $<200\text{ms}$.
*   **Gate 5 (Production Ready)**: Pentests complete, zero known high CVEs, system monitoring alerts configured.

### 5.1 General PR Gate Criteria (GG)
*   **GG.1**: Linting/formatting clean.
*   **GG.2**: All unit/integration tests pass.
*   **GG.3**: Test coverage $\ge 80\%$.
*   **GG.4**: No hard-coded keys or credentials.
*   **GG.5**: Status and state documentation updated.

---

## 6. Module Status Tracker [GOV-006]

| Module | Checkpoint | Status | Dependencies |
| :--- | :--- | :--- | :--- |
| **Authentication** | CP-004 | 🟢 COMPLETE | CP-003 |
| **Authorization** | CP-004 | 🟢 COMPLETE | Authentication |
| **CPQ** | CP-004 | 🔵 IN PROGRESS | CP-003 |
| **GS1 Engine** | CP-004 | 🔴 NOT STARTED | CP-003 |
| **Mint Engine** | CP-004 | 🔴 NOT STARTED | GS1 Engine |
| **QR Engine** | CP-004 | 🔴 NOT STARTED | Mint Engine |
| **Resolver** | CP-004 | 🔴 NOT STARTED | GS1 Engine, QR Engine |
| **Transparency Log** | CP-004 | 🔴 NOT STARTED | CP-003 |
| **Verification** | CP-004 | 🔴 NOT STARTED | Resolver |
| **Clone Detection** | CP-004 | 🔴 NOT STARTED | Resolver, Transparency Log |
| **Revocation** | CP-004 | 🔴 NOT STARTED | QR Engine, Transparency Log |
| **Dashboards** | CP-005 | 🔴 NOT STARTED | Verification, Clone Detection |
| **PWA** | CP-005 | 🔴 NOT STARTED | Verification, Dashboards |
| **TraceNet Integration** | CP-006 | 🔴 NOT STARTED | Transparency Log |
| **AgriStack Integration**| CP-006 | 🔴 NOT STARTED | Transparency Log |

---

## 7. Dependency Matrix [GOV-007]

### 7.1 Build Order (Topological Sort)
*   **Tier 0**: OS (`CP-000`)
*   **Tier 1**: Architecture (`CP-001`)
*   **Tier 2**: Database (`CP-002`)
*   **Tier 3**: API (`CP-003`)
*   **Tier 4**: Infrastructure (`CP-004`)
*   **Tier 5**: Development Ready (`CP-005`)
*   **Tier 6**: Auth (`CP-006`), CPQ (`CP-008`), GS1 (`CP-009`), Log (`CP-013`), Testing (`CP-021`)
*   **Tier 7**: Authz (`CP-007`), Mint (`CP-010`)
*   **Tier 8**: QR (`CP-011`)
*   **Tier 9**: Resolver (`CP-012`), Revocation (`CP-016`)
*   **Tier 10**: Verification (`CP-014`), Clone (`CP-015`)
*   **Tier 11**: Dashboards (`CP-017`), TraceNet (`CP-019`), AgriStack (`CP-020`)
*   **Tier 12**: PWA (`CP-018`)
*   **Tier 13**: Pilot (`CP-022`)
*   **Tier 14**: Release (`CP-023`)

---

## 8. Technical Debt Register [GOV-008]

*   **Current State**: 🟢 **Empty — Greenfield project.** No technical debt or quality waivers have been logged.
*   **Prevension Rules**:
    1.  Design-First: Write ADRs before implementing.
    2.  Gate Waiver: Automatic creation of a debt registry entry if quality gates are bypassed.
    3.  Refactoring Budget: Allocate 10-15% of sprint capacity to tech debt cleanups.
    4.  Dependency checks: Run audits on CI runs; prevent outdated packages.
    5.  Coverage floor: Block merges if coverage falls below 80%.

---

## 9. Risk & Decisions Log [GOV-009]

### 9.1 Risk Register
*   **R-001 (GS1 Evolving)**: Low probability / Medium impact. *Mitigation*: Pin to GS1 Digital Link v1.3.
*   **R-002 (Clone Accuracy)**: Medium probability / High impact. *Mitigation*: Collect labeled data early.
*   **R-003 (Latency bottleneck)**: Medium probability / High impact. *Mitigation*: Enforce strict p95 latency checks.

### 9.2 Architecture Decisions
*   **D-001**: Branching workflow established as `develop` primary integration base.
*   **D-002**: Initialize and lock Project Operating System before coding.
