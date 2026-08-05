-- 0021: Record honest pre-certification scans without weakening the fixed
-- verification verdict vocabulary.

DO $capmint_0021_preflight$
DECLARE
    verdict_position smallint;
    constraint_count integer;
    constraint_name text;
    constraint_validated boolean;
    verdict_values text[];
    predecessor_values constant text[] := ARRAY[
        'CLONE-SUSPECT', 'EXHAUSTED', 'EXPIRED', 'MISMATCH', 'REVOKED', 'VERIFIED'
    ];
    successor_values constant text[] := ARRAY[
        'CLONE-SUSPECT', 'EXHAUSTED', 'EXPIRED', 'MISMATCH', 'NOT_CERTIFIED',
        'REVOKED', 'VERIFIED'
    ];
BEGIN
    IF to_regclass('public.migrations_log') IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.migrations_log
           WHERE filename = '0020_tighten_organizations_public_read.sql'
       ) THEN
        RAISE EXCEPTION '0021_PREDECESSOR_NOT_RECORDED: migration 0020 must be recorded';
    END IF;

    IF to_regclass('public.scan_events') IS NULL THEN
        RAISE EXCEPTION '0021_TARGET_TABLE_MISSING';
    END IF;

    SELECT attribute.attnum
    INTO verdict_position
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.scan_events'::regclass
      AND attribute.attname = 'verdict'
      AND NOT attribute.attisdropped;

    IF verdict_position IS NULL THEN
        RAISE EXCEPTION '0021_VERDICT_COLUMN_MISSING';
    END IF;

    SELECT count(DISTINCT constraint_record.oid)::integer,
           min(constraint_record.conname),
           bool_and(constraint_record.convalidated),
           array_agg(DISTINCT (matched.captures)[1] ORDER BY (matched.captures)[1])
    INTO constraint_count, constraint_name, constraint_validated, verdict_values
    FROM pg_constraint AS constraint_record
    CROSS JOIN LATERAL regexp_matches(
        pg_get_constraintdef(constraint_record.oid, true),
        '''([A-Z_-]+)''',
        'g'
    ) AS matched(captures)
    WHERE constraint_record.conrelid = 'public.scan_events'::regclass
      AND constraint_record.contype = 'c'
      AND constraint_record.conkey @> ARRAY[verdict_position];

    IF constraint_count <> 1
       OR constraint_name <> 'chk_scan_events_verdict'
       OR NOT constraint_validated
       OR verdict_values NOT IN (predecessor_values, successor_values) THEN
        RAISE EXCEPTION
            '0021_VERDICT_CONSTRAINT_INCOMPATIBLE: constraints=%, name=%, validated=%, values=%',
            constraint_count,
            constraint_name,
            constraint_validated,
            verdict_values;
    END IF;

    IF verdict_values = successor_values THEN
        RETURN;
    END IF;

    ALTER TABLE public.scan_events
        DROP CONSTRAINT chk_scan_events_verdict;
    ALTER TABLE public.scan_events
        ADD CONSTRAINT chk_scan_events_verdict
        CHECK (
            verdict IN (
                'VERIFIED',
                'REVOKED',
                'EXHAUSTED',
                'CLONE-SUSPECT',
                'MISMATCH',
                'EXPIRED',
                'NOT_CERTIFIED'
            )
        );
END;
$capmint_0021_preflight$;
