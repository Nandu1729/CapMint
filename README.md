# CapMint — AI-First Anti-Counterfeiting Platform

**Authenticate Everything. Counterfeit Nothing.**

---

## 🏗️ Project Architecture Overview

CapMint uses secure cryptographic serial identifiers conforming to GS1 Digital Link standards, an append-only transparency ledger, and AI-driven clone detection to secure supply chains from manufacturer to consumer.

```
                   main (Protected Production Releases)
                    ▲
                    │
                 develop (Integration and Test Branch)
                    ▲
                    │
             feature branches (Short-lived checkpoint work)
```

---

## 🏁 Checkpoint System (CP-000 to CP-023)

CapMint development follows a strict sequential checkpoint roadmap. No milestones may be skipped.

### Phase 1 — Foundation (CP-000 to CP-005)
- **CP-000**: Project Operating System — ✅ **COMPLETE**
- **CP-001**: Architecture Lock — ⏳ **PENDING**
- **CP-002**: Database Design — ⬜ NOT STARTED
- **CP-003**: API Contracts — ⬜ NOT STARTED
- **CP-004**: Infrastructure — ⬜ NOT STARTED
- **CP-005**: Development Ready — ⬜ NOT STARTED

### Phase 2 — Core Engines & APIs (CP-006 to CP-014)
- **CP-006**: Authentication — ⬜ NOT STARTED
- **CP-007**: Authorization — ⬜ NOT STARTED
- **CP-008**: CPQ — ⬜ NOT STARTED
- **CP-009**: GS1 Engine — ⬜ NOT STARTED
- **CP-010**: Mint Engine — ⬜ NOT STARTED
- **CP-011**: QR Engine — ⬜ NOT STARTED
- **CP-012**: Resolver — ⬜ NOT STARTED
- **CP-013**: Transparency Log — ⬜ NOT STARTED
- **CP-014**: Verification — ⬜ NOT STARTED

### Phase 3 — Specialized Modules & Release (CP-015 to CP-023)
- **CP-015**: Clone Detection — ⬜ NOT STARTED
- **CP-016**: Revocation — ⬜ NOT STARTED
- **CP-017**: Dashboards — ⬜ NOT STARTED
- **CP-018**: PWA — ⬜ NOT STARTED
- **CP-019**: TraceNet Integration — ⬜ NOT STARTED
- **CP-020**: AgriStack Integration — ⬜ NOT STARTED
- **CP-021**: Testing — ⬜ NOT STARTED
- **CP-022**: Pilot Release — ⬜ NOT STARTED
- **CP-023**: Production Release — ⬜ NOT STARTED

---

## 📁 Repository Directory Structure

```
CapMint/
├── README.md                  # This file
├── OWNERS.md                  # Directory ownership and review policy
│
├── BRAIN/                     # Core Project operating system context
│   ├── PROJECT_CONTEXT.md     # Platform scope, missions, tech stack
│   ├── PROJECT_BRAIN.md       # Document indexes and golden workflows
│   ├── AI_RULES.md            # AI agent pre-check and post-task rules
│   ├── NON_NEGOTIABLES.md     # Inviolable security and quality parameters
│   ├── DEPENDENCIES.md        # Monorepo dependencies manifest
│   ├── ARCHITECTURE_SUMMARY.md# Microservice container outlines
│   ├── DECISIONS.md           # Locked architectural decision records (ADRs)
│   ├── CURRENT_STATE.md       # Snapshot state card
│   ├── CHANGELOG.md           # Changelog keep-a-changelog record
│   ├── NEXT_TASK.md           # Immediate next task details
│   ├── SESSION.md             # Active AI developer session memory
│   ├── LESSONS_LEARNED.md     # Living repository of engineering lessons
│   │
│   └── state/                 # State registers (Sprint, Roadmap, Milestones)
│       ├── ACTIVE_CHECKPOINT.md
│       ├── PROGRESS.md
│       ├── ACTIVE_BRANCH.md
│       ├── BLOCKERS.md
│       ├── CURRENT.md
│       ├── MILESTONES.md
│       ├── ROADMAP.md
│       └── SPRINT.md
│
├── governance/                # Operational planning and governance guides
│   ├── MASTER_PLAN.md         # Phased checklist targets
│   ├── DEPENDENCY_GRAPH.md    # Topological build sequence map
│   ├── MODULE_STATUS.md       # Module status tracking dashboard
│   ├── PROJECT_STATE.md       # Executive risk registry and metrics
│   ├── QUALITY_GATES.md       # Simplified Quality Gates (Gates 0 to 5)
│   ├── TECH_DEBT.md           # Greenfield technical debt tracking register
│   └── CHANGE_APPROVALS.md    # Approved configuration decisions index
│
├── templates/                 # Reusable templates for development tasks
│   ├── ADR.md
│   ├── API.md
│   ├── PR-template.md
│   ├── bug.md
│   ├── checkpoint.md
│   ├── database.md
│   ├── feature.md
│   ├── meeting.md
│   ├── release.md
│   ├── test-plan.md
│   └── threat-model.md
│
└── checkpoints/               # Checkpoint records and validation logs
    └── CP-000.md              # Foundation complete sign-off record
```

---

## 🔄 Development Workflow

1. **Pick a Task:** Consult `BRAIN/NEXT_TASK.md` and check active checkpoint tasks.
2. **Branch out:** Create a feature branch off `develop` (e.g. `feature/CP-001-architecture-lock`).
3. **Implement:** Code and write tests concurrently. Follow [BRAIN/AI_RULES.md](file:///Users/nandyyy/project/CapMint/BRAIN/AI_RULES.md).
4. **Pull Request:** Open a PR targeting `develop` using the [templates/PR-template.md](file:///Users/nandyyy/project/CapMint/templates/PR-template.md).
5. **Update State:** Overwrite and update all 7 post-task documentation registries in `BRAIN/` before requesting human verification.

---

## 🤝 Contributing

Before contributing, please read [OWNERS.md](file:///Users/nandyyy/project/CapMint/OWNERS.md) to understand review SLA guidelines, escalation paths, and decision authorities.
