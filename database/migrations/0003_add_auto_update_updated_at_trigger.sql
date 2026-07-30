-- Migration: Add auto update updated_at trigger
-- Date: 2026-07-18

-- 1. Create OR REPLACE the plpgsql update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Attach BEFORE UPDATE triggers to all tables having updated_at columns
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
