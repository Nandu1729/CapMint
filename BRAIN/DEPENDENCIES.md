# Project Dependencies

This document provides a complete layout and registry of the monorepo package workspaces and third-party library dependencies of CapMint.

---

## 1. Monorepo Workspaces Layout

CapMint utilizes `npm workspaces` to manage all internal packages and microservices in a single repository:

```
CapMint (Root)
 ├── packages/
 │    ├── crypto (Shared cryptographic helpers)
 │    └── database (Shared Postgres connection client)
 └── services/
      ├── auth-service (Authentication & Session manager)
      ├── cpq-service (Capacity & Budget allocation manager)
      ├── integration-service (AgriStack / TraceNet APIs gateway)
      ├── mint-service (Lot & Serialized code creation engine)
      ├── resolver-service (GS1 URL redirect & dynamic routing)
      ├── transparency-service (Append-only SHA-256 hash chains ledger)
      └── verification-service (Consumer scan and clone validation)
```

---

## 2. Core Service Dependencies

| Workspace Package | Major Core Libraries | Purpose |
| :--- | :--- | :--- |
| **`@capmint/crypto`** | `libsodium-wrappers` | Ed25519 signatures generation & validation. |
| **`@capmint/database`** | `pg`, `pg-pool` | Client wrapper for connection pooling. |
| **`auth-service`** | `fastify`, `@fastify/jwt`, `bcryptjs` | User password verification and JWT signing. |
| **`cpq-service`** | `fastify`, `redis` | Limit budget checking and quota locks. |
| **`mint-service`** | `fastify`, `@capmint/crypto` | Serialization and check digit calculators. |
| **`resolver-service`** | `fastify`, `redis` | High-throughput GS1 redirects resolution. |
| **`transparency-service`**| `fastify` | Event hashing log execution. |
| **`verification-service`**| `fastify`, `redis`, `@capmint/crypto` | Telemetry capture and signature verifying. |
| **`integration-service`** | `fastify` | Proxy requests to external registries. |

---

## 3. Development & Build Tools

The monorepo uses a shared development environment configured at the root:

*   **TypeScript (`tsc`):** Strict compilation configurations across all workspaces.
*   **Vitest (`vitest`):** Fast test runner for all workspace unit and E2E validation scripts.
*   **ESLint & Prettier:** Standard code style and code format checks.
