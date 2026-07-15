# PROJECT_CONTEXT

## Metadata
- **Document Type**: Technical Context & AI Operating Manual
- **Version**: 1.0
- **Status**: Frozen
- **Owner**: CapMint Project Operating System
- **Applies To**: All System Contributors and AI Agents
- **Review Status**: Approved

---

## Scope [PC-001]

This document establishes the permanent technical context required to understand and engineer CapMint. 

It defines:
- The engineering worldview and philosophies.
- The repository conventions and directory mappings.
- The documentation hierarchy.
- The AI engineering context and guidelines.
- The high-level technical assumptions.

It explicitly does NOT define:
- The project identity (defined in [PROJECT_BRAIN.md](PROJECT_BRAIN.md#1-project-identity-pb-001) [PB-001]).
- The system architecture specifications (defined in the blueprints under `../architecture/`).
- The AI behavior rules (defined in [AI_RULES.md](AI_RULES.md#scope-ar-001) [AR-001]).
- The active runtime execution state (defined in [CURRENT_STATE.md](CURRENT_STATE.md)).
- The immediate active work and task scopes (defined in [NEXT_TASK.md](NEXT_TASK.md) and [SESSION.md](SESSION.md)).

---

## 1. Product Overview & System Purpose [PC-002]

CapMint is a unit-level integrity and origin-claim registry for premium agricultural commodities. It bridges physical packing operations with digital certification bodies by preventing supply chain over-issuance. 

The system operates as a cryptographic gatekeeper, ensuring physical QR codes (conforming to GS1 Digital Link standards) can only be minted within verified, certifier-signed production limits.

---

## 2. Engineering Principles & Philosophy [PC-003]

CapMint's engineering culture is governed by ten core principles that prioritize system correctness, safety, and long-term maintainability:

1. **Security First**: All operations must fail closed. Input validation, rate-limiting, and cryptographic controls are prioritized over developer convenience.
2. **Architecture First**: Code must align with the frozen blueprints under `architecture/`. Implementation cannot drift from design.
3. **Documentation First, Implementation Second**: Modifications to workflows or domains require documentation updates prior to writing code.
4. **Single Source of Truth**: Every domain, entity, and design parameter has exactly one owner file. Duplication of concepts is prohibited.
5. **Explicit over Implicit**: Business rules, state changes, and error handling must be explicitly coded. Hidden behaviors or magic configurations are banned.
6. **Composition over Duplication**: Share common libraries via `packages/` utilities using adapters, preventing duplicate logic across services.
7. **Maintainability over Cleverness**: Write simple, readable, and standard-compliant TypeScript code. Avoid complex optimizations unless backed by metrics.
8. **Correctness over Speed**: Transaction completeness and yield capacity validations must be mathematically correct.
9. **Long-Term Evolution over Short-Term Convenience**: Plan schemas and modules to allow horizontal scaling and database splitting.

---

## Engineering Decision Hierarchy [PC-004]

The architectural decision hierarchy defines how design trade-offs must be evaluated. Lower-priority concerns must never compromise higher-priority principles:

1. **Product Integrity**: The system must enforce issuance capacity bounds unconditionally.
2. **Security**: Private key safety and zero trust boundaries cannot be compromised.
3. **Correctness**: Computations and state validations must be mathematically exact.
4. **Architecture Consistency**: Modules and dependencies must match the DAG and directory catalogs.
5. **Maintainability**: Custom features must follow uniform structures for long-term health.
6. **Scalability**: Decoupling strategies must allow horizontal database and cache scaling.
7. **Performance**: Throughput and latency SLAs must be met under load.
8. **Developer Convenience**: Workflow optimization is addressed only after correctness is assured.

---

## 3. AI Engineering Context [PC-005]

To safely operate within this repository, AI agents must adhere to the following guidelines:

- **Consume Architecture Logically**: Always read the relevant blueprints in `architecture/` before touching code in `services/`.
- **Prevent AI Drift**: Never make assumptions about naming structures or state lifecycles. Always verify terms in [CURRENT_STATE.md](CURRENT_STATE.md).
- **Enforce Context Isolation**: Load only the files specified by the escalation policy in [CONTEXT_INDEX.md](CONTEXT_INDEX.md). Never perform repository-wide searches.
- **Respect Folder Boundaries**: Code modifications must match the directory catalog. Do not place business logic in API routes or transport code in core domain modules.

---

## Architecture Consumption Order [PC-006]

AI agents must consume architectural specifications in the following order before starting any implementation. Implementation must never begin before the relevant architectural documents have been understood:

1. **[SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md#scope-sc-001) [SC-001]**: Business context, ecosystem boundaries, and invariants.
2. **`../architecture/system/SYSTEM_OVERVIEW.md`**: Principles, high-level components, and baseline workflows.
3. **`../architecture/system/SERVICE_BOUNDARIES.md`**: Logical services, encapsulation boundaries, and domain rules.
4. **[MODULE_DEPENDENCIES.md](../architecture/system/MODULE_DEPENDENCIES.md#scope-md-001) [MD-001]**: Logical code dependencies and import checks.
5. **[TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md#scope-ts-001) [TS-001]**: Framework, language, and database decisions.
6. **[DIRECTORY_OWNERSHIP.md](../architecture/system/DIRECTORY_OWNERSHIP.md#scope-do-001) [DO-001]**: Folder organization mapping to physical packages.
7. **`../architecture/C4/L1_SYSTEM_CONTEXT.md`**: Bird's-eye actor and external system maps.
8. **`../architecture/C4/L2_CONTAINER.md`**: Container processes and communication boundaries.
9. **[DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md#scope-df-001) [DF-001]**: Entity lifecycles and step-by-step transaction chains.
10. **[SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md#scope-sec-001) [SEC-001]**: Cryptography protocols, RBAC matrices, and threat models.
11. **`../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md`**: Environments, subnets, replication pools, and SLA targets.

---

## 4. Repository & Documentation Structure [PC-007]

CapMint's documentation is organized hierarchically to keep definitions decoupled and readable:

- **Platform Core State (`BRAIN/`)**: Defines the AI memory contracts, active tasks, session state, and loading boundaries.
- **Domain Blueprints (`architecture/system/`)**: Establishes conceptual domains, invariants, tech stacks, and folder layouts.
- **Verification Flow (`architecture/sequence/`)**: Maps state transition machines and transaction sequences.
- **Security Blueprint (`architecture/security/`)**: Contains threat models, access control matrix, and KMS key topologies.
- **Deployment & Scaling (`architecture/deployment/`)**: Maps environments, replication topologies, and NFR targets.
- **C4 Architecture Diagrams (`architecture/C4/`)**: Visually maps L1 System Context and L2 Container relationships.

For folder-level ownership and allowed/forbidden contents, reference the directory registry in [DIRECTORY_OWNERSHIP.md](../architecture/system/DIRECTORY_OWNERSHIP.md#scope-do-001) [DO-001]. For module dependencies, see [MODULE_DEPENDENCIES.md](../architecture/system/MODULE_DEPENDENCIES.md#scope-md-001) [MD-001].

---

## 5. High-Level Engineering Workflow [PC-008]

Every engineering task must execute through this standard validation lifecycle:

```
[ Step 1: Boot Session ]
  --> Load Universal Context (PROJECT_BRAIN, NEXT_TASK, etc.).
  
[ Step 2: Navigate by Ownership ]
  --> Locate the target folder in CONTEXT_INDEX.md.
  
[ Step 3: Read Design specs ]
  --> Load the matching architecture file under architecture/.
  
[ Step 4: Implement Code ]
  --> Refine services or schemas using TypeScript.
  
[ Step 5: Validate Quality ]
  --> Run verification checklists and local test suites.
  
[ Step 6: Log Completion ]
  --> Update SESSION.md and CURRENT_STATE.md logs.
  
[ Step 7: Update Next Tasks ]
  --> Update NEXT_TASK.md.
  
[ Step 8: Update Lessons ]
  --> Update LESSONS_LEARNED.md (if applicable).
  
[ Step 9: Hand off & Lock ]
  --> Stop and wait for repository owner approval before continuing to the next checkpoint.
```

---

## Context Boundaries [PC-009]

`PROJECT_CONTEXT.md` owns only the permanent engineering context. It must never contain:
- Project identity (defined in [PROJECT_BRAIN.md](PROJECT_BRAIN.md#1-project-identity-pb-001) [PB-001]).
- Repository navigation (defined in [CONTEXT_INDEX.md](CONTEXT_INDEX.md)).
- Runtime execution state (defined in [CURRENT_STATE.md](CURRENT_STATE.md)).
- Session history (defined in [SESSION.md](SESSION.md) and [CHANGELOG.md](CHANGELOG.md)).
- Implementation details (defined in service packages).
- Architecture specifications (defined in blueprints under `../architecture/`).

Those belong to their respective canonical documents.

---

## 6. References

- Permanent Memory Core: [PROJECT_BRAIN.md](PROJECT_BRAIN.md#1-project-identity-pb-001) [PB-001]
- AI Loading Protocol: [CONTEXT_INDEX.md](CONTEXT_INDEX.md)
- Active Checkpoint: [CURRENT_STATE.md](CURRENT_STATE.md)
- AI Behaviour Rules: [AI_RULES.md](AI_RULES.md#scope-ar-001) [AR-001]
- Architectural Invariants: [NON_NEGOTIABLES.md](NON_NEGOTIABLES.md#scope-nn-001) [NN-001]
- System Context Blueprint: [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md#scope-sc-001) [SC-001]
- Overview Blueprint: [SYSTEM_OVERVIEW.md](../architecture/system/SYSTEM_OVERVIEW.md)
- Directory Ownership Registry: [DIRECTORY_OWNERSHIP.md](../architecture/system/DIRECTORY_OWNERSHIP.md#scope-do-001) [DO-001]
- Technology Stack Matrix: [TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md#scope-ts-001) [TS-001]
