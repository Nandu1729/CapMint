# Folder Index: System Architecture [ARCHITECTURE-INDEX]

This directory contains system blueprints, architectural diagrams, boundary definitions, and sequencing flows.

## 1. Canonical Blueprints

| Document | Purpose | Canonical Owner | Related Documents | Stable Section Identifiers |
|---|---|---|---|---|
| **[system/SYSTEM_CONTEXT.md](system/SYSTEM_CONTEXT.md)** | Bounded context limits, crop yield rules, ecosystem bounds. | Architecture Board | [PROJECT_BRAIN.md](../BRAIN/PROJECT_BRAIN.md) | `[SC-001]` to `[SC-026]` |
| **[system/SYSTEM_OVERVIEW.md](system/SYSTEM_OVERVIEW.md)** | Architecture principles, core metrics, design methodologies. | Architecture Board | None | None |
| **[system/SERVICE_BOUNDARIES.md](system/SERVICE_BOUNDARIES.md)** | Logical encapsulation limits, database writers, read patterns. | Architecture Board | None | None |
| **[system/MODULE_DEPENDENCIES.md](system/MODULE_DEPENDENCIES.md)** | Logical dependency graphs, allowed/forbidden import limits. | Architecture Board | [system/DIRECTORY_OWNERSHIP.md](system/DIRECTORY_OWNERSHIP.md) | `[MD-001]` to `[MD-019]` |
| **[system/TECHNOLOGY_STACK.md](system/TECHNOLOGY_STACK.md)** | Tech stack definition, libraries, DB drivers, node environments. | Architecture Board | None | `[TS-001]` to `[TS-018]` |
| **[system/DIRECTORY_OWNERSHIP.md](system/DIRECTORY_OWNERSHIP.md)** | Monorepo layout, workspace rules, physical ownership definitions. | Architecture Board | [system/MODULE_DEPENDENCIES.md](system/MODULE_DEPENDENCIES.md) | `[DO-001]` to `[DO-018]` |
| **[sequence/DATA_FLOW.md](sequence/DATA_FLOW.md)** | Lifecycle transitions, state machines, validation pipelines. | Architecture Board | [system/SYSTEM_CONTEXT.md](system/SYSTEM_CONTEXT.md) | `[DF-001]` to `[DF-023]` |
| **[security/SECURITY_ARCHITECTURE.md](security/SECURITY_ARCHITECTURE.md)** | Threat models, RBAC validation rules, cryptographic algorithms. | Security Officer | None | `[SEC-001]` to `[SEC-025]` |
| **[deployment/DEPLOYMENT_ARCHITECTURE.md](deployment/DEPLOYMENT_ARCHITECTURE.md)** | CDN read caches, PostgreSQL replication, SRE limits, and scaling. | DevOps / SRE | None | None |

---

## 2. Visual Diagrams

These diagrams provide a graphical representation of the software structure:
*   **[C4/L1_SYSTEM_CONTEXT.md](C4/L1_SYSTEM_CONTEXT.md)** - Bird's eye actor and ecosystem layout.
*   **[C4/L2_CONTAINER.md](C4/L2_CONTAINER.md)** - Container runtime systems and internal ports.

---

## 3. Section Identifier Mappings

