# Threat Model: [Component / Feature Name]

> **Threat Model** — CapMint Anti-Counterfeiting Platform

---

## Overview

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Component**      | <!-- e.g., Label Verification API, Blockchain Bridge, Auth -->   |
| **Module**         | <!-- e.g., auth, labeling, verification, blockchain -->          |
| **Author**         | @[github-handle]                                                 |
| **Created**        | YYYY-MM-DD                                                       |
| **Last Reviewed**  | YYYY-MM-DD                                                       |
| **Review Cadence** | <!-- e.g., Every checkpoint, quarterly, on major change -->      |
| **Checkpoint**     | [CP-NNN](../checkpoints/CP-NNN.md)                              |
| **Status**         | `DRAFT` · `REVIEWED` · `APPROVED` · `NEEDS_UPDATE`              |

---

## 1. Component Description

<!-- Brief description of the component/feature being threat-modeled.
     What does it do? What role does it play in the CapMint system? -->

## 2. Data Flow Diagram

<!-- Illustrate how data moves through the component. Identify entry points, 
     data stores, external services, and trust boundaries. -->

```
                    ┌─────────────┐
                    │   Client    │
                    │  (Browser/  │
                    │   Mobile)   │
                    └──────┬──────┘
                           │ HTTPS
                    ───────┼─────── Trust Boundary: Public Internet
                           │
                    ┌──────▼──────┐
                    │ API Gateway │
                    │  (Auth/TLS) │
                    └──────┬──────┘
                           │
                    ───────┼─────── Trust Boundary: Internal Network
                           │
                    ┌──────▼──────┐       ┌──────────────┐
                    │  [Service]  │──────▶│  Database    │
                    │             │       │  (Encrypted) │
                    └──────┬──────┘       └──────────────┘
                           │
                    ┌──────▼──────┐
                    │ Blockchain  │
                    │   Layer     │
                    └─────────────┘
```

<!-- Replace the above with your actual data flow diagram. Mark all trust boundaries. -->

## 3. Assets

<!-- What are the valuable assets this component handles or protects? -->

| Asset ID | Asset                          | Classification           | Description                        |
| -------- | ------------------------------ | ------------------------ | ---------------------------------- |
| A1       | <!-- e.g., "Auth tokens" -->   | `Confidential` · `Integrity-Critical` · `Public` | <!-- What and why it matters --> |
| A2       | <!-- e.g., "Label hashes" -->  | `Integrity-Critical`     | <!-- Description -->               |
| A3       | <!-- e.g., "User PII" -->      | `Confidential`           | <!-- Description -->               |
| A4       | <!-- e.g., "Blockchain keys" --> | `Confidential`         | <!-- Description -->               |

## 4. Threat Actors

| Actor                    | Motivation                      | Capability                        | Likelihood |
| ------------------------ | ------------------------------- | --------------------------------- | ---------- |
| **External Attacker**    | Financial gain, counterfeit ops | Network access, common tools      | High       |
| **Insider Threat**       | Sabotage, data theft            | System access, domain knowledge   | Medium     |
| **Counterfeiter**        | Bypass verification, fake labels| Physical access, reverse engineering | High    |
| **Automated Bot**        | Credential stuffing, scraping   | Distributed infrastructure        | High       |
| **Nation-State**         | Supply chain disruption         | Advanced persistent threat (APT)  | Low        |
| <!-- Add/remove actors as relevant to this component -->  ||| |

## 5. STRIDE Threat Analysis

> **STRIDE:** Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege

| ID   | Category                 | Threat Description                              | Asset(s) | Actor(s) | Likelihood | Impact   | Risk Score | Control / Mitigation                          | Status     |
| ---- | ------------------------ | ----------------------------------------------- | -------- | -------- | ---------- | -------- | ---------- | --------------------------------------------- | ---------- |
| T01  | **Spoofing**             | <!-- e.g., "Forged JWT bypasses auth" -->        | A1       | External | High       | Critical | Critical   | <!-- e.g., "JWT signature verification" -->    | ✅ Mitigated |
| T02  | **Tampering**            | <!-- e.g., "Modified label data in transit" -->  | A2       | External | Medium     | High     | High       | <!-- e.g., "TLS + HMAC integrity check" -->    | ✅ Mitigated |
| T03  | **Repudiation**          | <!-- e.g., "User denies verification action" --> | A2       | Insider  | Medium     | Medium   | Medium     | <!-- e.g., "Audit log with blockchain anchor" --> | 🔄 Partial |
| T04  | **Info Disclosure**      | <!-- e.g., "PII leak via error messages" -->     | A3       | External | Medium     | High     | High       | <!-- e.g., "Sanitized error responses" -->     | ✅ Mitigated |
| T05  | **Denial of Service**    | <!-- e.g., "API rate limit bypass" -->           | —        | Bot      | High       | Medium   | High       | <!-- e.g., "Rate limiting + WAF" -->           | ✅ Mitigated |
| T06  | **Elevation of Privilege**| <!-- e.g., "IDOR to admin resources" -->        | A1, A3   | External | Medium     | Critical | Critical   | <!-- e.g., "RBAC + resource ownership checks" --> | ✅ Mitigated |

