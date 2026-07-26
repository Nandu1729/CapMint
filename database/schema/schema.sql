-- CapMint PostgreSQL schema snapshot
-- Snapshot version: 2026-07-26-DM03-C3c
-- Generated: 2026-07-26
-- Authoritative migration cutoff: 0013_tighten_tenant_constraints.sql
-- Intended use: inspection and disposable-database schema comparison only.
-- DO NOT apply this snapshot to an existing database. Forward migrations are
-- the authoritative schema evolution path.
-- Target Engine: PostgreSQL 15+
-- Purpose: Complete logical schema definition, constraints, and optimized index configurations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0.1 Table: organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(64) NOT NULL,
    business_reg_details JSONB NOT NULL DEFAULT '{}',
    official_email VARCHAR(255) NOT NULL UNIQUE,
    contact_info JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approval_notes TEXT,
    verification_evidence JSONB DEFAULT '{}'::jsonb,
    uploaded_documents JSONB DEFAULT '[]'::jsonb,
    CONSTRAINT chk_organizations_type CHECK (type IN ('PRODUCER', 'NABL_LABORATORY', 'CERTIFICATION_BODY', 'EXPORTER', 'SYSTEM_ADMINISTRATOR')),
    CONSTRAINT chk_organizations_status CHECK (status IN ('PENDING', 'VERIFICATION', 'APPROVED', 'ACTIVATED', 'SUSPENDED'))
);

-- 0. Table: users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    associated_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'MEMBER')),
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

-- 1. Table: certifiers
CREATE TABLE certifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    accreditation_details JSONB NOT NULL,
    public_key TEXT NOT NULL,
    key_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    key_rotation_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    organization_id UUID REFERENCES organizations(id),
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
    organization_id UUID NOT NULL REFERENCES organizations(id),
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
    signature_bundle TEXT NOT NULL,
    effective_start_date TIMESTAMPTZ NOT NULL,
    effective_end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rejection_reason TEXT,
    status_history JSONB DEFAULT '[]'::jsonb,
    CONSTRAINT budgets_id_producer_id_key UNIQUE (id, producer_id),
    CONSTRAINT chk_budgets_status CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'REVIEWING', 'APPROVED', 'ACTIVE', 'EXHAUSTED', 'REVOKED', 'REJECTED', 'REVISION_REQUESTED')),
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
    certification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_laboratory_organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    CONSTRAINT lots_budget_id_producer_id_fkey FOREIGN KEY (budget_id, producer_id) REFERENCES budgets(id, producer_id) ON DELETE RESTRICT,
    CONSTRAINT chk_lots_lab_status CHECK (lab_status IN ('PENDING', 'PASSED', 'FAILED')),
    CONSTRAINT chk_lots_revocation_status CHECK (revocation_status IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT chk_lots_certification_status CHECK (certification_status IN ('PENDING', 'CERTIFIED', 'REVOKED'))
);

-- 6. Table: unit_codes
CREATE TABLE unit_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    serial VARCHAR(64) NOT NULL UNIQUE,
    gtin VARCHAR(14) NOT NULL,
    digital_link_uri VARCHAR(2083) NOT NULL UNIQUE,
    public_identifier UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    verification_url VARCHAR(2083) NOT NULL UNIQUE,
    qr_code_data_uri TEXT,
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_by_organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
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
    CONSTRAINT chk_scan_events_verdict CHECK (verdict IN ('VERIFIED', 'REVOKED', 'EXHAUSTED', 'CLONE-SUSPECT', 'MISMATCH', 'EXPIRED'))
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

-- 10. Table: investigations
CREATE TABLE investigations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name VARCHAR(255) NOT NULL,
    public_identifier UUID NOT NULL UNIQUE,
    risk_level VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    detection_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    detection_reason TEXT NOT NULL,
    manufacturer VARCHAR(255) NOT NULL,
    current_product_status VARCHAR(32) NOT NULL,
    evidence JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_to UUID,
    case_notes JSONB DEFAULT '[]'::jsonb,
    evidence_timeline JSONB DEFAULT '[]'::jsonb,
    unit_code_id UUID NOT NULL REFERENCES unit_codes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_investigations_status CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REVOKED', 'DISMISSED', 'CLOSED'))
);

