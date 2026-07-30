-- Migration 0008: Add columns for workflow gaps (onboarding, budget history, investigations)

-- 1. Extend organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS verification_evidence JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS uploaded_documents JSONB DEFAULT '[]'::jsonb;

-- 2. Extend budgets table
ALTER TABLE budgets 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

-- 3. Extend investigations table
ALTER TABLE investigations 
ADD COLUMN IF NOT EXISTS assigned_to UUID,
ADD COLUMN IF NOT EXISTS case_notes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS evidence_timeline JSONB DEFAULT '[]'::jsonb;
