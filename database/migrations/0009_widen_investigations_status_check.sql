-- 0009: Widen the investigations status CHECK to the full set the application writes.
-- The original migration (0002) only allowed OPEN/UNDER_REVIEW/REVOKED/DISMISSED, but the
-- verification-service escalate/close flows write ESCALATED, RESOLVED and CLOSED, which failed
-- with a constraint violation on migration-built databases. Idempotent.

ALTER TABLE investigations DROP CONSTRAINT IF EXISTS chk_investigations_status;
ALTER TABLE investigations ADD CONSTRAINT chk_investigations_status
    CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REVOKED', 'DISMISSED', 'CLOSED'));
