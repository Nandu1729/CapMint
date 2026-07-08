# CapMint — Project Context

> **Document Owner:** BRAIN/  
> **Last Updated:** 2026-07-08  
> **Status:** Living Document — updated at every checkpoint transition  
> **Cross-References:**  
> - [CURRENT_STATE.md](./CURRENT_STATE.md)  
> - [CHANGELOG.md](./CHANGELOG.md)  
> - [MASTER_PLAN.md](../governance/MASTER_PLAN.md)  
> - [ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md)  
> - [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md)  
> - [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md)

---

## 1. Project Identity

| Field            | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| **Name**         | CapMint                                                      |
| **Tagline**      | *Authenticate Everything. Counterfeit Nothing.*               |
| **Type**         | AI-First Anti-Counterfeiting & Product Authentication Platform |
| **License**      | Proprietary (core) / MIT (select SDK modules)                |
| **Repository**   | `CapMint` monorepo                                           |
| **Primary Lang** | TypeScript (Node.js runtime)                                 |

---

## 2. Mission

Eliminate counterfeit products from global supply chains by providing an accessible, standards-compliant, AI-powered authentication platform that any manufacturer — from multinational pharma to smallholder agri-cooperatives — can deploy in under 48 hours.

## 3. Vision

A world where every physical product carries a cryptographically verifiable digital identity, consumers can authenticate with a single scan, and supply-chain actors share an immutable, privacy-respecting transparency ledger that makes counterfeiting economically unviable.

---

## 4. Problem Statement

### 4.1 Scale of Counterfeiting

- **$4.2 trillion** — estimated global economic impact of counterfeiting and piracy (OECD/EUIPO 2025 projection).
- **1 million+ deaths annually** attributed to counterfeit pharmaceuticals (WHO).
- Counterfeit goods represent **~3.3%** of world trade.

### 4.2 Why Existing Solutions Fail

| Gap                          | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| **Fragmented Standards**     | Proprietary tagging systems create vendor lock-in and interop failures.     |
| **Static Identifiers**       | Barcodes and serial numbers are trivially cloned.                           |
| **No Consumer Access**       | Verification is restricted to supply-chain insiders; end-users are blind.   |
| **No Clone Detection**       | Systems verify *validity* but not *uniqueness* — a cloned code still passes.|
| **Opaque Supply Chains**     | No shared, tamper-evident log exists across actors.                         |
| **High Deployment Cost**     | Enterprise authentication platforms price out SMEs and emerging markets.    |

### 4.3 Regulatory Pressure

- EU Falsified Medicines Directive (FMD) mandates serialisation.
- US DSCSA requires full electronic tracing by 2025+.
- India's TrackAndTrace for pharma exports.
- GS1 Digital Link adopted as the universal product identifier standard.

---

## 5. Solution Overview

CapMint is an **end-to-end authentication platform** built on four pillars:

### Pillar 1 — Standards-First Identity (GS1 Engine)

Every product is assigned a globally unique GS1 Digital Link URI. The GS1 Engine mints GTINs, SGTINs, batch/lot identifiers, and expiry metadata conforming to GS1 General Specifications v24.0.

### Pillar 2 — Secure, Intelligent QR Codes

The QR Generator produces cryptographically signed QR codes embedding the GS1 Digital Link, a short-lived HMAC signature, and a scan-counter nonce. Codes are designed to be visually distinctive (branded micro-logos) and resistant to photocopying.

### Pillar 3 — Clone Detection & Transparency Logs

Every scan event is recorded in an append-only Transparency Log. The Clone Detection engine applies AI-driven anomaly models (geo-velocity, scan frequency, device fingerprint clustering) to flag duplicated codes in real time.

### Pillar 4 — Consumer & Supply-Chain Verification

The Resolver service translates any GS1 Digital Link scan into a rich verification response — authenticity verdict, product metadata, provenance history — delivered via the PWA or API. TraceNet provides B2B supply-chain traceability; AgriStack extends this to agriculture with farm-to-fork tracking.

---

## 6. Target Users

| Persona                     | Needs                                                        |
| --------------------------- | ------------------------------------------------------------ |
| **Brand Owner / Manufacturer** | Protect brand, comply with regulations, track distribution |
| **Distributor / Wholesaler**   | Verify inbound goods, maintain chain of custody             |
| **Retailer / Pharmacist**      | Authenticate stock at point of sale                         |
| **Consumer**                   | One-scan verification, provenance transparency              |
| **Regulator / Inspector**      | Audit trail access, recall coordination                     |
| **Agri-Cooperative**           | Farm-to-fork traceability, export compliance                |

---

