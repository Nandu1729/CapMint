# Organization Governance

This document defines the governance rules, classifications, and lifecycle requirements for organizations registered within the CapMint multi-tenant ecosystem.

---

## 1. Organization Classifications

CapMint enforces separation of concerns by grouping all tenants into five distinct organization types:

*   **PRODUCER (Farmers / FPOs / Cooperatives):** Owns crop harvests, requests quota budgets, and mints serialized QR codes.
*   **NABL_LABORATORY (Testing Labs):** Conducts purity and chemical analyses; binds test results to specific lots.
*   **CERTIFICATION_BODY (Organic Certifiers):** Reviews budgets, verifies compliance credentials, and issues revocation orders.
*   **EXPORTER (Logistics & Customs Agencies):** Scans cargo lots at shipping checkpoints to verify NPOP allowances.
*   **SYSTEM_ADMINISTRATOR (Auditors / Operations):** Manages global system configs and reviews registration escalations.

---

## 2. Onboarding Lifecycle

Organizations must register through the following three-step verification workflow:

```
[ Step 1: Profile Submission ]  --> Input Business Name, GST, Address, Type, and Website.
             │
             v
[ Step 2: Administrator Info ]  --> Set Admin username, designation, and password.
             │
             v
[ Step 3: Verification Review ]  --> Status moves to PENDING; reviewed by Certifier.
```

---

## 3. Activation States & Constraints

Every organization record is bound to one of three lifecycle states:

| Status State | Description | Access Constraints |
| :--- | :--- | :--- |
| **`PENDING`** | Default state upon registration submission. | User login is blocked. The auth-service denies JWT creation. |
| **`ACTIVATED`** | Approved by the CapMint administration body. | Full API and Console access is unlocked for the tenant's workspace. |
| **`SUSPENDED`** | Disabled due to compliance failure or revocation. | Immediate system lockout. Active sessions are invalidated in Redis. |

---

## 4. Multi-Tenant Isolation Rule

No organization shall ever read, modify, or query data belonging to another workspace. All domain tables (Lots, Budgets, Unit Codes) are strictly isolated by an `organization_id` foreign key check, enforced at both the Postgres query scope and Fastify API route layers.
