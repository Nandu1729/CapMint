# CP-[NNN]: [Checkpoint Name]

> **Checkpoint Completion Record** — CapMint Anti-Counterfeiting Platform

---

## Overview

| Field                  | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| **Checkpoint ID**      | CP-[NNN] <!-- Sequential: CP-000, CP-001, CP-002 -->        |
| **Checkpoint Name**    | [Descriptive checkpoint name]                                |
| **Status**             | `PLANNED` · `IN_PROGRESS` · `COMPLETE` · `BLOCKED`          |
| **Start Date**         | YYYY-MM-DD                                                   |
| **Target Date**        | YYYY-MM-DD                                                   |
| **Completion Date**    | YYYY-MM-DD                                                   |
| **Branch**             | `checkpoint/CP-NNN-short-name`                               |
| **Lead**               | @[github-handle]                                             |
| **Team**               | @[handle], @[handle]                                         |

---

## 1. Objectives

<!-- List the specific goals this checkpoint aimed to accomplish. Each should be measurable. -->

- [ ] <!-- Objective 1: e.g., "Implement JWT-based authentication flow" -->
- [ ] <!-- Objective 2: e.g., "Deploy database schema for label management" -->
- [ ] <!-- Objective 3: e.g., "Achieve 80% unit test coverage on auth module" -->

## 2. Deliverables

### 2.1 Code Deliverables

| Deliverable                  | Module       | PR(s)        | Status     |
| ---------------------------- | ------------ | ------------ | ---------- |
| <!-- Feature/component -->   | <!-- mod --> | #[PR]        | ✅ / ❌ / 🔄 |
| <!-- Feature/component -->   | <!-- mod --> | #[PR]        | ✅ / ❌ / 🔄 |

### 2.2 Documentation Deliverables

| Document                     | Path                              | Status     |
| ---------------------------- | --------------------------------- | ---------- |
| <!-- e.g., API docs -->      | `docs/api/[endpoint].md`          | ✅ / ❌ / 🔄 |
| <!-- e.g., ADR -->           | `docs/adr/ADR-NNN.md`            | ✅ / ❌ / 🔄 |
| <!-- e.g., Feature spec -->  | `docs/features/[feature].md`      | ✅ / ❌ / 🔄 |

### 2.3 Infrastructure Deliverables

| Deliverable                  | Description                       | Status     |
| ---------------------------- | --------------------------------- | ---------- |
| <!-- e.g., CI pipeline -->   | <!-- Description -->              | ✅ / ❌ / 🔄 |
| <!-- e.g., DB migration -->  | <!-- Description -->              | ✅ / ❌ / 🔄 |

## 3. Quality Gate Results

> **All gates must pass (✅) for checkpoint completion.** See [quality gate definitions](../docs/process/quality-gates.md).

### Gate Checklist

| Gate                            | Criteria                              | Result     | Evidence / Notes           |
| ------------------------------- | ------------------------------------- | ---------- | -------------------------- |
| **Code Review**                 | All PRs approved by ≥2 reviewers      | ✅ / ❌     | <!-- Link to PRs -->       |
| **Unit Tests**                  | All pass, no skipped                  | ✅ / ❌     | <!-- CI link -->           |
| **Integration Tests**           | All pass on staging                   | ✅ / ❌     | <!-- CI link -->           |
| **Code Coverage**               | ≥ [N]% (see targets below)           | ✅ / ❌     | <!-- Coverage report -->   |
| **Security Review**             | No critical/high findings             | ✅ / ❌     | <!-- Scan report -->       |
| **Performance Baseline**        | Latency/throughput within targets     | ✅ / ❌     | <!-- Benchmark results --> |
| **Documentation Complete**      | All docs listed above are ✅          | ✅ / ❌     |                            |
| **No Open Blockers**            | Zero P0/P1 bugs remaining            | ✅ / ❌     | <!-- Bug tracker link -->  |

## 4. Test Coverage

| Module            | Line Coverage | Branch Coverage | Target    | Status     |
| ----------------- | ------------- | --------------- | --------- | ---------- |
| `auth`            | [N]%          | [N]%            | [N]%      | ✅ / ❌     |
| `labeling`        | [N]%          | [N]%            | [N]%      | ✅ / ❌     |
| `verification`    | [N]%          | [N]%            | [N]%      | ✅ / ❌     |
| `blockchain`      | [N]%          | [N]%            | [N]%      | ✅ / ❌     |
| **Overall**       | **[N]%**      | **[N]%**        | **[N]%**  | ✅ / ❌     |

## 5. Issues & Blockers

### 5.1 Resolved Issues

| Issue ID       | Title                    | Resolution                          |
| -------------- | ------------------------ | ----------------------------------- |
| BUG-[NNN]     | <!-- Bug title -->        | <!-- How it was resolved -->        |

### 5.2 Outstanding Issues

| Issue ID       | Title                    | Severity | Carried to CP  | Owner       |
| -------------- | ------------------------ | -------- | --------------- | ----------- |
| BUG-[NNN]     | <!-- Bug title -->        | S[0-3]   | CP-[NNN]        | @[handle]   |

### 5.3 Technical Debt Incurred

<!-- List any shortcuts, workarounds, or debt intentionally taken during this checkpoint. -->

- <!-- Debt 1: description + planned resolution checkpoint -->

## 6. Documents Updated

<!-- Confirm all project tracking docs have been updated for this checkpoint. -->

- [ ] `CURRENT_STATE.md`
- [ ] `CHANGELOG.md`
- [ ] `PROGRESS.md`
- [ ] `MODULE_STATUS.md`
- [ ] `ACTIVE_CHECKPOINT.md`
- [ ] `NEXT_TASK.md`
- [ ] `README.md` (if user-facing changes)

## 7. Approval

| Role               | Name            | Date       | Sign-off |
| ------------------ | --------------- | ---------- | -------- |
| **Tech Lead**      | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **QA Lead**        | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Product Owner**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Security Lead**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |

## 8. Next Checkpoint

| Field                  | Value                                                |
| ---------------------- | ---------------------------------------------------- |
| **Next Checkpoint**    | [CP-NNN: Name](../checkpoints/CP-NNN.md)             |
| **Planned Start**      | YYYY-MM-DD                                           |
| **Key Objectives**     | <!-- Brief list of next checkpoint goals -->          |
| **Dependencies**       | <!-- Anything that must be in place first -->         |

---

> **Usage:** Copy this template → rename to `CP-NNN-short-name.md` → fill progressively as work advances → complete all gates before marking `COMPLETE`.
