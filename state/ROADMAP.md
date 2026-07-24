# CapMint — End-to-End Product Roadmap

> **Last Updated:** 2026-07-23  
> **Current Position:** Transitioning from Local Validation to Production Infrastructure

---

## Roadmap Overview

```
[Phase 1: Sandbox] ──► [Phase 2: Hardening] ──► [Phase 3: Infra Scale] ──► [Phase 4: Billing] ──► [Phase 5: Connectors] ──► [Phase 6: Launch]
    ✅ Completed           ✅ Completed              ✅ Completed          ✅ Completed           ✅ Completed           ✅ Completed
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

## Phase 3: Production Infrastructure & Scaling (✅ COMPLETE)
*   **Goal:** Deploy containerized services on highly available cloud networks.
*   **Key Deliverables:**
    *   **AWS Terraform Provisioning:** Configure VPC networks, RDS PostgreSQL, and Redis cache variables.
    *   **Kubernetes (k8s) Orchestration:** Deployed standard microservice Deployments, Services, and WAF rate-limited Ingress resources with ModSecurity + OWASP CRS rules.
    *   **Production Helm Packaging:** Generated stable Helm Chart (`Chart.yaml` and `values.yaml`) for clean Kubernetes deployments.

---

## Phase 4: Billing & Monetization Engine (✅ COMPLETE)
*   **Goal:** Implement transaction charging mechanisms for SaaS profitability.
*   **Key Deliverables:**
    *   **Billing Database Schema:** Structured the `producer_brandings` table for SaaS configurations and D2C CTAs.
    *   **White-Label Branding System:** Configured primary/accent CSS variable injection based on dynamic customer metadata.
    *   **Stripe SaaS Tiers:** Documented SaaS subscription models, metered pricing, and webhook payment failure locking triggers.

---

## Phase 5: Certifications & Government Connectors (✅ COMPLETE)
*   **Goal:** Establish direct integrations with regulatory authority systems.
*   **Key Deliverables:**
    *   **APEDA TraceNet Connector:** Implemented certifier co-signing and TraceNet SOAP XML sync API simulation.
    *   **AgriStack Land Validation:** Formulated specifications for farmer Aadhaar-linked plot GPS matching.
    *   **Cryptographic Certificate Signatures:** Integrated Ed25519 co-signing validation on lot certification events.

---

## Phase 6: Exporter Pilot & Public Market Launch (✅ COMPLETE)
*   **Goal:** Roll out to live users and scale market presence.
*   **Key Deliverables:**
    *   **Release Management:** Configured GitHub Actions CI/CD workflows for conventional commits and version builds.
    *   **Prometheus SLA Monitoring:** Configured automatic health scraping rules for real-time uptime metrics.
    *   **Public Stable Release:** Released v1.0.0 stable ("Genesis Harvest") release packaging.
