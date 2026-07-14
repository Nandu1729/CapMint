# CapMint — Business Rules & Constraints Mapping (CP-002.7)

## 1. Executive Summary

This document represents the deliverables for **CP-002.7 (Business Rules & Constraints mapping)** under the Database Design phase. It establishes a traceability matrix linking the business invariants and compliance rules defined in the Product Requirements Document (PRD) to their physical enforcement targets in the codebase (database constraints, SQL indexes, transactional locks, or application logic).

---

## 2. Invariants & Rules Traceability Matrix

| Rule ID | Business Rule / Invariant | Domain Context | Primary Implementation Mechanism | Implementation Target |
| :--- | :--- | :--- | :--- | :--- |
| **BR-01** | **Yield Quota Ceiling (Supply Cap)** | Budgets & Drawdowns | Database CHECK Constraint + ACID Transactional Lock (`SELECT ... FOR UPDATE`) | `budgets.consumed_quantity <= budgets.approved_quantity` check constraint; Row-locking in Mint Service. |
| **BR-02** | **Certifier Digital Signature Gate** | Quota Authorization | Cryptographic Verification (Noble/Ed25519 signature checks) | Identity Service verifying `budgets.signature_bundle` against `certifiers.public_key`. |
| **BR-03** | **Cascade Revocation Cascade** | Lot & Unit Invalidation | Database Triggers / CASCADE Updates + Relational SQL Joins | SQL UPDATE trigger on `lots` updating related `unit_codes.current_state` and setting `revoked_at`. |
| **BR-04** | **Non-Sequential Serials (Anti-Guessing)**| Serial Generation | CSPRNG String Generation + Database UNIQUE Constraints | Application code using Node.js `crypto.randomBytes()`; `UNIQUE` index on `unit_codes.serial`. |
| **BR-05** | **Verdict Vocabulary Isolation** | Scan Result | Database CHECK Constraints + JSON Schema API Validators | `chk_scan_events_verdict` CHECK constraint; Fastify API response validation schemas. |
| **BR-06** | **Immutable ledger Integrity** | Transparency Log | Event Chain Hashing (SHA-256 chaining) + Database UNIQUE Keys | Transparency Service recalculating $\text{SHA-256}(\text{payload\_hash} + \text{previous\_hash})$; `UNIQUE` index on `log_entries.current_hash`. |
| **BR-07** | **Spatial-Temporal Clone Check** | Anomaly Detection | Geovelocity Algorithms + Compound Sorting Indexes | Scan Service calculating geovelocity; `idx_scan_events_unit_code_timestamp` index. |
| **BR-08** | **Land Parcel Origin Check** | Onboarding | Geography Polygon Intersect checks | PostGIS coordinates checking land footprint bounds against AgriStack GIS files. |

---

## 3. Implementation Rationale

### 3.1 BR-01: Yield Quota Ceiling (Supply Cap)
*   **Enforcement**: Checking balances at the application layer alone creates race conditions under high concurrency. To prevent double drawdowns:
    1.  The transaction must start.
    2.  Query budget: `SELECT consumed_quantity, approved_quantity FROM budgets WHERE id = $1 FOR UPDATE`. This locks the row against parallel writers.
    3.  Calculate remaining capacity: If $remaining < requested$, rollback transaction.
    4.  Update capacity: `UPDATE budgets SET consumed_quantity = consumed_quantity + $2 WHERE id = $1`.
    5.  Insert lot and unit codes. Commit transaction.
*   **Safety net**: A DB-level CHECK constraint on `budgets` enforces that `consumed_quantity <= approved_quantity` at all times, causing any transaction violating this rule to fail-closed.

### 3.2 BR-03: Cascade Revocation Cascade
*   **Enforcement**: To ensure real-time invalidation in the market, if a lot is flagged as `REVOKED`, scan events on child units must immediately resolve to the `REVOKED` verdict.
*   **Execution**:
    1.  A SQL trigger on the `lots` table intercepts updates on `revocation_status`.
    2.  If updated to `'REVOKED'`, it triggers:
        ```sql
        UPDATE unit_codes 
        SET current_state = 'REVOKED', revoked_at = NOW() 
        WHERE lot_id = NEW.id;
        ```
    3.  The public scan verification query performs a relational JOIN on both tables: if either the unit code state is `REVOKED` or the parent lot status is `REVOKED`, the resolved verdict returned is `REVOKED`.

### 3.3 BR-06: Immutable Ledger Integrity
*   **Enforcement**: To prevent administrators from modifying audit logs retroactively:
    1.  A new block cannot be added unless `previous_hash` exactly matches the `current_hash` of the preceding record.
    2.  The block's hash is defined as: `current_hash = SHA256(payload_hash || previous_hash)`.
    3.  The database enforces a `UNIQUE` index constraint on `current_hash`, preventing duplicate blocks or duplicate chains from being inserted.

### 3.4 BR-07: Spatial-Temporal Clone Check
*   **Enforcement**: To prevent a duplicate QR code from being scanned in multiple cities simultaneously:
    1.  Ingest the scan coordinates and timestamp.
    2.  Fetch the immediate preceding scan for the same unit:
        ```sql
        SELECT location, timestamp 
        FROM scan_events 
        WHERE unit_code_id = $1 
        ORDER BY timestamp DESC 
        LIMIT 1;
        ```
    3.  Calculate spatial distance and time difference.
    4.  If the speed required to travel between both points exceeds $1000\text{ km/h}$, flag the unit code as `clone_flag = TRUE` and set scan verdict to `CLONE-SUSPECT`.
*   **Performance SLA**: The index `idx_scan_events_unit_code_timestamp` sorted in `DESC` order ensures this check completes in `<5ms`.

---
*End of business_rules_mapping.md*
