# CapMint — Quality Gates

> **Document**: `governance/QUALITY_GATES.md`
> **Created**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Purpose

Quality gates are **mandatory pass/fail checkpoints** that every module and integration
milestone must satisfy before promotion to the next stage. No code reaches `main` without
passing its corresponding gate.

---

## 2. Gate Definitions

### Gate 0 — Project Initialisation (CP-000)

**Applies to**: Repository scaffold, governance framework, CI skeleton.

| # | Criterion | Verification |
|---|-----------|--------------|
| G0.1 | Repository structure matches agreed scaffold. | Manual review. |
| G0.2 | Branching strategy documented and enforced by branch protection rules. | GitHub settings audit. |
| G0.3 | CI pipeline runs lint + format checks on every PR. | Green CI badge. |
| G0.4 | All governance documents created and internally consistent. | Peer review. |
| G0.5 | BRAIN knowledge base initialised with project context. | File existence check. |
| G0.6 | `README.md` contains project overview, setup placeholder, and licence. | Manual review. |

---

### Gate 1 — Environment & Tooling (CP-001)

**Applies to**: Dev environment, Docker setup, tooling configuration.

| # | Criterion | Verification |
|---|-----------|--------------|
| G1.1 | `docker compose up` starts all services without errors. | Automated smoke test. |
| G1.2 | Environment variables documented in `.env.example`. | File diff check. |
| G1.3 | Hot-reload functional for the primary dev server. | Manual verification. |
| G1.4 | Seed data script populates local DB without errors. | Script exit code. |
| G1.5 | "Getting Started" section in README verified by a fresh-clone test. | New-contributor walkthrough. |

---

### Gate 2 — Foundation Modules (CP-002, CP-003, CP-004)

**Applies to**: Auth, Authorization, Security modules individually.

| # | Criterion | Verification |
|---|-----------|--------------|
| G2.1 | Unit test coverage ≥ 80 % for the module. | Coverage report. |
| G2.2 | No critical or high-severity static analysis findings. | SAST tool output. |
| G2.3 | API contract documented (OpenAPI / GraphQL schema). | Schema file exists + validates. |
| G2.4 | Auth: JWT issuance, refresh, and revocation flows pass. | Integration test suite. |
| G2.5 | Authz: RBAC policies enforce least-privilege correctly. | Policy test matrix. |
| G2.6 | Security: Rate limiting, CORS, CSP headers verified. | Automated header checks. |
| G2.7 | No secrets or credentials committed to the repository. | `git-secrets` scan. |
| G2.8 | ADR (Architecture Decision Record) written and approved. | File existence + review. |

---

### Gate 3 — Core Pipeline (CP-006, CP-007, CP-008, CP-009)

**Applies to**: GS1 Engine, QR Generator, Resolver, Transparency Log.

| # | Criterion | Verification |
|---|-----------|--------------|
| G3.1 | Unit test coverage ≥ 80 %. | Coverage report. |
| G3.2 | GS1: Generated identifiers conform to GS1 Digital Link 1.2. | Conformance test suite. |
| G3.3 | QR: Generated QR codes decode correctly and include digital signature. | Round-trip decode test. |
| G3.4 | Resolver: p95 latency < 300 ms under 1 000 concurrent requests. | Load test (k6 / Locust). |
| G3.5 | T-Log: Append-only invariant holds; Merkle proof verification passes. | Property-based tests. |
| G3.6 | T-Log: Throughput ≥ 5 000 events/sec sustained for 60 s. | Benchmark script. |
| G3.7 | No regressions in Foundation module tests. | Full CI suite green. |
| G3.8 | API documentation updated and published. | Docs build passes. |

---

### Gate 4 — Intelligence & UI (CP-010 … CP-014)

**Applies to**: Clone Detection, Revocation, CPQ, Dashboard, PWA.

| # | Criterion | Verification |
|---|-----------|--------------|
| G4.1 | Unit test coverage ≥ 80 %. | Coverage report. |
| G4.2 | Clone Detection: Precision ≥ 95 % on benchmark dataset. | Evaluation script. |
| G4.3 | Clone Detection: Inference latency p95 < 500 ms. | Load test. |
| G4.4 | Revocation: CRL/OCSP responder returns correct status within 1 s. | Integration test. |
| G4.5 | CPQ: Pricing rules engine produces deterministic quotes. | Property-based tests. |
| G4.6 | Dashboard: All role-based views render without JS errors. | Cypress / Playwright E2E. |
| G4.7 | PWA: Lighthouse performance score ≥ 90. | Lighthouse CI. |
| G4.8 | PWA: Offline scan-and-queue workflow verified. | Manual + automated test. |
| G4.9 | Accessibility audit passes (WCAG 2.1 AA). | axe-core scan. |
| G4.10 | No regressions in Core or Foundation tests. | Full CI suite green. |

