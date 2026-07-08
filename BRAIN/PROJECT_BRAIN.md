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

### 1.2 BRAIN/state/ — Checkpoint State

| Document                                                    | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md)  | Currently active checkpoint definition and progress        |
| `state/checkpoints/CP-NNN.md`                               | Individual checkpoint specs (created as work progresses)   |

### 1.3 governance/ — Project Governance

| Document                                                    | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [../governance/MASTER_PLAN.md](../governance/MASTER_PLAN.md)| Full checkpoint roadmap (CP-000 → CP-020+)                 |
| [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) | Visual inter-module dependency graph              |
| [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md)    | Tech debt registry with severity and remediation plans     |
| [../governance/RISK_REGISTER.md](../governance/RISK_REGISTER.md) | Project risks, mitigations, owners                   |

### 1.4 architecture/ — Technical Architecture

| Document                                                    | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [../architecture/SERVICE_MAP.md](../architecture/SERVICE_MAP.md) | Detailed microservice definitions and contracts       |
| [../architecture/DATA_MODEL.md](../architecture/DATA_MODEL.md)   | Database schema, entity relationships, migrations     |
| [../architecture/API_CONTRACTS.md](../architecture/API_CONTRACTS.md) | OpenAPI + GraphQL schema inventory                |
| [../architecture/SECURITY_MODEL.md](../architecture/SECURITY_MODEL.md) | AuthN/AuthZ flows, threat model, encryption     |
| [../architecture/INFRA.md](../architecture/INFRA.md)             | Infrastructure-as-code, K8s manifests, Terraform     |

### 1.5 docs/ — Developer & User Documentation

| Document                                                    | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `../docs/CONTRIBUTING.md`                                   | Contribution guidelines, PR template, review process       |
| `../docs/ONBOARDING.md`                                     | New developer setup guide                                  |
| `../docs/API_GUIDE.md`                                      | Public API usage guide                                     |
| `../docs/GLOSSARY.md`                                       | Domain terminology (GS1, GTIN, SGTIN, etc.)                |

---

## 2. AI Workflow — The Golden Loop

Every AI agent working on CapMint MUST follow this loop. Violations are logged and flagged.

```
┌─────────────────────────────────────────────────────┐
│                   THE GOLDEN LOOP                   │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │
│  │ 1. READ  │───▶│ 2. PLAN  │───▶│ 3. IMPLEMENT │   │
│  │  (5 docs)│    │ (scope)  │    │   (code)     │   │
│  └──────────┘    └──────────┘    └──────────────┘   │
│       ▲                                │             │
│       │          ┌──────────────┐      │             │
│       └──────────│ 4. UPDATE   │◀─────┘             │
│                  │  (6 docs)   │                     │
│                  └──────────────┘                    │
└─────────────────────────────────────────────────────┘
```

### Step 1 — READ (Pre-Task)

Before writing any code, read these five documents **in order**:

1. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — understand what CapMint is
2. [CURRENT_STATE.md](./CURRENT_STATE.md) — understand where we are now
3. [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) — understand the current goal
4. [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — understand what you must not violate
5. [AI_RULES.md](./AI_RULES.md) — understand how you must behave

### Step 2 — PLAN (Scope)

- Identify the tasks within the active checkpoint that are not yet complete.
- Scope work to a **single checkpoint task** or a coherent subset.
- Verify the planned work does not violate [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md).
- If architecture changes are required, draft an ADR in [DECISIONS.md](./DECISIONS.md) first.

### Step 3 — IMPLEMENT (Code)

- Follow the branching strategy (§3 below).
- Write code, tests, and documentation concurrently.
- Meet all quality gates defined in [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md).

### Step 4 — UPDATE (Post-Task)

After every task, update these six documents:

1. [CURRENT_STATE.md](./CURRENT_STATE.md) — new status snapshot
2. [CHANGELOG.md](./CHANGELOG.md) — append entry
3. [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md) — tick completed items
4. [DECISIONS.md](./DECISIONS.md) — if any decisions were made
5. [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) — if deps changed
6. [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) — if shortcuts were taken

---

## 3. Branching Strategy

```
main ◄──── release/* ◄──── develop ◄──── feature/*
  │                           │               │
  │   production releases     │  integration  │  individual tasks
  │   (tagged vX.Y.Z)        │  branch       │  (one per checkpoint task)
  │                           │               │
  ▼                           ▼               ▼
hotfix/* ──────────────────▶ main        bugfix/* ──▶ develop
```

### Branch Rules

| Branch Pattern  | Created From  | Merges Into   | Who Merges     | Protection                     |
| --------------- | ------------- | ------------- | -------------- | ------------------------------ |
| `main`          | —             | —             | Release manager| Protected: require PR + review |
| `release/*`     | `develop`     | `main`        | Release manager| Protected: require CI green    |
| `develop`       | `main` (init) | `release/*`   | Auto (CI)      | Protected: require PR + review |
| `feature/CP-NNN-*` | `develop` | `develop`     | Task owner     | Must pass lint + test          |
| `bugfix/*`      | `develop`     | `develop`     | Task owner     | Must pass lint + test          |
| `hotfix/*`      | `main`        | `main` + `develop` | Release manager | Emergency only            |

### Naming Convention

```
feature/CP-003-gs1-engine-gtin-minting
bugfix/CP-005-resolver-null-check
release/v0.1.0
hotfix/v0.1.1-critical-auth-bypass
```

### Critical Rule

> **NEVER commit directly to `develop` or `main`.** All changes flow through feature branches and pull requests. See [AI_RULES.md](./AI_RULES.md) §4.

---

## 4. Document Update Protocol

### When to Update Which Documents

| Event                        | Documents to Update                                         |
| ---------------------------- | ----------------------------------------------------------- |
| Task completed               | CURRENT_STATE, CHANGELOG, ACTIVE_CHECKPOINT                |
| Dependency added/changed     | DEPENDENCIES, DEPENDENCY_GRAPH                              |
| Architecture decision made   | DECISIONS, ARCHITECTURE_SUMMARY                             |
| Shortcut / tech debt taken   | TECH_DEBT                                                   |
| Checkpoint completed         | ACTIVE_CHECKPOINT (advance), MASTER_PLAN, CURRENT_STATE     |
| Security issue found         | NON_NEGOTIABLES (if policy change), RISK_REGISTER           |
| New module created           | PROJECT_CONTEXT (module list), SERVICE_MAP, DEPENDENCY_GRAPH|

### Update Format Standards

- **CHANGELOG.md:** Use [Keep a Changelog](https://keepachangelog.com/) format.
- **DECISIONS.md:** Use ADR format (Status / Context / Decision / Consequences).
- **CURRENT_STATE.md:** Overwrite with latest snapshot (not append).
- **ACTIVE_CHECKPOINT.md:** Use checkbox lists `- [x]` / `- [ ]`.

---

## 5. Checkpoint Lifecycle

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│  PLANNED   │────▶│  ACTIVE    │────▶│  REVIEW    │────▶│  COMPLETE  │
│            │     │            │     │            │     │            │
│ Defined in │     │ Tasks in   │     │ All tasks  │     │ Merged to  │
│ MASTER_PLAN│     │ progress   │     │ done, PR   │     │ develop,   │
│            │     │            │     │ under      │     │ state      │
│            │     │            │     │ review     │     │ archived   │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
```

- Only **one checkpoint** is ACTIVE at a time.
- A checkpoint cannot be marked COMPLETE until all its tasks pass CI and review.
- The ACTIVE_CHECKPOINT document is the single source of truth for progress.
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
│   └── state/
│       ├── ACTIVE_CHECKPOINT.md    # Current checkpoint
│       └── checkpoints/            # Archived checkpoints
├── governance/
│   ├── MASTER_PLAN.md              # Full roadmap
│   ├── DEPENDENCY_GRAPH.md         # Module graph
│   ├── TECH_DEBT.md                # Debt registry
│   └── RISK_REGISTER.md            # Risk log
├── architecture/
│   ├── SERVICE_MAP.md              # Service definitions
│   ├── DATA_MODEL.md               # DB schemas
│   ├── API_CONTRACTS.md            # API specs
│   ├── SECURITY_MODEL.md           # Security design
│   └── INFRA.md                    # Infrastructure
├── docs/                           # Developer docs
└── src/                            # Source code
    ├── services/                   # Microservices
    ├── packages/                   # Shared packages
    └── apps/                       # Frontend apps
```

---

*This is the **starting point** for all work on CapMint. When in doubt, start here.*
