-- 0007: Create producer_brandings table (previously only present in schema.sql; the migration
-- path never created it, so migration-built databases were missing the table). Idempotent.

CREATE TABLE IF NOT EXISTS producer_brandings (
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

-- Keep updated_at fresh on modification (was missing for this table).
DROP TRIGGER IF EXISTS trigger_update_producer_brandings_updated_at ON producer_brandings;
CREATE TRIGGER trigger_update_producer_brandings_updated_at
    BEFORE UPDATE ON producer_brandings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
