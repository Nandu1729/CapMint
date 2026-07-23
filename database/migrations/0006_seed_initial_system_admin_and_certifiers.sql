-- Migration: Seed initial system administrator organization, user, and default certifier
-- Date: 2026-07-19

-- 1. Insert default System Admin Organization
INSERT INTO organizations (id, name, type, official_email, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'CapMint System Administration',
    'SYSTEM_ADMINISTRATOR',
    'sysadmin@capmint.gov.in',
    'ACTIVATED'
)
ON CONFLICT DO NOTHING;

-- 2. Insert default System Admin User
INSERT INTO users (id, organization_id, username, password_hash, role, status)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'sysadmin',
    '$2b$10$e8N8yQ/7qY2vT6E4P7J9s.zP6Xg2Z4Q2W8R9Y3Z4Q2W8R9Y3Z4Q2W',
    'ADMIN',
    'ACTIVE'
)
ON CONFLICT DO NOTHING;

-- 3. Insert default National Certifier
INSERT INTO certifiers (id, name, accreditation_details, public_key, key_status)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'National Agricultural Quality Board',
    '{"accreditation_no": "NAQB-IND-2026-01", "authority": "Ministry of Agriculture"}',
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuivJCz//jZz3K7oRzWslrZ8f02pSYSU/9LqPUFgBBHA=\n-----END PUBLIC KEY-----',
    'ACTIVE'
)
ON CONFLICT DO NOTHING;
