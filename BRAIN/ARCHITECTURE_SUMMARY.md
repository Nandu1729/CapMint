# CapMint — Architecture Summary

> **Purpose:** High-level architecture overview for all contributors and AI agents.  
> **Last Updated:** 2026-07-08  
> **Status:** Living Document — updated when ADRs change the architecture  
> **Cross-References:**  
> - [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — project scope and modules  
> - [DECISIONS.md](./DECISIONS.md) — ADRs justifying architecture choices  
> - [DEPENDENCIES.md](./DEPENDENCIES.md) — dependency manifest  
> - [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — immutable constraints  
> - [../governance/DEPENDENCY_GRAPH.md](../governance/DEPENDENCY_GRAPH.md) — inter-module graph  
> - [../architecture/SERVICE_MAP.md](../architecture/SERVICE_MAP.md) — detailed service contracts  
> - [../architecture/DATA_MODEL.md](../architecture/DATA_MODEL.md) — database schemas  
> - [../architecture/SECURITY_MODEL.md](../architecture/SECURITY_MODEL.md) — security design  
> - [../architecture/API_CONTRACTS.md](../architecture/API_CONTRACTS.md) — API specifications  
> - [../architecture/INFRA.md](../architecture/INFRA.md) — infrastructure as code

---

## 1. Architecture Principles

| Principle                     | Rationale                                                    |
| ----------------------------- | ------------------------------------------------------------ |
| **Microservices**             | Bounded contexts per module; independent deploy & scale (ADR-003) |
| **API-First**                 | REST + GraphQL; contracts defined before implementation       |
| **Standards-First**           | GS1 Digital Link as the universal product identifier (ADR-004)|
| **Security-by-Default**       | Zero-trust; encrypt everything; validate everything           |
| **Observability-Everywhere**  | OpenTelemetry traces, Prometheus metrics, structured logs     |
| **Immutable Audit Trail**     | Append-only transparency log with Merkle proofs               |
| **AI-First Development**      | Checkpoint-driven, document-governed development (ADR-006)    |

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTERNAL CLIENTS                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Consumer │  │  Brand   │  │Regulator │  │  3rd-Party   │    │
│  │   PWA    │  │Dashboard │  │  Portal  │  │  Integrator  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
└───────┼──────────────┼──────────────┼──────────────┼────────────┘
        │              │              │              │
   ┌────▼──────────────▼──────────────▼──────────────▼────┐
   │                   API GATEWAY / INGRESS               │
   │         (Nginx Ingress + Rate Limiting + TLS)         │
   │         Auth: JWT validation, RBAC enforcement         │
   └────┬──────────────┬──────────────┬──────────────┬────┘
        │              │              │              │
   ┌────▼────┐   ┌─────▼────┐  ┌─────▼─────┐  ┌────▼─────┐
   │Security │   │Resolver  │  │ Dashboard │  │   CPQ    │
   │ Service │   │ Service  │  │  Service  │  │ Service  │
   └────┬────┘   └─────┬────┘  └─────┬─────┘  └────┬─────┘
        │              │              │              │
   ┌────▼────┐   ┌─────▼────┐  ┌─────▼─────┐  ┌────▼─────┐
   │GS1      │   │Clone     │  │TraceNet   │  │AgriStack │
   │Engine   │   │Detection │  │ Service   │  │ Service  │
   └────┬────┘   └─────┬────┘  └─────┬─────┘  └────┬─────┘
        │              │              │              │
   ┌────▼────┐   ┌─────▼────┐  ┌─────▼─────────────▼─────┐
   │QR       │   │Revocation│  │  Transparency Log        │
   │Generator│   │ Service  │  │  Service                 │
   └─────────┘   └──────────┘  └──────────────────────────┘
        │              │              │
   ┌────▼──────────────▼──────────────▼────┐
   │           DATA LAYER                   │
   │  ┌────────────┐    ┌────────────┐      │
   │  │ PostgreSQL │    │   Redis    │      │
   │  │   (Primary)│    │(Cache/Queue│      │
   │  └────────────┘    └────────────┘      │
   └────────────────────────────────────────┘
```

---

## 3. Core Services

### 3.1 Service Catalog

| Service              | Type       | Port  | API           | Database       | Description                                    |
| -------------------- | ---------- | ----- | ------------- | -------------- | ---------------------------------------------- |
| **Security**         | Core       | 3001  | REST          | PostgreSQL     | AuthN/AuthZ, JWT issuance, RBAC, user mgmt     |
| **GS1 Engine**       | Core       | 3002  | REST+GraphQL  | PostgreSQL     | GTIN minting, Digital Link generation           |
| **QR Generator**     | Core       | 3003  | REST          | Redis (cache)  | Cryptographic QR creation with HMAC signing     |
| **Resolver**         | Core       | 3004  | REST          | PostgreSQL+Redis| GS1 Digital Link resolution, verification      |
| **Transparency Log** | Core       | 3005  | REST+GraphQL  | PostgreSQL     | Append-only event ledger, Merkle proofs         |
| **Clone Detection**  | Core       | 3006  | REST          | PostgreSQL+Redis| AI anomaly detection, geo-velocity analysis    |
| **Revocation**       | Core       | 3007  | REST          | PostgreSQL     | Identifier revocation, recall management        |
| **CPQ**              | Business   | 3008  | REST          | PostgreSQL     | Subscription, billing, onboarding               |
| **Dashboard**        | Frontend   | 3009  | GraphQL       | —(aggregates)  | Analytics, threat maps, alert management        |
| **TraceNet**         | Extension  | 3010  | REST+GraphQL  | PostgreSQL     | B2B supply-chain traceability                   |
| **AgriStack**        | Extension  | 3011  | REST          | PostgreSQL     | Agriculture: farm-to-fork tracking              |
| **PWA**              | Frontend   | 3000  | —             | —              | Consumer scan-and-verify progressive web app    |

Detailed service definitions: [../architecture/SERVICE_MAP.md](../architecture/SERVICE_MAP.md)

### 3.2 Shared Packages

| Package                    | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `@capmint/common`          | Shared types, constants, error classes, utilities    |
| `@capmint/gs1-engine`      | GS1 validation, check-digit, Digital Link parsing    |
| `@capmint/auth-middleware`  | JWT validation, RBAC middleware, scope checking     |
| `@capmint/logger`          | Structured logging (pino + OpenTelemetry context)    |
| `@capmint/db`              | Prisma client, migrations, seed utilities            |
| `@capmint/test-utils`      | Test factories, mocks, fixtures                     |

---

## 4. Data Flow — Product Lifecycle

The core data flow follows a product from registration through consumer verification:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. REGISTER │────▶│  2. MINT     │────▶│  3. GENERATE │
│  Product via │     │  GS1 GTIN +  │     │  QR Code     │
│  CPQ / API   │     │  Digital Link│     │  (signed)    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  6. LOG      │◀────│  5. VERIFY   │◀────│  4. DISTRIBUTE│
│  Scan event  │     │  Resolve +   │     │  Product to  │
│  in Transp.  │     │  Authenticate│     │  supply chain│
│  Log         │     │  via Resolver│     │              │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│  7. DETECT   │────▶│  8. ALERT    │
│  Clones via  │     │  Brand owner │
│  AI anomaly  │     │  via Dashboard│
│  engine      │     │              │
└──────────────┘     └──────────────┘
```

### Step-by-Step Flow

| Step | Actor              | Service          | Action                                                     |
| ---- | ------------------ | ---------------- | ---------------------------------------------------------- |
| 1    | Brand Owner        | CPQ              | Registers product catalog and subscription plan             |
| 2    | System             | GS1 Engine       | Mints GTIN + serial → GS1 Digital Link URI                 |
| 3    | System             | QR Generator     | Generates HMAC-signed QR code with embedded Digital Link    |
| 4    | Brand Owner        | —                | Applies QR to packaging; distributes through supply chain   |
| 5    | Consumer/Inspector | Resolver         | Scans QR → Resolver validates signature, returns verdict    |
| 6    | System             | Transparency Log | Records scan event (timestamp, geo, device, result)         |
| 7    | System             | Clone Detection  | Analyzes scan patterns for anomalies (geo-velocity, freq)   |
| 8    | System             | Dashboard        | Alerts brand owner if clone detected; shows threat map      |

---

## 5. Security Architecture

### 5.1 Authentication & Authorization Flow

```
Client ──▶ API Gateway ──▶ Security Service
  │            │                  │
  │  TLS 1.3   │  JWT Validation  │  Token Issuance
  │            │  RBAC Check      │  OAuth 2.0 + PKCE
  │            │  Rate Limiting   │  Refresh Rotation
  │            │                  │
  └────────────┴──────────────────┘
```

### 5.2 Security Layers

| Layer                    | Component               | Purpose                                    |
| ------------------------ | ----------------------- | ------------------------------------------ |
| **Network**              | TLS 1.3, VPC, WAF       | Encrypt transit, isolate services           |
| **Gateway**              | Nginx Ingress           | Rate limiting, IP allowlisting, TLS term.   |
| **Authentication**       | JWT (RS256) + OAuth 2.0 | Identity verification                       |
| **Authorization**        | RBAC middleware          | Role + scope enforcement per endpoint       |
| **Data**                 | AES-256, pgcrypto       | Encrypt at rest                             |
| **Application**          | Zod validation, Prisma  | Input validation, parameterized queries     |
| **QR Integrity**         | HMAC-SHA256             | Tamper-proof QR payloads                    |
| **Audit**                | Transparency Log        | Immutable event trail with Merkle proofs    |
| **Monitoring**           | SIEM, OTel, Sentry      | Anomaly detection, error tracking           |

Full security design: [../architecture/SECURITY_MODEL.md](../architecture/SECURITY_MODEL.md)  
Auth ADR: [DECISIONS.md](./DECISIONS.md) — ADR-005  
Security non-negotiables: [NON_NEGOTIABLES.md](./NON_NEGOTIABLES.md) — NN-001, NN-002, NN-003

---

## 6. Deployment Architecture

### 6.1 Environment Topology

| Environment    | Purpose                  | Infrastructure          | Branch Source  |
| -------------- | ------------------------ | ----------------------- | -------------- |
| **Local**      | Developer workstation    | Docker Compose          | `feature/*`    |
| **CI**         | Automated testing        | GitHub Actions runners  | All branches   |
| **Staging**    | Pre-production validation| Kubernetes (single node)| `develop`      |
| **Production** | Live service             | Kubernetes (multi-node) | `main` (tagged)|

### 6.2 Kubernetes Topology (Production)

```
┌─────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                   │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │          Namespace: capmint-prod              │     │
│  │                                               │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │     │
│  │  │Security │ │GS1      │ │QR Gen   │        │     │
│  │  │(2 pods) │ │(2 pods) │ │(2 pods) │        │     │
│  │  └─────────┘ └─────────┘ └─────────┘        │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │     │
│  │  │Resolver │ │TransLog │ │CloneDet │        │     │
│  │  │(3 pods) │ │(2 pods) │ │(2 pods) │        │     │
│  │  └─────────┘ └─────────┘ └─────────┘        │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │     │
│  │  │Revoke   │ │CPQ      │ │TraceNet │        │     │
│  │  │(1 pod)  │ │(1 pod)  │ │(2 pods) │        │     │
│  │  └─────────┘ └─────────┘ └─────────┘        │     │
│  │  ┌─────────┐ ┌─────────┐                     │     │
│  │  │AgriStack│ │Dashboard│                     │     │
│  │  │(1 pod)  │ │(2 pods) │                     │     │
│  │  └─────────┘ └─────────┘                     │     │
│  └───────────────────────────────────────────────┘     │
│                                                       │
│  ┌───────────────────────────────────────────────┐     │
│  │          Namespace: capmint-data               │     │
│  │  ┌──────────────┐  ┌──────────────┐           │     │
│  │  │ PostgreSQL   │  │    Redis     │           │     │
│  │  │ (HA: primary │  │  (Sentinel   │           │     │
│  │  │  + replica)  │  │   cluster)   │           │     │
│  │  └──────────────┘  └──────────────┘           │     │
│  └───────────────────────────────────────────────┘     │
│                                                       │
│  ┌───────────────────────────────────────────────┐     │
│  │          Namespace: capmint-monitor            │     │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │     │
│  │  │Prometheus│ │ Grafana  │ │   Loki   │      │     │
│  │  └──────────┘ └──────────┘ └──────────┘      │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

### 6.3 Scaling Strategy

| Service          | Scale Trigger                          | Min Pods | Max Pods |
| ---------------- | -------------------------------------- | -------- | -------- |
| Resolver         | CPU > 70% OR request rate > 500 rps    | 3        | 10       |
| Clone Detection  | Queue depth > 1000 jobs                | 2        | 8        |
| QR Generator     | CPU > 70%                              | 2        | 6        |
| Security         | Request rate > 300 rps                 | 2        | 6        |
| Others           | CPU > 80%                              | 1        | 4        |

Infrastructure as code: [../architecture/INFRA.md](../architecture/INFRA.md)

---

## 7. Communication Patterns

| Pattern                | Usage                                               | Protocol    |
| ---------------------- | --------------------------------------------------- | ----------- |
| **Synchronous REST**   | Client ↔ Service, Service ↔ Service (queries)       | HTTP/2+TLS  |
| **GraphQL**            | Dashboard aggregation, complex relational queries    | HTTP/2+TLS  |
| **Async Job Queue**    | QR batch generation, clone detection analysis        | BullMQ/Redis|
| **Event Bus** (future) | Cross-service domain events                          | Redis Pub/Sub → Kafka (at scale) |
| **WebSocket** (future) | Real-time dashboard alerts                           | WSS         |

---

## 8. Repository Structure

```
CapMint/
├── BRAIN/                      # Project governance (this directory)
├── governance/                 # Roadmap, dependency graph, risk, debt
├── architecture/               # Detailed architecture docs
├── docs/                       # Developer & user documentation
├── src/
│   ├── services/
│   │   ├── security/           # Auth service
│   │   ├── gs1-engine/         # GS1 Digital Link service
│   │   ├── qr-generator/       # QR code service
│   │   ├── resolver/           # Verification service
│   │   ├── transparency-log/   # Audit ledger service
│   │   ├── clone-detection/    # AI anomaly service
│   │   ├── revocation/         # Revocation service
│   │   ├── cpq/                # Billing/onboarding service
│   │   ├── tracenet/           # Supply chain service
│   │   └── agristack/          # Agriculture extension
│   ├── packages/
│   │   ├── common/             # @capmint/common
│   │   ├── gs1-engine/         # @capmint/gs1-engine (shared lib)
│   │   ├── auth-middleware/    # @capmint/auth-middleware
│   │   ├── logger/             # @capmint/logger
│   │   ├── db/                 # @capmint/db (Prisma)
│   │   └── test-utils/         # @capmint/test-utils
│   └── apps/
│       ├── dashboard/          # Next.js dashboard app
│       └── pwa/                # Next.js PWA consumer app
├── infra/
│   ├── docker/                 # Dockerfiles per service
│   ├── k8s/                    # Kubernetes manifests (Helm)
│   └── terraform/              # Cloud infrastructure
├── .github/
│   └── workflows/              # CI/CD pipelines
└── docker-compose.yml          # Local development environment
```

---

*This document provides the architectural north star. Changes require an ADR in [DECISIONS.md](./DECISIONS.md).*