---

### Gate 5 — Ecosystem & GA (CP-016 … CP-020)

**Applies to**: TraceNet, AgriStack, Testing, Pre-Launch, GA Release.

| # | Criterion | Verification |
|---|-----------|--------------|
| G5.1 | TraceNet: Event ingestion pipeline processes 1 000 events/min. | Load test. |
| G5.2 | AgriStack: Regulatory payload schema validated against spec. | Schema validation. |
| G5.3 | End-to-end test suite covers ≥ 85 % of critical user journeys. | E2E coverage report. |
| G5.4 | Load test: System sustains 10 000 RPS for 30 min (p99 < 1 s). | Load test report. |
| G5.5 | Penetration test: Zero critical findings; all highs mitigated. | Pen-test report. |
| G5.6 | Runbooks created for all P1/P2 incident scenarios. | Doc review. |
| G5.7 | SLA definitions documented and monitoring dashboards live. | Dashboard screenshot. |
| G5.8 | Chaos test: System recovers from single-node failure within 60 s. | Chaos experiment log. |
| G5.9 | Zero known critical CVEs in production dependencies. | `npm audit` / `trivy` scan. |
| G5.10 | Release notes, migration guide, and changelog published. | Doc review. |

---

## 3. General Gates (Apply to Every Module)

These criteria apply **in addition** to the specific gate above.

| # | Criterion | Verification |
|---|-----------|--------------|
| GG.1 | Code passes all linters and formatters with zero warnings. | CI check. |
| GG.2 | No `TODO` or `FIXME` without a linked issue/ticket. | Grep + issue tracker cross-check. |
| GG.3 | Database migrations are reversible (up + down). | Migration test script. |
| GG.4 | Feature flags wrap incomplete or experimental features. | Code review. |
| GG.5 | Module status updated in [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md). | File diff. |
| GG.6 | Change approval logged in [`CHANGE_APPROVALS.md`](file:///Users/nandyyy/project/CapMint/governance/CHANGE_APPROVALS.md). | File diff. |
| GG.7 | No hard-coded configuration values; all externalised. | Code review + grep. |

---

## 4. Quality Gate Checklist Template

Copy this template into PR descriptions to confirm gate compliance.

```markdown
## Quality Gate Checklist — [Module Name] — [Gate #]

**Checkpoint**: CP-XXX
**Branch**: feature/xxx → develop
**Reviewer(s)**: @reviewer1, @reviewer2

### Specific Gate Criteria
- [ ] G#.1 — [Criterion description]
- [ ] G#.2 — [Criterion description]
- [ ] ...

### General Gate Criteria
- [ ] GG.1 — Linter / formatter clean
- [ ] GG.2 — No untracked TODOs
- [ ] GG.3 — Migrations reversible
- [ ] GG.4 — Feature flags applied
- [ ] GG.5 — MODULE_STATUS.md updated
- [ ] GG.6 — CHANGE_APPROVALS.md entry added
- [ ] GG.7 — No hard-coded config

### Sign-Off
- [ ] Developer: @dev — Date: YYYY-MM-DD
- [ ] Reviewer: @rev — Date: YYYY-MM-DD
- [ ] Tech Lead: @lead — Date: YYYY-MM-DD
```

---

## 5. Escalation Policy

| Scenario | Action |
|----------|--------|
| Gate criterion cannot be met | Raise a **waiver request** in Change Approvals with full justification. |
| Waiver approved | Document the accepted risk in [`TECH_DEBT.md`](file:///Users/nandyyy/project/CapMint/governance/TECH_DEBT.md) with a remediation deadline. |
| Waiver rejected | Module remains in current status until the criterion is satisfied. |
| Dispute | Escalate to Tech Lead → CTO within 24 hours. |

---

## 6. Cross-References

| Document | Path |
|----------|------|
| Master Plan | [`MASTER_PLAN.md`](file:///Users/nandyyy/project/CapMint/governance/MASTER_PLAN.md) |
| Non-Negotiables | [`../BRAIN/NON_NEGOTIABLES.md`](file:///Users/nandyyy/project/CapMint/BRAIN/NON_NEGOTIABLES.md) |
| Tech Debt | [`TECH_DEBT.md`](file:///Users/nandyyy/project/CapMint/governance/TECH_DEBT.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |
| Change Approvals | [`CHANGE_APPROVALS.md`](file:///Users/nandyyy/project/CapMint/governance/CHANGE_APPROVALS.md) |

---

*End of QUALITY_GATES.md*