-- 11. Table: producer_brandings
CREATE TABLE producer_brandings (
    producer_id UUID PRIMARY KEY REFERENCES producers(id) ON DELETE CASCADE,
    logo_url VARCHAR(512),
    primary_color VARCHAR(16) DEFAULT '#10B981',
    accent_color VARCHAR(16) DEFAULT '#3B82F6',
    brand_story TEXT,
    custom_banner_url VARCHAR(512),
    cta_text VARCHAR(100),
    cta_link VARCHAR(512),
    cta_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- INDEX DEFINITIONS TO OPTIMIZE SECURITY VERIFICATIONS AND SLA LOOKUPS
-- =========================================================================

-- Index to optimize key status verification checks (Identity Service)
CREATE INDEX idx_certifiers_key_status ON certifiers(key_status);
CREATE INDEX idx_certifiers_organization_id ON certifiers(organization_id);

-- Index to optimize producer categories search
CREATE INDEX idx_producers_type ON producers(type);
CREATE INDEX idx_producers_organization_id ON producers(organization_id);

-- Index to optimize site lookup by owner and crop type
CREATE INDEX idx_plots_producer ON plots_or_hive_clusters(producer_id);
CREATE INDEX idx_plots_crop_type ON plots_or_hive_clusters(crop_type);

-- Index to optimize capacity validation checks during minting drawdowns (Budget Service)
CREATE INDEX idx_budgets_producer_status ON budgets(producer_id, status);
CREATE INDEX idx_budgets_certifier_id ON budgets(certifier_id);

-- Index to optimize budget lot associations and invalidations (Minting Service)
CREATE INDEX idx_lots_budget ON lots(budget_id);
CREATE INDEX idx_lots_revocation ON lots(revocation_status);
CREATE INDEX idx_lots_producer_id ON lots(producer_id);
CREATE INDEX idx_lots_certification_status ON lots(certification_status);
CREATE INDEX idx_lots_assigned_laboratory_organization_id ON lots(assigned_laboratory_organization_id);

-- CRITICAL INDEX: Compound index to guarantee low latency verification lookups (<300ms SLA)
CREATE INDEX idx_unit_codes_gtin_serial ON unit_codes(gtin, serial);
CREATE INDEX idx_unit_codes_lot ON unit_codes(lot_id);
CREATE INDEX idx_unit_codes_current_state ON unit_codes(current_state);

-- Index for lab evidence queries
CREATE INDEX idx_lab_results_lot ON lab_results(lot_id);
CREATE INDEX idx_lab_results_submitted_by_organization_id ON lab_results(submitted_by_organization_id);

-- CRITICAL INDEX: Compound key with DESC sorting to optimize spatial-temporal geovelocity clone checks
CREATE INDEX idx_scan_events_unit_code_timestamp ON scan_events(unit_code_id, timestamp DESC);
CREATE INDEX idx_scan_events_verdict ON scan_events(verdict);

-- Index to optimize chain validation scans on transparency log
CREATE INDEX idx_log_entries_current_hash ON log_entries(current_hash);
CREATE INDEX idx_log_entries_entity ON log_entries(entity_type, entity_id);
CREATE INDEX idx_log_entries_created_at_desc ON log_entries(created_at DESC);

-- Index to optimize authentication profile lookups
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_organization_id ON users(organization_id);

-- Index to optimize clone investigations search
CREATE INDEX idx_investigations_public_identifier ON investigations(public_identifier);
CREATE INDEX idx_investigations_status ON investigations(status);
CREATE UNIQUE INDEX idx_investigations_unit_code_id ON investigations(unit_code_id);

-- =========================================================================
-- DATABASE FUNCTIONS AND AUTO-UPDATE TRIGGERS
-- =========================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_certifiers_updated_at
    BEFORE UPDATE ON certifiers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_producers_updated_at
    BEFORE UPDATE ON producers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_lots_updated_at
    BEFORE UPDATE ON lots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_lab_results_updated_at
    BEFORE UPDATE ON lab_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_investigations_updated_at
    BEFORE UPDATE ON investigations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_producer_brandings_updated_at
    BEFORE UPDATE ON producer_brandings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
