-- 0022: A draft budget has not yet been countersigned by its certifier.
-- The certifier activation action is the only source of signature_bundle.

DO $capmint_0022_preflight$
DECLARE
    signature_column RECORD;
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.migrations_log
           WHERE filename = '0021_add_not_certified_scan_verdict.sql'
       ) THEN
        RAISE EXCEPTION '0022_PREDECESSOR_NOT_RECORDED: migration 0021 must be recorded';
    END IF;

    IF to_regclass('public.budgets') IS NULL THEN
        RAISE EXCEPTION '0022_TARGET_TABLE_MISSING';
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expr
    INTO signature_column
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = 'public.budgets'::regclass
      AND attribute.attname = 'signature_bundle'
      AND NOT attribute.attisdropped;

    IF NOT FOUND
       OR signature_column.data_type <> 'text'
       OR signature_column.default_expr IS NOT NULL THEN
        RAISE EXCEPTION
            '0022_SIGNATURE_COLUMN_INCOMPATIBLE: expected TEXT without a default';
    END IF;

    IF NOT signature_column.not_null THEN
        RETURN;
    END IF;

    ALTER TABLE public.budgets
        ALTER COLUMN signature_bundle DROP NOT NULL;
END;
$capmint_0022_preflight$;
