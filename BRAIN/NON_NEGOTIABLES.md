# CapMint — Non-Negotiable Rules

> **Authority:** These rules are ABSOLUTE. No checkpoint, deadline, or convenience justifies violating them.  
> **Last Updated:** 2026-07-08  
> **Status:** Enforced — violations block merges and deployments  
> **Cross-References:**  
> - [AI_RULES.md](./AI_RULES.md) — AI agent behavioral rules  
> - [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) — system design  
> - [DECISIONS.md](./DECISIONS.md) — architecture decision records  
> - [PROJECT_BRAIN.md](./PROJECT_BRAIN.md) — central hub  
> - [../architecture/SECURITY_MODEL.md](../architecture/SECURITY_MODEL.md) — detailed security design

---

## Rule Index

| #   | Rule                         | Category      | Severity   |
| --- | ---------------------------- | ------------- | ---------- |
| NN-001 | Encryption at Rest & Transit | Security      | 🔴 Critical |
| NN-002 | OWASP Top 10 Compliance     | Security      | 🔴 Critical |
| NN-003 | JWT + OAuth 2.0 Auth         | Security      | 🔴 Critical |
| NN-004 | GS1 Standards Compliance     | Compliance    | 🔴 Critical |
| NN-005 | Immutable Transparency Logs  | Data Integrity| 🔴 Critical |
| NN-006 | 80% Test Coverage            | Quality       | 🟡 High     |
| NN-007 | Versioned APIs               | Compatibility | 🟡 High     |
| NN-008 | Checkpoint Discipline        | Process       | 🟡 High     |
| NN-009 | Mandatory Code Review        | Quality       | 🟡 High     |
| NN-010 | API p95 < 200ms              | Performance   | 🟡 High     |

---

## NN-001: Encryption at Rest and in Transit

### Rule
All data MUST be encrypted both at rest and in transit. No exceptions.

### Requirements

| Aspect             | Standard                                                      |
| ------------------ | ------------------------------------------------------------- |
| **In Transit**     | TLS 1.3 minimum for all HTTP, gRPC, and WebSocket connections |
| **At Rest (DB)**   | AES-256 encryption for PostgreSQL (via pgcrypto or disk-level)|
| **At Rest (Files)**| AES-256 for any file storage (S3 SSE-KMS or equivalent)       |
| **Key Management** | Keys stored in a managed KMS (AWS KMS / GCP KMS / HashiCorp Vault) |
| **Secrets**        | All secrets via environment variables or secret manager — NEVER in code |
| **QR Signatures**  | HMAC-SHA256 for QR code payload signing; RS256 for JWT tokens |

### Verification
- CI pipeline runs `tls-check` against all service endpoints.
- Database encryption is validated during infrastructure provisioning.
- Secret scanning (e.g., `gitleaks`) runs on every PR.

---

## NN-002: OWASP Top 10 Compliance

