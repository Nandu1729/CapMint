# CapMint — End-to-End Product Roadmap

> **Last Updated:** 2026-07-23  
> **Current Position:** Transitioning from Local Validation to Production Infrastructure

---

## Roadmap Overview

```
[Phase 1: Sandbox] ──► [Phase 2: Hardening] ──► [Phase 3: Infra Scale] ──► [Phase 4: Billing] ──► [Phase 5: Connectors] ──► [Phase 6: Launch]
    ✅ Completed           ✅ Completed              ⏳ Active             ⏳ Active              ⬜ Planned             ⬜ Planned
```

---

## Phase 1: Local Sandbox Prototype (✅ COMPLETE)
*   **Goal:** Build the basic 7-microservice architecture and proxy routing setup.
*   **Key Deliverables:**
    *   Setup the 7 TypeScript microservices running locally.
    *   Configured the local gateway router (`scripts/frontend-server.js`) on port 8080.
    *   Created the interactive single-page dashboard and mobile scanner PWA.

---

## Phase 2: Database Migration & Security Hardening (✅ COMPLETE)
*   **Goal:** Enforce database integrity, implement transaction security, and run compliance validation.
*   **Key Deliverables:**
    *   **Migrations 0001–0006:** Setup schema tables, PL/pgSQL timestamp triggers, and default seeds.
    *   **NABL Lab Report Controls:** Added duplicate check hash validation and replacement audit logs.
    *   **Compliance Test Runner:** Implemented 52 test scenarios covering security, RBAC, budgeting, and geovelocity clone detection with 100% pass rate.

---

## Phase 3: Production Infrastructure & Scaling (⏳ ACTIVE)
*   **Goal:** Deploy containerized services on highly available cloud networks.
*   **Key Deliverables:**
    *   **AWS Terraform Provisioning:** Configure VPC networks, multi-AZ RDS PostgreSQL instances, and ElastiCache Redis clusters.
    *   **Kubernetes (k8s) Orchestration:** Write Helm charts with Horizontal Pod Autoscalers (HPA) to scale resolver services.
    *   **Key Management (KMS):** Integrate with HashiCorp Vault or AWS KMS for certifier Ed25519 key storage.

---

## Phase 4: Billing & Monetization Engine (⏳ ACTIVE)
*   **Goal:** Implement transaction charging mechanisms for SaaS profitability.
*   **Key Deliverables:**
    *   **Billing Database Schema:** Add tenant subscription plans and transaction metrics tracking.
    *   **Minting Micro-Fees:** Configure billing webhooks to charge a transactional fee (e.g., $0.01) per QR code minted.
    *   **Stripe Integration:** Hook into Stripe billing APIs for certification bodies and producer subscription tiers.

---

## Phase 5: Certifications & Government Connectors (⬜ PLANNED)
*   **Goal:** Establish direct integrations with regulatory authority systems.
*   **Key Deliverables:**
    *   **APEDA TraceNet Connector:** Integrate with the government export certification portal.
    *   **AgriStack land Validation:** Fetch geo-boundary details and yield assumptions directly from land registries.
    *   **GS1 Registry Sync:** Sync generated barcode serials with the GS1 Global Registry.

---

## Phase 6: Exporter Pilot & Public Market Launch (⬜ PLANNED)
*   **Goal:** Roll out to live users and scale market presence.
*   **Key Deliverables:**
    *   **Private Alpha Pilot:** Launch with selected Honey and Tea exporters.
    *   **LIMS Lab Integration:** Pre-integrate NABL laboratory information systems for automatic report uploading.
    *   **Public Release:** Go-live release to the open market with a production sign-off.
