# CONTEXT_INDEX

## Metadata
- **Document Type**: AI Context Loading Protocol
- **Version**: 1.0
- **Checkpoint**: CP-001 (Architecture Lock)
- **Status**: Frozen
- **Owner**: CapMint Project Operating System
- **Applies To**: All AI Agents

---

## Scope

This document owns:
- The context-loading parameters, rules, and priority levels for AI agents.
- The directory ownership registry, mapping planned repository folders to their designated owners.
- The AI startup workflow and execution lifecycle sequence.
- The context escalation strategy and token optimization rules.
- The completion guidelines, validation rules, and Repository Freeze Policy.

This document intentionally does NOT define:
- Core business invariants or agricultural crop rules (defined in [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md)).
- Container topologies, network ports, or database replication configurations (defined in [L2_CONTAINER.md](../architecture/C4/L2_CONTAINER.md) and [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md)).
- Service contracts, Bounded Context boundaries, or API routes (defined in [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md) and [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md)).
- Specific code-level technology stacks or compiler settings (defined in [TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md)).

---

## Purpose

This document defines the canonical context-loading rules for AI coding agents operating on the CapMint repository. 

AI agents must **never** load the entire repository. Loading unnecessary directories wastes tokens, introduces semantic noise, decreases retrieval speed, and causes "AI drift"—where the agent makes assumptions or overrides boundaries defined in other systems. This operating manual enforces a deterministic, layered approach to context loading, ensuring agents retrieve only the minimum required knowledge to safely execute tasks.

---

## Single Source of Truth

Every architectural, implementation, or procedural concept has exactly one canonical owner. AI agents must never duplicate documentation across different folders. If information already exists elsewhere, reference it using a relative markdown link instead of copying it. Canonical documents always take precedence in resolving conflicts.

---

## Repository Navigation Principle

AI agents must navigate the codebase by ownership boundaries rather than generic repository-wide searches.

```
Brain
  ↓
Context Index
  ↓
Folder Owner
  ↓
Required Files
  ↓
Execute Task
```

Agents must never perform broad repository-wide searches when ownership boundaries are already defined.

---

## Architectural Navigation Rule

If architectural understanding is required:

```
Load [ARCHITECTURE_SUMMARY.md](file:///Users/nandyyy/Project/CapMint/BRAIN/ARCHITECTURE_SUMMARY.md)
  ↓
Determine affected architecture area
  ↓
Load only the relevant architecture documents
```

*Note: Do not load the complete architecture directory.*

---

## Universal Context (Startup Phase)

AI agents must load the following files in the exact order listed below before beginning any task analysis to establish the operational baseline:

1. **`PROJECT_BRAIN.md`**: Outlines the high-level business vision, target metrics, and repository history.
2. **`PROJECT_CONTEXT.md`**: Contains overall project guidelines, coding rules, and development instructions.
3. **`AI_RULES.md`**: Establishes strict rules, restrictions, and non-negotiable instructions.
4. **`NON_NEGOTIABLES.md`**: Lists structural invariants and baseline rules that cannot be bypassed.
5. **`SESSION.md`**: Tracks active session metrics, current workflow stop conditions, and immediate tasks.
6. **`CURRENT_STATE.md`**: Tracks checkpoint progression status, active file paths, and the terminology dictionary.
7. **`NEXT_TASK.md`**: Defines the precise objective of the next active development phase.
8. **`CONTEXT_INDEX.md`**: (This Document) Resolves the exact folder targets and exclusions for the task scope.

---

## AI Startup Workflow

AI agents must execute the boot sequence below at the start of every session:

```
[ PROJECT_BRAIN ] 
       |
       v
[ PROJECT_CONTEXT ]
       |
       v
[ AI_RULES ]
       |
       v
[ NON_NEGOTIABLES ]
       |
       v
[ SESSION ]
       |
       v
[ CURRENT_STATE ]
       |
       v
[ NEXT_TASK ]
       |
       v
[ CONTEXT_INDEX ]
       |
       v
[ Load Required Context ]
       |
       v
[ Execute / Implement ]
       |
       v
[ Update Brain State ]
       |
       v
[ Stop & Wait for Review ]
```

---

## Context Loading Priority

In-memory context must be populated in the following hierarchy:

1. **Priority 1: Brain (Universal Startup)**: Establishes base constraints and workspace state.
2. **Priority 2: Current Checkpoint**: Matches active milestone files to block future-phase tasks.
3. **Priority 3: Architecture**: Reads domain blueprints to check invariants and service constraints.
4. **Priority 4: Target Service**: Loads source code and configurations for the active domain module.
5. **Priority 5: Related Tests**: Loads the matching test files to establish success parameters.
6. **Priority 6: Optional References**: Gathers API specifications, external webhook schemas, or deployment manifests.

---

## Checkpoint-Based Loading

To maintain focus and prevent out-of-scope alterations, load files based on the active project checkpoint status tracked in `CURRENT_STATE.md`:

