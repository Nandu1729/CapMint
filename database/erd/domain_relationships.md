# CapMint — Domain Relationships (CP-002.3)

## 1. Executive Summary

This document represents the deliverables for **CP-002.3 (Domain Relationships)** under the Database Design phase. It defines the logical and referential relationships between database tables, detailing mapping cardinalities, nullability, referential integrity constraints (Foreign Keys), and cascade rules (delete/update policies).

Establishing strict referential boundaries prevents data orphans and ensures that cascading state changes (e.g., lot revocation bubbling down to units) are backed by clean database relationships.

---

## 2. Entity Relationship Matrix

The table below lists all database relationships in CapMint:

| Parent Table | Child Table | Relationship Type | Cardinality | FK Column | Delete Rule | Update Rule | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `organizations` | `producers` | One-to-Many ($1:N$) | $0..1$ during C2 migration $\rightarrow$ $0..*$ | `organization_id` | `NO ACTION` | `NO ACTION` | Explicit tenant owner; nullable only for quarantined legacy rows during C2. |
| `organizations` | `certifiers` | One-to-Many ($1:N$) | $0..1$ during C2 migration $\rightarrow$ $0..*$ | `organization_id` | `NO ACTION` | `NO ACTION` | Explicit tenant owner; nullable only for quarantined legacy rows during C2. |
| `producers` | `plots_or_hive_clusters` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `producer_id` | `RESTRICT` | `CASCADE` | Maps locations to owning producer. |
| `certifiers` | `budgets` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `certifier_id` | `RESTRICT` | `CASCADE` | Tracks certifier signing budget quota. |
| `producers` | `budgets` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `producer_id` | `RESTRICT` | `CASCADE` | Tracks capacity allocation to producer. |
| `budgets` | `lots` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `budget_id` | `RESTRICT` | `CASCADE` | Tracks quota consumed by lots. |
| `budgets` | `lots` | Composite ownership guard | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `(budget_id, producer_id)` | `RESTRICT` | `NO ACTION` | Prevents a lot producer from disagreeing with its budget producer. |
| `producers` | `lots` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `producer_id` | `RESTRICT` | `CASCADE` | Tracks batch packaging producer. |
| `lots` | `unit_codes` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $1..*$ (Mandatory) | `lot_id` | `RESTRICT` | `CASCADE` | Groups retail codes under batch runs. |
| `lots` | `lab_results` | One-to-One ($1:1$) | $1$ (Mandatory) $\rightarrow$ $0..1$ (Optional) | `lot_id` | `RESTRICT` | `CASCADE` | Binds lab PDF reports to lots. |
| `organizations` | `lots` | Laboratory assignment | $0..1$ (Optional) $\rightarrow$ $0..*$ | `assigned_laboratory_organization_id` | `RESTRICT` | `NO ACTION` | Nullable relationship; C3b assignment is restricted to the budget-controlling certifier and an activated NABL target. |
| `organizations` | `lab_results` | Laboratory submitter provenance | $0..1$ (Optional) $\rightarrow$ $0..*$ | `submitted_by_organization_id` | `RESTRICT` | `NO ACTION` | C3b writes persist the authenticated assigned lab; legacy rows stay NULL. |
| `unit_codes` | `investigations` | One-to-One candidate | $1$ after C3a backfill $\rightarrow$ $0..*$ | `unit_code_id` | `RESTRICT` | `CASCADE` | Exact FK-backed investigation provenance; NOT NULL/UNIQUE tightening is deferred to C3c. |
| `unit_codes` | `scan_events` | One-to-Many ($1:N$) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `unit_code_id` | `RESTRICT` | `CASCADE` | Logs telemetry query events. |
| *Polymorphic* | `log_entries` | Polymorphic (Logical) | $1$ (Mandatory) $\rightarrow$ $0..*$ (Optional) | `entity_id` | N/A (Manual) | N/A (Manual)| decoupled ledger audit trail. |

---

## 3. Relationship Specifications

### 3.1 Organization $\rightarrow$ Producer/Certifier Profiles ($1:N$)
*   **Business Rationale**: JWT `orgId` identifies `organizations.id`, while producer and certifier primary keys remain independent domain identifiers. Explicit foreign keys make tenant ownership expressible without changing existing provenance identifiers.
*   **Cardinality**: The schema permits one organization to own multiple profiles. Current activation provisions at most one equal-ID profile. During C2, a legacy profile may have no mapped organization and therefore retains `NULL`.
*   **Constraints**: `FOREIGN KEY (organization_id) REFERENCES organizations(id)` on both profile tables.
*   **Enforcement rationale**: Every non-`NULL` tenant key is validated. C3a authorization derives ownership through these keys; uniqueness, `NOT NULL`, RLS, and orphan resolution remain separately gated.

### 3.2 Producer $\rightarrow$ Plots or Hive Clusters ($1:N$)
*   **Business Rationale**: A producer owns the land plots or apiary clusters where raw commodities are grown. 
*   **Cardinality**: A plot must be owned by exactly one producer. A producer can own multiple plots (or zero if newly onboarded).
*   **Constraint**: `FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` on delete prevents purging a producer if active land footprints are registered, ensuring historical source traceability remains intact.

