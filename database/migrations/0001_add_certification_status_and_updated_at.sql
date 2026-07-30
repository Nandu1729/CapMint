-- Migration: Add certification_status to lots and updated_at to lab_results
-- Date: 2026-07-18

-- 1. Add certification_status column to lots table with check constraint
ALTER TABLE lots ADD COLUMN certification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING';
ALTER TABLE lots ADD CONSTRAINT chk_lots_certification_status CHECK (certification_status IN ('PENDING', 'CERTIFIED', 'REVOKED'));

-- 2. Add updated_at column to lab_results table
ALTER TABLE lab_results ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