- **Current Checkpoint**: Query the active checkpoint tag in `CURRENT_STATE.md` (e.g. `CP-001`).
- **Load Checkpoint-Specific Folders**: Retrieve only the directories and files mapped to the active checkpoint.
- **Future Checkpoints**: If future checkpoints are defined in the path, follow the milestones laid out in `CURRENT_STATE.md` without loading future files prematurely.

---

## Service-Based Loading

When modifying application services, restrict context loading to the specific service path and its corresponding architecture specifications:

- **gateway-service**:
  - Required Folder: `services/gateway-service/`
  - Required Architecture: `../architecture/system/SYSTEM_CONTEXT.md`, `../architecture/system/SERVICE_BOUNDARIES.md`
  - Optional Dependencies: `api/`
- **identity-service**:
  - Required Folder: `services/identity-service/`
  - Required Architecture: `../architecture/system/SYSTEM_CONTEXT.md`, `../architecture/system/SERVICE_BOUNDARIES.md`
  - Optional Dependencies: `database/`
- **auth-service**:
  - Required Folder: `services/auth-service/`
  - Required Architecture: `../architecture/security/SECURITY_ARCHITECTURE.md`
  - Optional Dependencies: `api/`, `packages/`
- **cpq-service**:
  - Required Folder: `services/cpq-service/`
  - Required Architecture: `../architecture/system/SYSTEM_CONTEXT.md`, `../architecture/system/SERVICE_BOUNDARIES.md`
  - Optional Dependencies: `services/identity-service/`
- **mint-service**:
  - Required Folder: `services/mint-service/`
  - Required Architecture: `../architecture/system/SYSTEM_CONTEXT.md`, `../architecture/sequence/DATA_FLOW.md`
  - Optional Dependencies: `services/auth-service/`
- **resolver-service**:
  - Required Folder: `services/resolver-service/`
  - Required Architecture: `../architecture/system/SYSTEM_OVERVIEW.md`
  - Optional Dependencies: `services/verification-service/`
- **verification-service**:
  - Required Folder: `services/verification-service/`
  - Required Architecture: `../architecture/security/SECURITY_ARCHITECTURE.md`, `../architecture/C4/L2_CONTAINER.md`
  - Optional Dependencies: `services/mint-service/`
- **transparency-service**:
  - Required Folder: `services/transparency-service/`
  - Required Architecture: `../architecture/sequence/DATA_FLOW.md`
  - Optional Dependencies: `packages/`
- **clone-detection-service**:
  - Required Folder: `services/clone-detection-service/`
  - Required Architecture: `../architecture/security/SECURITY_ARCHITECTURE.md`
  - Optional Dependencies: `services/verification-service/`
- **notification-service**:
  - Required Folder: `services/notification-service/`
  - Required Architecture: `../architecture/system/SYSTEM_CONTEXT.md`
  - Optional Dependencies: `packages/`
- **integration-service**:
  - Required Folder: `services/integration-service/`
  - Required Architecture: `../architecture/system/SYSTEM_CONTEXT.md`
  - Optional Dependencies: `api/`
- **analytics-service**:
  - Required Folder: `services/analytics-service/`
  - Required Architecture: `../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md`
  - Optional Dependencies: `services/verification-service/`
- **audit-service**:
  - Required Folder: `services/audit-service/`
  - Required Architecture: `../architecture/security/SECURITY_ARCHITECTURE.md`
  - Optional Dependencies: `services/transparency-service/`
- **scan-service**:
  - Required Folder: `services/scan-service/`
  - Required Architecture: `../architecture/C4/L1_SYSTEM_CONTEXT.md`
  - Optional Dependencies: `services/verification-service/`

---

## Folder Ownership

CapMint establishes strict, non-overlapping ownership rules across the repository structure:

| Folder | Owner | Purpose | Never Store |
|---|---|---|---|
| **`BRAIN/`** | AI Memory | Global state parameters, contextual indices, and operational guidelines. | Unrelated code, third-party libraries, build configurations. |
| **`state/`** | Execution State | Live execution state, active checkpoint tracking, roadmap, sprint progress, blockers, branch status, and execution tracking. | Permanent design documents, application code. |
| **`architecture/`** | System Design | Design blueprints, C4 context diagrams, and NFR targets. | Source code, test scripts, deployment configurations. |
| **`knowledge/`** | External Standards | GS1 Digital Link standard specs and integration docs. | Internal domain logic code, private signing keys. |
| **`services/`** | Implementation | Core business logic modules (microservices). | Shared common helpers, compiled assets, documentation. |
| **`packages/`** | Shared Code | Common utilities, formatting helpers, and cryptographic libraries. | Service-specific API controllers, database connection pools. |
| **`database/`** | Persistence | Postgres table schemas, indexing scripts, and migrations. | Frontend application UI code, static HTML files. |
| **`testing/`** | Quality | Integration testing suites, contract tests, and compliance scripts. | Active production database passwords, deployment credentials. |
| **`governance/`** | Project Governance | Architecture Freeze records, RFCs, and decision logs. | Temporary operational logs, runtime cache data. |
| **`docs/`** | User Documentation | Operator PWA guides and developer onboarding docs. | Executable build bundles, test reports. |
| **`api/`** | Route Specs | Fastify routers, HTTP request/response validation schemas. | Database migration scripts, frontend UI layouts. |
| **`security/`** | Secrets & Keys | IAM policies, KMS key ring definitions, SSL configurations. | Application business logic, raw unencrypted private keys. |
| **`infrastructure/`** | Cloud Configuration | Dockerfiles, Docker Compose configs, and network VPC setups. | Application source files, database migrations. |
| **`deployment/`** | Operations | Environment files, CI/CD pipeline scripts, and backup tools. | Raw application source code files. |
| **`frontend/`** | Client UI | Public Verifier and Operator PWA source code. | Core database connection configurations. |
| **`backend/`** | API Coordinator | Server entry-point files and runtime setup configs. | Frontend HTML/CSS templates. |

