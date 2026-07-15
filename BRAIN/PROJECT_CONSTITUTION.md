# Project Constitution [PROJECT_CONSTITUTION]

This is the supreme technical constitution, memory core, and operating ruleset for the CapMint project. It binds all system boundaries, engineering guidelines, AI constraints, invariants, context index, and architecture navigation rules into a single Source of Truth.

---

## 1. Project Identity & Memory Core [PB-001]

### 1.1 Project Name
- **Name**: CapMint
- **Pronunciation**: /kæpmɪnt/
- **Casing**: Capital `C`, capital `M`, lowercase `int` (e.g., `CapMint`). Never `capmint`, `CAPMINT`, or `Capmint`.

### 1.2 Vision & Mission [PB-002]
- **Vision**: Build the world's most trusted AI-first anti-counterfeiting platform—one where every physical product carries a cryptographically verifiable digital identity.
- **Mission**: Deliver an open, modular, production-grade platform that generates GS1-compliant identifiers, resolves product provenance, detects clones using heuristics, and logs events to an append-only transparency ledger.

### 1.3 Engineering Philosophy [PB-003]
- **Calculated Integrity**: Integrity cannot be self-declared. It must be computed from source constraints, verified by external authority, and enforced at the boundary of issuance.
- **Fail Closed**: If validation fails or a dependency is unavailable, block the transaction immediately.
- **Privacy by Design**: Mask PII and locations before recording telemetry or verification queries.

### 1.4 Permanent Invariants [PB-005]
1. **Supply Cap Constraint**: The total count of unit codes minted for a budget cannot exceed the approved capacity of that budget.
2. **Certifier Signature Gate**: Minting is blocked if a budget's `signature_bundle` is invalid or missing.
3. **Verdict Vocabulary Isolation**: Scans must return exactly one of the five approved verdicts: `VERIFIED`, `REVOKED`, `EXHAUSTED`, `CLONE-SUSPECT`, `MISMATCH`.
4. **Cascade Revocation**: Unit codes linked to a revoked lot must resolve to `REVOKED` immediately.

### 1.5 Repository Immutability Matrix [PB-008]
- **Tier 1 (Immutable)**: System invariants, verdict vocabulary, cryptographic algorithms. Requires formal Board RFC.
- **Tier 2 (Rare Changes)**: Bounded contexts, service names, network trust zones, database engines.
- **Tier 3 (Dynamic Configs)**: Alert thresholds, UI layout assets, edge caching TTLs, external API payload parameters.

---

## 2. Engineering Context & Philosophy [PC-001]

### 2.1 Engineering Decision Hierarchy [PC-004]
When making technical decisions, follow this hierarchy:
1. System Invariants & Non-Negotiables.
2. Cryptographic Security & Threat Models.
3. Database Transaction Integrity (ACID).
4. Edge Cache performance & low latency scan resolutions.
5. Microservice separation and modular imports.

### 2.2 Architecture Consumption Order [PC-006]
AI agents must consume architectural specifications in the following order before starting implementation:
1. **[SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md#scope-sc-001) [SC-001]**: Business context, ecosystem boundaries, and invariants.
2. **`../architecture/system/SYSTEM_OVERVIEW.md`**: Principles, high-level components, and baseline workflows.
3. **`../architecture/system/SERVICE_BOUNDARIES.md`**: Logical services, encapsulation boundaries, and domain rules.
4. **[MODULE_DEPENDENCIES.md](../architecture/system/MODULE_DEPENDENCIES.md#scope-md-001) [MD-001]**: Logical code dependencies and import checks.
5. **[TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md#scope-ts-001) [TS-001]**: Framework, language, and database decisions.
6. **[DIRECTORY_OWNERSHIP.md](../architecture/system/DIRECTORY_OWNERSHIP.md#scope-do-001) [DO-001]**: Folder organization mapping to physical packages.
7. **[DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md#scope-df-001) [DF-001]**: Entity lifecycles and step-by-step transaction chains.
8. **[SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md#scope-sec-001) [SEC-001]**: Cryptography protocols, RBAC matrices, and threat models.

---

## 3. AI Behavior Rules [AR-001]

### 3.1 AI Operating Precedence [AR-002]
When multiple documents define different guidance, AI agents must follow this precedence order:
1. **[NON_NEGOTIABLES.md](NON_NEGOTIABLES.md#scope-nn-001) [NN-001]** (Highest Precedence)
2. **[AI_RULES.md](AI_RULES.md#scope-ar-001) [AR-001]**
3. **[PROJECT_BRAIN.md](PROJECT_BRAIN.md#1-project-identity-pb-001) [PB-001]**
4. **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#scope-pc-001) [PC-001]**
5. **[CONTEXT_INDEX.md](CONTEXT_INDEX.md)**

### 3.2 Context Loading Discipline [AR-005]
- **Never load the entire repository**: Wastes tokens and causes "AI drift". Load only the directories matching the active checkpoint.
- **Reference over copying**: Use relative markdown links to point to other files instead of duplicating.
- **Verify before modifying**: Read PROJECT_BRAIN and PROJECT_CONTEXT before proposing code edits.

### 3.3 Quality Gates [AR-011]
- **GG.1**: Linting, formatting, and type-checks clean (zero warnings).
- **GG.2**: Unit/Integration tests pass.
- **GG.3**: Code coverage $\ge 80\%$ for new code.
- **GG.4**: No hard-coded keys or configurations in commits.

---

## 4. Supreme Non-Negotiables & Invariants [NN-001]

### 4.1 Constitutional Principles [NN-003]
- **Uncompromising Invariants**: Under no circumstances shall any database update, config change, or codebase PR bypass the core supply cap, certifier signature, or cascade revocation rules.
- **Fail-Closed Verification**: Any signature verification error, database lock timeout, or validation mismatch must halt execution and block the request.
- **Zero dynamic redirects**: Verification URLs must route directly to the local/production gateway server without third-party dynamic redirectors.

### 4.2 Security Rules [NN-008]
- **Secrets Management**: System credentials and database connections must be injected at runtime using environment variables.
- **No Direct Commits**: Direct commits to the protected `main` branch are blocked. All changes must go through feature branches merged via PR to `develop`.

---

## 5. Architectural Navigation Summary [ARCH-001]

*   **System Context Blueprint (`SYSTEM_CONTEXT.md`)**: Context limits, crop yield rules, ecosystem bounds.
*   **Module Dependencies Blueprint (`MODULE_DEPENDENCIES.md`)**: Logical dependency graphs, allowed/forbidden import limits.
*   **Technology Stack Blueprint (`TECHNOLOGY_STACK.md`)**: Tech stack definition, libraries, DB drivers.
*   **Directory Ownership Blueprint (`DIRECTORY_OWNERSHIP.md`)**: Monorepo layout, workspace rules.
*   **Data Flow Blueprint (`DATA_FLOW.md`)**: Lifecycle transitions, state machines, validation pipelines.
*   **Security Architecture Blueprint (`SECURITY_ARCHITECTURE.md`)**: Cryptography, RBAC, threat modeling.

---

## 6. Context Loading & Escalation Rules [CI-001]

- **Tier 1: Simple Task**: Load ONLY Universal State + Target File + Target Test.
- **Tier 2: Domain Task**: Load Universal State + Full Domain Directory (e.g. `services/mint-service/`).
- **Tier 3: Cross-Domain Task**: Load Universal State + Service Directory A + Service Directory B + MODULE_DEPENDENCIES.md.
- **Tier 4: Repository-Wide Scope**: Load entire workspace. Allowed *only* if explicitly requested by the user.