### SYSTEM_CONTEXT Section Identifiers
- `[SC-001]` : [Scope](system/SYSTEM_CONTEXT.md#scope-sc-001)
- `[SC-002]` : [1. System Mission](system/SYSTEM_CONTEXT.md#1-system-mission-sc-002)
- `[SC-003]` : [2. Product Philosophy](system/SYSTEM_CONTEXT.md#2-product-philosophy-sc-003)
- `[SC-004]` : [3. System Identity](system/SYSTEM_CONTEXT.md#3-system-identity-sc-004)
- `[SC-005]` : [4. Core Problem](system/SYSTEM_CONTEXT.md#4-core-problem-sc-005)
- `[SC-006]` : [5. System Boundaries](system/SYSTEM_CONTEXT.md#5-system-boundaries-sc-006)
- `[SC-007]` : [6. Core Concepts](system/SYSTEM_CONTEXT.md#6-core-concepts-sc-007)
- `[SC-008]` : [7. Domain Model](system/SYSTEM_CONTEXT.md#7-domain-model-sc-008)
- `[SC-009]` : [8. Core Business Rules](system/system/SYSTEM_CONTEXT.md#8-core-business-rules-sc-009)
- `[SC-010]` : [9. System Invariants](system/SYSTEM_CONTEXT.md#9-system-invariants-sc-010)
- `[SC-011]` : [10. Trust Model](system/SYSTEM_CONTEXT.md#10-trust-model-sc-011)
- `[SC-012]` : [11. Authority Model](system/SYSTEM_CONTEXT.md#11-authority-model-sc-012)
- `[SC-013]` : [12. State Model](system/SYSTEM_CONTEXT.md#12-state-model-sc-013)
- `[SC-014]` : [13. Information Flow](system/SYSTEM_CONTEXT.md#13-information-flow-sc-014)
- `[SC-015]` : [14. Major Subsystems](system/SYSTEM_CONTEXT.md#14-major-subsystems-sc-015)
- `[SC-016]` : [15. External Ecosystem](system/SYSTEM_CONTEXT.md#15-external-ecosystem-sc-016)
- `[SC-017]` : [16. Security Context](system/SYSTEM_CONTEXT.md#16-security-context-sc-017)
- `[SC-018]` : [17. Failure Philosophy](system/SYSTEM_CONTEXT.md#17-failure-philosophy-sc-018)
- `[SC-019]` : [18. Scalability Philosophy](system/SYSTEM_CONTEXT.md#18-scalability-philosophy-sc-019)
- `[SC-020]` : [19. Architectural Principles](system/SYSTEM_CONTEXT.md#19-architectural-principles-sc-020)
- `[SC-021]` : [20. Cross-Cutting Concerns](system/SYSTEM_CONTEXT.md#20-cross-cutting-concerns-sc-021)
- `[SC-022]` : [21. Assumptions](system/SYSTEM_CONTEXT.md#21-assumptions-sc-022)
- `[SC-023]` : [22. Out of Scope](system/SYSTEM_CONTEXT.md#22-out-of-scope-sc-023)
- `[SC-024]` : [23. Future Evolution](system/SYSTEM_CONTEXT.md#23-future-evolution-sc-024)
- `[SC-025]` : [24. Glossary](system/SYSTEM_CONTEXT.md#24-glossary-sc-025)
- `[SC-026]` : [25. Architecture Freeze](system/SYSTEM_CONTEXT.md#25-architecture-freeze-sc-026)

### DATA_FLOW Section Identifiers
- `[DF-001]` : [Scope](sequence/DATA_FLOW.md#scope-df-001)
- `[DF-002]` : [1. Purpose](sequence/DATA_FLOW.md#1-purpose-df-002)
- `[DF-003]` : [2. Data Flow Philosophy](sequence/DATA_FLOW.md#2-data-flow-philosophy-df-003)
- `[DF-004]` : [3. High-Level Information Lifecycle](sequence/DATA_FLOW.md#3-high-level-information-lifecycle-df-004)
- `[DF-005]` : [4. Primary Business Flows](sequence/DATA_FLOW.md#4-primary-business-flows-df-005)
- `[DF-006]` : [5. Information Producers](sequence/DATA_FLOW.md#5-information-producers-df-006)
- `[DF-007]` : [6. Information Consumers](sequence/DATA_FLOW.md#6-information-consumers-df-007)
- `[DF-008]` : [7. Data Transformation](sequence/DATA_FLOW.md#7-data-transformation-df-008)
- `[DF-009]` : [8. Trust Transitions & Privacy Boundaries](sequence/DATA_FLOW.md#8-trust-transitions--privacy-boundaries-df-009)
- `[DF-010]` : [9. State Transition Flow](sequence/DATA_FLOW.md#9-state-transition-flow-df-010)
- `[DF-011]` : [10. Data Ownership Flow](sequence/DATA_FLOW.md#10-data-ownership-flow-df-011)
- `[DF-012]` : [11. Validation Pipeline](sequence/DATA_FLOW.md#11-validation-pipeline-df-012)
- `[DF-013]` : [12. Audit Flow](sequence/DATA_FLOW.md#12-audit-flow-df-013)
- `[DF-014]` : [13. Public Verification Flow](sequence/DATA_FLOW.md#13-public-verification-flow-df-014)
- `[DF-015]` : [14. Failure & Performance Scenarios](sequence/DATA_FLOW.md#14-failure--performance-scenarios-df-015)
- `[DF-016]` : [15. Operational Constraints](sequence/DATA_FLOW.md#15-operational-constraints-df-016)
- `[DF-017]` : [16. Cross-Cutting Concerns](sequence/DATA_FLOW.md#16-cross-cutting-concerns-df-017)
- `[DF-018]` : [17. Scalability Considerations](sequence/DATA_FLOW.md#17-scalability-considerations-df-018)
- `[DF-019]` : [18. Architectural Constraints](sequence/DATA_FLOW.md#18-architectural-constraints-df-019)
- `[DF-020]` : [19. Assumptions](sequence/DATA_FLOW.md#19-assumptions-df-020)
- `[DF-021]` : [20. Future Evolution](sequence/DATA_FLOW.md#20-future-evolution-df-021)
- `[DF-022]` : [21. Glossary](sequence/DATA_FLOW.md#21-glossary-df-022)
- `[DF-023]` : [22. Architecture Freeze](sequence/DATA_FLOW.md#22-architecture-freeze-df-023)
