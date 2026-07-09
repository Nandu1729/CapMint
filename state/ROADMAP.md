# CapMint — Roadmap

> **Last Updated:** 2026-07-08  
> **Current Position:** Near-Term Foundation Phase (CP-000 ✅ → CP-001 ⏳)

---

## Roadmap Overview

```
Near-Term                 Medium-Term                  Long-Term
CP-000 → CP-005           CP-006 → CP-014              CP-015 → CP-023
Foundation Phase          Core Engines & APIs          Specialized Modules & Release
     ◄─── WE ARE HERE
```

---

## Phase 1: Near-Term Foundation (CP-000 → CP-005)

**Focus:** Foundation, architecture designs, data models, and tooling.  
**Goal:** Prepare the workspace, lock architecture, design database, specify API contracts, configure infrastructure, and establish a development-ready state.

| CP     | Name                       | Status        | Est. Duration | Key Outcome                    |
|--------|----------------------------|---------------|---------------|--------------------------------|
| CP-000 | Project Operating System   | ✅ COMPLETE    | < 1 day       | Governance & state tracking    |
| CP-001 | Architecture Lock          | ⏳ PENDING     | ~3 days       | Locked system architecture & C4|
| CP-002 | Database Design            | ⬜ NOT STARTED | ~3 days       | DB schemas & ERDs locked       |
| CP-003 | API Contracts              | ⬜ NOT STARTED | ~3 days       | OpenAPI / GraphQL specs locked |
| CP-004 | Infrastructure             | ⬜ NOT STARTED | ~4 days       | Docker & env configs ready     |
| CP-005 | Development Ready          | ⬜ NOT STARTED | ~2 days       | CI pipelines and workspace ready|

---

## Phase 2: Medium-Term Core Engines & APIs (CP-006 → CP-014)

**Focus:** Core security (AuthN/AuthZ) and authentication/verification engines.  
**Goal:** Implement auth primitives and the core anti-counterfeiting identification/verification flow.

| CP     | Name                       | Status        | Est. Duration | Key Outcome                    |
|--------|----------------------------|---------------|---------------|--------------------------------|
| CP-006 | Authentication             | ⬜ NOT STARTED | ~5 days       | JWT-based authentication       |
| CP-007 | Authorization              | ⬜ NOT STARTED | ~4 days       | RBAC implementation            |
| CP-008 | CPQ                        | ⬜ NOT STARTED | ~6 days       | Billing & quoting engine       |
| CP-009 | GS1 Engine                 | ⬜ NOT STARTED | ~5 days       | GTIN & Digital Link management |
| CP-010 | Mint Engine                | ⬜ NOT STARTED | ~5 days       | Cryptographic serial codes     |
| CP-011 | QR Engine                  | ⬜ NOT STARTED | ~4 days       | Cryptographic QR code signs    |
| CP-012 | Resolver                   | ⬜ NOT STARTED | ~5 days       | Digital Link routing engine    |
| CP-013 | Transparency Log           | ⬜ NOT STARTED | ~6 days       | Merkle-tree log events         |
| CP-014 | Verification               | ⬜ NOT STARTED | ~4 days       | Authenticity validation APIs   |

---

## Phase 3: Long-Term Specialized Modules & Release (CP-015 → CP-023)

**Focus:** Machine learning intelligence, user interfaces, third-party integrations, pilot, and release.  
**Goal:** Deploy clone detection algorithms, analytics dashboards, offline PWAs, supply chain integrations, run comprehensive quality verification, and release to production.

| CP     | Name                       | Status        | Est. Duration | Key Outcome                    |
|--------|----------------------------|---------------|---------------|--------------------------------|
| CP-015 | Clone Detection            | ⬜ NOT STARTED | ~8 days       | AI counterfeit detection       |
| CP-016 | Revocation                 | ⬜ NOT STARTED | ~4 days       | Code revocation API            |
| CP-017 | Dashboards                 | ⬜ NOT STARTED | ~7 days       | Portal UI analytics            |
| CP-018 | PWA                        | ⬜ NOT STARTED | ~7 days       | Consumer web verification app  |
| CP-019 | TraceNet Integration       | ⬜ NOT STARTED | ~6 days       | Supply chain B2B tracking      |
| CP-020 | AgriStack Integration      | ⬜ NOT STARTED | ~6 days       | Agricultural portal connector  |
| CP-021 | Testing                    | ⬜ NOT STARTED | ~7 days       | Load & security pen-tests      |
| CP-022 | Pilot Release              | ⬜ NOT STARTED | ~5 days       | Beta test in staging           |
| CP-023 | Production Release         | ⬜ NOT STARTED | ~3 days       | General Availability live 🚀   |

---

## Timeline Summary

| Phase       | Checkpoints     | Est. Total Duration | Status |
|-------------|-----------------|---------------------|--------|
| Near-Term   | CP-000 → CP-005 | ~16 days            | In Progress |
| Medium-Term | CP-006 → CP-014 | ~44 days            | Not Started |
| Long-Term   | CP-015 → CP-023 | ~53 days            | Not Started |
| **Total**   | **CP-000 → CP-023** | **~113 days**       | Active |

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [MASTER_PLAN.md](../../governance/MASTER_PLAN.md) | Authoritative project roadmap |
| [MILESTONES.md](MILESTONES.md) | Detailed milestone descriptions |
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md) | Current checkpoint status |
| [PROGRESS.md](PROGRESS.md) | Completion metrics |
| [SPRINT.md](SPRINT.md) | Sprint-level planning |
