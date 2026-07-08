# CapMint — Quick Reference (AI Agent State Card)

> **Last Updated:** 2026-07-08  
> ⚡ This file is the **single entry point** for AI agents resuming work on CapMint.

---

## At a Glance

| Property            | Value                                      |
|---------------------|--------------------------------------------|
| **Checkpoint**      | CP-001 (Brain Complete) — ⏳ PENDING        |
| **Previous**        | CP-000 (Foundation Initialized) — ✅ DONE   |
| **Branch**          | `main` (switch to `feature/mint` for CP-001)|
| **Next Task**       | Populate all BRAIN/ subdirectories          |
| **Blockers**        | None                                        |
| **Sprint**          | Sprint 1 — Brain Complete                   |
| **Overall Progress**| 1/21 checkpoints (4.8%)                     |

---

## Before You Start — Checklist

1. ☐ Read this file (you're doing it now ✅)
2. ☐ Read [CURRENT_STATE.md](../CURRENT_STATE.md) for full project state
3. ☐ Read [NEXT_TASK.md](../NEXT_TASK.md) for task details & acceptance criteria
4. ☐ Check [BLOCKERS.md](BLOCKERS.md) for any impediments
5. ☐ Verify you're on the correct git branch
6. ☐ Review [AI_RULES.md](../AI_RULES.md) for behavioral constraints

---

## Document Map

### Core State Documents

| Document                                         | What It Tells You                     |
|--------------------------------------------------|---------------------------------------|
| [CURRENT_STATE.md](../CURRENT_STATE.md)          | Full project state & module status    |
| [NEXT_TASK.md](../NEXT_TASK.md)                  | What to work on next & how            |
| [CHANGELOG.md](../CHANGELOG.md)                  | What has been done so far             |
| [AI_RULES.md](../AI_RULES.md)                    | Rules you must follow                 |

### State Tracking (this directory)

| Document                                         | What It Tells You                     |
|--------------------------------------------------|---------------------------------------|
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md)     | Full checkpoint roadmap & transitions |
| [PROGRESS.md](PROGRESS.md)                       | Overall progress metrics              |
| [ACTIVE_BRANCH.md](ACTIVE_BRANCH.md)             | Branch strategy & current branch      |
| [BLOCKERS.md](BLOCKERS.md)                       | Active blockers & escalation          |
| [MILESTONES.md](MILESTONES.md)                   | All milestone descriptions            |
| [ROADMAP.md](ROADMAP.md)                         | Phased delivery plan                  |
| [SPRINT.md](SPRINT.md)                           | Current sprint details                |

### Governance Documents

| Document                                              | What It Tells You                 |
|-------------------------------------------------------|-----------------------------------|
| [MASTER_PLAN.md](../../governance/MASTER_PLAN.md)     | Full project roadmap              |
| [MODULE_STATUS.md](../../governance/MODULE_STATUS.md) | Module-level tracking             |

---

## Quick Commands

```bash
# Check current branch
git branch --show-current

# Create and switch to feature branch for CP-001
git checkout -b develop main
git checkout -b feature/mint develop

# See recent commits
git log --oneline -10

# Check for uncommitted changes
git status
```

---

## State Update Protocol

When you complete work, update these files **in order**:

1. **CURRENT_STATE.md** — Update checkpoint status and module table
2. **ACTIVE_CHECKPOINT.md** — Mark checkpoint transitions
3. **PROGRESS.md** — Update completion counts and metrics
4. **CHANGELOG.md** — Add entry for the completed work
5. **NEXT_TASK.md** — Load the next task details
6. **This file** — Update the At a Glance table
7. **SPRINT.md** — Update sprint progress

---

## Emergency Procedures

| Situation                    | Action                                           |
|------------------------------|--------------------------------------------------|
| Blocker found                | Add to [BLOCKERS.md](BLOCKERS.md), update state  |
| Wrong branch                 | `git stash` → switch → `git stash pop`           |
| Merge conflict               | Resolve, document in commit message              |
| Checkpoint criteria unclear  | Check [MASTER_PLAN.md](../../governance/MASTER_PLAN.md) |
| Lost context                 | Re-read this file from the top                   |

---

> 💡 **Tip:** Bookmark this file. It's your compass for the CapMint project.
