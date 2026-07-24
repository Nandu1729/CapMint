# CapMint — Quick Reference (AI Agent State Card)

> **Last Updated:** 2026-07-24  
> ⚡ This file is the **single entry point** for AI agents resuming work on CapMint.

---

## At a Glance

| Property            | Value                                      |
|---------------------|--------------------------------------------|
| **Target Phase**    | Product Workflow Gap Closures & Real-world Finalization |
| **Branch**          | `feature/workflow-gaps`                    |
| **Next Task**       | Verification validation / User validation |
| **Blockers**        | None                                        |
| **Overall Progress**| 100% Core Gaps Addressed & Passed Test Suite 🚀 |

---

## Before You Start — Checklist

1. ☐ Read this file (you're doing it now ✅)
2. ☐ Review active API specifications in the [api/](file:///Users/nandyyy/project/CapMint/api) folder
3. ☐ Check database structures and migrations in [database/migrations/](file:///Users/nandyyy/project/CapMint/database/migrations)
4. ☐ Verify system health locally using `npm run dev` and `node playground/test_runner.js`

---

## Document Map

### Core State & Project Specs

| Document | What It Tells You |
|---|---|
| [PROGRESS.md](PROGRESS.md) | Progress metrics for End-to-End core capabilities |
| [ROADMAP.md](ROADMAP.md) | Capability-based phased milestones |
| [ACTIVE_BRANCH.md](ACTIVE_BRANCH.md) | Branch strategy & current branch |
| [BLOCKERS.md](BLOCKERS.md) | Active blockers & escalation policies |
| [CapMint_Commercialization_Pipeline.md](../../.gemini/antigravity-cli/brain/a4692173-ddd7-4c90-a713-4ee7a9e5255f/CapMint_Commercialization_Pipeline.md) | Product architectural roadmap and monetization stages |

---

## Quick Commands

```bash
# Check current branch
git branch --show-current

# Spin up local microservices
npm run dev

# Run database migrations
node playground/run_migrations.js

# Execute 52-case compliance test suite
node playground/test_runner.js
```

---

## Emergency Procedures

| Situation | Action |
|---|---|
| Blocker found | Add to [BLOCKERS.md](BLOCKERS.md), update state |
| Wrong branch | `git stash` → switch → `git stash pop` |
| Merge conflict | Resolve, document in commit message |
| Lost context | Re-read this file from the top |

---

> 💡 **Tip:** Bookmark this file. It's your compass for the CapMint project.
