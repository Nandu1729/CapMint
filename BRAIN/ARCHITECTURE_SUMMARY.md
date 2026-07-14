# ARCHITECTURE_SUMMARY

## Metadata
- **Document Type**: Executive Architecture Summary
- **Version**: 1.0
- **Status**: Frozen
- **Owner**: CapMint Project Operating System
- **Applies To**: All System Contributors and AI Agents
- **Review Status**: Approved

---

## Purpose

This document serves as the high-level, executive overview of the CapMint system architecture. It is designed to be read by engineers, auditors, and AI agents to grasp the system's structural pattern, trust boundaries, and component composition in under 5 minutes. 

It MUST be loaded as a conceptual prelude before reading detailed domain blueprints under `architecture/`. It is not a replacement for those blueprints.

---

## Scope

This document owns only the executive-level overview of the CapMint system structure. It summarizes system subsystems, logical layers, architectural styles, and non-functional quality attributes.

---

## Architecture at a Glance

CapMint is a cryptographically verified unit-level serialization registry that enforces yield capacity limits on agricultural products. It consists of three primary subsystems:
1. **Application Backend**: A distributed microservices engine coordinating authorization, packaging-line minting, and transparency ledger writes.
2. **Operator Interface (PWA)**: A mobile interface allowing field packaging agents to run off-line drawdowns.
3. **Public Verifier Web App**: A lightweight, zero-authentication client allowing end consumers to scan QR codes and verify claims instantly.

---

## Architecture Style

CapMint utilizes a combined set of modern architectural patterns to ensure high system decoupling and reliability:
- Domain-Driven Design (DDD)
- Bounded Contexts
- Service-Oriented Architecture (SOA)
- Layered Architecture
- API-First design
- Zero Trust security model
- Single Source of Truth

---

## Architectural Layers

The system is organized into the following logical layers, ensuring separation of concerns across runtime boundaries:

```
Presentation Layer
        │
        ▼
    API Layer
        │
        ▼
Application Services
        │
        ▼
 Domain Services
        │
        ▼
Persistence Layer
        │
        ▼
Infrastructure Layer
```

---

## System Composition

- **Frontend**: Lightweight mobile web applications (Operator PWA and Public Verifier Web App) built to render on retail devices.
- **Backend**: Microservice modules handling logical domains coordinated under web routing engines.
- **Services**: Decoupled domain business logic engines separated into isolated packages.
- **Database**: Relational database as the system of record, coupled with an in-memory key-value cache.
- **Infrastructure**: Containerized runtimes isolated inside strict network subnets.
- **Security**: Cryptographic key vaults managing signing keys, decoupled from application memory.
- **Knowledge**: Integration standards and guidelines (GS1 Digital Link URI templates).
- **Brain**: In-memory AI guidelines and operational logs (`PROJECT_BRAIN.md`, `NON_NEGOTIABLES.md`).
- **State**: Runtime tracking, active checkpoints, and branch operational variables.

---

## Service Landscape

The CapMint backend is partitioned into 14 distinct logical services:

- **gateway-service**:
  - Purpose: Serves as the single API entry point, handling routing, transport encryption, and rate-limiting.
  - Canonical Reference: [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md)
- **auth-service**:
  - Purpose: Manages token issuance, session verification, and API key validations.
  - Canonical Reference: [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)
- **identity-service**:
  - Purpose: Maintains profiles for certifiers, operators, agricultural plots, and organizations.
  - Canonical Reference: [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md)
- **mint-service**:
  - Purpose: Generates cryptographically signed QR serial codes bound to certifier-approved capacity budgets.
  - Canonical Reference: [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md)
- **verification-service**:
  - Purpose: Resolves scans and evaluates signatures, clone status, and yield capacity.
  - Canonical Reference: [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)
- **transparency-service**:
  - Purpose: Publishes hash-chained serial lists to external public ledgers for auditing.
  - Canonical Reference: [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md)
- **clone-detection-service**:
  - Purpose: Runs anomaly detection heuristics to flag duplicate scans of identical serial codes.
  - Canonical Reference: [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)
- **notification-service**:
  - Purpose: Coordinates SMS/Email dispatches for out-of-bounds alerts and key rotations.
  - Canonical Reference: [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md)
- **audit-service**:
  - Purpose: Captures immutable history of administrative actions, budget increases, and key changes.
  - Canonical Reference: [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)
- **analytics-service**:
  - Purpose: Generates operational yields dashboards, crop summaries, and scanner metrics.
  - Canonical Reference: [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md)
- **resolver-service**:
  - Purpose: Redirects GS1 Digital Link URIs to public verification payloads.
  - Canonical Reference: [SYSTEM_OVERVIEW.md](../architecture/system/SYSTEM_OVERVIEW.md)
- **integration-service**:
  - Purpose: Handles data sync with external government certification databases.
  - Canonical Reference: [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md)
- **cpq-service**:
  - Purpose: Coordinates farm plot capacity planning, yield forecasting, and quota pricing.
  - Canonical Reference: [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md)
- **scan-service**:
  - Purpose: Ingests telemetry scans from the field and feeds anomaly detection buffers.
  - Canonical Reference: [L1_SYSTEM_CONTEXT.md](../architecture/C4/L1_SYSTEM_CONTEXT.md)

