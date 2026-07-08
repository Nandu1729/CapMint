# CapMint — Tech Debt Register

> **Document**: `governance/TECH_DEBT.md`
> **Created**: 2026-07-08
> **Last Updated**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Purpose

This register tracks all known **technical debt** in the CapMint platform. Every item
that deviates from the ideal implementation — whether by design trade-off, time constraint,
or quality-gate waiver — must be recorded here with a remediation plan.

> **Current State**: 🟢 **Empty — Greenfield project.** No tech debt has been incurred yet.
> The structures below are ready to capture debt as development progresses.

---

## 2. Debt Categories

| Code | Category | Description |
|------|----------|-------------|
| **ARCH** | Architectural | Structural decisions that constrain future flexibility. |
| **CODE** | Code Quality | Duplicated code, poor abstractions, missing patterns. |
| **TEST** | Testing Gaps | Insufficient coverage, missing edge-case tests, flaky tests. |
| **DEPS** | Dependencies | Outdated libraries, known CVEs, unnecessary packages. |
| **DOCS** | Documentation | Missing / stale docs, undocumented APIs, unclear ADRs. |
| **PERF** | Performance | Known bottlenecks, unoptimised queries, missing caching. |
| **SEC** | Security | Deferred hardening, incomplete input validation, weak crypto. |
| **INFRA** | Infrastructure | Manual deployment steps, missing IaC, config drift. |
| **UX** | User Experience | Accessibility gaps, broken responsive layouts, poor error UX. |

---

## 3. Severity Definitions

| Severity | SLA to Remediate | Definition |
|----------|------------------|------------|
| 🔴 **Critical** | Within current sprint | Actively causing failures, security vulnerabilities, or data loss. |
| 🟠 **High** | Within 2 sprints | Significantly impedes velocity or poses material risk. |
| 🟡 **Medium** | Within current phase | Noticeable friction; manageable workaround exists. |
| 🟢 **Low** | Before GA | Minor inconvenience; cosmetic or stylistic. |

---

## 4. Tech Debt Tracking Table

| ID | Category | Severity | Module | Summary | Introduced | Checkpoint | Remediation Target | Owner | Status |
|----|----------|----------|--------|---------|------------|------------|-------------------|-------|--------|
| — | — | — | — | *No items recorded.* | — | — | — | — | — |

> **How to add an entry**: Copy the row template below and fill in each column.
>
> ```
> | TD-NNN | CATEGORY | 🟡 Severity | Module | Brief summary of the debt | YYYY-MM-DD | CP-XXX | CP-YYY | @owner | OPEN |
> ```

---

## 5. Debt Entry Template

When recording a new debt item, include the following detail in a sub-section:

```markdown
### TD-NNN: [Short Title]

- **Category**: CODE / ARCH / TEST / DEPS / DOCS / PERF / SEC / INFRA / UX
- **Severity**: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
- **Module**: [Module name]
- **Checkpoint Introduced**: CP-XXX
- **Description**: [What the debt is and why it exists.]
- **Impact**: [What happens if this is not addressed.]
- **Workaround**: [Current mitigation, if any.]
- **Remediation Plan**: [Steps to eliminate the debt.]
- **Target Checkpoint**: CP-YYY
- **Owner**: @person
- **Status**: OPEN / IN PROGRESS / RESOLVED / ACCEPTED
```

---

## 6. Debt Items (Detail)

> *No items yet. This section will contain expanded descriptions as debt is incurred.*

---

## 7. Prevention Strategies

Preventing tech debt is cheaper than remediating it. The following practices are
**mandatory** for all contributors.

### 7.1 Design-First Development

- Every module begins with an Architecture Decision Record (ADR) **before** coding.
- ADRs are peer-reviewed and approved in [`CHANGE_APPROVALS.md`](file:///Users/nandyyy/project/CapMint/governance/CHANGE_APPROVALS.md).

### 7.2 Quality Gate Enforcement

- No code merges to `develop` or `main` without passing the applicable
  [quality gate](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md).
- Gate waivers automatically create a debt entry in this register.

### 7.3 Continuous Refactoring Budget

- Allocate **10–15 % of each sprint** to debt reduction.
- Debt items are prioritised alongside feature work in sprint planning.

### 7.4 Dependency Hygiene

- Run `npm audit` / `trivy` on every CI build.
- Automated Dependabot / Renovate PRs for dependency updates.
- No new dependency added without a justification in the PR description.

### 7.5 Test Coverage Floor

- Module test coverage must never drop below **80 %**.
- CI fails if coverage falls below the floor.

### 7.6 Documentation as Code

- API docs auto-generated from OpenAPI / GraphQL schemas.
- Stale doc detection: CI warns if a module's docs haven't been updated alongside
  code changes to that module.

### 7.7 Periodic Debt Reviews

| Review | Cadence | Participants |
|--------|---------|--------------|
| Sprint debt triage | Every sprint | Module leads |
| Phase debt audit | At each phase boundary (CP-005, CP-014, CP-022) | Full team |
| Pre-GA debt freeze | Before CP-023 | Tech Lead + CTO |

---

## 8. Metrics

| Metric | Current | Target at GA |
|--------|---------|--------------|
| Total open debt items | 0 | ≤ 10 |
| Critical / High items | 0 | 0 |
| Avg. age of open items | N/A | ≤ 2 sprints |
| Debt items resolved | 0 | — |
| Waiver-originated items | 0 | ≤ 3 |

---

## 9. Cross-References

| Document | Path |
|----------|------|
| Quality Gates | [`QUALITY_GATES.md`](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md) |
| Decisions | [`../BRAIN/DECISIONS.md`](file:///Users/nandyyy/project/CapMint/BRAIN/DECISIONS.md) |
| Change Approvals | [`CHANGE_APPROVALS.md`](file:///Users/nandyyy/project/CapMint/governance/CHANGE_APPROVALS.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |

---

*End of TECH_DEBT.md*
