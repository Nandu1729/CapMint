# CapMint — AI Agent Rules

> **Authority:** This document governs all AI agent behavior on the CapMint project.  
> **Last Updated:** 2026-07-08  
> **Status:** Enforced — violations are logged and flagged for human review  

---

## 1. Pre-Task Checklist (MANDATORY)

Before writing **any** code, configuration, or documentation, the AI agent MUST read these six documents in the specified order:

| Order | Document | Why |
|---|---|---|
| 1 | [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | Understand CapMint identity and scope |
| 2 | [CURRENT_STATE.md](./CURRENT_STATE.md) | Know the overall project status |
| 3 | [SESSION.md](./SESSION.md) | Load short-term session memory |
| 4 | [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) | Know the active milestone and remaining tasks |
| 5 | [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) | Know the inviolable constraints |
| 6 | **AI_RULES.md** *(this file)* | Confirm behavioral rules |

### Pre-Task Verification Statement
After reading, the agent should internally confirm:
```
✅ I know the project mission and modules.
✅ I know the current state of the codebase.
✅ I know the active session parameters and objectives.
✅ I know which checkpoint is active and what tasks remain.
✅ I know the non-negotiable rules I must not violate.
✅ I know the AI workflow and update obligations.
```

---

## 2. Milestone Discipline

### 2.1 Sequential Checkpoint Execution
Checkpoints MUST be completed in strict sequential order: CP-000 → CP-001 → ... → CP-023.
- **Never skip a checkpoint.** Even if a later checkpoint seems simpler.
- **Never work on tasks from a future checkpoint** while the current one has incomplete items.
- **Never mark a checkpoint complete** until ALL its tasks pass tests, and code review.
- **One checkpoint active at a time.** The active checkpoint is defined in [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md).

### 2.2 Checkpoint Transition Protocol
When all tasks in the active checkpoint are complete:
1. Verify all tasks are marked complete in ACTIVE_CHECKPOINT.md.
2. Verify all feature branches for this checkpoint are merged to `develop`.
3. Verify CI is green on `develop`.
4. Archive the checkpoint spec to `checkpoints/CP-NNN.md`.
5. Update ACTIVE_CHECKPOINT.md with the next checkpoint's definition from [MASTER_PLAN.md](../governance/MASTER_PLAN.md).
6. Update [CURRENT_STATE.md](./CURRENT_STATE.md) with the new checkpoint status.
7. Append a checkpoint transition entry to [CHANGELOG.md](./CHANGELOG.md).

### 2.3 Task Granularity
- Each checkpoint task should be completable in a **single focused session**.
- Each task gets its own **feature branch**: `feature/CP-NNN-description`.
- Each task results in a **single pull request** to `develop`.

---

## 3. Post-Task Updates (MANDATORY)

After completing **every** task (code, config, or documentation), the AI agent MUST update the following seven documents:

| # | Document | What to Update |
|---|---|---|
| 1 | [CURRENT_STATE.md](./CURRENT_STATE.md) | Overwrite with latest status snapshot |
| 2 | [CHANGELOG.md](./CHANGELOG.md) | Append entry in Keep-a-Changelog format |
| 3 | [SESSION.md](./SESSION.md) | Update active session status and memory |
| 4 | [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) | Mark completed tasks with `[x]` |
| 5 | [DECISIONS.md](./DECISIONS.md) | Add ADR if any architectural decision was made |
| 6 | [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) | Update if dependencies changed |
| 7 | [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) | Log any shortcuts or known issues |

### Post-Task Verification Statement
```
✅ CURRENT_STATE.md reflects the new reality.
✅ CHANGELOG.md has an entry for this task.
✅ SESSION.md logs this session's outcome and next session's handoff.
✅ ACTIVE_CHECKPOINT.md tasks are accurately checked.
✅ DECISIONS.md is updated (if applicable).
✅ DEPENDENCY_GRAPH.md is current (if deps changed).
✅ TECH_DEBT.md logs any shortcuts taken.
```

---

## 4. Branching Rules

### 4.1 Branch Discipline
- **Never commit directly to `main`.**
- **Never commit directly to `develop`.**
- **Always create feature branches from `develop`.**
- **Always name branches `feature/CP-NNN-description`.**
- **All merges to `develop` require a pull request.**
- **Merge development flow goes: `main` → `develop` → `feature branches`.**

---

## 5. Architecture Immutability

### 5.1 Architecture Freeze
The architecture defined in [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) is frozen. The AI agent MUST NOT change microservice boundaries, swap key technologies, alter authentication designs, or modify deployment structures without approval.

### 5.2 How to Propose Architecture Changes
1. Draft an ADR in [DECISIONS.md](./DECISIONS.md) with Status: **Proposed**.
2. Document the Context, Decision, and Consequences.
3. **STOP** and request human review before implementing.
4. Only proceed after the ADR status is changed to **Accepted** by a human.

---

## 6. Code Quality Standards

### 6.1 Language and Style
- **Language**: TypeScript 5.x, strict mode (`"strict": true`).
- **Linter**: ESLint with `@typescript-eslint` recommended rules.
- **Formatter**: Prettier.

### 6.2 Testing Requirements
- **Unit**: Jest (coverage ≥ 80%).
- **Integration**: Jest (coverage ≥ 70%).

---

## 7. Prohibited Actions

The AI agent MUST NEVER:
1. Skip the pre-task checklist.
2. Skip the post-task updates.
3. Skip a checkpoint or work out of order.
4. Commit directly to `main` or `develop`.
5. Change architecture without an accepted ADR.
6. Hardcode secrets, API keys, or credentials.
7. Introduce a dependency without adding it to [DEPENDENCIES.md](./DEPENDENCIES.md).
8. Ignore linter or type-checker errors.

---

## 8. Error Handling Protocol

When the AI agent encounters an issue it cannot resolve:
1. **Document the issue** in [CURRENT_STATE.md](./CURRENT_STATE.md) under a `## Blockers` section.
2. **Log it** in [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) if it's a known limitation.
3. **STOP and report** to the human operator with what was attempted, what failed, and what is recommended.
4. **Do not work around** security or architecture constraints.

---

*These rules exist to maintain project integrity, security, and momentum. They are non-negotiable.*
