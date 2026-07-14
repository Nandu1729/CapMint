# CapMint — Business Domain Discovery (CP-002.1)

## 1. Executive Summary

This document represents the deliverables for **CP-002.1 (Business Domain Discovery)** under the CapMint Development Operating System. It defines the core domain model, entities, attributes, state transitions, business operations, and system invariants based on the frozen system context and working Product Requirements Document (PRD).

The CapMint system is designed as a unit-level serialization registry and capacity enforcer. Its primary mission is to prevent supply chain over-issuance fraud (selling conventional products under organic certificate quotas) by enforcing certifier-signed yield limits before physical identifiers (QR codes) can be minted.

---

## 2. Domain Concept Vocabulary

The business domain is structured around nine core concepts:

1. **Certifier**: The regulatory authority that audits organic/premium claims, registers cryptographic signing keys, and approves yield budgets.
2. **Producer**: The agricultural entity (Farmer, FPO, Hive Operator, Brand, Exporter) that cultivates or sources the commodity.
3. **Plot or Hive Cluster**: The physical land parcel or apiary registered under a producer, establishing the geographic bounds of production.
4. **Budget**: The approved seasonal capacity ceiling (by unit, volume, or weight) allocated to a producer. Requires certifier digital signature.
5. **Lot**: A processed, packaged, or sorted batch of goods originating from a production run, drawing from an active budget.
6. **Unit Code**: The individual retail package identity, exposed via a GS1 Digital Link compatible QR code.
7. **Lab Result**: The chemical or physical analysis report (e.g., NMR, pesticide panel) binding analytical evidence to a specific lot.
8. **Scan Event**: The consumer verification query and telemetry record (IP, timestamp, approximate geohash).
9. **Log Entry**: The immutable building block of the hash-chained, append-only integrity ledger.

---

## 3. Entity Specification

Below is the conceptual mapping of the domain entities and their structural attributes:

### 3.1 Certifier
*   **Purpose**: Represents the certification authority owning the keys used to sign budgets and authorize revocations.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `name` (String): Authorized name of the certifying organization.
    *   `accreditation_details` (JSON): Accreditation IDs, validity dates, and regulatory scopes (e.g., NPOP, PGS-India).
    *   `public_key` (String/Hex): Ed25519 cryptographic public key used for signature verification.
    *   `key_status` (Enum): `ACTIVE`, `ROTATED`, `REVOKED`.
    *   `key_rotation_metadata` (JSON): Timestamps, previous key references, revocation reason.

### 3.2 Producer
*   **Purpose**: The commercial producer, FPO, or brand requesting serialization.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `name` (String): Registered business name.
    *   `type` (Enum): `FARMER`, `FPO`, `BRAND`, `HIVE_OPERATOR`.
    *   `registry_references` (JSON): Mappings to external registries (AgriStack ID, cooperative registry numbers, TraceNet ID).
    *   `contact_metadata` (JSON): Phone, email, address, key contacts.

### 3.3 Plot or Hive Cluster
*   **Purpose**: Represents the physical site of production linked to AgriStack coordinates.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `producer_id` (UUID, Foreign Key $\rightarrow$ Producer): Reference to the owning producer.
    *   `geo_boundary` (JSON/PostGIS): Spatial boundaries, polygon points, or location coordinates.
    *   `crop_type` (String): Commodity type (e.g. wheat, organic honey, mustard).
    *   `season_year` (String): Active harvest season (e.g., Rabi 2026).
    *   `agristack_reference` (String): Outer land parcel ID/reference.

