# CapMint — Quick Reference (AI Agent State Card)

> **Last Updated:** 2026-07-08  
> ⚡ This file is the **single entry point** for AI agents resuming work on CapMint.

---

## At a Glance

| Property            | Value                                      |
|---------------------|--------------------------------------------|
| **Checkpoint**      | All Checkpoints — ✅ **DONE**               |
| **Previous**        | CP-008 (Production Readiness) — ✅ **DONE** |
| **Branch**          | `main` (active)                            |
| **Next Task**       | None (Project fully signed-off and GA Ready) |
| **Blockers**        | None                                        |
| **Sprint**          | None (Release complete)                     |
| **Overall Progress**| GA Ready / Released 🚀                     |

---

## Before You Start — Checklist

1. ☐ Read this file (you're doing it now ✅)
2. ☐ Read [CURRENT_STATE.md](../CURRENT_STATE.md) for full project state
3. ☐ Read [SESSION.md](../SESSION.md) for active session memory
4. ☐ Read [NEXT_TASK.md](../NEXT_TASK.md) for task details & acceptance criteria
5. ☐ Check [BLOCKERS.md](BLOCKERS.md) for any impediments
6. ☐ Verify you're on the correct git branch (`feature/auth` off `develop`)
7. ☐ Review [AI_RULES.md](../AI_RULES.md) for behavioral constraints

---

## Document Map

### Core State Documents

| Document | What It Tells You |
|---|---|
| [CURRENT_STATE.md](../CURRENT_STATE.md) | Full project state & module status |
| [SESSION.md](../SESSION.md) | Active session memory log |
| [NEXT_TASK.md](../NEXT_TASK.md) | What to work on next & how |
| [CHANGELOG.md](../CHANGELOG.md) | What has been done so far |
| [AI_RULES.md](../AI_RULES.md) | Rules you must follow |
| [LESSONS_LEARNED.md](../LESSONS_LEARNED.md) | living log of lessons learned |

### State Tracking (this directory)

| Document | What It Tells You |
|---|---|
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md) | Full checkpoint roadmap & transitions |
| [PROGRESS.md](PROGRESS.md) | Phased progress metrics (binary) |
| [ACTIVE_BRANCH.md](ACTIVE_BRANCH.md) | Branch strategy & current branch |
| [BLOCKERS.md](BLOCKERS.md) | Active blockers & escalation |
| [MILESTONES.md](MILESTONES.md) | All milestone descriptions (CP-000 to CP-023) |
| [ROADMAP.md](ROADMAP.md) | Phased delivery plan |
| [SPRINT.md](SPRINT.md) | Current sprint details |

### Governance Documents

| Document | What It Tells You |
|---|---|
| [MASTER_PLAN.md](../../governance/MASTER_PLAN.md) | Full project roadmap |
| [MODULE_STATUS.md](../../governance/MODULE_STATUS.md) | Module-level tracking |
| [PROJECT_STATE.md](../../governance/PROJECT_STATE.md) | Executive status summary |
| [QUALITY_GATES.md](../../governance/QUALITY_GATES.md) | Pass/fail gating criteria |

---

## Quick Commands

```bash
# Check current branch
git branch --show-current

# Create and switch to feature branch for CP-001
git checkout develop
git checkout -b feature/architecture-lock develop

# See recent commits
git log --oneline -10

# Check for uncommitted changes
git status
```

---

## State Update Protocol

When you complete work, update these files **in order**:

1. **CURRENT_STATE.md** — Update checkpoint status and module table
2. **SESSION.md** — Document session objective, completion, and handoff
3. **ACTIVE_CHECKPOINT.md** — Mark checkpoint transitions
4. **PROGRESS.md** — Update completion registers
5. **CHANGELOG.md** — Add entry for the completed work
6. **NEXT_TASK.md** — Load the next task details
7. **This file** — Update the At a Glance table
8. **SPRINT.md** — Update sprint progress

---

## Emergency Procedures

| Situation | Action |
|---|---|
| Blocker found | Add to [BLOCKERS.md](BLOCKERS.md), update state |
| Wrong branch | `git stash` → switch → `git stash pop` |
| Merge conflict | Resolve, document in commit message |
| Checkpoint criteria unclear | Check [MASTER_PLAN.md](../../governance/MASTER_PLAN.md) |
| Lost context | Re-read this file from the top |

---

> 💡 **Tip:** Bookmark this file. It's your compass for the CapMint project.
