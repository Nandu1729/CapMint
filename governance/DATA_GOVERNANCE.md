# Data Governance

This document establishes the data governance policy, Single Writer constraints, privacy masking guidelines, and data retention parameters for CapMint.

---

## 1. Single Writer Constraint

To prevent database write conflicts and maintain domain boundaries, only one designated microservice is permitted to execute writes/updates on any given database table:

*   **`users` & `organizations`:** Auth Service (`auth-service`)
*   **`budgets`:** Budget Service (`cpq-service`)
*   **`lots` & `unit_codes`:** Minting Service (`mint-service`)
*   **`scan_events` & `investigations`:** Verification Service (`verification-service`)
*   **`log_entries`:** Transparency Service (`transparency-service`)

*Note: All other services must query or request actions from the table owner via REST APIs.*

---

## 2. Privacy & PII Masking

CapMint must prevent the exposure of Personally Identifiable Information (PII) on public verifier screens:

*   **Farmer Names:** Masked on public screens. Only FPO / cooperative names are returned.
*   **GPS Plot Coordinates:** Exact coordinates from AgriStack are masked on public screens; only generalized geographic boundaries (state, district) are exposed.
*   **Financial Details:** Quota costs, land valuation, and commercial transactions are strictly restricted to the internal Producer console.

---

## 3. Telemetry Retention Policy

*   **Redis Telemetry Queue:** Raw IP addresses and detailed telemetry payloads from public scans are retained in Redis for clone detection analysis, and are purged after 24 hours.
*   **Postgres Summaries:** Summarized metrics (total scan count, general country/city geohashes) are logged long-term in the SQL database for analytical reports.
