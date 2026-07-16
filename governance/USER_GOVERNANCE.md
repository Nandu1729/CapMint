# User Governance

This document establishes the user governance policy, account lifecycles, role permissions, and authentication rules for CapMint.

---

## 1. Account Lifecycles

All user accounts must reside under a registered tenant organization. A user's account state is strictly bound to one of two modes:

*   **`ACTIVE`:** Normal operational status. Users can log in, receive signed JWT tokens, and interact with their workspace.
*   **`DISABLED`:** Suspended state. Authentications are immediately rejected with a `DISABLED_USER` error code.

*Note: If an Organization's status is set to `SUSPENDED`, all user accounts within that organization are automatically locked out, regardless of their individual status.*

---

## 2. Role-Based Access Control (RBAC)

CapMint segregates user privileges within each workspace using two distinct roles:

1.  **`ADMIN`:**
    *   Full administrative permissions inside the tenant workspace.
    *   Can configure integration properties, view billing logs, and create/manage additional operator accounts.
2.  **`MEMBER` (Operator):**
    *   Restricted operational permissions.
    *   Authorized only for standard inputs (e.g. creating lot runs, minting serials, posting scan telemetry). Cannot alter budget parameters.

---

## 3. Session Issuance Controls

When a user authenticates successfully via the `auth-service` `/api/v1/auth/login` gateway:
*   A cryptographically signed **JSON Web Token (JWT)** is generated.
*   The JWT payload must explicitly carry:
    *   `id` (User UUID)
    *   `username`
    *   `orgId` (Organization UUID)
    *   `orgType` (`PRODUCER`, `NABL_LABORATORY`, etc.)
    *   `role` (`ADMIN`, `MEMBER`)
*   Tokens are short-lived. Session renewals require validation against active tenant flags in the Redis cache.
