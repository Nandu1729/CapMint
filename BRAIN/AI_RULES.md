# CapMint — AI Agent Rules

> **Authority:** This document governs all AI agent behavior on the CapMint project.  
> **Last Updated:** 2026-07-08  
> **Status:** Enforced — violations are logged and flagged for human review  
> **Cross-References:**  
> - [PROJECT_BRAIN.md](./PROJECT_BRAIN.md) — central hub and workflow  
> - [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — project identity  
> - [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — immutable constraints  
> - [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) — system design  
> - [DECISIONS.md](./DECISIONS.md) — architecture decisions  
> - [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) — current goal

---

## 1. Pre-Task Checklist (MANDATORY)

Before writing **any** code, configuration, or documentation, the AI agent MUST read these five documents in the specified order:

| Order | Document                                                 | Why                                          |
| ----- | -------------------------------------------------------- | -------------------------------------------- |
| 1     | [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)               | Understand what CapMint is and its scope      |
| 2     | [CURRENT_STATE.md](./CURRENT_STATE.md)                   | Know the current project status               |
| 3     | [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) | Know the current goal and remaining tasks   |
| 4     | [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md)               | Know the inviolable constraints               |
| 5     | **AI_RULES.md** *(this file)*                            | Confirm behavioral rules                      |

### Pre-Task Verification Statement

After reading, the agent should internally confirm:

```
✅ I know the project mission and modules.
✅ I know the current state of the codebase.
✅ I know which checkpoint is active and what tasks remain.
✅ I know the non-negotiable rules I must not violate.
✅ I know the AI workflow and update obligations.
```

> **If any document is missing or unreadable, STOP and report the issue. Do not proceed with assumptions.**

---

## 2. Milestone Discipline

### 2.1 Sequential Checkpoint Execution

Checkpoints MUST be completed in strict sequential order: CP-000 → CP-001 → CP-002 → ... → CP-020+.

**Rules:**
- **Never skip a checkpoint.** Even if a later checkpoint seems simpler or more urgent.
- **Never work on tasks from a future checkpoint** while the current one has incomplete items.
- **Never mark a checkpoint complete** until ALL its tasks pass CI, tests, and code review.
- **One checkpoint active at a time.** The active checkpoint is defined in [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md).

### 2.2 Checkpoint Transition Protocol

When all tasks in the active checkpoint are complete:

1. Verify all tasks are `[x]` in ACTIVE_CHECKPOINT.md.
2. Verify all feature branches for this checkpoint are merged to `develop`.
3. Verify CI is green on `develop`.
4. Archive the checkpoint spec to `state/checkpoints/CP-NNN.md`.
5. Update ACTIVE_CHECKPOINT.md with the next checkpoint's definition from [MASTER_PLAN.md](../governance/MASTER_PLAN.md).
6. Update [CURRENT_STATE.md](./CURRENT_STATE.md) with the new phase.
7. Append a checkpoint transition entry to [CHANGELOG.md](./CHANGELOG.md).

### 2.3 Task Granularity

- Each checkpoint task should be completable in a **single focused session**.
- Each task gets its own **feature branch**: `feature/CP-NNN-descriptive-name`.
- Each task results in a **single pull request** to `develop`.

---

## 3. Post-Task Updates (MANDATORY)

After completing **every** task (code, config, or documentation), the AI agent MUST update the following six documents:

| # | Document                                                          | What to Update                                |
| - | ----------------------------------------------------------------- | --------------------------------------------- |
| 1 | [CURRENT_STATE.md](./CURRENT_STATE.md)                            | Overwrite with latest status snapshot          |
| 2 | [CHANGELOG.md](./CHANGELOG.md)                                    | Append entry in Keep-a-Changelog format        |
| 3 | [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md)        | Mark completed tasks with `[x]`                |
| 4 | [DECISIONS.md](./DECISIONS.md)                                    | Add ADR if any architectural decision was made |
| 5 | [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) | Update if dependencies changed           |
| 6 | [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md)          | Log any shortcuts or known issues              |

### Post-Task Verification Statement

```
✅ CURRENT_STATE.md reflects the new reality.
✅ CHANGELOG.md has an entry for this task.
✅ ACTIVE_CHECKPOINT.md tasks are accurately checked.
✅ DECISIONS.md is updated (if applicable).
✅ DEPENDENCY_GRAPH.md is current (if deps changed).
✅ TECH_DEBT.md logs any shortcuts taken.
```

> **Skipping post-task updates is a rule violation.** No exceptions.

---

## 4. Branching Rules

### 4.1 Branch Discipline

| Rule                                                        | Severity   |
| ----------------------------------------------------------- | ---------- |
| **Never commit directly to `main`**                        | 🔴 Critical |
| **Never commit directly to `develop`**                     | 🔴 Critical |
| **Never push to `release/*` without passing CI**           | 🔴 Critical |
| **Always create feature branches from `develop`**          | 🟡 High     |
| **Always name branches `feature/CP-NNN-description`**      | 🟡 High     |
| **Always squash-merge feature branches**                   | 🟢 Standard |
| **Delete feature branches after merge**                    | 🟢 Standard |

### 4.2 Branch Naming Convention

```
feature/CP-{checkpoint}-{kebab-case-description}
bugfix/CP-{checkpoint}-{kebab-case-description}
release/v{major}.{minor}.{patch}
hotfix/v{major}.{minor}.{patch}-{description}
```

**Examples:**
```
feature/CP-003-gs1-engine-gtin-minting
feature/CP-005-resolver-verification-endpoint
bugfix/CP-007-clone-detection-false-positive
release/v0.1.0
hotfix/v0.1.1-auth-bypass-fix
```

### 4.3 Pull Request Requirements

Every PR must include:
- Descriptive title referencing the checkpoint: `[CP-003] Implement GTIN minting service`
- Link to the task in ACTIVE_CHECKPOINT.md
- Summary of changes
- Test results (must pass)
- Updated documentation (if applicable)

---

## 5. Architecture Immutability

### 5.1 The Architecture is Frozen Unless an ADR is Filed

The architecture defined in [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) is **immutable**. The AI agent MUST NOT:

- Change the microservice boundaries
- Replace a core technology (e.g., swap PostgreSQL for MongoDB)
- Alter the authentication mechanism
- Modify the GS1 compliance approach
- Change the deployment topology

### 5.2 How to Propose Architecture Changes

If a change is genuinely necessary:

1. Draft an ADR in [DECISIONS.md](./DECISIONS.md) with Status: **Proposed**.
2. Document the Context, Decision, and Consequences.
3. Cross-reference the affected documents.
4. **STOP** and request human review before implementing.
5. Only proceed after the ADR status is changed to **Accepted** by a human.

---

## 6. Code Quality Standards

### 6.1 Language and Style

| Standard                      | Requirement                                           |
| ----------------------------- | ----------------------------------------------------- |
| **Language**                  | TypeScript 5.x, strict mode (`"strict": true`)        |
| **Linter**                    | ESLint with `@typescript-eslint` recommended rules     |
| **Formatter**                 | Prettier (default config, 100 char line width)         |
| **Naming**                    | camelCase (variables, functions), PascalCase (types, classes), SCREAMING_SNAKE (constants) |
| **File naming**               | kebab-case for files, PascalCase for React components  |
| **Imports**                   | Absolute imports from `@capmint/*` package aliases     |

### 6.2 Testing Requirements

| Test Type       | Tool    | Coverage Target | When                            |
| --------------- | ------- | --------------- | ------------------------------- |
| **Unit**        | Jest    | ≥ 80%           | Every function with logic       |
| **Integration** | Jest    | ≥ 70%           | Every API endpoint              |
| **E2E**         | Cypress | Critical paths  | Every user-facing flow          |

See coverage requirements in [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md).

### 6.3 Documentation Standards

- Every public function/method has a JSDoc comment.
- Every API endpoint has an OpenAPI annotation.
- Every module has a README.md in its root directory.
- Complex logic has inline comments explaining *why*, not *what*.

### 6.4 Security Standards

- No secrets in code or config files — use environment variables.
- All user input is validated and sanitized.
- SQL queries use parameterized statements (enforced by Prisma).
- HTTP responses include security headers (HSTS, CSP, X-Frame-Options).
- Dependencies are scanned for vulnerabilities on every CI run.

See full security requirements in [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md).

---

## 7. Prohibited Actions

The AI agent MUST NEVER:

| #  | Prohibited Action                                                |
| -- | ---------------------------------------------------------------- |
| 1  | Skip the pre-task checklist                                      |
| 2  | Skip the post-task updates                                       |
| 3  | Skip a checkpoint or work out of order                           |
| 4  | Commit directly to `main` or `develop`                           |
| 5  | Change architecture without an accepted ADR                      |
| 6  | Hardcode secrets, API keys, or credentials                       |
| 7  | Disable or weaken security controls                              |
| 8  | Reduce test coverage below 80%                                   |
| 9  | Introduce a dependency without adding it to [DEPENDENCIES.md](./DEPENDENCIES.md) |
| 10 | Mark a checkpoint complete with failing tests                    |
| 11 | Ignore linter or type-checker errors                             |
| 12 | Deploy without CI passing                                        |

---

## 8. Error Handling Protocol

When the AI agent encounters an issue it cannot resolve:

1. **Document the issue** in [CURRENT_STATE.md](./CURRENT_STATE.md) under a `## Blockers` section.
2. **Log it** in [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) if it's a known limitation.
3. **STOP and report** to the human operator with:
   - What was attempted
   - What failed
   - What the agent recommends
4. **Do not work around** security or architecture constraints.

---

*These rules exist to maintain project integrity, security, and momentum. They are non-negotiable.*
