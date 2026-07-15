# TECHNOLOGY_STACK

## Scope [TS-001]

This document owns:
- System technology choices (TypeScript, Node.js, Fastify, Postgres, Redis, KMS)
- Cryptographic algorithm selections (Ed25519, SHA-256)
- GS1 Digital Link standard definition and integration
- Alternative technology evaluation matrices
- Replacement difficulties, constraints, and software evolution strategies

This document intentionally does NOT define:
- Logical container boundaries, network routing paths, or cloud HSM specs (defined in [CONTAINER_ARCHITECTURE.md](../C4/L2_CONTAINER.md) and [DEPLOYMENT_ARCHITECTURE.md](../deployment/DEPLOYMENT_ARCHITECTURE.md))
- Core business invariants or land registration limits (defined in [SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md))
- Service context single-writer boundaries (defined in [SERVICE_BOUNDARIES.md](./SERVICE_BOUNDARIES.md))
- State transitions, entity state machines, or transactional API sequences (defined in [DATA_FLOW.md](../sequence/DATA_FLOW.md))
- JWT authentication schemas or RBAC permissions grids (defined in [SECURITY_ARCHITECTURE.md](../security/SECURITY_ARCHITECTURE.md))
- Repository directory layouts or workspace tools (defined in [DIRECTORY_OWNERSHIP.md](./DIRECTORY_OWNERSHIP.md))

## 1. Purpose [TS-002]

This document defines the technology stack for the CapMint platform. It outlines the core runtime environments, databases, libraries, and standards chosen to build, operate, and maintain the system.

### Structural Relationships
- **[SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md)**: Establishes the core integrity invariants.
- **[CONTAINER_ARCHITECTURE.md](../C4/L2_CONTAINER.md)**: Outlines the physical execution layers.
- **[SERVICE_BOUNDARIES.md](./SERVICE_BOUNDARIES.md)**: Defines domain responsibilities and logical encapsulation.
- **[DEPLOYMENT_ARCHITECTURE.md](../deployment/DEPLOYMENT_ARCHITECTURE.md)**: Maps deployable infrastructure units.
- **TECHNOLOGY_STACK.md** (This Document): Focuses on the language, framework, database, and library decisions, explaining why they were chosen and how they are structured.

---

## 2. Technology Philosophy [TS-003]

CapMint's technology selection is guided by the following principles:

- **Single-Language Strategy**: Utilizing TypeScript across the backend, verifier, and operator PWA to minimize cognitive overhead, enable code sharing (e.g., validation schemas, types), and maximize developer speed.
- **Boring, Proven Tools**: Preferring mature technology over early-stage alternatives. Database selection prioritizes transaction safety over speculative scale capabilities.
- **Standards Alignment**: Building on industry standards (GS1 Digital Link) rather than custom formats to ensure long-term, public compatibility.

---

## 3. Technology Stack Summary [TS-004]

The table below lists the technologies designated for the CapMint platform.

| Architectural Layer | Technology Selected | Responsibility | Status |
|---|---|---|---|
| **Programming Language** | TypeScript | Standardized language across all codebases. | Confirmed |
| **Backend API Runtime** | Node.js | Non-blocking I/O runtime. | Confirmed |
| **Backend Framework** | Fastify | Core web framework, router, and schema validator. | Confirmed (Alt: Express) |
| **Primary System of Record** | Postgres | Persistent relational storage, ledger logging. | Confirmed |
| **Cache & Queue** | Redis | Ephemeral verification caching, rate limiting. | Confirmed |
| **Object Store** | Object Storage | PDF certificate and log file blob storage. | Confirmed |
| **Cryptography** | `@noble/ed25519` / libsodium | Ed25519 signature generation and validation. | Confirmed |
| **QR Code Standard** | GS1 Digital Link URIs | Public verification link format. | Confirmed |
| **Key Vault** | Cloud KMS / HSM | FIPS 140-2 Level 3 private key storage. | Confirmed |
| **Hosting Platform** | Managed Postgres + small VM | Low-cost VM/Serverless deployment. | Confirmed |
| **CDN / Edge WAF** | Cloudflare | Anycast DNS, edge caching, and DDoS defense. | Confirmed |
| **Authentication** | JSON Web Token (JWT) | Authenticated session token format. | TBD |
| **Observability & Logs** | TBD | Performance tracking and telemetry analysis. | TBD |
| **Testing Framework** | TBD | Unit, integration, and security testing. | TBD |
| **CI/CD Pipeline** | TBD | Build automation and deployment. | TBD |

---

## 4. Technology Decisions [TS-005]

### 1. Programming Language: TypeScript
- **Purpose**: Application code execution.
- **Architectural Responsibility**: Used for all logic across the Application Backend, Public Verifier, and Operator PWA.
- **Why Selected**: Combines JS edge execution with strict type safety, which is essential for ensuring correctness in capacity calculations and transaction states.
- **Trade-offs**: Requires a compilation stage; introduces dependency overhead.
- **Replacement Difficulty**: Extremely high; requires rewriting the entire system.

### 2. Backend Web Framework: Fastify
- **Purpose**: Web router and API engine.
- **Architectural Responsibility**: Exposes JSON REST endpoints and runs schema validations at the service entry points.
- **Why Selected**: Outperforms Express in benchmark tests, which is critical for meeting the $<300\text{ms}$ verification target. Includes built-in JSON schema validation using Ajv.
- **Trade-offs**: Smaller plugin ecosystem than Express.
- **Replacement Difficulty**: Medium; Fastify service handlers are decoupled from core business domains.

