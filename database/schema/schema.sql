-- CapMint Postgres Database Schema (CP-002.5)
-- Target Engine: PostgreSQL 15+
-- Purpose: Complete logical schema definition, constraints, and optimized index configurations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to handle rebuild execution
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS scan_events CASCADE;
DROP TABLE IF EXISTS lab_results CASCADE;
DROP TABLE IF EXISTS unit_codes CASCADE;
DROP TABLE IF EXISTS lots CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS plots_or_hive_clusters CASCADE;
DROP TABLE IF EXISTS producers CASCADE;
DROP TABLE IF EXISTS certifiers CASCADE;

-- 0. Table: users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    associated_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'PRODUCER', 'PACK_HOUSE', 'CERTIFIER', 'LAB'))
);

-- 1. Table: certifiers
CREATE TABLE certifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    accreditation_details JSONB NOT NULL,
    public_key VARCHAR(128) NOT NULL,
    key_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    key_rotation_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_certifiers_key_status CHECK (key_status IN ('ACTIVE', 'ROTATED', 'REVOKED'))
);

-- 2. Table: producers
CREATE TABLE producers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    registry_references JSONB NOT NULL,
    contact_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_producers_type CHECK (type IN ('FARMER', 'FPO', 'BRAND', 'HIVE_OPERATOR'))
);

-- 3. Table: plots_or_hive_clusters
CREATE TABLE plots_or_hive_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID NOT NULL REFERENCES producers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    geo_boundary JSONB NOT NULL,
    crop_type VARCHAR(64) NOT NULL,
    season_year VARCHAR(32) NOT NULL,
    agristack_reference VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table: budgets
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID NOT NULL REFERENCES producers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    certifier_id UUID NOT NULL REFERENCES certifiers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_unit_type VARCHAR(32) NOT NULL,
    approved_quantity NUMERIC(12, 2) NOT NULL CONSTRAINT chk_budgets_approved CHECK (approved_quantity > 0.00),
    consumed_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CONSTRAINT chk_budgets_consumed CHECK (consumed_quantity >= 0.00),
    remaining_quantity NUMERIC(12, 2) GENERATED ALWAYS AS (approved_quantity - consumed_quantity) STORED,
    yield_assumptions JSONB NOT NULL,
    signature_bundle VARCHAR(256) NOT NULL,
    effective_start_date TIMESTAMPTZ NOT NULL,
    effective_end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_budgets_status CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXHAUSTED', 'REVOKED')),
    CONSTRAINT chk_budgets_remaining CHECK (consumed_quantity <= approved_quantity),
    CONSTRAINT chk_budgets_source_unit_type CHECK (source_unit_type IN ('WEIGHT_KG', 'VOLUME_L', 'UNIT_COUNT'))
);

-- 5. Table: lots
CREATE TABLE lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID NOT NULL REFERENCES producers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    product_metadata JSONB NOT NULL,
    batch_size NUMERIC(12, 2) NOT NULL CONSTRAINT chk_lots_batch_size CHECK (batch_size > 0.00),
    processing_dates JSONB NOT NULL,
    lab_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    revocation_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_lots_lab_status CHECK (lab_status IN ('PENDING', 'PASSED', 'FAILED')),
    CONSTRAINT chk_lots_revocation_status CHECK (revocation_status IN ('ACTIVE', 'REVOKED'))
);

-- 6. Table: unit_codes
CREATE TABLE unit_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    serial VARCHAR(64) NOT NULL UNIQUE,
    gtin VARCHAR(14) NOT NULL,
    digital_link_uri VARCHAR(2083) NOT NULL UNIQUE,
    current_state VARCHAR(32) NOT NULL DEFAULT 'MINTED',
    minted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    clone_flag BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_unit_codes_state CHECK (current_state IN ('MINTED', 'PACKED', 'IN-TRANSIT', 'SHELF', 'VERIFIED', 'REVOKED'))
);

-- 7. Table: lab_results
CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id UUID NOT NULL UNIQUE REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    lab_name VARCHAR(255) NOT NULL,
    test_type VARCHAR(64) NOT NULL,
    result_summary VARCHAR(32) NOT NULL,
    report_hash VARCHAR(64) NOT NULL,
    report_reference VARCHAR(500) NOT NULL,
    decision_impact JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_lab_results_summary CHECK (result_summary IN ('PASS', 'FAIL'))
);

-- 8. Table: scan_events
CREATE TABLE scan_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_code_id UUID NOT NULL REFERENCES unit_codes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    location JSONB,
    device_metadata JSONB NOT NULL,
    verdict VARCHAR(32) NOT NULL,
    anomaly_flags JSONB,
    CONSTRAINT chk_scan_events_verdict CHECK (verdict IN ('VERIFIED', 'REVOKED', 'EXHAUSTED', 'CLONE-SUSPECT', 'MISMATCH'))
);

-- 9. Table: log_entries
CREATE TABLE log_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL UNIQUE,
    published_anchor_reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- INDEX DEFINITIONS TO OPTIMIZE SECURITY VERIFICATIONS AND SLA LOOKUPS
-- =========================================================================

-- Index to optimize key status verification checks (Identity Service)
CREATE INDEX idx_certifiers_key_status ON certifiers(key_status);

-- Index to optimize producer categories search
CREATE INDEX idx_producers_type ON producers(type);

-- Index to optimize site lookup by owner and crop type
CREATE INDEX idx_plots_producer ON plots_or_hive_clusters(producer_id);
CREATE INDEX idx_plots_crop_type ON plots_or_hive_clusters(crop_type);

-- Index to optimize capacity validation checks during minting drawdowns (Budget Service)
CREATE INDEX idx_budgets_producer_status ON budgets(producer_id, status);

-- Index to optimize budget lot associations and invalidations (Minting Service)
CREATE INDEX idx_lots_budget ON lots(budget_id);
CREATE INDEX idx_lots_revocation ON lots(revocation_status);

-- CRITICAL INDEX: Compound index to guarantee low latency verification lookups (<300ms SLA)
CREATE INDEX idx_unit_codes_gtin_serial ON unit_codes(gtin, serial);
CREATE INDEX idx_unit_codes_lot ON unit_codes(lot_id);

-- Index for lab evidence queries
CREATE INDEX idx_lab_results_lot ON lab_results(lot_id);

-- CRITICAL INDEX: Compound key with DESC sorting to optimize spatial-temporal geovelocity clone checks
CREATE INDEX idx_scan_events_unit_code_timestamp ON scan_events(unit_code_id, timestamp DESC);

-- Index to optimize chain validation scans on transparency log
CREATE INDEX idx_log_entries_current_hash ON log_entries(current_hash);
CREATE INDEX idx_log_entries_entity ON log_entries(entity_type, entity_id);

-- Index to optimize authentication profile lookups
CREATE INDEX idx_users_username ON users(username);