---

## High-Level Data Flow

During normal product verification, data moves along the following pipeline:

```
Client ──> Gateway ──> Application Services ──> Persistence ──> Audit & Transparency ──> Response
```

For detailed transaction workflows, message states, and state-machine transitions, see [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md).

---

## Trust Boundaries

CapMint enforces five security and operational trust zones:
- **Public Zone**: Unauthenticated, rate-limited traffic accessing Public Verifier and Resolver services.
- **Protected Zone**: Authenticated Operators and Certifiers executing actions using short-lived tokens.
- **Internal Zone**: Encapsulated microservices executing over internal private networks.
- **Administrative Zone**: Highly restricted audit access for key rotations and budget adjustments.
- **Cryptographic Zone**: Cryptographic key vaults managing private key access. No application service has direct visibility of signing keys.

For threat models and access control details, reference [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md).

---

## Technology Overview

- **Language**: TypeScript (Single-language strategy across backend and PWAs).
- **Framework**: High-performance asynchronous web frameworks.
- **Database**: Relational database engine for strict ACID guarantees.
- **Cache**: In-memory database for token validation and rate-limit counters.
- **Messaging**: Ephemeral message queue for telemetry event streams.
- **Cloud**: Managed container runtimes with HSM-based key storage.
- **Deployment**: Declarative pipelines utilizing container builds.
- **Testing**: Unified unit and integration testing suites.

For specifications, see [TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md).

---

## Non-Functional Overview

The primary non-functional quality attributes of the CapMint architecture are categorized below:
- **Security**: Zero-trust access policies, cryptographic verification, and HSM key vaults.
- **Scalability**: Decoupled service structures allowing independent scaling of API routes and persistence pools.
- **Availability**: High redundancy setups with localized failover parameters.
- **Reliability**: Fail-closed transactional locks protecting against quota over-issuance.
- **Maintainability**: Unified language stack, single source of truth layouts, and explicit modular boundaries.
- **Observability**: Centralized telemetry pipelines capturing scans, audits, and system errors.

For complete specifications, see [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md).

---

## Architecture Navigation

AI agents and developers seeking deep system blueprints should navigate to the canonical documents using this guide:

| Question | Canonical Document |
|---|---|
| What is the overall ecosystem, actors, and core invariants? | [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md) |
| What are the high-level components and workflow rules? | [SYSTEM_OVERVIEW.md](../architecture/system/SYSTEM_OVERVIEW.md) |
| Where are the logical boundaries, services, and domain contracts defined? | [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md) |
| How are modular dependencies and imports checked? | [MODULE_DEPENDENCIES.md](../architecture/system/MODULE_DEPENDENCIES.md) |
| What languages, runtimes, and databases are approved? | [TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md) |
| Which directory contains which package, and who owns it? | [DIRECTORY_OWNERSHIP.md](../architecture/system/DIRECTORY_OWNERSHIP.md) |
| What does the bird's-eye C4 diagram map? | [L1_SYSTEM_CONTEXT.md](../architecture/C4/L1_SYSTEM_CONTEXT.md) |
| How do containers interact and communicate across ports? | [L2_CONTAINER.md](../architecture/C4/L2_CONTAINER.md) |
| How does data progress through states, and what are the API routes? | [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md) |
| What are the threat models, encryption guidelines, and RBAC matrix? | [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md) |
| What are the cloud subnets, failover, backup, and latency targets? | [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md) |

---

## AI Usage

`ARCHITECTURE_SUMMARY.md` is loaded only when architectural understanding is required. 

After reading this summary, the AI agent MUST determine the affected architectural domain or service area, then load ONLY the required detailed blueprints from the [Architecture Navigation](#architecture-navigation) table. The AI agent MUST NOT recursively load the complete `architecture/` directory. For target file loading constraints, see [CONTEXT_INDEX.md](CONTEXT_INDEX.md).

---

## Ownership

`ARCHITECTURE_SUMMARY.md` summarizes the architecture. It is NOT the canonical source of architectural truth. The authoritative definitions remain in the `architecture/` directory. Whenever conflicts exist, the detailed architecture documents always take precedence.

---

## Change Policy

This document should only change when:
- Overall system architecture changes.
- New architectural domains are introduced.
- Major architectural principles evolve.

It must NOT change because of:
- Feature implementation.
- Bug fixes.
- Refactoring.
- Service-level code changes.

---

## Canonical References

Detailed specifications reside in their respective canonical owners:
- [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md)
- [SYSTEM_OVERVIEW.md](../architecture/system/SYSTEM_OVERVIEW.md)
- [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md)
- [MODULE_DEPENDENCIES.md](../architecture/system/MODULE_DEPENDENCIES.md)
- [TECHNOLOGY_STACK.md](../architecture/system/TECHNOLOGY_STACK.md)
- [DIRECTORY_OWNERSHIP.md](../architecture/system/DIRECTORY_OWNERSHIP.md)
- [L1_SYSTEM_CONTEXT.md](../architecture/C4/L1_SYSTEM_CONTEXT.md)
- [L2_CONTAINER.md](../architecture/C4/L2_CONTAINER.md)
- [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md)
- [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)
- [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md)
