# CapMint — Next Task

> **Last Updated:** 2026-07-08  
> **Current Task:** CP-001 — Architecture Lock  
> **Priority:** 🔴 HIGH  
> **Status:** ⏳ PENDING  

---

## Prerequisites

| Prerequisite                  | Status | Notes                              |
|-------------------------------|--------|------------------------------------|
| CP-000 Project Operating System | ✅ DONE | All OS docs, template scaffolding created and reviewed. |
| Governance docs in place      | ✅ DONE | MASTER_PLAN, MODULE_STATUS, DEPENDENCY_GRAPH set up. |
| State tracking initialized    | ✅ DONE | state/ trackers initialized. |
| AI rules defined              | ✅ DONE | AI_RULES.md established. |
| Git branching strategy set    | ✅ DONE | `main` ← `develop` ← `feature/*` flow defined. |

**All prerequisites satisfied.** Ready to begin CP-001.

---

## Task: CP-001 — Architecture Lock

### Objective

Define and freeze the architecture and high-level structure of the CapMint platform. This involves mapping out the C4 Container and Component Diagrams, locking in interface definitions, identifying system flows, and compiling initial security threat vectors.

### Branch Strategy

Work for CP-001 will proceed as follows:

```
    develop (integration)
       └── feature/architecture-lock (working branch)
```

1. Sync local `develop` branch.
2. Checkout a new feature branch `feature/architecture-lock` from `develop`.
3. All CP-001 documentation changes are made on `feature/architecture-lock`.
4. PR is raised: `feature/architecture-lock` → `develop`.
5. Upon approval and merge, CP-001 is declared complete.

### Scope

| Component / Task | Focus | Status |
|------------------|-------|--------|
| **C4 Diagrams** | Container model and Core verification component diagrams in `/architecture/C4/`. | ⬜ NOT STARTED |
| **System Flow Diagram** | Define step-by-step product registration-to-verification loops. | ⬜ NOT STARTED |
| **Security Threat Profile** | List STRIDE threats for core API gateways and resolvers. | ⬜ NOT STARTED |
| **Tech Framework ADRs** | Approve and lock frameworks (Next.js, Express, etc.). | ⬜ NOT STARTED |

### Acceptance Criteria

- [ ] Complete C4 Container diagrams locked.
- [ ] Complete C4 Component diagrams for core verification loop.
- = [ ] System flow design patterns documented.
- [ ] Architecture decision records updated to show locked choices in `DECISIONS.md`.
- [ ] Security architecture threat vectors listed.
- [ ] All state files (`CURRENT_STATE.md`, `CHANGELOG.md`, `PROGRESS.md`, `SESSION.md`, `ACTIVE_CHECKPOINT.md`) updated.

---

## After CP-001

The next checkpoint will be **CP-002: Database Design**, which defines database relational schemas, indexes, and migrations.

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [MASTER_PLAN.md](../governance/MASTER_PLAN.md) | Full project roadmap |
| [CURRENT_STATE.md](CURRENT_STATE.md) | Current project state |
| [ACTIVE_CHECKPOINT.md](state/ACTIVE_CHECKPOINT.md) | Checkpoint status & transitions |
| [CHANGELOG.md](CHANGELOG.md) | Change history |
| [ROADMAP.md](state/ROADMAP.md) | Phased delivery roadmap |
| [SESSION.md](SESSION.md) | Active session memory |

---

## Notes for AI Agents

1. Read [CURRENT_STATE.md](CURRENT_STATE.md) and [SESSION.md](SESSION.md) before starting any work.
2. Ensure you are on the correct branch (`feature/architecture-lock`) before making changes.
3. Commit frequently with conventional commit messages (`feat:`, `docs:`, `chore:`).
4. Update state tracking documents as you complete the deliverables.
