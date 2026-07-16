# Audit & Transparency Governance

This document establishes the audit rules, append-only log parameters, and database permission limits that enforce the platform's immutable integrity ledger.

---

## 1. Immutable Event Chaining

To ensure that administrative database accounts cannot retroactively modify historical records without detection, the platform writes all critical state changes to a cryptographic hash chain:

$$\text{BlockHash}_n = \text{SHA-256}(\text{BlockHash}_{n-1} \parallel \text{EventPayload}_n)$$

*   **Block Validation:** A block is invalid if its `previous_hash` does not match the computed hash of block $n-1$.
*   **Ledger Anchoring:** The head hash is periodically committed to public external logs, establishing a timestamped proof of state.

---

## 2. Database Role Hardening

To enforce append-only discipline:
*   The database user account utilized by the application backend is granted ONLY `INSERT` and `SELECT` privileges on the `log_entries` table.
*   `UPDATE`, `DELETE`, and `TRUNCATE` operations are explicitly blocked at the database role level.
*   Database triggers detect and reject any attempts to bypass these schema limitations.

---

## 3. Operational Audit Logs

Every action performed by a tenant or system operator must generate an audit log record containing:

1.  **Actor Context:** User UUID, Organization ID, and authentication session token identifier.
2.  **Telemetry Data:** Client IP address, user-agent string, and geohash.
3.  **Payload details:** An explicit JSON payload detailing what state fields were modified.
4.  **Correlation ID:** Passed down from edge gateway to allow tracing requests across microservices.