*Note: No two folders may share identical responsibilities. All cross-layer dependencies must use exported public interfaces defined in `packages/` or abstract adapters.*

---

## Never Load

To prevent memory leaks and excessive token consumption, the following directories and files must **never** be loaded unless explicitly requested by the user:

- `node_modules/` (Third-party dependencies)
- `.git/` (VCS metadata)
- `dist/` or `build/` (Compiled files)
- `coverage/` (Test coverage reports)
- Release artifacts (ZIPs, tarballs)
- Temporary files (`.DS_Store`, `.tmp`, `.log`)
- Generated outputs (built bundles, PDF reports)

---

## Context Escalation Strategy

Context volume should be escalated in tiers, ensuring memory efficiency is maintained:

```
[ Tier 1: Simple Task ] 
  --> Load ONLY: Universal State + Target File + Target Test.
  
[ Tier 2: Domain Task ]
  --> Load: Universal State + Full Domain Directory (e.g., services/mint-service/).
  
[ Tier 3: Cross-Domain Task ]
  --> Load: Universal State + Service Directory A + Service Directory B + MODULE_DEPENDENCIES.md.
  
[ Tier 4: Repository-Wide Scope ]
  --> Load: Entire workspace. (ALLOWED ONLY IF EXPLICITLY REQUESTED BY THE USER).
```

*Note: Repository-wide loading must only occur when explicitly requested by the user.*

---

## Token Optimization Guidelines

- **Limit the Scope**: Only load directories matching the target service.
- **Reference Over Copying**: Use relative links to point to other files instead of duplicating information (e.g. `[SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)`).
- **Target Specific Headers**: When viewing files, specify exact line numbers or headers if possible to keep context usage minimal.
- **Avoid Unrelated Services**: Never scan unrelated microservice directories.

---

## Anti-Patterns

Coding agents must actively avoid the following behaviors:
- **The "Context Dump"**: Initiating a search or viewing files across the entire workspace for a single-file task.
- **Ignoring Canonical Source of Truth**: Rewriting security guidelines in backend route folders instead of linking to `SECURITY_ARCHITECTURE.md`.
- **Blind Coding**: Proceeding with database schema edits without verifying the terminology and constraints defined in `CURRENT_STATE.md`.
- **Parallel Overwrite Conflicts**: Editing files in `services/` while simultaneously modifying their interfaces in `packages/` without validation.

---

## Completion Rules

When work finishes, the AI agent must perform the following actions:

1. **Update State Files**:
   - Update `SESSION.md` with active task completion metrics.
   - Update `CURRENT_STATE.md` (only if project knowledge has changed).
   - Update `NEXT_TASK.md` to map the next active development phase.
   - Update `LESSONS_LEARNED.md` (if applicable).
2. **Handle Architecture Alterations**:
   - If architecture was modified, **STOP** and request approval.
   - Update `DECISIONS.md` in the `BRAIN/` folder.
   - Update the respective architecture documents under `architecture/`.
   - Do **NOT** proceed with implementation code until the changes are approved.

---

## Validation Checklist

Perform these checks before presenting work or concluding a task:

- [ ] **Correct Checkpoint**: Confirmed the active milestone checkpoint matches `CURRENT_STATE.md`.
- [ ] **Correct Branch**: Checked that the git branch is aligned with the task scope.
- [ ] **Correct Brain Loaded**: Verified that universal context files are active in memory.
- [ ] **Correct Architecture Loaded**: Confirmed that the design specifications for this service have been checked.
- [ ] **Correct Service Loaded**: Checked that only target service files are loaded.
- [ ] **No Unrelated Folders**: Confirmed no out-of-scope folders (e.g. frontend code during backend db tasks) are in context.
- [ ] **No Duplicated Ownership**: Checked that the edits do not define variables or schemas owned by other services.
- [ ] **Repository Rules Respected**: Verified that folder organization matches the directory catalog.
- [ ] **Ready for Execution**: Confirmed all preconditions are met.

---

## Repository Freeze Policy

This document SHALL NOT change during normal feature development. Modify ONLY when:
1. Repository structure changes.
2. AI workflow changes.
3. Context loading strategy changes.
4. Repository owner approves the modification.
