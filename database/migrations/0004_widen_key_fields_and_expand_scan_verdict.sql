-- Migration: Widen certifier public keys, budget signature bundles, and expand scan event verdict constraint
-- Date: 2026-07-18

-- 1. Widen public_key in certifiers table
ALTER TABLE certifiers ALTER COLUMN public_key TYPE TEXT;

-- 2. Widen signature_bundle in budgets table
ALTER TABLE budgets ALTER COLUMN signature_bundle TYPE TEXT;

-- 3. Update scan_events verdict check constraint to allow 'EXPIRED'
ALTER TABLE scan_events DROP CONSTRAINT IF EXISTS chk_scan_events_verdict;
ALTER TABLE scan_events ADD CONSTRAINT chk_scan_events_verdict CHECK (verdict IN ('VERIFIED', 'REVOKED', 'EXHAUSTED', 'CLONE-SUSPECT', 'MISMATCH', 'EXPIRED'));
