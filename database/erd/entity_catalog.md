# CapMint — Entity Catalog (CP-002.2)

## 1. Executive Summary

This document represents the deliverables for **CP-002.2 (Entity Catalog)** under the Database Design phase. It defines the logical database tables, field data types, nullability rules, primary/foreign key relationships, indexing strategies, logical owners (microservice scopes), and transactional auditing properties for all data structures in the CapMint system.

These tables provide the relational schema structure required to enforce the strict invariants (supply caps, cryptographic signatures, cascade revocations, and hash-chained transparency logs) defined in the CapMint blueprints.

---

## 2. Entity Matrix & Catalog

The database is divided into nine core tables, mapped to their single-writer microservices:

```
[Identity Service]     --> certifiers, producers, plots_or_hive_clusters
[Budget Service]       --> budgets
[Minting Service]      --> lots, unit_codes
[Evidence Service]     --> lab_results
[Verification Service] --> scan_events
[Transparency Service] --> log_entries
```

---

### 2.1 Table: `certifiers`
*   **Logical Owner Service**: `Identity Service`
*   **Purpose**: Stores profiles, active public verification keys, and key rotation history of accredited certification bodies.
*   **Key Constraints**: Name must be unique. Public key must be Ed25519 standards-aligned.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `name` | `VARCHAR(255)` | `NOT NULL` | `UNIQUE` | Registered name of the certifier. |
| `accreditation_details`| `JSONB` | `NOT NULL` | None | Accreditation agency IDs, licenses, validity dates. |
| `public_key` | `VARCHAR(128)` | `NOT NULL` | None | Ed25519 cryptographic public key in Hex. |
| `key_status` | `VARCHAR(32)` | `NOT NULL` | Check: `ACTIVE`, `ROTATED`, `REVOKED` | Cryptographic key lifecycle state. |
| `key_rotation_metadata`| `JSONB` | `NULL` | None | Timeline, history of rotated keys, and reasons. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Audit timestamp of registration. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Timestamp of last profile edit. |

*   **Indexing Targets**:
    *   `idx_certifiers_key_status` ON (`key_status`) — Optimizes signature verification checks.
*   **Domain Events**:
    *   Inserts trigger `CertifierRegistered`.
    *   Updates on keys trigger `CertifierKeyRotated`.
*   **Ledger Anchored**: Yes (mutations generate log entries).

---

### 2.2 Table: `producers`
*   **Logical Owner Service**: `Identity Service`
*   **Purpose**: Main profile index of agricultural producers, FPOs, and processing brands.
*   **Key Constraints**: Registry references must contain valid mapping targets.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `name` | `VARCHAR(255)` | `NOT NULL` | None | Registered producer or FPO name. |
| `type` | `VARCHAR(32)` | `NOT NULL` | Check: `FARMER`, `FPO`, `BRAND`, `HIVE_OPERATOR` | Producer operating classification. |
| `registry_references` | `JSONB` | `NOT NULL` | None | AgriStack IDs, TraceNet organic certificates. |
| `contact_metadata` | `JSONB` | `NULL` | None | Address details, emails, phones, manager logs. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Profile creation date. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Last update timestamp. |

*   **Indexing Targets**:
    *   `idx_producers_type` ON (`type`) — Optimizes classification filtering.
*   **Domain Events**:
    *   Inserts trigger `ProducerOnboarded`.
*   **Ledger Anchored**: Yes.

---

