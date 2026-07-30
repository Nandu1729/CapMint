-- 0011: Add explicit, nullable organization ownership to producer and
-- certifier profiles without changing runtime authorization semantics.
--
-- Existing equal-ID profiles are backfilled only when the matching
-- organization exists. Unmapped profiles remain NULL for later operator
-- resolution. RLS policies and NOT NULL enforcement are intentionally
-- deferred to DM-03 Phase C3.

ALTER TABLE producers
    ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE certifiers
    ADD COLUMN IF NOT EXISTS organization_id UUID;

DO $capmint_profile_columns$
DECLARE
    producer_column RECORD;
    certifier_column RECORD;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr
    INTO producer_column
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid = 'producers'::regclass
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped;

    IF NOT FOUND
       OR producer_column.data_type <> 'uuid'
       OR producer_column.not_null
       OR producer_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0011_INCOMPATIBLE_PRODUCER_ORGANIZATION_ID: expected nullable UUID without a default';
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr
    INTO certifier_column
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid = 'certifiers'::regclass
      AND a.attname = 'organization_id'
      AND NOT a.attisdropped;

    IF NOT FOUND
       OR certifier_column.data_type <> 'uuid'
       OR certifier_column.not_null
       OR certifier_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0011_INCOMPATIBLE_CERTIFIER_ORGANIZATION_ID: expected nullable UUID without a default';
    END IF;
END;
$capmint_profile_columns$;

UPDATE producers AS producer
SET organization_id = producer.id
WHERE producer.organization_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM organizations AS organization
      WHERE organization.id = producer.id
  );

UPDATE certifiers AS certifier
SET organization_id = certifier.id
WHERE certifier.organization_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM organizations AS organization
      WHERE organization.id = certifier.id
  );

DO $capmint_profile_foreign_keys$
DECLARE
    constraint_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(c.oid, true)
    INTO constraint_definition
    FROM pg_constraint c
    WHERE c.conrelid = 'producers'::regclass
      AND c.conname = 'producers_organization_id_fkey';

    IF NOT FOUND THEN
        ALTER TABLE producers
            ADD CONSTRAINT producers_organization_id_fkey
            FOREIGN KEY (organization_id)
            REFERENCES organizations(id)
            NOT VALID;
    ELSIF constraint_definition <>
          'FOREIGN KEY (organization_id) REFERENCES organizations(id)' THEN
        RAISE EXCEPTION
            '0011_INCOMPATIBLE_PRODUCER_ORGANIZATION_FK: %',
            constraint_definition;
    END IF;

    SELECT pg_get_constraintdef(c.oid, true)
    INTO constraint_definition
    FROM pg_constraint c
    WHERE c.conrelid = 'certifiers'::regclass
      AND c.conname = 'certifiers_organization_id_fkey';

    IF NOT FOUND THEN
        ALTER TABLE certifiers
            ADD CONSTRAINT certifiers_organization_id_fkey
            FOREIGN KEY (organization_id)
            REFERENCES organizations(id)
            NOT VALID;
    ELSIF constraint_definition <>
          'FOREIGN KEY (organization_id) REFERENCES organizations(id)' THEN
        RAISE EXCEPTION
            '0011_INCOMPATIBLE_CERTIFIER_ORGANIZATION_FK: %',
            constraint_definition;
    END IF;
END;
$capmint_profile_foreign_keys$;

ALTER TABLE producers
    VALIDATE CONSTRAINT producers_organization_id_fkey;

ALTER TABLE certifiers
    VALIDATE CONSTRAINT certifiers_organization_id_fkey;

CREATE INDEX IF NOT EXISTS idx_producers_organization_id
    ON producers(organization_id);

CREATE INDEX IF NOT EXISTS idx_certifiers_organization_id
    ON certifiers(organization_id);