### Rule
Every service MUST be hardened against the [OWASP Top 10 (2021)](https://owasp.org/Top10/) vulnerabilities.

### Checklist

| OWASP Category                     | CapMint Mitigation                                         |
| ---------------------------------- | ---------------------------------------------------------- |
| A01 — Broken Access Control        | RBAC enforced at API gateway + service level               |
| A02 — Cryptographic Failures       | See NN-001; no weak ciphers, no MD5/SHA1                   |
| A03 — Injection                    | Parameterized queries (Prisma ORM); input validation (Zod) |
| A04 — Insecure Design              | Threat modeling per [SECURITY_MODEL.md](../architecture/SECURITY_MODEL.md) |
| A05 — Security Misconfiguration    | Hardened Docker images; no default credentials             |
| A06 — Vulnerable Components        | `npm audit` + Snyk/Dependabot on every CI run              |
| A07 — Auth Failures                | See NN-003; rate limiting, account lockout                  |
| A08 — Data Integrity Failures      | See NN-005; Merkle-tree verification for logs              |
| A09 — Logging & Monitoring Failures| Structured logging (OpenTelemetry); SIEM integration       |
| A10 — SSRF                         | URL allowlisting for external calls; no raw URL proxying   |

### Verification
- OWASP ZAP scan runs in CI on every `release/*` branch.
- Manual penetration test before every major version release.

---

## NN-003: JWT + OAuth 2.0 Authentication

### Rule
All API authentication MUST use JWT (RS256) with OAuth 2.0 (PKCE flow for public clients).

### Requirements

| Aspect                  | Standard                                                    |
| ----------------------- | ----------------------------------------------------------- |
| **Token Format**        | JWT signed with RS256 (RSA 2048-bit minimum)                |
| **Access Token TTL**    | 15 minutes maximum                                          |
| **Refresh Token TTL**   | 7 days, single-use with rotation                            |
| **Token Storage**       | httpOnly, Secure, SameSite=Strict cookies (web); secure storage (mobile) |
| **OAuth Flow**          | Authorization Code + PKCE for all public clients            |
| **Scopes**              | Fine-grained per-module scopes (e.g., `gs1:write`, `resolver:read`) |
| **RBAC Roles**          | `super_admin`, `brand_owner`, `distributor`, `inspector`, `consumer` |
| **API Keys**            | For M2M (machine-to-machine) — scoped, rotatable, rate-limited |
| **Session Invalidation**| Immediate on password change or account compromise          |

### Cross-Reference
- Detailed auth flows: [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) §5
- Auth architecture: [../architecture/SECURITY_MODEL.md](../architecture/SECURITY_MODEL.md)
- ADR: [DECISIONS.md](./DECISIONS.md) — ADR-005

---

## NN-004: GS1 Standards Compliance

### Rule
All product identifiers MUST conform to GS1 General Specifications v24.0 and GS1 Digital Link standard v1.3.

### Requirements

| Aspect                   | Standard                                                  |
| ------------------------ | --------------------------------------------------------- |
| **GTIN**                 | 14-digit GTIN with valid check digit (modulo-10)          |
| **SGTIN (serialised)**   | GTIN + unique serial number (AI 21)                       |
| **Digital Link URI**     | `https://id.capmint.com/01/{gtin}/21/{serial}?...`        |
| **Application Identifiers** | Full AI support: 01 (GTIN), 10 (batch), 17 (expiry), 21 (serial) |
| **Resolver Conformance** | GS1 Digital Link Resolver conformance level 1+            |
| **Validation**           | Every identifier is validated against GS1 check-digit and format rules before persistence |

### Verification
- GS1 validation suite runs in CI against every generated identifier.
- Resolver endpoint tested against GS1 conformance test suite.
- See ADR: [DECISIONS.md](./DECISIONS.md) — ADR-004

---

## NN-005: Immutable Transparency Logs

### Rule
The Transparency Log is append-only and tamper-evident. No log entry may be modified or deleted after creation.

### Requirements

| Aspect                  | Standard                                                    |
| ----------------------- | ----------------------------------------------------------- |
| **Append-Only**         | INSERT only — no UPDATE or DELETE on log tables              |
| **Merkle Tree**         | Log entries are chained via SHA-256 Merkle tree hashes       |
| **Tamper Detection**    | Periodic consistency proofs verify log integrity             |
| **Retention**           | Minimum 7 years (pharmaceutical regulatory requirement)      |
| **Audit Access**        | Regulators get read-only access via scoped API keys          |
| **Backup**              | Geographically redundant, encrypted backups every 6 hours    |

### Verification
- Database triggers prevent UPDATE/DELETE on `transparency_log` table.
- Nightly Merkle consistency check job with alerting.
- Backup restoration tested quarterly.

---

## NN-006: 80% Test Coverage

### Rule
Combined unit and integration test coverage MUST be ≥ 80% for every service. No PR is merged below this threshold.

### Requirements

| Test Layer      | Tool    | Minimum Coverage | Scope                              |
| --------------- | ------- | ---------------- | ---------------------------------- |
| **Unit**        | Jest    | ≥ 80% (lines)   | All business logic, utils, models  |
| **Integration** | Jest    | ≥ 70% (lines)   | All API endpoints, DB interactions |
| **E2E**         | Cypress | Critical paths   | Auth flows, scan-verify, dashboard |
| **Overall**     | —       | ≥ 80% (combined) | Per-service gate in CI             |

### Enforcement
- `jest --coverage --coverageThreshold='{"global":{"lines":80}}'` in CI.
- Coverage reports uploaded to PR comments.
- Coverage decrease → PR blocked.

### Cross-Reference
- [AI_RULES.md](./AI_RULES.md) §6.2

---

## NN-007: Versioned APIs

### Rule
All public APIs MUST be versioned. Breaking changes MUST increment the major version.

### Requirements

| Aspect              | Standard                                                    |
| ------------------- | ----------------------------------------------------------- |
| **Versioning Scheme**| URL path versioning: `/api/v1/...`, `/api/v2/...`          |
| **Deprecation**     | Minimum 6-month deprecation window before removal            |
| **Changelog**       | Every version change documented in API_CONTRACTS.md          |
| **Backward Compat** | Minor versions MUST be backward compatible                   |
| **OpenAPI Spec**    | Every version has a published OpenAPI 3.1 specification      |
| **GraphQL**         | Schema evolution via `@deprecated` directive; no field removal without deprecation |

### Verification
- OpenAPI diff tool runs on PRs touching API routes.
- Breaking change detection blocks merge without version bump.
- See: [../architecture/API_CONTRACTS.md](../architecture/API_CONTRACTS.md)

---

## NN-008: Checkpoint Discipline

### Rule
Work MUST proceed through checkpoints sequentially. No checkpoint may be skipped or worked on out of order.

### Requirements

- Checkpoints run CP-000 → CP-001 → ... → CP-020+ in strict order.
- Only one checkpoint is active at any time.
- A checkpoint is complete only when ALL tasks pass CI, tests, and code review.
- The active checkpoint is tracked in [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md).
- Checkpoint roadmap is defined in [../governance/MASTER_PLAN.md](../governance/MASTER_PLAN.md).

### Enforcement
- [AI_RULES.md](./AI_RULES.md) §2 governs checkpoint behavior for AI agents.
- PR titles must reference a checkpoint: `[CP-NNN] ...`.
- PRs referencing a non-active checkpoint are blocked.

---

## NN-009: Mandatory Code Review

### Rule
Every code change MUST be reviewed by at least one other contributor (human or AI reviewer with different context) before merging.

### Requirements

| Aspect                | Standard                                                   |
| --------------------- | ---------------------------------------------------------- |
| **Min Reviewers**     | 1 (2 for security-critical code)                            |
| **Review Scope**      | Code correctness, security, test coverage, documentation    |
| **Security Review**   | Any change to auth, crypto, or access control requires security-focused review |
| **Auto-Checks**       | Linter, type-checker, tests, coverage — all must pass before review |
| **Stale Reviews**     | Reviews invalidated by new pushes                           |

### Enforcement
- GitHub branch protection rules on `develop`, `release/*`, `main`.
- CODEOWNERS file for security-critical paths.

---

## NN-010: API Response Time — p95 < 200ms

### Rule
All API endpoints MUST respond within 200ms at the 95th percentile under normal load.

### Requirements

| Aspect              | Standard                                                     |
| ------------------- | ------------------------------------------------------------ |
| **p50 Target**      | < 50ms                                                       |
| **p95 Target**      | < 200ms                                                      |
| **p99 Target**      | < 500ms                                                      |
| **Load Profile**    | Tested at 2x expected peak traffic                           |
| **Measurement**     | OpenTelemetry traces, Prometheus histograms                  |
| **Alerting**        | Alert on p95 > 200ms sustained for 5 minutes                |
| **Caching**         | Redis caching for Resolver and GS1 lookups (TTL-based)       |
| **DB Optimization** | Query execution plans reviewed; indexes required for filtered queries |

### Verification
- Load testing (k6/Artillery) in CI for `release/*` branches.
- Grafana dashboards with p50/p95/p99 panels per service.
- Performance regression detection in PR CI pipeline.

### Cross-Reference
- Success metrics: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) §10
- Infrastructure: [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) §4

---

## Violation Protocol

When a non-negotiable rule is violated:

1. **CI blocks the merge** — automated enforcement where possible.
2. **Violation is logged** in [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) with severity `CRITICAL`.
3. **Immediate remediation** is required before any other work proceeds.
4. **Post-mortem** is filed for repeated violations.

> *These rules protect users, data, and the integrity of the authentication platform. They are the foundation on which trust is built.*

---

*Last reviewed: 2026-07-08 | Next scheduled review: CP-010 milestone*