### 2.3 Table: `plots_or_hive_clusters`
*   **Logical Owner Service**: `Identity Service`
*   **Purpose**: Geographical boundaries and crop properties of production sites, linked to AgriStack records.
*   **Key Constraints**: AgriStack reference must be unique if present.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `producer_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `producers(id)` | Owning agricultural entity. |
| `geo_boundary` | `JSONB` | `NOT NULL` | None (PostGIS geometry extension can map in production) | Geographic boundary points (polygons / coordinates). |
| `crop_type` | `VARCHAR(64)` | `NOT NULL` | None | Commodity category (e.g. `HONEY`, `MUSTARD`). |
| `season_year` | `VARCHAR(32)` | `NOT NULL` | None | Harvest season (e.g. `Rabi 2026`). |
| `agristack_reference` | `VARCHAR(100)` | `NULL` | `UNIQUE` | External land parcel ID from AgriStack. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Timestamp of registration. |

*   **Indexing Targets**:
    *   `idx_plots_producer` ON (`producer_id`) — Optimizes yield evaluation lookups.
    *   `idx_plots_crop_type` ON (`crop_type`) — Optimizes regional yield audits.
*   **Domain Events**:
    *   Inserts trigger `PlotRegistered`.
*   **Ledger Anchored**: Yes.

---

### 2.4 Table: `budgets`
*   **Logical Owner Service**: `Budget Service`
*   **Purpose**: Manages capacity quotas to prevent organic over-issuance.
*   **Key Constraints**: `consumed_quantity` must be $\le$ `approved_quantity`. Ed25519 signature is mandatory.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `producer_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `producers(id)` | Recipient producer. |
| `certifier_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `certifiers(id)` | Cryptographic signer certifier. |
| `source_unit_type` | `VARCHAR(32)` | `NOT NULL` | Check: `WEIGHT_KG`, `VOLUME_L`, `UNIT_COUNT` | Unit basis of budget capacity. |
| `approved_quantity` | `NUMERIC(12, 2)` | `NOT NULL` | Check: `> 0.00` | Authorized capacity limit. |
| `consumed_quantity` | `NUMERIC(12, 2)` | `NOT NULL` | Default `0.00`, Check: `>= 0.00` | Capacity consumed by minting. |
| `remaining_quantity`| `NUMERIC(12, 2)` | `NOT NULL` | `GENERATED ALWAYS` AS (`approved_quantity` - `consumed_quantity`) | Remaining capacity quota. |
| `yield_assumptions` | `JSONB` | `NOT NULL` | None | Math assumptions (area x yield rate). |
| `signature_bundle` | `VARCHAR(256)` | `NOT NULL` | None | Ed25519 cryptographic signature. |
| `effective_start_date`| `TIMESTAMPTZ` | `NOT NULL` | None | Quota active start timestamp. |
| `effective_end_date` | `TIMESTAMPTZ` | `NOT NULL` | None | Quota expiration timestamp. |
| `status` | `VARCHAR(32)` | `NOT NULL` | Check: `DRAFT`, `PENDING`, `ACTIVE`, `EXHAUSTED`, `REVOKED` | Quota status lifecycle. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Creation date. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Last state transition date. |

*   **Indexing Targets**:
    *   `idx_budgets_producer_status` ON (`producer_id`, `status`) — Optimizes capacity verification queries during minting.
*   **Domain Events**:
    *   Proposed: `BudgetProposed`.
    *   Activated: `BudgetActivated` (on valid signature check).
    *   Exhausted: `BudgetExhausted` (triggered when remaining = 0).
    *   Revoked: `BudgetRevoked`.
*   **Ledger Anchored**: Yes (critical for audit trails).

---

### 2.5 Table: `lots`
*   **Logical Owner Service**: `Minting Service`
*   **Purpose**: Groups unit codes under a packaging batch and links them to residue/adulteration testing evidence.
*   **Key Constraints**: FK constraints to budget.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `producer_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `producers(id)` | Packaging producer. |
| `budget_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `budgets(id)` | Budget quota drawn down. |
| `product_metadata` | `JSONB` | `NOT NULL` | None | Commodity description, GTIN code. |
| `batch_size` | `NUMERIC(12, 2)` | `NOT NULL` | Check: `> 0.00` | Quota volume consumed by lot. |
| `processing_dates` | `JSONB` | `NOT NULL` | None | Packaging and sorting dates. |
| `lab_status` | `VARCHAR(32)` | `NOT NULL` | Default `'PENDING'`, Check: `PENDING`, `PASSED`, `FAILED` | Laboratory check status. |
| `revocation_status` | `VARCHAR(32)` | `NOT NULL` | Default `'ACTIVE'`, Check: `ACTIVE`, `REVOKED` | Invalidation state. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Ingestion timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Update timestamp. |

*   **Indexing Targets**:
    *   `idx_lots_budget` ON (`budget_id`) — Optimizes quota consumption audits.
    *   `idx_lots_revocation` ON (`revocation_status`) — Optimizes status checks during scan resolution.
*   **Domain Events**:
    *   Created: `LotCreated` (deducts budget quota).
    *   Revoked: `LotRevoked` (triggers cascade revocation of unit codes).
*   **Ledger Anchored**: Yes.

---

### 2.6 Table: `unit_codes`
*   **Logical Owner Service**: `Minting Service`
*   **Purpose**: Contains globally unique, non-sequential serialized unit identifiers and their states.
*   **Key Constraints**: `serial` must be unique. `digital_link_uri` must be unique.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `lot_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `lots(id)` | Parent batch lot. |
| `serial` | `VARCHAR(64)` | `NOT NULL` | `UNIQUE` | Random non-sequential cryptographic serial. |
| `gtin` | `VARCHAR(14)` | `NOT NULL` | None | GS1 Global Trade Item Number. |
| `digital_link_uri` | `VARCHAR(2083)` | `NOT NULL` | `UNIQUE` | Standards-aligned URI scan string. |
| `current_state` | `VARCHAR(32)` | `NOT NULL` | Default `'MINTED'`, Check: `MINTED`, `PACKED`, `IN-TRANSIT`, `SHELF`, `VERIFIED`, `REVOKED` | Code state machine indicator. |
| `minted_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Time of minting. |
| `revoked_at` | `TIMESTAMPTZ` | `NULL` | None | Invalidation timestamp (bubbled down from lot). |
| `clone_flag` | `BOOLEAN` | `NOT NULL` | Default `FALSE` | High-risk clone suspect flag. |

*   **Indexing Targets**:
    *   `idx_unit_codes_gtin_serial` ON (`gtin`, `serial`) — **CRITICAL** path index for $<300\text{ms}$ scan resolutions.
    *   `idx_unit_codes_lot` ON (`lot_id`) — Optimizes lot revocation cascade updates.
*   **Domain Events**:
    *   Created: `UnitMinted`.
    *   Transitioned: `UnitStateTransitioned`.
    *   Revoked: `UnitRevoked` (bubbled on lot invalidation).
*   **Ledger Anchored**: Yes.

---

### 2.7 Table: `lab_results`
*   **Logical Owner Service**: `Evidence Service`
*   **Purpose**: Links accredited laboratory tests and PDF hashes to batches/lots.
*   **Key Constraints**: Each lot has exactly one lab result (`UNIQUE` constraint on `lot_id`).

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `lot_id` | `UUID` | `NOT NULL` | `UNIQUE`, `FOREIGN KEY` $\rightarrow$ `lots(id)` | Tested lot batch. |
| `lab_name` | `VARCHAR(255)` | `NOT NULL` | None | Accredited NABL laboratory name. |
| `test_type` | `VARCHAR(64)` | `NOT NULL` | None | Testing method (e.g. NMR, panel). |
| `result_summary` | `VARCHAR(32)` | `NOT NULL` | Check: `PASS`, `FAIL` | Aggregated test outcome. |
| `report_hash` | `VARCHAR(64)` | `NOT NULL` | None | SHA-256 cryptographic hash of PDF. |
| `report_reference` | `VARCHAR(500)` | `NOT NULL` | None | Secure object store URL of the PDF. |
| `decision_impact` | `JSONB` | `NULL` | None | Extracted chemical residue limit trace details. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Ingestion date. |

*   **Indexing Targets**:
    *   `idx_lab_results_lot` ON (`lot_id`) — Optimizes verification lookup details.
*   **Domain Events**:
    *   Uploaded: `LabResultUploaded` (causes lot update and potential revocation cascade).
*   **Ledger Anchored**: Yes.

---

### 2.8 Table: `scan_events`
*   **Logical Owner Service**: `Verification Service`
*   **Purpose**: Log of public QR scans, capturing telemetry for auditing and geovelocity clone detection.
*   **Key Constraints**: FK constraint to target unit code.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `unit_code_id` | `UUID` | `NOT NULL` | `FOREIGN KEY` $\rightarrow$ `unit_codes(id)` | Scanned unit code. |
| `timestamp` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Ingestion timestamp. |
| `location` | `JSONB` | `NULL` | None | Approximate geohash or location bounds. |
| `device_metadata` | `JSONB` | `NOT NULL` | None | IP hash, User-Agent parameters. |
| `verdict` | `VARCHAR(32)` | `NOT NULL` | Check: `VERIFIED`, `REVOKED`, `EXHAUSTED`, `CLONE-SUSPECT`, `MISMATCH` | Verdict presented to client. |
| `anomaly_flags` | `JSONB` | `NULL` | None | Metrics from clone heuristics. |

*   **Indexing Targets**:
    *   `idx_scan_events_unit_code` ON (`unit_code_id`, `timestamp` DESC) — Optimizes geo-velocity checks against historical scan records.
*   **Domain Events**: None (reads do not generate ledger mutations).
*   **Ledger Anchored**: No (stored in relational DB for telemetry/analytics, but excluded from append-only event log to prevent spam bloating).

---

### 2.9 Table: `log_entries`
*   **Logical Owner Service**: `Transparency Service`
*   **Purpose**: The append-only, cryptographic event ledger database structure.
*   **Key Constraints**: `current_hash` must be unique. Previous hash links must be sequential.

| Column Name | Database Data Type | Nullability | Constraints / Keys | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY` | Unique identifier. |
| `entity_type` | `VARCHAR(64)` | `NOT NULL` | None | Reference category (`BUDGET`, `LOT`, etc.). |
| `entity_id` | `UUID` | `NOT NULL` | None | Target record ID. |
| `event_type` | `VARCHAR(64)` | `NOT NULL` | None | Event name (e.g. `'MINT'`). |
| `payload_hash` | `VARCHAR(64)` | `NOT NULL` | None | SHA-256 hash of serialization details. |
| `previous_hash` | `VARCHAR(64)` | `NOT NULL` | None | Link to parent ledger block hash. |
| `current_hash` | `VARCHAR(64)` | `NOT NULL` | `UNIQUE` | Block hash: $\text{SHA-256}(\text{payload\_hash} + \text{previous\_hash})$. |
| `published_anchor_reference` | `VARCHAR(255)` | `NULL` | None | External git commit or anchor ID. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Default `NOW()` | Event timestamp. |

*   **Indexing Targets**:
    *   `idx_log_entries_current_hash` ON (`current_hash`) — Optimizes chain integrity audits.
    *   `idx_log_entries_entity` ON (`entity_type`, `entity_id`) — Optimizes history checks for specific records.
*   **Domain Events**: None.
*   **Ledger Anchored**: This *is* the ledger.

---
*End of entity_catalog.md*