**Risk Score Matrix:**

| | Low Impact | Medium Impact | High Impact | Critical Impact |
|---|---|---|---|---|
| **High Likelihood** | Medium | High | Critical | Critical |
| **Medium Likelihood** | Low | Medium | High | Critical |
| **Low Likelihood** | Low | Low | Medium | High |

## 6. Trust Boundaries

<!-- Define and document all trust boundaries in the system. -->

| Boundary ID | Boundary                          | From                    | To                       | Controls                          |
| ----------- | --------------------------------- | ----------------------- | ------------------------ | --------------------------------- |
| TB1         | Public Internet → API Gateway     | Client                  | API Gateway              | TLS 1.3, Auth, Rate Limiting      |
| TB2         | API Gateway → Internal Services   | API Gateway             | Service Layer            | mTLS, Service Mesh Auth           |
| TB3         | Service → Database                | Service Layer           | PostgreSQL               | Encrypted connection, RBAC        |
| TB4         | Service → Blockchain              | Service Layer           | Blockchain Node          | Signed transactions, Key mgmt     |

## 7. Attack Surface

<!-- Enumerate all entry points and interfaces exposed by this component. -->

| Surface                    | Type          | Exposed To   | Protection                         |
| -------------------------- | ------------- | ------------ | ---------------------------------- |
| REST API endpoints         | Network       | Public       | Auth, validation, rate limiting    |
| Database port              | Network       | Internal     | Firewall, encrypted, credential    |
| Admin dashboard            | Web UI        | Authenticated| MFA, RBAC, session management      |
| File upload endpoint       | Network       | Public       | Size limits, type validation, AV   |
| Blockchain RPC             | Network       | Internal     | Signed transactions, allow-list    |
| <!-- Add surfaces -->      |               |              |                                    |

## 8. Security Controls

<!-- Map controls to the threats they address. -->

| Control ID | Control                           | Type                    | Threats Addressed | Implementation Status |
| ---------- | --------------------------------- | ----------------------- | ----------------- | --------------------- |
| C01        | JWT Authentication                | Preventive              | T01, T06          | ✅ Implemented         |
| C02        | TLS 1.3 Everywhere                | Preventive              | T02, T04          | ✅ Implemented         |
| C03        | Input Validation & Sanitization   | Preventive              | T02, T04          | ✅ Implemented         |
| C04        | Rate Limiting (per-user + global) | Preventive              | T05               | ✅ Implemented         |
| C05        | Audit Logging                     | Detective               | T03               | 🔄 In Progress         |
| C06        | RBAC + Resource Ownership         | Preventive              | T06               | ✅ Implemented         |
| C07        | Blockchain Anchoring              | Preventive / Detective  | T02, T03          | 🔄 In Progress         |
| <!-- Add controls as needed --> ||| | |

## 9. Residual Risks

<!-- Risks that remain AFTER all controls are in place. These are accepted or deferred. -->

| Risk ID | Description                                   | Likelihood | Impact   | Acceptance Rationale                      | Owner       | Review Date |
| ------- | --------------------------------------------- | ---------- | -------- | ----------------------------------------- | ----------- | ----------- |
| R01     | <!-- e.g., "Insider with DB access" -->       | Low        | High     | <!-- Why this risk is accepted -->         | @[handle]   | YYYY-MM-DD  |
| R02     | <!-- e.g., "Zero-day in dependency" -->       | Low        | Critical | <!-- Mitigation: Dependabot + WAF -->      | @[handle]   | YYYY-MM-DD  |

---

## Review & Approval

| Role               | Name            | Date       | Sign-off |
| ------------------ | --------------- | ---------- | -------- |
| **Security Lead**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Tech Lead**      | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Module Owner**   | @[handle]       | YYYY-MM-DD | ✅ / ❌   |

---

## Related Documents

- **Feature Spec:** [feature-name.md](../docs/features/feature-name.md)
- **API Doc:** [api-endpoint.md](../docs/api/api-endpoint.md)
- **ADR:** [ADR-NNN](../docs/adr/ADR-NNN.md)
- **Test Plan (Security):** [TP-NNN.md](../docs/testing/TP-NNN.md)

---

> **Usage:** Copy this template → rename to `threat-model-[component].md` → complete all sections → review with security lead → revisit at defined cadence or when the component changes.
