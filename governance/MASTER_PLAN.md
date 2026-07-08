# CapMint — Master Plan

> **Document**: `governance/MASTER_PLAN.md`
> **Created**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Vision

Build the **world's most trusted AI-first anti-counterfeiting platform** — one where every physical product carries a cryptographically verifiable digital identity, and every supply-chain hand-off is recorded on an immutable transparency ledger.

---

## 2. Mission

Deliver an open, modular, production-grade platform that:
1. **Generates** globally-unique GS1-compliant identifiers and tamper-evident QR codes.
2. **Resolves** product identifiers to rich provenance metadata in real time.
3. **Detects** cloned or counterfeit assets using AI-driven anomaly analysis.
4. **Logs** every lifecycle event on an append-only transparency ledger.
5. **Integrates** with agricultural and ecosystem partners via TraceNet & AgriStack.

---

## 3. Strategic Pillars

| # | Pillar | Description |
|---|--------|-------------|
| P1 | **Security-First** | Zero-trust auth, RBAC, end-to-end encryption, revocation support. |
| P2 | **Standards-Driven** | GS1 Digital Link, ISO 22381, W3C DID alignment. |
| P3 | **AI-Native** | Clone detection, anomaly scoring, predictive risk models. |
| P4 | **Developer Experience** | Clean APIs, comprehensive SDKs, offline-capable PWA. |
| P5 | **Ecosystem Ready** | Open connectors for TraceNet, AgriStack, and third-party ERPs. |

---

## 4. Phased Roadmap

### Phase 1 — Foundation (CP-000 → CP-005)
Establish project workspaces, lock system architecture designs, specify DB models, document API contract schemas, prepare Docker configurations, and ensure developer workspace readiness.
- **CP-000**: Project Operating System — Governance files, active checkpoint, checklists, session templates.
- **CP-001**: Architecture Lock — Lock system layout, C4 container & component blueprints.
- **CP-002**: Database Design — Entity relational schemas, indices, database engine configurations.
- **CP-003**: API Contracts — Document and mock all public OpenAPI/GraphQL API schemas.
- **CP-004**: Infrastructure — Containerizations (Docker Compose stacks) and environment rules.
- **CP-005**: Development Ready — CI pipelines green, seed scripts ready, ready for code development.

### Phase 2 — Core Engines & APIs (CP-006 → CP-014)
Develop core security, identity, and verification services.
- **CP-006**: Authentication — JWT asymmetric issuance (RS256) and secure login flows.
- **CP-007**: Authorization — Route and method role policies (RBAC).
- **CP-008**: CPQ — Price calculation, dynamic catalogs, and product subscription plans.
- **CP-009**: GS1 Engine — Product GTIN registrations and GS1 Digital Link URI configurations.
- **CP-010**: Mint Engine — Unique serial generation, batch registration, metadata attachments.
- **CP-011**: QR Engine — Branded cryptographic signed QR templates generator.
- **CP-012**: Resolver — Redirect and metadata mappings resolver for GS1 Digital Link URIs.
- **CP-013**: Transparency Log — Append-only transactional event logger using Merkle trees.
- **CP-014**: Verification — Public authenticity confirmation and verification endpoint schemas.

### Phase 3 — Specialized Modules & Release (CP-015 → CP-023)
Integrate intelligence analytics dashboards, user PWA client scanner, external networks, testing, and GA deployment.
- **CP-015**: Clone Detection — AI anomaly model integration, geo-velocity checks.
- **CP-016**: Revocation — Invalidated serial listings, compromised QR blocks.
- **CP-017**: Dashboards — Administrative metrics, visual threat reports.
- **CP-018**: PWA — Consumer verification mobile scan app (offline-ready caching).
- **CP-019**: TraceNet Integration — Supply chain partner custody tracking interface.
- **CP-020**: AgriStack Integration — Agricultural lot registry integration.
- **CP-021**: Testing — System load optimization, compliance check, external pentests.
- **CP-022**: Pilot Release — Beta test integration rollout with select partners.
- **CP-023**: Production Release — GA production deployment and live monitoring.

---

## 5. Checkpoint Detail Table

