# CapMint — Entity Relationship Diagram (CP-002.4)

## 1. Executive Summary

This document represents the deliverables for **CP-002.4 (ERD)** under the Database Design phase. It defines the logical Entity Relationship Diagram (ERD) mapping the tables, attributes, primary/foreign keys, and relational cardinalities of the CapMint database.

---

## 2. Visual Entity Relationship Diagram (Mermaid)

The diagram below represents the logical relationships and primary/foreign key connections of all core entities in the database:

```mermaid
erDiagram
    certifiers {
        uuid id PK
        varchar name UK
        jsonb accreditation_details
        varchar public_key
        varchar key_status
        jsonb key_rotation_metadata
        timestamptz created_at
        timestamptz updated_at
    }
    producers {
        uuid id PK
        varchar name
        varchar type
        jsonb registry_references
        jsonb contact_metadata
        timestamptz created_at
        timestamptz updated_at
    }
    plots_or_hive_clusters {
        uuid id PK
        uuid producer_id FK
        jsonb geo_boundary
        varchar crop_type
        varchar season_year
        varchar agristack_reference UK
        timestamptz created_at
    }
    budgets {
        uuid id PK
        uuid producer_id FK
        uuid certifier_id FK
        varchar source_unit_type
        numeric approved_quantity
        numeric consumed_quantity
        numeric remaining_quantity
        jsonb yield_assumptions
        varchar signature_bundle
        timestamptz effective_start_date
        timestamptz effective_end_date
        varchar status
        timestamptz created_at
        timestamptz updated_at
    }
    lots {
        uuid id PK
        uuid producer_id FK
        uuid budget_id FK
        jsonb product_metadata
        numeric batch_size
        jsonb processing_dates
        varchar lab_status
        varchar revocation_status
        timestamptz created_at
        timestamptz updated_at
    }
    unit_codes {
        uuid id PK
        uuid lot_id FK
        varchar serial UK
        varchar gtin
        varchar digital_link_uri UK
        varchar current_state
        timestamptz minted_at
        timestamptz revoked_at
        boolean clone_flag
    }
    lab_results {
        uuid id PK
        uuid lot_id FK, UK
        varchar lab_name
        varchar test_type
        varchar result_summary
        varchar report_hash
        varchar report_reference
        jsonb decision_impact
        timestamptz created_at
    }
    scan_events {
        uuid id PK
        uuid unit_code_id FK
        timestamptz timestamp
        jsonb location
        jsonb device_metadata
        varchar verdict
        jsonb anomaly_flags
    }
    log_entries {
        uuid id PK
        varchar entity_type
        uuid entity_id
        varchar event_type
        varchar payload_hash
        varchar previous_hash
        varchar current_hash UK
        varchar published_anchor_reference
        timestamptz created_at
    }

    producers ||--o{ plots_or_hive_clusters : "owns"
    certifiers ||--o{ budgets : "approves"
    producers ||--o{ budgets : "receives"
    budgets ||--o{ lots : "limits"
    producers ||--o{ lots : "packages"
    lots ||--o{ unit_codes : "groups"
    lots ||--o| lab_results : "supported by"
    unit_codes ||--o{ scan_events : "triggers"
```

---

## 3. Relationship Explanations

1.  **`producers` $\rightarrow$ `plots_or_hive_clusters` ($1:N$)**: A producer owns zero or more geographical production sites (plots or hive clusters).
2.  **`certifiers` $\rightarrow$ `budgets` ($1:N$)**: A certifier authorizes and cryptographically signs zero or more capacity budgets.
3.  **`producers` $\rightarrow$ `budgets` ($1:N$)**: A producer receives zero or more capacity budgets allowing them to serialize goods.
4.  **`budgets` $\rightarrow$ `lots` ($1:N$)**: A budget quota constrains zero or more production batches (lots).
5.  **`producers` $\rightarrow$ `lots` ($1:N$)**: A producer acts as the packaging organization for zero or more lots.
6.  **`lots` $\rightarrow$ `unit_codes` ($1:N$)**: A lot run generates one or more retail-level package unit codes.
7.  **`lots` $\rightarrow$ `lab_results` ($1:1$)**: A lot run is backed by at most one analytical test report (NMR/residue panels).
8.  **`unit_codes` $\rightarrow$ `scan_events` ($1:N$)**: An individual unit code generates zero or more public verification telemetry logs.

*Note: The `log_entries` table is logically associated with all mutable entities (Budgets, Lots, Unit Codes) using polymorphic references (`entity_type` + `entity_id`) without physical foreign key constraints. This prevents cascading deletions or profile changes from breaking the historical cryptographic chain.*

---
*End of erd.md*