## 7. Core Modules

Each module maps to a bounded microservice context. See [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) for service topology.

| Module               | Responsibility                                                              |
| -------------------- | --------------------------------------------------------------------------- |
| **CPQ**              | Configure-Price-Quote engine for onboarding, subscription, and billing.     |
| **GS1 Engine**       | GS1 Digital Link minting, GTIN management, identifier lifecycle.           |
| **QR Generator**     | Cryptographic QR code generation with HMAC signatures and branding.        |
| **Resolver**         | GS1 Digital Link resolution, verification API, product metadata delivery.  |
| **Transparency Log** | Append-only, Merkle-tree-backed event ledger for scan and lifecycle events. |
| **Clone Detection**  | AI anomaly engine — geo-velocity, frequency, device clustering.            |
| **Revocation**       | Identifier revocation, recall management, expiry enforcement.              |
| **Dashboard**        | Brand-owner analytics, threat maps, scan heatmaps, alert management.       |
| **PWA**              | Consumer-facing progressive web app for scan-and-verify.                   |
| **TraceNet**         | B2B supply-chain traceability — custody transfer, shipment tracking.       |
| **AgriStack**        | Agriculture extension — farm registration, harvest lots, export certs.     |
| **Security**         | AuthN/AuthZ (JWT + OAuth2), RBAC, API gateway, rate limiting, WAF.         |

---

## 8. Technology Stack

| Layer              | Technology                                      |
| ------------------ | ----------------------------------------------- |
| **Runtime**        | Node.js 20 LTS, TypeScript 5.x (strict mode)   |
| **Frontend**       | React 18, Next.js 14 (App Router), PWA          |
| **API**            | REST (OpenAPI 3.1) + GraphQL (Apollo Server 4)  |
| **Database**       | PostgreSQL 16 (primary), Redis 7 (cache/queue)  |
| **ORM / Query**    | Prisma 5 (PostgreSQL), ioredis (Redis)          |
| **Auth**           | JWT (RS256) + OAuth 2.0 (PKCE), RBAC middleware |
| **Testing**        | Jest (unit/integration), Cypress (E2E)          |
| **CI/CD**          | GitHub Actions → Docker → Kubernetes (Helm)     |
| **Observability**  | OpenTelemetry, Prometheus, Grafana, Loki        |
| **Infrastructure** | Docker, Kubernetes (EKS/GKE), Terraform         |

Full dependency manifest: [DEPENDENCIES.md](./DEPENDENCIES.md)

---

## 9. AI-First Methodology

CapMint is developed using an **AI-first, checkpoint-driven** methodology. All development is orchestrated through this BRAIN/ directory.

### 9.1 Principles

1. **AI reads before it writes.** Every task begins by consulting PROJECT_CONTEXT, CURRENT_STATE, ACTIVE_CHECKPOINT, NON_NEGOTIABLES, and AI_RULES.
2. **Checkpoints are sacred.** Work proceeds sequentially from CP-000 (Foundation) through CP-020+. No checkpoint is skipped. See [state/ACTIVE_CHECKPOINT.md](./state/ACTIVE_CHECKPOINT.md).
3. **Documents are the source of truth.** If it's not in BRAIN/, it doesn't govern the project.
4. **Post-task updates are mandatory.** After every task, the AI updates CURRENT_STATE, CHANGELOG, ACTIVE_CHECKPOINT, DECISIONS (if applicable), DEPENDENCY_GRAPH, and TECH_DEBT.
5. **Architecture is immutable unless an ADR is filed.** See [DECISIONS.md](./DECISIONS.md).

### 9.2 Checkpoint Progression

| Range       | Phase                  |
| ----------- | ---------------------- |
| CP-000–003  | Foundation & Scaffold  |
| CP-004–007  | Core Services          |
| CP-008–011  | Integration & Security |
| CP-012–015  | Frontend & PWA         |
| CP-016–018  | TraceNet & AgriStack   |
| CP-019–020+ | Hardening & Launch     |

Detailed checkpoint definitions live in [MASTER_PLAN.md](../governance/MASTER_PLAN.md).

---

## 10. Success Metrics

| Metric                        | Target                |
| ----------------------------- | --------------------- |
| API p95 latency               | < 200 ms              |
| Clone detection precision     | ≥ 95%                 |
| Test coverage                 | ≥ 80% (unit + integ)  |
| QR scan-to-verdict time       | < 1.5 s (mobile PWA)  |
| GS1 conformance               | 100% (validation suite)|
| Uptime SLA                    | 99.9%                 |

---

*This document is the canonical source of project identity and scope. All other BRAIN/ documents derive context from it.*
