# CapMint — Dependency Manifest

> **Purpose:** Single source of truth for all project dependencies — runtime, dev, infrastructure, and external.  
> **Last Updated:** 2026-07-08  
> **Status:** Living Document — updated at every checkpoint when dependencies change  
> **Cross-References:**  
> - [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) — visual inter-module dependency graph  
> - [../governance/TECH_DEBT.md](../governance/TECH_DEBT.md) — debt related to dependency upgrades  
> - [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) — system design context  
> - [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — security scanning requirements (NN-002, NN-006)  
> - [DECISIONS.md](./DECISIONS.md) — ADRs justifying technology choices

---

## 1. Runtime Dependencies (Production)

### 1.1 Core Platform

| Package                | Version (Pinned) | Purpose                                  | ADR Ref   |
| ---------------------- | ---------------- | ---------------------------------------- | --------- |
| `typescript`           | `~5.5.0`         | Language — strict mode enforced           | ADR-001   |
| `node` (runtime)       | `20.x LTS`       | Server runtime                            | ADR-001   |
| `express`              | `~4.21.0`        | HTTP server framework                     | —         |
| `@apollo/server`       | `~4.11.0`        | GraphQL server                            | —         |
| `graphql`              | `~16.9.0`        | GraphQL schema language                   | —         |
| `prisma`               | `~5.20.0`        | ORM — PostgreSQL                          | ADR-002   |
| `@prisma/client`       | `~5.20.0`        | Generated DB client                       | ADR-002   |
| `ioredis`              | `~5.4.0`         | Redis client (cache, queues, sessions)    | —         |
| `bullmq`               | `~5.13.0`        | Job queue (Redis-backed)                  | —         |
| `zod`                  | `~3.23.0`        | Runtime schema validation                 | —         |

### 1.2 Authentication & Security

| Package                | Version (Pinned) | Purpose                                  | ADR Ref   |
| ---------------------- | ---------------- | ---------------------------------------- | --------- |
| `jsonwebtoken`         | `~9.0.0`         | JWT signing and verification (RS256)     | ADR-005   |
| `passport`             | `~0.7.0`         | Auth middleware framework                 | ADR-005   |
| `passport-oauth2`      | `~1.8.0`         | OAuth 2.0 strategy                        | ADR-005   |
| `bcryptjs`             | `~2.4.3`         | Password hashing                          | —         |
| `helmet`               | `~8.0.0`         | HTTP security headers                     | —         |
| `cors`                 | `~2.8.5`         | CORS middleware                           | —         |
| `express-rate-limit`   | `~7.4.0`         | Rate limiting                             | —         |
| `csurf`                | `~1.11.0`        | CSRF protection                           | —         |

### 1.3 GS1 & QR

| Package                | Version (Pinned) | Purpose                                  | ADR Ref   |
| ---------------------- | ---------------- | ---------------------------------------- | --------- |
| `qrcode`               | `~1.5.4`         | QR code generation                        | —         |
| `sharp`                | `~0.33.0`        | Image processing (QR branding/overlay)    | —         |
| `crypto` (Node built-in)| —               | HMAC-SHA256 for QR signatures             | —         |
| *Custom: `@capmint/gs1-engine`* | `workspace` | GS1 Digital Link minting & validation | ADR-004   |

### 1.4 Frontend

| Package                | Version (Pinned) | Purpose                                  | ADR Ref   |
| ---------------------- | ---------------- | ---------------------------------------- | --------- |
| `react`                | `~18.3.0`        | UI library                                | —         |
| `react-dom`            | `~18.3.0`        | React DOM renderer                        | —         |
| `next`                 | `~14.2.0`        | React framework (App Router)              | —         |
| `@tanstack/react-query`| `~5.56.0`       | Server state management                   | —         |
| `recharts`             | `~2.13.0`        | Dashboard charting                        | —         |
| `lucide-react`         | `~0.441.0`       | Icon library                              | —         |

### 1.5 Observability

| Package                | Version (Pinned) | Purpose                                  |
| ---------------------- | ---------------- | ---------------------------------------- |
| `@opentelemetry/api`   | `~1.9.0`         | Distributed tracing API                   |
| `@opentelemetry/sdk-node` | `~0.53.0`     | OTel Node SDK                             |
| `pino`                 | `~9.4.0`         | Structured JSON logging                   |
| `pino-pretty`          | `~11.2.0`        | Dev log formatting                        |

---

## 2. Development Dependencies

| Package                | Version (Pinned) | Purpose                                  |
| ---------------------- | ---------------- | ---------------------------------------- |
| `jest`                 | `~29.7.0`        | Unit & integration testing                |
| `ts-jest`              | `~29.2.0`        | TypeScript Jest transformer               |
| `@types/jest`          | `~29.5.0`        | Jest type definitions                     |
| `cypress`              | `~13.14.0`       | E2E testing                               |
| `supertest`            | `~7.0.0`         | HTTP assertion library for integration tests |
| `eslint`               | `~9.10.0`        | Linting                                   |
| `@typescript-eslint/eslint-plugin` | `~8.6.0` | TypeScript ESLint rules             |
| `prettier`             | `~3.3.0`         | Code formatting                           |
| `husky`                | `~9.1.0`         | Git hooks (pre-commit, pre-push)          |
| `lint-staged`          | `~15.2.0`        | Run linters on staged files               |
| `tsx`                  | `~4.19.0`        | TypeScript execution (scripts)            |
| `nodemon`              | `~3.1.0`         | Development file watcher                  |
| `@faker-js/faker`      | `~9.0.0`         | Test data generation                      |
| `msw`                  | `~2.4.0`         | API mocking for tests                     |

---

## 3. Infrastructure Dependencies

| Component              | Version / Service | Purpose                                  |
| ---------------------- | ----------------- | ---------------------------------------- |
| **PostgreSQL**         | 16.x              | Primary relational database               |
| **Redis**              | 7.x               | Caching, session store, job queues        |
| **Docker**             | 27.x              | Container runtime                         |
| **Kubernetes**         | 1.30+              | Container orchestration                   |
| **Helm**               | 3.x               | K8s package management                    |
| **Terraform**          | 1.9+               | Infrastructure as Code                    |
| **Nginx Ingress**      | 1.11+              | K8s ingress controller                    |
| **cert-manager**       | 1.15+              | TLS certificate automation                |
| **GitHub Actions**     | —                  | CI/CD pipeline                            |

### Infrastructure Architecture
See [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) §4 for deployment topology.

---

## 4. External Services

| Service                | Purpose                                  | Required | Fallback          |
| ---------------------- | ---------------------------------------- | -------- | ----------------- |
| **AWS KMS / GCP KMS**  | Key management for JWT signing, QR HMAC  | Yes      | HashiCorp Vault   |
| **AWS S3 / GCS**       | QR image storage, backup storage         | Yes      | MinIO (self-host) |
| **SendGrid / SES**     | Transactional email                       | Yes      | Mailgun           |
| **Twilio**             | SMS verification (optional)               | No       | —                 |
| **Sentry**             | Error tracking                            | Yes      | Self-hosted Sentry|
| **Snyk / Dependabot**  | Dependency vulnerability scanning         | Yes      | `npm audit`       |
| **GS1 GDSN**           | GS1 registry sync (future)               | No       | Manual entry      |

---

## 5. Inter-Module Dependencies

This matrix shows which CapMint modules depend on which other modules. See [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) for the visual graph.

| Module             | Depends On                                                    |
| ------------------ | ------------------------------------------------------------- |
| **CPQ**            | Security                                                      |
| **GS1 Engine**     | Security, PostgreSQL                                          |
| **QR Generator**   | GS1 Engine, Security                                          |
| **Resolver**       | GS1 Engine, Transparency Log, Clone Detection, Security, Redis|
| **Transparency Log** | Security, PostgreSQL                                        |
| **Clone Detection** | Transparency Log, Security, Redis                            |
| **Revocation**     | GS1 Engine, Transparency Log, Security                        |
| **Dashboard**      | All services (read-only aggregation), Security                |
| **PWA**            | Resolver, Security                                            |
| **TraceNet**       | GS1 Engine, Transparency Log, Security                        |
| **AgriStack**      | GS1 Engine, TraceNet, Security                                |
| **Security**       | PostgreSQL, Redis (sessions), KMS (keys)                      |

---

## 6. Version Pinning Policy

| Rule                                                          | Enforcement                          |
| ------------------------------------------------------------- | ------------------------------------ |
| All deps use **tilde (`~`) pinning** for patch-level updates  | `package.json` validation in CI       |
| **Lock files** (`package-lock.json`) MUST be committed        | `.gitignore` check in CI              |
| Major version bumps require an **ADR** in [DECISIONS.md](./DECISIONS.md) | PR review checklist        |
| Minor version bumps require **test pass confirmation**        | CI gate                               |
| No `*` or `latest` version specifiers                         | ESLint rule / CI check                |
| Lock file integrity verified on every CI run                  | `npm ci` (not `npm install`)          |

---

## 7. Security Scanning

| Scan Type                  | Tool                | Frequency              | Blocks Merge? |
| -------------------------- | ------------------- | ---------------------- | ------------- |
| **Dependency Audit**       | `npm audit`         | Every CI run            | Yes (critical/high) |
| **Vulnerability Scan**     | Snyk / Dependabot   | Daily + every PR        | Yes (critical) |
| **Secret Detection**       | gitleaks            | Every PR                | Yes            |
| **License Compliance**     | license-checker     | Weekly + release builds | Yes (GPL in prod) |
| **Container Scan**         | Trivy               | Every Docker build      | Yes (critical) |
| **SAST (Static Analysis)** | CodeQL / Semgrep    | Every PR                | Yes (high+)    |

### Vulnerability Response SLA

| Severity   | Response Time  | Resolution Time |
| ---------- | -------------- | --------------- |
| Critical   | 4 hours        | 24 hours        |
| High       | 24 hours       | 1 week          |
| Medium     | 1 week         | 1 month         |
| Low        | 1 month        | Next release    |

---

## 8. Dependency Addition Protocol

When adding a new dependency:

1. **Justify:** Document why it's needed (no "nice to have" in production deps).
2. **Evaluate:** Check bundle size, maintenance status, license, security history.
3. **Pin:** Add with tilde pinning (`~x.y.z`).
4. **Document:** Add to this file in the appropriate section.
5. **Update graph:** Update [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) if inter-module deps change.
6. **Scan:** Verify `npm audit` and Snyk pass with the new dep.
7. **Review:** Include dependency justification in the PR description.

---

*This manifest is authoritative. If a dependency is used in code but not listed here, it is unauthorized and must be added or removed.*
