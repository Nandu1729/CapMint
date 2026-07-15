# PROJECT_BRAIN

## Metadata
- **Document Type**: Project Identity & Long-Term AI Memory
- **Version**: 1.0
- **Status**: Frozen
- **Owner**: CapMint Project Operating System
- **Applies To**: All System Contributors and AI Agents
- **Review Status**: Approved

---

## 1. Project Identity [PB-001]

CapMint is a cryptographically verified unit-level registry and origin-claim integrity system for premium and organic agricultural products. It operates as the secure gatekeeper between physical packaging operations and administrative certification bodies.

### Why it Exists
Organic food supply chains suffer from systemic over-issuance fraud, where conventional products are mislabeled and sold under organic certificate quotas. CapMint mathematically prevents this by binding code serialization to certifier-authorized yield capacity limits.

---

## 2. Vision & Mission [PB-002]

### Vision
To establish global, trustless transparency in premium commodity supply chains, ensuring every consumer can mathematically verify the origin and authenticity of their purchase without depending on blind trust in intermediary vendors.

### Mission
To provide a lightweight, high-performance, and decentralized-audit-friendly serialization engine that enforces production limits at the point of packaging, ensuring zero over-issuance of certified goods.

---

## 3. Product & Engineering Philosophy [PB-003]

### Product Philosophy
- **Verification Over Proclamation**: Claims of organic origin must be backed by certifier signatures and laboratory evidence.
- **Fail-Closed Gatekeeping**: If validity cannot be verified, serialization must block immediately.
- **Lightweight Footprint**: The verification path must run on standard retail mobile browsers without requiring native app installations.

### Engineering Philosophy
- **Single-Language Strategy**: The entire codebase (backend, verifier, and operator PWA) is written in TypeScript to optimize speed, code sharing, and context efficiency.
- **ACID Security First**: Relational data transitions must use strict database transactions rather than speculative caching mechanisms.
- **Explicit Cryptographic Authority**: The system cannot self-authorize; all active budgets require verified certifier key approvals.

---

## 4. Core Principles [PB-004]

- **No Over-Issuance**: Sum of minted unit serials must never exceed authorized plot capacity: $\sum \text{Minted} \le \text{Capacity}$.
- **Append-Only Event Ledger**: All state mutations generate hash-chained events block-hashed via SHA-256 and anchored periodically to external channels.
- **Zero Trust Zones**: Restrict access at the network boundary, ensuring Fastify servers operate with minimal privileges and KMS vaults isolate private signing keys.

---

## Permanent Invariants [PB-005]

The following define the permanent identity of CapMint and are not expected to change during normal project evolution:
- Mission
- Vision
- Product Philosophy
- Engineering Philosophy
- Core Principles
- Canonical Terminology

Changes require explicit repository owner approval.

---

## Decision Philosophy [PB-006]

The architectural decision hierarchy defines how design trade-offs must be evaluated. No decision may violate a higher-priority principle to satisfy a lower-priority one:

1. **Product Integrity**: The system must enforce issuance capacity bounds unconditionally.
2. **Security**: Private key safety and zero trust boundaries cannot be compromised.
3. **Correctness**: Computations and state validations must be mathematically exact.
4. **Simplicity**: Code structure and network interactions must minimize cognitive overhead.
5. **Maintainability**: Custom features must follow uniform structures for long-term health.
6. **Performance**: Throughput and SLA benchmarks must be met under load.
7. **Convenience**: Operator workflow ease is addressed only after safety is assured.

---

## 5. Repository & AI Working Principles [PB-007]

### Repository Philosophy
- **Domain-First Layout**: Code directories correspond strictly to logical domains rather than framework categories.
- **Strict DAG Imports**: Code dependencies must form a Directed Acyclic Graph; circular imports are blocked at compile time.

### AI Working Principles
- **Minimal Context Loading**: Load only the files specified by the priority levels in [CONTEXT_INDEX.md](CONTEXT_INDEX.md) to prevent AI drift.
- **Precedence of Invariants**: AI must check safety constraints in `NON_NEGOTIABLES.md` before proposing code changes.
- **No Documentation Duplication**: Never copy definitions across directories; reference the canonical files instead.

---

## 6. Immutability Matrix [PB-008]

| Tier | Items | Change Policy |
|---|---|---|
| **Tier 1: Permanent (Must Never Change)** | System Invariants, Core Verdict Vocabulary, Core Cryptographic Algorithms (Ed25519, SHA-256). | Requires formal Architecture Board RFC and cryptographic transition plan. |
| **Tier 2: Rare Changes** | Bounded Contexts, Bounded Service Names, Network trust zones, database engines (Postgres DB). | Allowed only during major version bumps and milestone transitions. |
| **Tier 3: Dynamic Configs** | Alert thresholds, UI layout assets, edge caching TTLs, external API payload parameters. | Managed via runtime environment variables and deploy configurations. |

---

## 7. Canonical Terminology [PB-009]

- **Primary Database**: `Postgres DB` (the relational system of record).
- **Cache & Telemetry Queue**: `Redis Cache` (ephemeral data buffer).
- **Key Vault**: `Cloud KMS` (HSM-backed cryptographic signing environment).
- **API Engine**: `Application Backend (Fastify API)`.
- **Static Frontends**: `Public Verifier Web App` & `Operator Web App (PWA)`.
- **Verdict Vocabulary**: `VERIFIED`, `REVOKED`, `EXHAUSTED`, `CLONE-SUSPECT`, `MISMATCH`.

---

## 8. High-Level Project Lifecycle [PB-010]

```
Vision
  ↓
Architecture
  ↓
Data Model
  ↓
Services
  ↓
Interfaces
  ↓
Infrastructure
  ↓
Quality
  ↓
Release
  ↓
Evolution
```

---

## AI Memory Contract [PB-011]

`PROJECT_BRAIN.md` is the permanent identity of the project. AI agents must treat this document as immutable project memory. Operational information must never be stored here. The following belong in separate operational documents:
- Current Tasks (managed in `NEXT_TASK.md`)
- Session History (managed in `SESSION.md` and `CHANGELOG.md`)
- Current Checkpoint (managed in `CURRENT_STATE.md`)
- Active Branch (managed in `CURRENT_STATE.md` or git)
- Progress Tracking (managed in `CURRENT_STATE.md`)
- Sprint Status (managed in `CURRENT_STATE.md`)
- Temporary Notes (managed in scratch files)
- Implementation Details (managed in service files)

Reference the appropriate operational documents instead of duplicating information.

---

## 9. References

Detailed specifications reside in their respective canonical owners:
- Core business invariants: [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md)
- Bounded Context definitions: [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md)
- State lifecycles and transitions: [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md)
- Security threat models and RBAC: [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md)
- Deployment topologies and NFRs: [DEPLOYMENT_ARCHITECTURE.md](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md)
- AI loading protocol: [CONTEXT_INDEX.md](CONTEXT_INDEX.md)
