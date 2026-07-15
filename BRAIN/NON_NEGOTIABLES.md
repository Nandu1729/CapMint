# NON_NEGOTIABLES

## Metadata
- **Document Type**: Repository Constitution & Permanent Rulebook
- **Version**: 1.0
- **Status**: Frozen
- **Owner**: CapMint Project Operating System
- **Applies To**: All System Contributors, AI Agents, and Automation
- **Review Status**: Approved
- **Last Reviewed**: 2026-07-09
- **Next Review Trigger**: Major System Revision RFC / Operating System Upgrade

---

## Scope [NN-001]

This document defines the permanent, non-negotiable rules governing the CapMint codebase, architecture, security, and developer processes. Every rule mapped in this constitution is absolute and MUST be followed by all contributors, automation systems, and AI agents.

This document intentionally does NOT define:
- Domain specifications, Bounded Context boundaries, or business rules (defined in [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md) and [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md)).
- Container specifications, port mappings, or VM subnets (defined in [L2_CONTAINER.md](../architecture/C4/L2_CONTAINER.md) and [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md)).
- Specific API routes, validation schemas, or database schemas (defined in [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md)).
- Immediate active work tasks or sprint logs (defined in [NEXT_TASK.md](NEXT_TASK.md) and [SESSION.md](SESSION.md)).

---

## Authority [NN-002]

`NON_NEGOTIABLES.md` SHALL serve as the supreme constitutional rulebook for the CapMint Development Operating System. In the event of a conflict between this document and any other file in the repository (including design blueprints, implementation files, or system logs), the rules defined in **this document** SHALL always prevail.

---

## Constitutional Principles [NN-003]

These rules exist to protect:
- Repository Integrity
- Architectural Integrity
- Security
- Data Integrity
- Documentation Integrity
- AI Consistency
- Long-term Maintainability
- Single Source of Truth
- Engineering Discipline

No implementation convenience may override these principles.

---

## Core Principle [NN-004]

Every rule mapped in this rulebook exists to preserve repository integrity, architectural alignment, zero-trust security boundaries, system maintainability, and mathematical correctness across all development cycles.

---

## Rule Categories [NN-005]

