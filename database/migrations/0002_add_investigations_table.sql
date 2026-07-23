-- Migration: Add investigations table
-- Date: 2026-07-18

CREATE TABLE IF NOT EXISTS investigations (
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
    CONSTRAINT chk_investigations_status CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'REVOKED', 'DISMISSED'))
);

CREATE INDEX IF NOT EXISTS idx_investigations_public_identifier ON investigations(public_identifier);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);