### 3. Relational Storage: Postgres
- **Purpose**: Persistent database.
- **Architectural Responsibility**: Enforces transaction safety on budget drawdown ledgers and stores the append-only transparency log.
- **Why Selected**: Offers ACID compliance, rich SQL querying, JSONB indexing, and managed hosting availability.
- **Trade-offs**: Requires manual horizontal partitioning strategy at scale.
- **Replacement Difficulty**: High.

### 4. Ephemeral Store: Redis
- **Purpose**: Caching and rate-limiting.
- **Architectural Responsibility**: Resolves public verification queries from cache and manages rate-limiting states.
- **Why Selected**: Extremely low latency; supports atomic increment locks needed for rate limiting.
- **Trade-offs**: Ephemeral storage; data must be rebuildable from Postgres.
- **Replacement Difficulty**: Low.

### 5. Cryptography: Ed25519 (`@noble/ed25519` or `libsodium`)
- **Purpose**: Signature verification.
- **Architectural Responsibility**: Validates certifier approvals and signs integrity logs.
- **Why Selected**: Fast signature validation and small key size; standard algorithm for modern cryptographic platforms.
- **Trade-offs**: Does not support homomorphic encryption or zero-knowledge proofs.
- **Replacement Difficulty**: Medium.

---

## 5. Technology Boundaries [TS-006]

```
[ Operator PWA / HTML & Vanilla CSS ]  --> served via Cloudflare CDN edge
                    | (HTTPS APIs)
                    v
[ Fastify Backend / TypeScript ]      --> validated via JSON Schemas
                    | (Internal TCP Network)
       +------------+------------+
       |                         |
       v                         v
[ Postgres / SQL ]        [ Redis / Cache ]
```

- **Runtime Boundary**: Frontends use Web APIs and compile to JavaScript. The backend runs on Node.js.
- **Cryptographic Boundary**: Fastify never has access to the private keys, which are isolated inside the KMS.

---

## 6. Core Runtime Technologies [TS-007]
- **Execution Model**: Single-threaded event loop (Node.js).
- **Application Language**: TypeScript compiled to ESNext.

---

## 7. Data Technologies [TS-008]
- **ACID Database**: Postgres.
- **In-Memory Cache**: Redis.
- **Blob Store**: Object Storage (for unstructured PDFs).

---

## 8. Security Technologies [TS-009]
- **Signature Scheme**: Ed25519.
- **Hash Functions**: SHA-256.
- **Transport Protection**: HTTPS / TLS 1.3.

---

## 9. Frontend Technologies [TS-010]
- **Operator App**: Installable PWA built with HTML, Vanilla CSS, and JavaScript/TypeScript.
- **Public Verifier**: Lightweight Web App designed for mobile browsers.

---

## 10. Backend Technologies [TS-011]
- **API Engine**: Fastify.
- **Framework Core**: Node.js.

---

## 11. Integration Technologies [TS-012]
- **Identity Link Format**: GS1 Digital Link Standard.
- **External Registries**: AgriStack JSON API, APEDA TraceNet API.
- **Lab Standard**: NABL Laboratory Webhook endpoints.

---

## 12. Technology Constraints [TS-013]

- **Single-Language Boundary**: All custom logic is restricted to TypeScript.
- **Zero Client-Side App Downloads**: Public verification must work natively in standard mobile browsers.
- **Standards Compliance**: QR codes must remain GS1 Digital Link-compliant.

---

## 13. Technology Decision Matrix [TS-014]

The table below outlines the trade-offs evaluated during tech stack selection:

| Component | Selected Option | Alternatives Evaluated | Architectural Rationale | Change Cost |
|---|---|---|---|---|
| **API Framework** | **Fastify** | Express, NestJS | Fastify offers better performance and built-in schema validation; NestJS is unnecessarily heavy for the pilot. | Medium |
| **Database** | **Postgres** | MySQL, MongoDB | Postgres offers strong transactional guarantees (ACID) and robust JSONB support. | High |
| **Language** | **TypeScript** | JavaScript, Go | TypeScript provides compile-time type safety; Go was rejected to maintain a single language codebase. | Extremely High |
| **Cryptography** | **Ed25519** | RSA, ECDSA (secp256k1) | Ed25519 offers faster execution and smaller signature sizes. | Medium |

---

## 14. Future Technology Evolution [TS-015]

- **CDN Edge Workers**: Moving public verifications to Cloudflare Workers to eliminate backend load during scan spikes.
- **Direct Database Replacements**: If write volume exceeds Postgres single-instance limits, the platform can evolve to run on horizontally scalable Postgres engines (e.g., Citus/Spackle-like models).

---

## 15. Assumptions [TS-016]

- **NAML JSON Capabilities**: We assume testing labs can deliver certificates in structured JSON formats alongside PDF reports.
- **Client PWA Runtime**: We assume target mobile browsers support modern Service Workers and IndexedDB.

---

## 16. Glossary [TS-017]

- **ACID**: Atomicity, Consistency, Isolation, Durability guarantees for database transactions.
- **Ed25519**: Elliptic curve signature scheme.
- **Fastify**: High-performance Node.js web framework.
- **GS1 Digital Link**: Standard mapping physical barcodes to web URLs.
- **KMS**: Cloud Key Management Service.
- **PWA**: Progressive Web Application.

---

## 17. Architecture Freeze [TS-018]

> [!IMPORTANT]
> This section formally freezes the CapMint Technology Stack Version 1.0. Any downstream changes to programming languages, database engines, or cryptographic schemes must follow the formal RFC process.

| Attribute | Value |
|---|---|
| **Version** | 1.0 |
| **Checkpoint** | CP-001 |
| **Status** | Approved |
| **Next Checkpoint** | CP-002 Database Design |
