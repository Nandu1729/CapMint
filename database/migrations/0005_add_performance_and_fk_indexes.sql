-- Migration: Add foreign key and performance index optimizations
-- Date: 2026-07-18

-- 1. Foreign Key Index on users(organization_id)
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- 2. Foreign Key Index on budgets(certifier_id)
CREATE INDEX IF NOT EXISTS idx_budgets_certifier_id ON budgets(certifier_id);

-- 3. Foreign Key Index on lots(producer_id)
CREATE INDEX IF NOT EXISTS idx_lots_producer_id ON lots(producer_id);

-- 4. Status Index on lots(certification_status)
CREATE INDEX IF NOT EXISTS idx_lots_certification_status ON lots(certification_status);

-- 5. Status Index on unit_codes(current_state)
CREATE INDEX IF NOT EXISTS idx_unit_codes_current_state ON unit_codes(current_state);

-- 6. Verdict Index on scan_events(verdict)
CREATE INDEX IF NOT EXISTS idx_scan_events_verdict ON scan_events(verdict);

-- 7. Audit chronological index on log_entries(created_at DESC)
CREATE INDEX IF NOT EXISTS idx_log_entries_created_at_desc ON log_entries(created_at DESC);
