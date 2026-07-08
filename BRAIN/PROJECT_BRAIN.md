# CapMint — Project Brain (Central Knowledge Hub)

> **Purpose:** Single entry point for all AI agents and human contributors. Every document, rule, and workflow is indexed here.  
> **Last Updated:** 2026-07-08  
> **Status:** Living Document — updated at every checkpoint transition  
> **Rule:** *If you are an AI agent starting work on CapMint, read this file FIRST.*

---

## 1. Document Index

### 1.1 BRAIN/ — Core Documents

| Document                                                    | Purpose                                                    | Update Frequency       |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)                  | Project identity, mission, modules, tech stack             | Per major milestone    |
| **PROJECT_BRAIN.md** *(this file)*                          | Central knowledge hub, document index, workflows           | Every checkpoint       |
| [AI_RULES.md](./AI_RULES.md)                               | AI agent behavioral rules and checklists                   | Rarely (policy change) |
| [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md)                  | Immutable quality and security constraints                 | Rarely (policy change) |
| [DEPENDENCIES.md](./DEPENDENCIES.md)                        | Runtime, dev, infra, and external dependency manifest      | Every checkpoint       |
| [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md)        | High-level architecture, data flow, deployment topology    | Per ADR                |
| [DECISIONS.md](./DECISIONS.md)                              | Architecture Decision Records (ADRs)                       | Per decision           |
| [CURRENT_STATE.md](./CURRENT_STATE.md)                      | Live project status snapshot                                | Every task             |
| [CHANGELOG.md](./CHANGELOG.md)                              | Chronological record of all changes                        | Every task             |
| [SESSION.md](./SESSION.md)                                  | Short-term memory for active AI developer sessions         | Every session          |
| [LESSONS_LEARNED.md](./LESSONS_LEARNED.md)                  | Log of key engineering discoveries and design resolutions  | Per key discovery      |

### 1.2 BRAIN/state/ — Checkpoint State

| Document                                                    | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md)  | Currently active checkpoint definition and progress        |
| [state/PROGRESS.md](./state/PROGRESS.md)                    | Completion metrics (Foundation vs Application)             |
| [state/ACTIVE_BRANCH.md](./state/ACTIVE_BRANCH.md)          | Branch mapping and merge rules                             |
| [state/BLOCKERS.md](./state/BLOCKERS.md)                    | Active blockages and mitigation tracking registry          |
| [state/CURRENT.md](./state/CURRENT.md)                      | Quick reference summary card                               |
| [state/MILESTONES.md](./state/MILESTONES.md)                | Complete milestone breakdown (CP-000 to CP-023)            |
| [state/ROADMAP.md](./state/ROADMAP.md)                      | Near-term, medium-term, and long-term delivery roadmap     |
| [state/SPRINT.md](./state/SPRINT.md)                        | Active sprint task details                                 |

### 1.3 governance/ — Project Governance

| Document                                                    | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [../governance/MASTER_PLAN.md](../governance/MASTER_PLAN.md)| Full checkpoint roadmap (CP-000 → CP-023)                  |
| [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) | Inter-module dependency graph                     |
| [../governance/MODULE_STATUS.md](../governance/MODULE_STATUS.md) | Module status tracking register                       |
| [../governance/PROJECT_STATE.md](../governance/PROJECT_STATE.md) | Executive status summary and risk log                    |
| [../governance/QUALITY_GATES.md](../governance/QUALITY_GATES.md) | Pass/fail criteria (Gates 0 to 5)                         |
| [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md)    | Technical debt register                                    |
| [../governance/CHANGE_APPROVALS.md](../governance/CHANGE_APPROVALS.md) | Audit trail of approved configuration changes          |

---

## 2. AI Workflow — The Golden Loop

Every AI agent working on CapMint MUST follow this loop. Violations are logged and flagged.

```
┌─────────────────────────────────────────────────────┐
│                   THE GOLDEN LOOP                   │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │
│  │ 1. READ  │───▶│ 2. PLAN  │───▶│ 3. IMPLEMENT │   │
│  │  (6 docs)│    │ (scope)  │    │   (code)     │   │
│  └──────────┘    └──────────┘    └──────────────┘   │
│       ▲                                │             │
│       │          ┌──────────────┐      │             │
│       └──────────│ 4. UPDATE   │◀─────┘             │
│                  │  (7 docs)   │                     │
│                  └──────────────┘                    │
└─────────────────────────────────────────────────────┘
```

### Step 1 — READ (Pre-Task)

Before starting any work, read these six documents **in order**:

1. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — understand what CapMint is
2. [CURRENT_STATE.md](./CURRENT_STATE.md) — understand where we are now
3. [SESSION.md](./SESSION.md) — understand active session focus and memory
4. [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) — understand the active milestone
5. [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — understand what you must not violate
6. [AI_RULES.md](./AI_RULES.md) — understand behavioral guidelines

### Step 2 — PLAN (Scope)

- Identify the tasks within the active checkpoint.
- Scope work to a **single checkpoint task**.
- Verify work does not violate [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md).
- If architecture changes are required, draft an ADR in [DECISIONS.md](./DECISIONS.md) first.

### Step 3 — IMPLEMENT (Code)

- Follow the branching strategy (§3 below).
- Write code, tests, and documentation concurrently.
- Meet all quality gates defined in [governance/QUALITY_GATES.md](../governance/QUALITY_GATES.md).

### Step 4 — UPDATE (Post-Task)

After every task, update these seven documents:

1. [CURRENT_STATE.md](./CURRENT_STATE.md) — new status snapshot
2. [CHANGELOG.md](./CHANGELOG.md) — append entry
3. [SESSION.md](./SESSION.md) — log session progression
4. [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) — tick completed items
5. [DECISIONS.md](./DECISIONS.md) — if any decisions were made
6. [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) — if deps changed
7. [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) — if shortcuts were taken

---

## 3. Branching Strategy

```
main ← develop ← feature branches
```

### Branch Rules

- **`main`**: Protected branch. Stable production releases only.
- **`develop`**: Protected branch. Active integration. All feature branches must branch off of and merge back into `develop`.
- **`feature/*`**: Short-lived branches for individual checkpoints and tasks.

> **NEVER commit directly to `develop` or `main`.** All changes flow through feature branches and pull requests. See [AI_RULES.md](./AI_RULES.md) §4.

---

## 4. Document Update Protocol

| Event                        | Documents to Update                                         |
| ---------------------------- | ----------------------------------------------------------- |
| Task completed               | CURRENT_STATE, CHANGELOG, SESSION, ACTIVE_CHECKPOINT        |
| Dependency added/changed     | DEPENDENCIES, DEPENDENCY_GRAPH                              |
| Architecture decision made   | DECISIONS, ARCHITECTURE_SUMMARY                             |
| Shortcut / tech debt taken   | TECH_DEBT                                                   |
| Checkpoint completed         | ACTIVE_CHECKPOINT (advance), MASTER_PLAN, CURRENT_STATE     |
| Security issue found         | NON_NEGOTIABLES (if policy change)                          |

---

## 5. Checkpoint Lifecycle

- Only **one checkpoint** is ACTIVE at a time.
- A checkpoint cannot be marked COMPLETE until all its tasks pass tests and review.
- Checkpoint definitions: [MASTER_PLAN.md](../governance/MASTER_PLAN.md)

---

## 6. Quick Reference — File Locations

```
CapMint/
├── BRAIN/                          # ◀ You are here
│   ├── PROJECT_BRAIN.md            # This file
│   ├── PROJECT_CONTEXT.md          # Project identity
│   ├── AI_RULES.md                 # AI behavioral rules
│   ├── NON_NEGOTIABLES.md          # Immutable constraints
│   ├── DEPENDENCIES.md             # Dependency manifest
│   ├── ARCHITECTURE_SUMMARY.md     # High-level architecture
│   ├── DECISIONS.md                # ADR log
│   ├── CURRENT_STATE.md            # Live status
│   ├── CHANGELOG.md                # Change history
│   ├── SESSION.md                  # Session memory
│   ├── LESSONS_LEARNED.md          # Lessons log
│   └── state/
│       ├── ACTIVE_CHECKPOINT.md    # Current checkpoint
│       ├── PROGRESS.md             # Completion metrics
│       ├── ACTIVE_BRANCH.md        # Branch mapping
│       └── ...                     # Other state trackers
├── governance/
│   ├── MASTER_PLAN.md              # Full roadmap
│   ├── DEPENDENCY_GRAPH.md         # Module graph
│   ├── MODULE_STATUS.md            # Status register
│   ├── PROJECT_STATE.md            # Project state summary
│   ├── QUALITY_GATES.md            # Quality gate guidelines
│   ├── TECH_DEBT.md                # Debt registry
│   └── CHANGE_APPROVALS.md         # Configuration approval register
├── templates/                      # Document and task templates
└── checkpoints/                    # Checkpoint completions records
```

---

*This is the **starting point** for all work on CapMint. When in doubt, start here.*
