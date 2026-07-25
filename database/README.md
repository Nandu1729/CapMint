# CapMint Database Evolution

## Authority

Forward migrations in `database/migrations/` are the authoritative schema
evolution path. Released baselines in `database/baselines/` are immutable
bootstrap artifacts at a documented cutoff. `database/schema/schema.sql` is a
version-labelled derived snapshot for inspection and disposable schema
comparison; it must not be applied to an existing database.

Seed and test data are separate from schema bootstrap.

The current baseline is:

- identifier: `capmint-baseline-20260725-cutoff-0009`
- schema cutoff: `0009_widen_investigations_status_check.sql`
- next forward migration: `0010_reconcile_pre_dm03_schema.sql`
- checksum: recorded in `capmint-baseline-20260725.json`

The baseline was derived from the canonical pre-DM-03 migration state. Its
schema body is compared with the snapshot and with a database built through
the forward migration path. It contains no development users or seed fixtures.

## Runner Modes

`playground/run_migrations.js` requires exactly one explicit mode and a
configured `DATABASE_URL`. It has no connection-string fallback.

```bash
node playground/run_migrations.js --check
node playground/run_migrations.js --plan
node playground/run_migrations.js --apply
node playground/run_migrations.js --adopt 0007_add_producer_brandings_table.sql 0009_widen_investigations_status_check.sql
node playground/run_migrations.js --bootstrap
```

- `--check` and `--plan` are read-only. They exit `2` when action or unsafe
  drift remains.
- `--apply` acquires the CapMint PostgreSQL advisory lock and executes only
  pending migrations. Each migration and its `EXECUTED` record share one
  transaction.
- `--adopt` requires exact filenames and deterministic state equivalence. It
  writes `ADOPTED` metadata but executes no migration DDL.
- `--bootstrap` refuses a non-empty database, applies the immutable baseline,
  records one `BASELINE` entry, and runs migrations newer than the cutoff.

Mutating modes fail when another runner holds the advisory lock. `--apply`
never silently adopts schema effects.

## Migration Ledger

Legacy `filename` and `applied_at` rows remain valid. They are classified as
`LEGACY` and retain null checksums because stronger provenance cannot be
reconstructed.

| Mode | Meaning |
|---|---|
| `LEGACY` | Historical row without verifiable execution checksum |
| `EXECUTED` | This runner executed the exact file and stored its SHA-256 |
| `ADOPTED` | Exact effects were verified and recorded with file checksum and evidence fingerprint |
| `BASELINE` | An empty database was bootstrapped from the identified immutable baseline |

Previously stored checksums are never overwritten automatically. A mismatch,
a logged file missing from the repository, duplicate versions, or
non-monotonic versions blocks normal apply.

Failed migrations are rolled back and are not recorded. This avoids a false
success record; the command failure and database logs provide operational
failure evidence.

## Reconciliation 0010

`0010_reconcile_pre_dm03_schema.sql` repairs only supported pre-DM-03 drift:

- an absent `producer_brandings` table;
- the exact branding table missing its expected timestamp function/trigger;
- a disabled expected branding trigger;
- a missing, original, alternate-name, or unvalidated investigations status
  constraint with supported data.

It refuses partial branding columns or constraints, incompatible trigger
functions, extra branding triggers, contradictory investigation constraints,
and unsupported investigation status data. It is repeatable and contains no
tenant ownership columns or seed data.

## Existing Database Procedure

1. Run `--check`.
2. Run `--plan`.
3. Review exact-state evidence for adoption candidates.
4. With separate approval, adopt only explicit filenames.
5. Run `--apply` to execute forward reconciliation.
6. Run `--check` again and require a no-op result.

Do not insert migration rows manually or rerun historical migrations merely to
make the ledger appear complete.

## Rollback and Audit

Metadata column additions can be removed only through a separately reviewed
forward operation after proving no runner depends on them. Removing a mistaken
`ADOPTED` row is a metadata correction requiring approval and an audit note; it
does not undo existing schema effects. A baseline record must not be removed
from a baseline-built database because it defines which historical migrations
were intentionally skipped.

Schema changes made by a successful migration require a reviewed forward
remediation. No automatic down migration is provided.

## CI Verification

CI uses disposable PostgreSQL databases to verify:

- empty bootstrap and second-run idempotency;
- exact-state adoption without application-schema DDL;
- supported reconciliation and fail-closed partial states;
- checksum and missing-file refusal;
- advisory-lock exclusion;
- baseline/snapshot normalized schema equality;
- baseline/forward-migration normalized schema equality;
- duplicate and non-monotonic migration rejection.

Released baseline SQL and manifest checksums must change together before
release. After release, create a new baseline identifier rather than editing an
existing baseline.
