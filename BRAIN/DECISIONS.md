# CapMint — Architecture Decision Records (ADRs)

> **Purpose:** Immutable record of all significant architecture decisions with context, rationale, and consequences.  
> **Last Updated:** 2026-07-08  
> **Status:** Living Document — append-only (decisions are never deleted, only superseded)  
> **Cross-References:**  
> - [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) — system design shaped by these decisions  
> - [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — constraints enforced by these decisions  
> - [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — project scope and modules  
> - [DEPENDENCIES.md](./DEPENDENCIES.md) — dependencies chosen per these decisions  
> - [AI_RULES.md](./AI_RULES.md) — workflow rules (ADR-006, ADR-007)  
> - [PROJECT_BRAIN.md](./PROJECT_BRAIN.md) — central hub

---

## ADR Index

| ADR     | Title                              | Status     | Date       |
| ------- | ---------------------------------- | ---------- | ---------- |
| ADR-001 | TypeScript as Primary Language     | ✅ Accepted | 2026-07-08 |
| ADR-002 | PostgreSQL as Primary Database     | ✅ Accepted | 2026-07-08 |
| ADR-003 | Microservices Architecture         | ✅ Accepted | 2026-07-08 |
| ADR-004 | GS1 Digital Link Standard         | ✅ Accepted | 2026-07-08 |
| ADR-005 | JWT + OAuth 2.0 Authentication    | ✅ Accepted | 2026-07-08 |
| ADR-006 | AI-First Development Methodology  | ✅ Accepted | 2026-07-08 |
| ADR-007 | Sequential Checkpoint Execution   | ✅ Accepted | 2026-07-08 |

---

## ADR-001: TypeScript as Primary Language

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint requires a language for both backend services (Node.js) and frontend applications (React/Next.js). The codebase must be maintainable by a small team, facilitate AI-assisted development, and provide strong type safety for a security-critical platform. Candidates considered: TypeScript, Go, Python, Java.

### Decision

Use **TypeScript 5.x** with strict mode (`"strict": true`) as the primary language for all services, shared packages, and frontend applications.

### Consequences

**Positive:**
- **Full-stack type safety** — one language across backend, frontend, and shared packages reduces context switching and enables shared types.
- **Rich ecosystem** — npm provides mature libraries for GS1, QR, crypto, and web frameworks.
- **AI-friendly** — TypeScript is well-represented in AI training data, improving AI agent code generation quality.
- **Strict mode** catches null/undefined errors, implicit `any`, and type coercion bugs at compile time.
- **Monorepo synergy** — shared `@capmint/*` packages work seamlessly with TypeScript project references.

**Negative:**
- **Runtime performance** — Node.js is slower than Go/Java for CPU-bound tasks (e.g., batch QR generation). Mitigated by offloading to worker threads or job queues.
- **Type complexity** — Advanced TypeScript generics can become unreadable. Mitigated by code review standards in [AI_RULES.md](./AI_RULES.md) §6.
- **Single runtime** — Vendor lock to Node.js ecosystem. Acceptable given the full-stack benefits.

**Constraints Applied:**
- ESLint with `@typescript-eslint` recommended rules (see [AI_RULES.md](./AI_RULES.md) §6.1).
- Prettier for formatting (100 char width).
- `"strict": true` in all `tsconfig.json` files — no exceptions.

---

## ADR-002: PostgreSQL as Primary Database

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint needs a primary database for product identifiers, user accounts, scan events, and supply-chain records. Requirements: ACID transactions, relational integrity, JSON support for metadata, proven at scale, strong ecosystem. Candidates considered: PostgreSQL, MySQL, MongoDB, CockroachDB.

### Decision

Use **PostgreSQL 16** as the primary relational database for all services. Use **Prisma 5** as the ORM layer. Use **Redis 7** as a complementary cache and job queue backend.

### Consequences

**Positive:**
- **ACID guarantees** — essential for financial (CPQ), identity (GS1 Engine), and audit (Transparency Log) data.
- **JSONB support** — flexible metadata storage without schema migration for every field.
- **pgcrypto** — native encryption functions for sensitive data at rest ([NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) NN-001).
- **Mature replication** — proven HA with streaming replication and logical replication.
- **Prisma integration** — type-safe queries, auto-generated migrations, schema-as-code.

**Negative:**
- **Horizontal scaling** — PostgreSQL scales vertically more naturally than horizontally. Mitigated by read replicas and Redis caching for hot paths (Resolver, GS1 lookups).
- **Operational complexity** — requires DBA expertise for production tuning. Mitigated by managed services (RDS/Cloud SQL).

**Constraints Applied:**
- All queries via Prisma (parameterized — prevents SQL injection per NN-002).
- No raw SQL unless wrapped in Prisma `$queryRaw` with parameterized inputs.
- Redis for caching only — not as a source of truth.

---

## ADR-003: Microservices Architecture

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint has 12 distinct functional modules (see [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) §7). The system must scale individual components independently (Resolver under high scan load vs. CPQ with low traffic) and allow independent deployment cycles.

### Decision

Adopt a **microservices architecture** where each core module is an independently deployable service. Services communicate via REST/GraphQL (synchronous) and BullMQ job queues (asynchronous).

### Consequences

**Positive:**
- **Independent scaling** — Resolver (3–10 pods) scales independently from CPQ (1 pod). See [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) §6.3.
- **Independent deployment** — a bug fix in Clone Detection doesn't require redeploying the GS1 Engine.
- **Fault isolation** — a failing QR Generator doesn't take down the Resolver.
- **Team scalability** — different teams/agents can own different services.

**Negative:**
- **Operational complexity** — 12 services require orchestration (Kubernetes), service discovery, distributed tracing. Mitigated by Helm charts and OpenTelemetry.
- **Data consistency** — cross-service transactions are complex. Mitigated by saga patterns and eventual consistency where appropriate.
- **Local dev complexity** — running 12 services locally is heavy. Mitigated by `docker-compose.yml` and selective service startup.

**Constraints Applied:**
- Each service has its own Prisma schema (or schema subset).
- Inter-service communication is via well-defined REST/GraphQL APIs — no shared databases.
- Service contracts defined in [../architecture/API_CONTRACTS.md](../architecture/API_CONTRACTS.md).

---

## ADR-004: GS1 Digital Link as Product Identifier Standard

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint needs a universal product identification system that is globally unique, interoperable, machine-readable, and web-resolvable. Candidates considered: proprietary UUID system, GS1 GTIN + barcodes, GS1 Digital Link, custom blockchain-based IDs.

### Decision

Adopt **GS1 Digital Link standard v1.3** as the canonical product identifier format. All product identifiers are expressed as GS1 Digital Link URIs resolving to the CapMint Resolver service.

### Consequences

**Positive:**
- **Global interoperability** — GS1 is the de facto standard used by 2M+ companies in 116 countries.
- **Web-native** — Digital Links are HTTP URIs, scannable as QR codes and resolvable in any browser.
- **Regulatory acceptance** — GS1 identifiers satisfy EU FMD, US DSCSA, and other serialisation mandates.
- **Rich metadata** — Application Identifiers (AIs) carry batch, expiry, serial, and custom data within the URI.
- **Future-proof** — GS1 Digital Link is the successor to legacy barcodes, endorsed by major retailers.

**Negative:**
- **GS1 membership** — brand owners need GS1 company prefixes (cost). CapMint can broker or facilitate.
- **URI complexity** — Digital Link URIs are longer than simple UUIDs. Mitigated by QR code capacity.
- **Standard rigidity** — must conform strictly to GS1 specs; no shortcuts. Enforced by [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) NN-004.

**Constraints Applied:**
- GS1 validation suite runs in CI.
- Resolver conforms to GS1 Resolver conformance level 1+.
- URI format: `https://id.capmint.com/01/{gtin}/21/{serial}?10={batch}&17={expiry}`

---

## ADR-005: JWT + OAuth 2.0 Authentication

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint serves multiple client types: consumer PWA (public), brand dashboard (confidential), regulator portal (confidential), M2M integrations (service accounts). The auth system must support all client types, provide fine-grained access control, and be standards-based.

### Decision

Use **JWT (RS256)** for token-based authentication and **OAuth 2.0 with PKCE** for authorization flows. Implement **RBAC** with fine-grained scopes per module.

### Consequences

**Positive:**
- **Stateless verification** — JWTs are verified at the API gateway without calling the Security service, reducing latency.
- **Standards-based** — OAuth 2.0 + PKCE is the industry standard for public and confidential clients.
- **RS256 signing** — asymmetric keys mean services only need the public key to verify tokens.
- **Fine-grained scopes** — `gs1:write`, `resolver:read`, `dashboard:admin` enable precise RBAC.
- **M2M support** — API keys with client credentials grant for machine-to-machine integrations.

**Negative:**
- **Token revocation** — JWTs can't be revoked before expiry without a blocklist. Mitigated by short TTL (15 min) and refresh token rotation.
- **Key management** — RS256 requires secure key storage. Mitigated by KMS ([NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) NN-001).
- **Complexity** — OAuth 2.0 flows are complex to implement correctly. Mitigated by Passport.js and battle-tested libraries.

**Constraints Applied:**
- Access token TTL: 15 minutes max.
- Refresh tokens: single-use with rotation, 7-day max TTL.
- All tokens stored in httpOnly, Secure, SameSite=Strict cookies.
- Detailed requirements: [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) NN-003.

---

## ADR-006: AI-First Development Methodology

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint is developed primarily with AI coding agents. The development methodology must ensure AI agents produce consistent, high-quality, well-documented code that adheres to project standards. Traditional agile methodologies (Scrum, Kanban) don't account for AI agent behavior.

### Decision

Adopt an **AI-first, document-governed** development methodology where:
- The `BRAIN/` directory is the single source of truth for all project governance.
- AI agents follow a strict read-plan-implement-update loop (The Golden Loop).
- All work is checkpoint-driven (see ADR-007).
- Pre-task and post-task checklists are mandatory.

### Consequences

**Positive:**
- **Consistency** — AI agents produce uniform output by reading the same governance docs before every task.
- **Traceability** — every change is linked to a checkpoint task, logged in CHANGELOG, and reflected in CURRENT_STATE.
- **Quality** — mandatory post-task updates ensure documentation never drifts from code.
- **Onboarding** — new AI agents (or humans) can start by reading PROJECT_BRAIN.md.

**Negative:**
- **Overhead** — reading 5 docs and updating 6 docs per task adds time. Accepted as the cost of quality.
- **Document drift risk** — if updates are skipped, governance docs become unreliable. Mitigated by making updates non-negotiable (see [AI_RULES.md](./AI_RULES.md) §3).
- **Rigidity** — the methodology is prescriptive. Flexibility comes from checkpoint task design, not process deviation.

**Constraints Applied:**
- The Golden Loop is defined in [PROJECT_BRAIN.md](./PROJECT_BRAIN.md) §2.
- Rules are enforced in [AI_RULES.md](./AI_RULES.md).
- Violations are logged and flagged.

---

## ADR-007: Sequential Checkpoint Execution

**Status:** ✅ Accepted  
**Date:** 2026-07-08  
**Deciders:** Founding team

### Context

CapMint has 20+ checkpoints spanning foundation, core services, integration, frontend, extensions, and hardening. Parallel execution across checkpoints risks incomplete foundations (e.g., building the Resolver before the GS1 Engine is stable), inconsistent states, and architectural drift.

### Decision

Enforce **strict sequential execution** of checkpoints: CP-000 → CP-001 → ... → CP-020+. Only one checkpoint is active at a time. A checkpoint cannot be advanced until all its tasks are complete and verified.

### Consequences

**Positive:**
- **Solid foundations** — each checkpoint builds on a verified, complete predecessor.
- **Clear progress** — ACTIVE_CHECKPOINT.md always shows exactly where the project stands.
- **Reduced rework** — completing infrastructure before services, and services before frontends, minimizes integration issues.
- **Predictable velocity** — checkpoint durations become a reliable planning metric over time.

**Negative:**
- **No parallelism** — tasks within a checkpoint can be parallel, but cross-checkpoint work is blocked. Accepted to prevent foundation gaps.
- **Bottlenecks** — a blocked task blocks the entire checkpoint. Mitigated by task decomposition and blocker escalation protocol (see [AI_RULES.md](./AI_RULES.md) §8).
- **Perceived slowness** — stakeholders may want to see frontend work before backend is complete. Mitigated by mockups and design-only frontrunning in earlier checkpoints.

**Constraints Applied:**
- Checkpoint roadmap: [../governance/MASTER_PLAN.md](../governance/MASTER_PLAN.md)
- Active checkpoint tracking: [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md)
- Enforcement rules: [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) NN-008
- AI behavior: [AI_RULES.md](./AI_RULES.md) §2

---

## Template for Future ADRs

```markdown
## ADR-NNN: [Title]

**Status:** 🟡 Proposed | ✅ Accepted | ❌ Rejected | 🔄 Superseded by ADR-XXX
**Date:** YYYY-MM-DD
**Deciders:** [who]

### Context
[What is the issue? What forces are at play?]

### Decision
[What is the change being proposed or made?]

### Consequences
**Positive:**
- [benefit 1]
- [benefit 2]

**Negative:**
- [tradeoff 1]
- [tradeoff 2]

**Constraints Applied:**
- [link to affected doc]
```

---

## Decision Log Protocol

1. **Proposing:** Set status to `🟡 Proposed`. Document context and decision. Tag for human review.
2. **Accepting:** Human changes status to `✅ Accepted`. Implementation may begin.
3. **Rejecting:** Human changes status to `❌ Rejected`. Document reason in Consequences.
4. **Superseding:** New ADR is created. Old ADR status updated to `🔄 Superseded by ADR-XXX`.
5. **Never delete an ADR.** History is immutable.

Cross-reference: [AI_RULES.md](./AI_RULES.md) §5 — Architecture Immutability rules.

---

*This log is append-only. Decisions shape the architecture; the architecture is documented in [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md).*
