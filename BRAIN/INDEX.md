# Folder Index: Platform Core State [BRAIN-INDEX]

This directory houses the permanent memory, operating rules, invariants, and active state tracking for CapMint. It serves as the primary technical constitution for all contributors and AI agents.

## 1. Canonical Documents

| Document | Purpose | Canonical Owner | Related Documents | Stable Section Identifiers |
|---|---|---|---|---|
| **[PROJECT_BRAIN.md](PROJECT_BRAIN.md)** | Long-term AI memory, core vision, and term glossary. | CapMint Core OS | None | `[PB-001]` to `[PB-011]` |
| **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** | Technical context, coding philosophies, and architecture order. | CapMint Core OS | [PROJECT_BRAIN.md](PROJECT_BRAIN.md) | `[PC-001]` to `[PC-009]` |
| **[AI_RULES.md](AI_RULES.md)** | Operating constraints, role guidelines, and disciplines for AI agents. | CapMint Core OS | [NON_NEGOTIABLES.md](NON_NEGOTIABLES.md) | `[AR-001]` to `[AR-016]` |
| **[NON_NEGOTIABLES.md](NON_NEGOTIABLES.md)** | Constitution rules (R, A, S, D, AI, Doc, E, G categories). | CapMint Core OS | [AI_RULES.md](AI_RULES.md) | `[NN-001]` to `[NN-019]` |
| **[CONTEXT_INDEX.md](CONTEXT_INDEX.md)** | File load priority level mappings. | CapMint Core OS | None | None |

---

## 2. Operational Files

These tracking files are updated dynamically during active development sprints:
*   **[CURRENT_STATE.md](CURRENT_STATE.md)** - Active checkpoint status and sprint goals.
*   **[NEXT_TASK.md](NEXT_TASK.md)** - Queue of upcoming user requests and tasks.
*   **[SESSION.md](SESSION.md)** - Event tracking for the current development session.
*   **[DECISIONS.md](DECISIONS.md)** - Formally approved architecture design decisions.
*   **[LESSONS_LEARNED.md](LESSONS_LEARNED.md)** - Compilation of developer learnings.
*   **[DEPENDENCIES.md](DEPENDENCIES.md)** - Quick lookup of external system integrations.

---

## 3. Section Identifier Mappings