| CP | Name | Branch | Dependencies | Phase | Est. Duration |
|----|------|--------|--------------|-------|---------------|
| CP-000 | Project Operating System | `develop` | — | Foundation | < 1 day |
| CP-001 | Architecture Lock | `feature/architecture-lock` | CP-000 | Foundation | ~3 days |
| CP-002 | Database Design | `feature/database-design` | CP-001 | Foundation | ~3 days |
| CP-003 | API Contracts | `feature/api-contracts` | CP-002 | Foundation | ~3 days |
| CP-004 | Infrastructure | `feature/infrastructure` | CP-003 | Foundation | ~4 days |
| CP-005 | Development Ready | `feature/development-ready` | CP-004 | Foundation | ~2 days |
| CP-006 | Authentication | `feature/auth` | CP-005 | Core Engines | ~5 days |
| CP-007 | Authorization | `feature/authz` | CP-006 | Core Engines | ~4 days |
| CP-008 | CPQ | `feature/cpq` | CP-005 | Core Engines | ~6 days |
| CP-009 | GS1 Engine | `feature/gs1-engine` | CP-005 | Core Engines | ~5 days |
| CP-010 | Mint Engine | `feature/mint-engine` | CP-009 | Core Engines | ~5 days |
| CP-011 | QR Engine | `feature/qr-engine` | CP-010 | Core Engines | ~4 days |
| CP-012 | Resolver | `feature/resolver` | CP-009, CP-011 | Core Engines | ~5 days |
| CP-013 | Transparency Log | `feature/transparency-log` | CP-005 | Core Engines | ~6 days |
| CP-014 | Verification | `feature/verification` | CP-012 | Core Engines | ~4 days |
| CP-015 | Clone Detection | `feature/clone-detection` | CP-012, CP-013 | Specialized Modules | ~8 days |
| CP-016 | Revocation | `feature/revocation` | CP-011, CP-013 | Specialized Modules | ~4 days |
| CP-017 | Dashboards | `feature/dashboards` | CP-012, CP-013, CP-015 | Specialized Modules | ~7 days |
| CP-018 | PWA | `feature/pwa` | CP-012, CP-017 | Specialized Modules | ~7 days |
| CP-019 | TraceNet Integration | `feature/tracenet` | CP-013 | Specialized Modules | ~6 days |
| CP-020 | AgriStack Integration| `feature/agristack` | CP-013 | Specialized Modules | ~6 days |
| CP-021 | Testing | `feature/testing` | CP-005 | Specialized Modules | ~7 days |
| CP-022 | Pilot Release | `release/pilot` | CP-006 to CP-021 | Release | ~5 days |
| CP-023 | Production Release | `release/production` | CP-022 | Release | ~3 days |

---

## 6. Branching Strategy

```
main ← develop ← feature branches
```

- **`main`**: Stable production-ready code.
- **`develop`**: Primary integration branch. Active working base.
- **`feature/*`**: Individual feature branches, created from `develop` and merged via PR.

---

## 7. Success Metrics

| Metric | Target | Measured At |
|---|---|---|
| QR scan-to-result latency (p95) | < 300 ms | CP-012 |
| Clone detection precision | ≥ 95% | CP-015 |
| Transparency log append throughput | ≥ 5,000 events/sec | CP-013 |
| Auth token verification (p99) | < 50 ms | CP-006 |
| E2E test coverage | ≥ 80% | CP-021 |

---

## 8. Cross-References

| Document | Path |
|----------|------|
| Project Context | [`../BRAIN/PROJECT_CONTEXT.md`](file:///Users/nandyyy/project/CapMint/BRAIN/PROJECT_CONTEXT.md) |
| Dependency Graph | [`DEPENDENCY_GRAPH.md`](file:///Users/nandyyy/project/CapMint/governance/DEPENDENCY_GRAPH.md) |
| Roadmap | [`../BRAIN/state/ROADMAP.md`](file:///Users/nandyyy/project/CapMint/BRAIN/state/ROADMAP.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |
| Quality Gates | [`QUALITY_GATES.md`](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md) |
| Session Log | [`../BRAIN/SESSION.md`](file:///Users/nandyyy/project/CapMint/BRAIN/SESSION.md) |
| Decisions | [`../BRAIN/DECISIONS.md`](file:///Users/nandyyy/project/CapMint/BRAIN/DECISIONS.md) |

---

*End of MASTER_PLAN.md*
