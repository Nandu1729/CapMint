# CapMint — Quality Gates

> **Document**: `governance/QUALITY_GATES.md`
> **Created**: 2026-07-08
> **Last Updated**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Purpose

Quality gates are **mandatory pass/fail checkpoints** that every module and integration milestone must satisfy before promotion to the next stage. No code reaches `main` without passing its corresponding gate.

---

## 2. Gate Definitions

### Gate 0 — Repository Foundation

**Applies to**: Repository scaffold, governance framework, configuration files, initial documentation, templates.
**Milestone**: CP-000 (Project Operating System)

| # | Criterion | Verification |
|---|-----------|--------------|
| G0.1 | Repository structure matches agreed directory structure layout. | Manual review. |
| G0.2 | Branching strategy documented and enforced (develop, features). | settings audit. |
| G0.3 | All foundational project operating system documents created and verified. | Peer review. |
| G0.4 | Reusable document templates present in `/templates`. | File verification. |
| G0.5 | Initial git checkout completed and tagged `CP-000`. | Git tag verification. |

---

### Gate 1 — Architecture Locked

**Applies to**: Architecture, system designs, C4 diagrams, database design, API design contracts.
**Milestones**: CP-001 through CP-003

| # | Criterion | Verification |
|---|-----------|--------------|
| G1.1 | Complete C4 Model (Context, Container, Component diagrams) documented. | Architecture review. |
| G1.2 | Database relational schemas designed, optimized, and documented. | DB architecture sign-off. |
| G1.3 | All public API design contracts fully documented (OpenAPI/GraphQL). | API review. |
| G1.4 | Architectural Decision Records (ADRs) finalized and signed off. | ADR log check in `DECISIONS.md`. |
| G1.5 | Threat model and security architecture finalized. | Security review. |

---

### Gate 2 — Development Ready

**Applies to**: Dev tools, container configurations, local testing setup, environments.
**Milestones**: CP-004 through CP-005

| # | Criterion | Verification |
|---|-----------|--------------|
| G2.1 | Local development environment runs via `docker compose up` with zero errors. | Docker setup test. |
| G2.2 | Environment variable configurations documented in `.env.example`. | File audit. |
| G2.3 | CI/CD base pipelines operational (build, lint, test triggers). | Pipeline run validation. |
| G2.4 | Seed data scripts and initial migration schemas run successfully. | Local DB check. |
| G2.5 | "Getting Started" guides completed and validated. | Peer clone walkthrough. |

---

### Gate 3 — Feature Complete

**Applies to**: Feature modules, core engines, interfaces, PWAs, trackers, and integrations.
**Milestones**: CP-006 through CP-020

| # | Criterion | Verification |
|---|-----------|--------------|
| G3.1 | All functional requirements satisfied for the target module. | E2E/Acceptance test validation. |
| G3.2 | Code passes strict TypeScript compilations and lint checks (zero warnings).| CI pipeline audit. |
| G3.3 | Unit and integration test coverage meets or exceeds 80%. | Coverage reports. |
| G3.4 | API endpoints conform strictly to versioning guidelines. | Contract test validation. |
| G3.5 | Security controls implemented (RBAC check, input sanitization). | Static analysis (SAST) scan. |
| G3.6 | Documentation and changelogs updated for the checkpoint. | File verification. |

---

### Gate 4 — Release Ready

**Applies to**: Integration testing, release candidates, system integration.
**Milestones**: CP-021 through CP-022

| # | Criterion | Verification |
|---|-----------|--------------|
| G4.1 | Full end-to-end user journey test suite passes. | E2E automation run (Cypress/Playwright). |
| G4.2 | Pilot testing in staging environment completed successfully. | Staging audit logs. |
| G4.3 | Performance load tests demonstrate compliance with latency targets. | Performance test results (p95 < 200ms). |
| G4.4 | Migration scripts tested and verified under rollback scenarios. | DB migration simulation. |
| G4.5 | User and API documentation completed. | Docs compile check. |

---

### Gate 5 — Production Ready

**Applies to**: General Availability release to the public.
**Milestone**: CP-023

| # | Criterion | Verification |
|---|-----------|--------------|
| G5.1 | Penetration test completed with zero critical or high-severity vulnerabilities.| Pentest sign-off. |
| G5.2 | Dependency scan verified with zero known high CVEs. | Dependency auditing tool output. |
| G5.3 | System monitoring dashboards, logs, and alerts configured in production. | Ops validation. |
| G5.4 | SLA metrics, scaling policies, and incident playbooks finalized. | Ops handbook sign-off. |
| G5.5 | Release approvals signed off by all key stakeholders. | Change approval register. |

---

## 3. General Gates (Apply to Every PR)

These criteria apply to every PR before it can merge into the `develop` integration branch:

- **GG.1**: Linting, formatting, and type-checks must be clean (zero warnings).
- **GG.2**: Unit/Integration tests must pass.
- **GG.3**: Code coverage must be ≥ 80% for new code.
- **GG.4**: No hard-coded keys, configurations, or credentials (`git-secrets` scan clean).
- **GG.5**: Project state documentation (`CURRENT_STATE.md`, `CHANGELOG.md`, `PROGRESS.md`, etc.) updated.

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

## 5. Cross-References

| Document | Path |
|----------|------|
| Master Plan | [`MASTER_PLAN.md`](file:///Users/nandyyy/project/CapMint/governance/MASTER_PLAN.md) |
| Non-Negotiables | [`../BRAIN/NON_NEGOTIABLES.md`](file:///Users/nandyyy/project/CapMint/BRAIN/NON_NEGOTIABLES.md) |
| Tech Debt | [`TECH_DEBT.md`](file:///Users/nandyyy/project/CapMint/governance/TECH_DEBT.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |
| Change Approvals | [`CHANGE_APPROVALS.md`](file:///Users/nandyyy/project/CapMint/governance/CHANGE_APPROVALS.md) |

---

*End of QUALITY_GATES.md*