### PROJECT_BRAIN Section Identifiers
- `[PB-001]` : [1. Project Identity](PROJECT_BRAIN.md#1-project-identity-pb-001)
- `[PB-002]` : [2. Vision & Mission](PROJECT_BRAIN.md#2-vision-mission-pb-002)
- `[PB-003]` : [3. Product & Engineering Philosophy](PROJECT_BRAIN.md#3-product--engineering-philosophy-pb-003)
- `[PB-004]` : [4. Core Principles](PROJECT_BRAIN.md#4-core-principles-pb-004)
- `[PB-005]` : [Permanent Invariants](PROJECT_BRAIN.md#permanent-invariants-pb-005)
- `[PB-006]` : [Decision Philosophy](PROJECT_BRAIN.md#decision-philosophy-pb-006)
- `[PB-007]` : [5. Repository & AI Working Principles](PROJECT_BRAIN.md#5-repository--ai-working-principles-pb-007)
- `[PB-008]` : [6. Immutability Matrix](PROJECT_BRAIN.md#6-immutability-matrix-pb-008)
- `[PB-009]` : [7. Canonical Terminology](PROJECT_BRAIN.md#7-canonical-terminology-pb-009)
- `[PB-010]` : [8. High-Level Project Lifecycle](PROJECT_BRAIN.md#8-high-level-project-lifecycle-pb-010)
- `[PB-011]` : [AI Memory Contract](PROJECT_BRAIN.md#ai-memory-contract-pb-011)

### PROJECT_CONTEXT Section Identifiers
- `[PC-001]` : [Scope](PROJECT_CONTEXT.md#scope-pc-001)
- `[PC-002]` : [1. Product Overview & System Purpose](PROJECT_CONTEXT.md#1-product-overview--system-purpose-pc-002)
- `[PC-003]` : [2. Engineering Principles & Philosophy](PROJECT_CONTEXT.md#2-engineering-principles--philosophy-pc-003)
- `[PC-004]` : [Engineering Decision Hierarchy](PROJECT_CONTEXT.md#engineering-decision-hierarchy-pc-004)
- `[PC-005]` : [3. AI Engineering Context](PROJECT_CONTEXT.md#3-ai-engineering-context-pc-005)
- `[PC-006]` : [Architecture Consumption Order](PROJECT_CONTEXT.md#architecture-consumption-order-pc-006)
- `[PC-007]` : [4. Repository & Documentation Structure](PROJECT_CONTEXT.md#4-repository--documentation-structure-pc-007)
- `[PC-008]` : [5. High-Level Engineering Workflow](PROJECT_CONTEXT.md#5-high-level-engineering-workflow-pc-008)
- `[PC-009]` : [Context Boundaries](PROJECT_CONTEXT.md#context-boundaries-pc-009)

### AI_RULES Section Identifiers
- `[AR-001]` : [Scope](AI_RULES.md#scope-ar-001)
- `[AR-002]` : [AI Operating Hierarchy](AI_RULES.md#ai-operating-hierarchy-ar-002)
- `[AR-003]` : [AI Role](AI_RULES.md#ai-role-ar-003)
- `[AR-004]` : [AI Operating Principles](AI_RULES.md#ai-operating-principles-ar-004)
- `[AR-005]` : [AI Context Loading Discipline](AI_RULES.md#ai-context-loading-discipline-ar-005)
- `[AR-006]` : [Repository Discipline](AI_RULES.md#repository-discipline-ar-006)
- `[AR-007]` : [Implementation Discipline](AI_RULES.md#implementation-discipline-ar-007)
- `[AR-008]` : [Documentation Discipline](AI_RULES.md#documentation-discipline-ar-008)
- `[AR-009]` : [Decision Discipline](AI_RULES.md#decision-discipline-ar-009)
- `[AR-010]` : [Checkpoint Discipline](AI_RULES.md#checkpoint-discipline-ar-010)
- `[AR-011]` : [Quality Gates](AI_RULES.md#quality-gates-ar-011)
- `[AR-012]` : [Prohibited Behavior](AI_RULES.md#prohibited-behavior-ar-012)
- `[AR-013]` : [Error Handling](AI_RULES.md#error-handling-ar-013)
- `[AR-014]` : [AI Communication Rules](AI_RULES.md#ai-communication-rules-ar-014)
- `[AR-015]` : [AI Success Criteria](AI_RULES.md#ai-success-criteria-ar-015)
- `[AR-016]` : [AI Rules Freeze Policy](AI_RULES.md#ai-rules-freeze-policy-ar-016)

### NON_NEGOTIABLES Section Identifiers
- `[NN-001]` : [Scope](NON_NEGOTIABLES.md#scope-nn-001)
- `[NN-002]` : [Authority](NON_NEGOTIABLES.md#authority-nn-002)
- `[NN-003]` : [Constitutional Principles](NON_NEGOTIABLES.md#constitutional-principles-nn-003)
- `[NN-004]` : [Core Principle](NON_NEGOTIABLES.md#core-principle-nn-004)
- `[NN-005]` : [Rule Categories](NON_NEGOTIABLES.md#rule-categories-nn-005)
- `[NN-006]` : [Repository Integrity Rules](NON_NEGOTIABLES.md#repository-integrity-rules-nn-006)
- `[NN-007]` : [Architecture Integrity Rules](NON_NEGOTIABLES.md#architecture-integrity-rules-nn-007)
- `[NN-008]` : [Security Rules](NON_NEGOTIABLES.md#security-rules-nn-008)
- `[NN-009]` : [Data Integrity Rules](NON_NEGOTIABLES.md#data-integrity-rules-nn-009)
- `[NN-010]` : [AI Behavior Rules](NON_NEGOTIABLES.md#ai-behavior-rules-nn-010)
- `[NN-011]` : [Documentation Rules](NON_NEGOTIABLES.md#documentation-rules-nn-011)
- `[NN-012]` : [Engineering Rules](NON_NEGOTIABLES.md#engineering-rules-nn-012)
- `[NN-013]` : [Governance Rules](NON_NEGOTIABLES.md#governance-rules-nn-013)
- `[NN-014]` : [Conflict Resolution](NON_NEGOTIABLES.md#conflict-resolution-nn-014)
- `[NN-015]` : [Violation Handling](NON_NEGOTIABLES.md#violation-handling-nn-015)
- `[NN-016]` : [Validation Checklist](NON_NEGOTIABLES.md#validation-checklist-nn-016)
- `[NN-017]` : [Enforcement](NON_NEGOTIABLES.md#enforcement-nn-017)
- `[NN-018]` : [Modification Policy](NON_NEGOTIABLES.md#modification-policy-nn-018)
- `[NN-019]` : [Repository Freeze Policy](NON_NEGOTIABLES.md#repository-freeze-policy-nn-019)
