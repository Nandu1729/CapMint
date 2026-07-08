# CapMint — Next Task

> **Last Updated:** 2026-07-08  
> **Current Task:** CP-001 — Brain Complete  
> **Priority:** 🔴 HIGH  
> **Status:** ⏳ PENDING

---

## Prerequisites

| Prerequisite                  | Status | Notes                              |
|-------------------------------|--------|------------------------------------|
| CP-000 Foundation Initialized | ✅ DONE | All foundation docs created        |
| Governance docs in place      | ✅ DONE | MASTER_PLAN, MODULE_STATUS, ADRs   |
| State tracking initialized    | ✅ DONE | BRAIN/state/ fully populated       |
| AI rules defined              | ✅ DONE | AI_RULES.md committed              |
| Git branching strategy set    | ✅ DONE | Trunk-based with feature branches  |

**All prerequisites satisfied.** Ready to begin CP-001.

---

## Task: CP-001 — Brain Complete

### Objective

Populate all `BRAIN/` subdirectories with their required documents, templates, and
configuration files so the AI-driven development system is fully operational.

### Branch Strategy

```
main (stable)
  └── develop (integration)
       └── feature/mint (CP-001 work)
```

1. Create `develop` branch from `main`
2. Create `feature/mint` branch from `develop`
3. All CP-001 work happens on `feature/mint`
4. PR: `feature/mint` → `develop` (requires review)
5. PR: `develop` → `main` (requires checkpoint sign-off)

### Scope

| Subdirectory         | Required Contents                          | Status        |
|----------------------|--------------------------------------------|---------------|
| `BRAIN/state/`       | All state tracking docs                    | ✅ COMPLETE    |
| `BRAIN/templates/`   | Issue, PR, ADR, checkpoint templates       | ⬜ NOT STARTED |
| `BRAIN/checklists/`  | Pre-commit, review, deployment checklists  | ⬜ NOT STARTED |
| `BRAIN/context/`     | Architecture context, tech stack, glossary | ⬜ NOT STARTED |
| `BRAIN/decisions/`   | ADR index, decision log                    | ⬜ NOT STARTED |
| `BRAIN/prompts/`     | AI agent prompt library                    | ⬜ NOT STARTED |
| `BRAIN/runbooks/`    | Operational runbooks                       | ⬜ NOT STARTED |
| `BRAIN/metrics/`     | KPI definitions, tracking templates        | ⬜ NOT STARTED |

### Acceptance Criteria

- [ ] All subdirectories listed above exist and contain their required documents
- [ ] Every document follows the established template format
- [ ] All cross-references between documents are valid and use relative paths
- [ ] `BRAIN/README.md` indexes all subdirectories and their purposes
- [ ] No placeholder or TODO content remains in any document
- [ ] `CURRENT_STATE.md` updated to reflect CP-001 completion
- [ ] `CHANGELOG.md` updated with CP-001 entry
- [ ] All changes committed to `feature/mint` branch with conventional commits

### Estimated Effort

| Task                     | Estimate |
|--------------------------|----------|
| Templates creation       | 2 hours  |
| Checklists creation      | 1 hour   |
| Context documents        | 2 hours  |
| Decisions framework      | 1 hour   |
| Prompt library           | 2 hours  |
| Runbooks                 | 1 hour   |
| Metrics definitions      | 1 hour   |
| Review & cross-ref audit | 1 hour   |
| **Total**                | **~11 hours** |

---

## After CP-001

The next checkpoint will be **CP-002: Core Architecture**, which defines the system
architecture, API contracts, data models, and infrastructure design.

---

## Cross-References

| Document                                           | Purpose                          |
|----------------------------------------------------|----------------------------------|
| [MASTER_PLAN.md](../governance/MASTER_PLAN.md)     | Full project roadmap             |
| [CURRENT_STATE.md](CURRENT_STATE.md)               | Current project state            |
| [ACTIVE_CHECKPOINT.md](state/ACTIVE_CHECKPOINT.md) | Checkpoint status & transitions  |
| [CHANGELOG.md](CHANGELOG.md)                       | Change history                   |
| [ROADMAP.md](state/ROADMAP.md)                     | Phased delivery roadmap          |

---

## Notes for AI Agents

1. Read [CURRENT_STATE.md](CURRENT_STATE.md) before starting any work.
2. Ensure you are on the correct branch (`feature/mint`) before making changes.
3. Commit frequently with conventional commit messages (`feat:`, `docs:`, `chore:`).
4. Update state tracking documents as you complete each subdirectory.
5. Run the cross-reference validation before marking CP-001 as complete.
