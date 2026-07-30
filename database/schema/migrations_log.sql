-- CapMint migration ledger metadata, tool version 2.
-- Existing filename/applied_at rows remain valid and are classified as LEGACY.

CREATE TABLE IF NOT EXISTS migrations_log (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE migrations_log
    ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64),
    ADD COLUMN IF NOT EXISTS application_mode VARCHAR(16) NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN IF NOT EXISTS evidence_fingerprint CHAR(64),
    ADD COLUMN IF NOT EXISTS baseline_identifier VARCHAR(255),
    ADD COLUMN IF NOT EXISTS baseline_cutoff INTEGER,
    ADD COLUMN IF NOT EXISTS baseline_next_migration INTEGER,
    ADD COLUMN IF NOT EXISTS baseline_creation_version VARCHAR(64),
    ADD COLUMN IF NOT EXISTS applied_tool_version VARCHAR(32);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'migrations_log'::regclass
          AND conname = 'chk_migrations_log_application_mode'
    ) THEN
        ALTER TABLE migrations_log
            ADD CONSTRAINT chk_migrations_log_application_mode
            CHECK (application_mode IN ('LEGACY', 'EXECUTED', 'ADOPTED', 'BASELINE'));
    END IF;
END;
$$;