### 3.3 Certifier $\rightarrow$ Budgets ($1:N$)
*   **Business Rationale**: A budget quota must be authorized and signed by an accredited certifier's cryptographic key.
*   **Cardinality**: A budget is signed by exactly one certifier. A certifier can sign multiple budgets over time.
*   **Constraint**: `FOREIGN KEY (certifier_id) REFERENCES certifiers(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` prevents deletion of a certifier profile if they have authorized active/historical capacity budgets.

### 3.4 Producer $\rightarrow$ Budgets ($1:N$)
*   **Business Rationale**: Quota allocations are granted to specific producers.
*   **Cardinality**: A budget belongs to exactly one producer. A producer can have multiple seasonal budgets.
*   **Constraint**: `FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` prevents purging a producer while active quota budgets remain in the database.

### 3.5 Budget $\rightarrow$ Lots ($1:N$)
*   **Business Rationale**: Lots packed in the warehouse must draw from the remaining capacity quota of an active budget.
*   **Cardinality**: A lot must belong to exactly one capacity budget. A budget can support multiple packed lots.
*   **Constraint**: `FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` blocks deletion of a budget if any packed lot references it, preventing corruption of capacity allocation auditing.

### 3.6 Producer $\rightarrow$ Lots ($1:N$)
*   **Business Rationale**: Establishes commercial custody over batch processing.
*   **Cardinality**: A lot is packaged by exactly one producer. A producer can package multiple lots.
*   **Constraint**: `FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` blocks deletion of a producer profile if they have active lot batches.

### 3.7 Lot $\rightarrow$ Unit Codes ($1:N$)
*   **Business Rationale**: Grouping individual unit serials under a lot allows status changes (such as lab failures) to propagate collectively.
*   **Cardinality**: A unit code must belong to exactly one lot. A lot contains one or more unit codes.
*   **Constraint**: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` ensures that a lot batch record cannot be deleted if serialized packages have been issued under it, preventing orphaned units in the retail market.

### 3.8 Lot $\rightarrow$ Lab Results ($1:1$)
*   **Business Rationale**: Binds chemical analysis certificates to the batch.
*   **Cardinality**: A lot has at most one lab result (optional initially, mandatory before shipping). A lab result belongs to exactly one lot.
*   **Constraint**: `FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE CASCADE` (with a `UNIQUE` index constraint on `lot_id`).
*   **Enforcement rationale**: The `UNIQUE` key enforces that a lot cannot have duplicate pesticide panels orNMR reports.

### 3.9 Unit Code $\rightarrow$ Scan Events ($1:N$)
*   **Business Rationale**: Captures telemetries of public scans to run anomaly heuristics.
*   **Cardinality**: A scan event references exactly one unit code. A unit code can accrue multiple scans.
*   **Constraint**: `FOREIGN KEY (unit_code_id) REFERENCES unit_codes(id) ON DELETE RESTRICT ON UPDATE CASCADE`
*   **Enforcement rationale**: `RESTRICT` prevents purging a unit code if scan events are logged, protecting telemetry datasets from retroactive modification.

### 3.10 C3a Derived Ownership Relationships

*   **Lot/budget producer guard**: `budgets(id, producer_id)` has unique
    reference support and
    `lots(budget_id, producer_id) REFERENCES budgets(id, producer_id)
    ON DELETE RESTRICT`. This makes the duplicated producer key consistent.
*   **Investigation provenance**:
    `investigations.unit_code_id REFERENCES unit_codes(id)
    ON DELETE RESTRICT ON UPDATE CASCADE`. Migration 0012 fills it only from an
    exact `public_identifier` match. It remains nullable and non-unique until
    C3c.
*   **Laboratory assignment and provenance**:
    `lots.assigned_laboratory_organization_id` and
    `lab_results.submitted_by_organization_id` reference organizations with
    `ON DELETE RESTRICT`. Both remain nullable for legacy rows. C3b lets the
    controlling certifier assign an activated NABL organization, requires that
    assignment for laboratory reads/writes, and records the authenticated
    organization on accepted result inserts and replacements.

---

## 4. Decoupled & Polymorphic Relationships

### 4.1 Log Entry $\rightarrow$ System Entities (Polymorphic)
*   **Business Rationale**: The append-only event ledger must remain strictly decoupled from operational business tables. If a hard database delete occurs on a profile, the historical event hash-chain must not break.
*   **Logical Cardinality**: A log entry corresponds to exactly one state transition of an entity (Budget, Lot, or Unit Code). An entity can have multiple historical log entries.
*   **Physical Mapping**: Implemented using a **Polymorphic logical reference**:
    *   `entity_type` (`VARCHAR`): E.g., `'BUDGET'`, `'LOT'`, `'UNIT_CODE'`.
    *   `entity_id` (`UUID`): ID of the target record.
*   **Referential Integrity**: There are **no physical foreign key constraints** on `entity_id` at the database level.
*   **Enforcement**: Integrity is verified cryptographically by re-computing block hashes ($\text{SHA-256}(\text{payload\_hash} + \text{previous\_hash})$) rather than relying on standard database constraint cascades.

---
*End of domain_relationships.md*
