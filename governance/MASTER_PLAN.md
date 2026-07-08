# CapMint — Master Plan

> **Document**: `governance/MASTER_PLAN.md`
> **Created**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Vision

Build the **world's most trusted AI-first anti-counterfeiting platform** — one where every
physical product carries a cryptographically verifiable digital identity, and every supply-chain
hand-off is recorded on an immutable transparency ledger.

## 2. Mission

Deliver an open, modular, production-grade platform that:

1. **Generates** globally-unique GS1-compliant identifiers and tamper-evident QR codes.
2. **Resolves** product identifiers to rich provenance metadata in real time.
3. **Detects** cloned or counterfeit assets using AI-driven anomaly analysis.
4. **Logs** every lifecycle event on an append-only transparency ledger.
5. **Integrates** with agricultural and ecosystem partners via TraceNet & AgriStack.

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

Establish the project operating system, core infrastructure, authentication, and
authorization primitives.

- **CP-000**: Project OS initialisation — governance docs, repo scaffold, CI skeleton.
- **CP-001**: Dev environment — Docker Compose, env configs, local tooling.
- **CP-002**: Auth module — JWT issuance, refresh flow, MFA hooks.
- **CP-003**: Authorization module — RBAC engine, policy definitions, middleware.
- **CP-004**: Security hardening — rate limiting, CORS, CSP, audit hooks.
- **CP-005**: Foundation integration — Auth + Authz + Security end-to-end smoke tests.

### Phase 2 — Core (CP-006 → CP-009)

Build the product-identity pipeline: identifier generation, QR encoding, resolver, and
the transparency ledger.

- **CP-006**: GS1 Engine — GTIN / SGTIN generation, Digital Link URI construction.
- **CP-007**: QR Generator — deterministic QR creation, signing, visual templates.
- **CP-008**: Resolver — Digital Link resolution API, caching layer, fallback logic.
- **CP-009**: Transparency Log — append-only event store, Merkle audit proofs.

### Phase 3 — Modules (CP-010 → CP-015)

Layer on intelligence, business logic, and user-facing surfaces.

- **CP-010**: Clone Detection — AI inference pipeline, anomaly scoring, alerts.
- **CP-011**: Revocation — credential & QR revocation lists, OCSP-style responder.
- **CP-012**: CPQ (Configure-Price-Quote) — product catalogue, pricing rules, quoting.
- **CP-013**: Dashboard — real-time analytics, role-based views, notification centre.
- **CP-014**: PWA — offline scan, camera integration, service-worker sync.
- **CP-015**: Module integration — cross-module E2E tests, performance baselines.

### Phase 4 — Ecosystem (CP-016 → CP-020)

Connect the platform to external networks and harden for production launch.

- **CP-016**: TraceNet connector — supply-chain event ingestion, partner auth.
- **CP-017**: AgriStack connector — crop-identity mapping, regulatory payloads.
- **CP-018**: Testing & certification — load tests, pen tests, compliance audits.
- **CP-019**: Pre-launch hardening — chaos tests, runbook creation, SLA definition.
- **CP-020**: GA release — production cut-over, monitoring, incident playbook.

---

## 5. Checkpoint Detail Table

| CP | Name | Branch | Dependencies | Phase | Est. Duration |
|----|------|--------|--------------|-------|---------------|
| CP-000 | Project OS Init | `main` | — | 1 | 1 week |
| CP-001 | Dev Environment | `feature/dev-env` → `develop` | CP-000 | 1 | 1 week |
| CP-002 | Auth Module | `feature/auth` → `develop` | CP-001 | 1 | 2 weeks |
| CP-003 | Authorization | `feature/authz` → `develop` | CP-002 | 1 | 2 weeks |
| CP-004 | Security Hardening | `feature/security` → `develop` | CP-002, CP-003 | 1 | 2 weeks |
| CP-005 | Foundation Integration | `release/v0.1` → `main` | CP-002, CP-003, CP-004 | 1 | 1 week |
| CP-006 | GS1 Engine | `feature/gs1-engine` → `develop` | CP-005 | 2 | 2 weeks |
| CP-007 | QR Generator | `feature/qr-gen` → `develop` | CP-006 | 2 | 2 weeks |
| CP-008 | Resolver | `feature/resolver` → `develop` | CP-006, CP-007 | 2 | 2 weeks |
| CP-009 | Transparency Log | `feature/transparency-log` → `develop` | CP-005 | 2 | 3 weeks |
| CP-010 | Clone Detection | `feature/clone-detect` → `develop` | CP-008, CP-009 | 3 | 3 weeks |
| CP-011 | Revocation | `feature/revocation` → `develop` | CP-007, CP-009 | 3 | 2 weeks |
| CP-012 | CPQ | `feature/cpq` → `develop` | CP-005 | 3 | 2 weeks |
| CP-013 | Dashboard | `feature/dashboard` → `develop` | CP-008, CP-009, CP-010 | 3 | 3 weeks |
| CP-014 | PWA | `feature/pwa` → `develop` | CP-008, CP-013 | 3 | 2 weeks |
| CP-015 | Module Integration | `release/v0.5` → `main` | CP-010 … CP-014 | 3 | 2 weeks |
| CP-016 | TraceNet | `feature/tracenet` → `develop` | CP-009, CP-015 | 4 | 3 weeks |
| CP-017 | AgriStack | `feature/agristack` → `develop` | CP-009, CP-015 | 4 | 3 weeks |
| CP-018 | Testing & Cert | `feature/testing` → `develop` | CP-015 | 4 | 3 weeks |
| CP-019 | Pre-Launch | `release/v1.0-rc` → `main` | CP-016, CP-017, CP-018 | 4 | 2 weeks |
| CP-020 | GA Release | `release/v1.0` → `main` | CP-019 | 4 | 1 week |

---

## 6. Branching Strategy

```
feature/*  →  develop  →  release/*  →  main
```

- **feature/\***: One branch per module / checkpoint task.
- **develop**: Integration branch — all features merge here first.
- **release/\***: Stabilisation branch cut at phase boundaries (CP-005, CP-015, CP-019, CP-020).
- **main**: Production-ready code only. Tagged releases.

---

## 7. Success Metrics

| Metric | Target | Measured At |
|--------|--------|-------------|
| QR scan-to-result latency (p95) | < 300 ms | CP-008 |
| Clone detection precision | ≥ 95 % | CP-010 |
| Transparency log append throughput | ≥ 5 000 events/sec | CP-009 |
| Auth token issuance (p99) | < 100 ms | CP-002 |
| PWA Lighthouse score | ≥ 90 | CP-014 |
| E2E test coverage | ≥ 85 % | CP-015 |
| Load-test (sustained) | 10 000 RPS for 30 min | CP-018 |
| Zero critical CVEs at GA | 0 | CP-020 |

---

## 8. Cross-References

| Document | Path |
|----------|------|
| Project Context | [`../BRAIN/PROJECT_CONTEXT.md`](file:///Users/nandyyy/project/CapMint/BRAIN/PROJECT_CONTEXT.md) |
| Dependency Graph | [`DEPENDENCY_GRAPH.md`](file:///Users/nandyyy/project/CapMint/governance/DEPENDENCY_GRAPH.md) |
| Roadmap | [`../BRAIN/state/ROADMAP.md`](file:///Users/nandyyy/project/CapMint/BRAIN/state/ROADMAP.md) |
| Module Status | [`MODULE_STATUS.md`](file:///Users/nandyyy/project/CapMint/governance/MODULE_STATUS.md) |
| Quality Gates | [`QUALITY_GATES.md`](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md) |

---

*End of MASTER_PLAN.md*
