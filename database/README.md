# CapMint Database Evolution

## Authority

Forward migrations in `database/migrations/` are the authoritative schema
evolution path. Released baselines in `database/baselines/` are immutable
bootstrap artifacts at a documented cutoff. `database/schema/schema.sql` is a
version-labelled derived snapshot for inspection and disposable schema
comparison; it must not be applied to an existing database.

Seed and test data are separate from schema bootstrap.

CapMint separates database initialization into four concerns:

| Concern | Authority |
|---|---|
| Schema bootstrap | Immutable baseline plus newer forward migrations |
| Required production reference data | None currently |
| First system administrator | Explicit `npm run bootstrap:admin` operator command |
| Development/test fixtures | Explicit `npm run seed:development` command |

Auth and CPQ service startup performs no seed DML. Starting an application
process is not a database initialization mechanism.

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

## First Administrator

After bootstrapping a new schema and confirming `--check` is clean, inject the
following variables from an operator-controlled secret source:

```bash
export DATABASE_URL='<redacted>'
export CAPMINT_BOOTSTRAP_ADMIN_USERNAME='<operator username>'
export CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME='<system administration organization>'
export CAPMINT_BOOTSTRAP_ADMIN_EMAIL='<operator email>'
export CAPMINT_BOOTSTRAP_ADMIN_PASSWORD='<strong secret>'
npm run bootstrap:admin
```

The command requires a 16-128 character mixed-class password and rejects known
defaults or a password containing the username/email local part. It acquires
the migration and bootstrap advisory locks, verifies migration state, and
creates the activated organization, active ADMIN user, and
`SYSTEM_ADMIN_BOOTSTRAPPED` ledger event in one transaction.

The command refuses any existing or partial system-administrator state. A
second run returns `ADMIN_ALREADY_EXISTS` and changes nothing. It does not
implement or claim forced first-login password rotation; the current schema and
authentication API have no enforceable rotation state.

Completed bootstrap removal is not an automatic rollback. A reviewed recovery
operation should disable the account and organization and append a compensating
audit event rather than deleting ledger history.

## Development Fixtures

Development/test fixtures are explicit and are never applied by service
startup:

```bash
export NODE_ENV=development
export CAPMINT_ALLOW_DEVELOPMENT_SEED=1
export CAPMINT_DEVELOPMENT_SEED_PASSWORD='<strong development-only secret>'
export CAPMINT_DEVELOPMENT_CERTIFIER_PRIVATE_KEY='<development-only Ed25519 private key>'
export CAPMINT_DEVELOPMENT_CERTIFIER_PUBLIC_KEY='<matching Ed25519 public key>'
npm run seed:development
```

The command refuses production, staging, unset environments, missing enablement,
mismatched keys, the known compromised historical key, and non-empty database
states that are not the exact versioned fixture set. It stores only the public
key and creates a correctly signed, non-active demo budget. An exact rerun is a
no-op; it never overwrites credentials or uses blind conflict suppression.

Legacy migration `0006` remains unchanged for historical integrity but is not
part of baseline bootstrap. The former `database/seed/seed.sql` duplicated its
known credential and compromised key and has been removed. Existing databases
are not modified by either command unless an operator explicitly targets an
eligible state.

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
- first-admin atomicity, auditability, and existing-state refusal;
- explicit development fixture gating, key validation, and idempotency;
- production auth/CPQ startup with zero seed DML.

Released baseline SQL and manifest checksums must change together before
release. After release, create a new baseline identifier rather than editing an
existing baseline.