1. [Repository Integrity Rules](#repository-integrity-rules)
2. [Architecture Integrity Rules](#architecture-integrity-rules)
3. [Security Rules](#security-rules)
4. [Data Integrity Rules](#data-integrity-rules)
5. [AI Behavior Rules](#ai-behavior-rules)
6. [Documentation Rules](#documentation-rules)
7. [Engineering Rules](#engineering-rules)
8. [Governance Rules](#governance-rules)

---

## Repository Integrity Rules [NN-006]

- **R-1.1**: The repository top-level folder layout is strictly frozen. Contributors and AI agents SHALL NOT create, delete, or rename top-level folders.
- **R-1.2**: Duplicate folder or file ownership of domain logic is strictly prohibited. Every folder SHALL map to exactly one owner.
- **R-1.3**: Contributors SHALL NOT introduce parallel architectures or duplicate services.
- **R-1.4**: Contributors and AI agents SHALL NOT introduce undocumented directories or untracked configuration templates.
- **R-1.5**: Repository ownership is immutable. Every folder SHALL have exactly one canonical owner. Ownership SHALL NOT overlap. Canonical ownership SHALL always take precedence over convenience.

---

## Architecture Integrity Rules [NN-007]

- **A-1.1**: Code implementation MUST follow the designs mapped in `architecture/` blueprints. Architecture SHALL NEVER follow implementation.
- **A-1.2**: Contributors and AI agents MUST NOT bypass Bounded Context service boundaries. Cross-service interactions SHALL only occur via public interfaces or abstract adapters.
- **A-1.3**: Code dependencies MUST form a Directed Acyclic Graph (DAG). Circular references between modules are strictly prohibited.
- **A-1.4**: Architecture SHALL be approved before implementation. Implementation SHALL NEVER redefine architecture. Implementation SHALL NEVER become the source of architectural truth. Architecture documents remain the canonical source.

---

## Security Rules [NN-008]

- **S-1.1**: All validation, session checks, and state transitions MUST fail closed.
- **S-1.2**: Enforce least privilege access control at all times. Application routes MUST be locked under Role-Based Access Control (RBAC).
- **S-1.3**: Contributors and AI agents SHALL NOT hardcode credentials, API keys, or private keys anywhere in the repository.
- **S-1.4**: Contributors and AI agents MUST NOT weaken cryptographic guarantees. Signature checking (Ed25519) and logging hashes (SHA-256) are non-negotiable.

---

## Data Integrity Rules [NN-009]

- **D-1.1**: Maintain a Single Source of Truth for all database structures and schemas. Domain definitions SHALL NOT be duplicated across services.
- D-1.2: All database transactions mutating state (e.g. minting drawdowns) MUST run within strict transactional blocks to prevent over-issuance.
- **D-1.3**: System-wide public verification verdicts MUST strictly conform to the 5 approved results (`VERIFIED`, `REVOKED`, `EXHAUSTED`, `CLONE-SUSPECT`, `MISMATCH`). Custom verdicts are prohibited.

---

## AI Behavior Rules [NN-010]

- **AI-1.1**: AI agents SHALL NOT invent requirements, user scenarios, or code limits that are not documented in the active task.
- **AI-1.2**: AI agents SHALL NOT generate APIs, routes, or protocols without architectural sign-off.
- **AI-1.3**: AI agents SHALL NOT guess business rules or yield limits. If required information is missing, they MUST halt and request clarification.
- **AI-1.4**: AI agents SHALL NOT silently ignore violations of these Non-Negotiables. They MUST raise an alert immediately upon detection.
- **AI-1.5**: AI SHALL distinguish between:
  - Facts
  - Assumptions
  - Recommendations
  AI SHALL clearly label each. AI SHALL never present assumptions as facts.

---

## Documentation Rules [NN-011]

- **Doc-1.1**: Technical documentation MUST remain fully synchronized with the implementation code.
- **Doc-1.2**: Documentation SHALL NOT be duplicated. References and relative markdown links MUST be used to point to canonical sources.
- **Doc-1.3**: Changes to specifications require an Architecture Freeze review prior to code edits.
- **Doc-1.4**: Documentation SHALL evolve together with implementation. Documentation drift is prohibited. Canonical documentation SHALL always be updated before or alongside behavioral changes.

---

## Engineering Rules [NN-012]

- **E-1.1**: Mathematical correctness and constraint checks SHALL always take precedence over execution speed.
- **E-1.2**: Security and zero trust bounds SHALL always override developer convenience.
- **E-1.3**: Maintainability and simple composition SHALL always override clever code hacks.
- **E-1.4**: Design specifications and documentation MUST be complete before writing implementation code.

---

## Governance Rules [NN-013]

- **G-1.1**: Frozen documentation under `architecture/` and `BRAIN/` SHALL NOT be modified without explicit repository owner approval.
- **G-1.2**: Architectural modifications or deviations require a formal Architectural Decision Record (ADR) and updates to `DECISIONS.md`.
- **G-1.3**: Breaking schema alterations or service boundaries reshuffling SHALL require owner approval.

---

## Conflict Resolution [NN-014]

Precedence of authority within the CapMint Development Operating System is defined in the following order. A higher authority SHALL always override a lower authority:

1. **`NON_NEGOTIABLES.md`** (Highest Precedence)
2. **`AI_RULES.md`**
3. **`PROJECT_BRAIN.md`**
4. **`PROJECT_CONTEXT.md`**
5. **`CONTEXT_INDEX.md`**
6. **Architecture Blueprints** (under `../architecture/`)
7. **Implementation Code** (Lowest Precedence)

---

## Violation Handling [NN-015]

If a task or user request violates any Non-Negotiable rule, the AI agent SHALL:
1. **Stop execution immediately**.
2. **Identify the violated rule** and the constitutional rule code.
3. **Identify the affected document or repository area**.
4. **Explain the impact** of the violation on system integrity.
5. **Recommend a compliant alternative** to resolve the conflict.
6. **Refuse implementation** and wait for explicit instructions or override approval from the repository owner.

---

## Validation Checklist [NN-016]

Before presenting work or committing changes, verify the following:

- [ ] **Repository integrity preserved**: Top-level directory layout matches the frozen registry.
- [ ] **Architecture integrity preserved**: Imports form a DAG; service boundaries are respected.
- [ ] **Security preserved**: Fail-closed rules and RBAC controls are fully active.
- [ ] **Documentation preserved**: Specs match code, and links use relative paths.
- [ ] **Single Source of Truth preserved**: No duplicate logic or documentation exists.
- [ ] **No frozen documents modified**: Files under `architecture/` remain unaltered.
- [ ] **No ownership conflicts introduced**: Every directory contains only its designated owner modules.
- [ ] **Constitutional rules preserved**: All constitutional rules remain active.
- [ ] **Repository ownership preserved**: Ownership lines remain distinct and un-overlapped.
- [ ] **Architecture remains canonical**: Code is mapped directly to blueprints.
- [ ] **Documentation remains synchronized**: No documentation drift is present.
- [ ] **AI behavior rules respected**: Facts, assumptions, and suggestions are clearly parsed.
- [ ] **No repository drift introduced**: Directories catalog conventions remain intact.

---

## Enforcement [NN-017]

Every AI agent, contributor, automation workflow, and future repository extension is bound by these constitutional rules. No component of the repository is exempt.

---

## Modification Policy [NN-018]

This document represents the permanent behavioral and structural constitution of the codebase. It MUST NOT change during normal feature development. It SHALL only change when:
1. Repository governance structures change.
2. Platform-wide security policies change.
3. Development Operating System specifications change.
4. The repository owner explicitly approves the modification.

---

## Repository Freeze Policy [NN-019]

The repository structure, folder naming, directories catalog, AI Operating System, and constitutional rules defined herein are considered frozen. All feature development and active implementations MUST operate strictly within these constraints.

Repository Freeze applies to:
- Repository structure
- Folder ownership
- Operating System documents
- Governance model
- Core architectural principles

Feature development must operate within these constraints and SHALL NOT redefine them.