### 3.4 Budget
*   **Purpose**: The capacity ceiling allocation restricting how many unit codes can be serialized.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `producer_id` (UUID, Foreign Key $\rightarrow$ Producer): Target producer.
    *   `certifier_id` (UUID, Foreign Key $\rightarrow$ Certifier): Approving certifier.
    *   `source_unit_type` (Enum): `WEIGHT_KG`, `VOLUME_L`, `UNIT_COUNT`.
    *   `approved_quantity` (Numeric): Total capacity limit.
    *   `consumed_quantity` (Numeric): Capacity quantity already drawn down by mint requests.
    *   `remaining_quantity` (Numeric): Calculated as `approved_quantity` - `consumed_quantity`.
    *   `yield_assumptions` (JSON): Plot area x crop yield coefficients supporting the budget computation.
    *   `signature_bundle` (String/Hex): Ed25519 signature of the certifier over the budget parameters.
    *   `effective_start_date` (Timestamp): Start of validity period.
    *   `effective_end_date` (Timestamp): End of validity period.
    *   `status` (Enum): `DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `EXHAUSTED`, `REVOKED`.

### 3.5 Lot
*   **Purpose**: Groups individual unit codes under a common production run and lab evidence.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `producer_id` (UUID, Foreign Key $\rightarrow$ Producer): Packing producer.
    *   `budget_id` (UUID, Foreign Key $\rightarrow$ Budget): Capacity quota lot draws against.
    *   `product_metadata` (JSON): GTIN, commodity name, package details.
    *   `batch_size` (Numeric): Declared quantity of units in the lot.
    *   `processing_dates` (JSON): Sorting and packaging timestamps.
    *   `lab_status` (Enum): `PENDING`, `PASSED`, `FAILED`.
    *   `revocation_status` (Enum): `ACTIVE`, `REVOKED`.

### 3.6 Unit Code
*   **Purpose**: A unique serialized retail unit code.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `lot_id` (UUID, Foreign Key $\rightarrow$ Lot): Parent lot association.
    *   `serial` (String, Unique): Random non-sequential cryptographic serial.
    *   `GTIN` (String): GS1 Global Trade Item Number.
    *   `digital_link_uri` (String, Unique): GS1 Digital Link formatted URL.
    *   `current_state` (Enum): `MINTED`, `PACKED`, `IN-TRANSIT`, `SHELF`, `VERIFIED`, `REVOKED`.
    *   `minted_at` (Timestamp): Date of serialization.
    *   `revoked_at` (Timestamp, Nullable): Timestamp of invalidation.
    *   `clone_flag` (Boolean): Suspicious scan marker.

### 3.7 Lab Result
*   **Purpose**: The residue report issued by NABL labs.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `lot_id` (UUID, Foreign Key $\rightarrow$ Lot): Target tested lot.
    *   `lab_name` (String): Accredited NABL laboratory name.
    *   `test_type` (String): Chemical testing method (e.g. GC-MS, NMR).
    *   `result_summary` (Enum): `PASS`, `FAIL`.
    *   `report_hash` (String/SHA-256): Cryptographic hash of the raw PDF file.
    *   `report_reference` (String): URL reference to secure PDF document storage.
    *   `decision_impact` (JSON): Extracted pesticide trace levels.

### 3.8 Scan Event
*   **Purpose**: Telemetry record of QR code verification requests.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `unit_code_id` (UUID, Foreign Key $\rightarrow$ Unit Code): target serial.
    *   `timestamp` (Timestamp): Time of query ingestion.
    *   `location` (JSON/Geohash): Client geohash (where browser geolocations are permitted).
    *   `device_metadata` (JSON): IP hash, User-Agent header, verification client type.
    *   `verdict` (Enum): Verdict returned (`VERIFIED`, `REVOKED`, `EXHAUSTED`, `CLONE-SUSPECT`, `MISMATCH`).
    *   `anomaly_flags` (JSON): Spatial-temporal clone analysis score results.

### 3.9 Log Entry
*   **Purpose**: Event block inside the append-only ledger.
*   **Key Fields**:
    *   `id` (UUID, Primary Key): Unique internal identifier.
    *   `entity_type` (String): Target entity context (`BUDGET`, `LOT`, `UNIT_CODE`).
    *   `entity_id` (UUID): Reference ID of the target record.
    *   `event_type` (String): E.g. `MINT_SERIAL`, `STATE_TRANSITION`, `REVOKE_LOT`.
    *   `payload_hash` (String/SHA-256): Hash of the serialized mutation payload.
    *   `previous_hash` (String/SHA-256): Link to the previous ledger block.
    *   `current_hash` (String/SHA-256): Calculated hash of this entry block: $\text{SHA-256}(\text{payload\_hash} + \text{previous\_hash})$.
    *   `published_anchor_reference` (String, Nullable): Commit link or reference of the published chain head.

---

## 4. Domain Operations (State Mutations)

1.  **Onboard Certifier**: Register certifier metadata, store their public key, and set status to `ACTIVE`.
2.  **Onboard Producer**: Ingest farmer / FPO metadata, verify parameters against AgriStack.
3.  **Register Site**: Associate geographic boundary (plot) with producer.
4.  **Propose Capacity**: Construct seasonal yield budget draft (`status = DRAFT`).
5.  **Authorize Budget**: Verify certifier's Ed25519 signature against the budget draft payload. Set status to `ACTIVE`.
6.  **Drawdown / Mint**: Request serialization of $N$ unit codes for a brand.
    *   **Enforce**: `remaining_quantity` $\ge N$.
    *   **Action**: Generate $N$ non-sequential serials, format GS1 DL, deduct capacity in a transactional block. Add events to the Event Log.
7.  **Transition Code State**: Update unit state from `MINTED` $\rightarrow$ `PACKED` $\rightarrow$ `IN-TRANSIT` $\rightarrow$ `SHELF`.
8.  **Link Evidence**: Ingest lab report PDF, calculate SHA-256, store report metadata, and link to targeted Lot.
9.  **Revoke Lot**: Transition lot revocation status to `REVOKED`. Cascade status instantly to all attached unit codes.
10. **Ingest Scan**: Record scan timestamp, geolocation, IP hash. Perform geo-velocity clone detection. Return public verdict.

---

## 5. Non-Negotiable Rules & Business Constraints

*   **ACID Minting Rule**: Serialization requests must perform capacity checks and drawdowns inside strict database transaction blocks (`SELECT ... FOR UPDATE` row locks) to guarantee no double drawdowns or capacity over-issuance occur under parallel requests.
*   **Co-Signed budget Gate**: Minting is blocked if a budget's `signature_bundle` is invalid or missing. The system must not be able to bypass certifier signature checks.
*   **Fail-Closed Validation**: Any validation failure (e.g. signature verification error, database timeout, missing AgriStack record) must immediately halt operations and block the request.
*   **Verdict Isolation**: The public verifier page must return exactly one of the five approved verdicts: `VERIFIED`, `REVOKED`, `EXHAUSTED`, `CLONE-SUSPECT`, `MISMATCH`. No generic or marketing text (e.g., "100% organic guaranteed") is permitted.
*   **Log Continuity Constraint**: A Log Entry cannot be inserted unless its `previous_hash` exactly matches the `current_hash` of the preceding block. Any mutation of past entries must render all downstream blocks invalid.
*   **Cascade Revocation**: Unit codes linked to a revoked Lot must resolve to `REVOKED` immediately, even if their individual states remain `SHELF` or `VERIFIED`.

---
*End of domain_discovery.md*
