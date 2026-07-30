# CapMint v1.1.0 Production Database Cutover Runbook

## Purpose and safety boundary

This runbook provisions a new, empty PostgreSQL database at the schema promoted
in CapMint `v1.1.0` (migration state through `0020`). It separates the database
owner used for provisioning from the non-owner role used by every backend:

| Role | Purpose | Required posture |
|---|---|---|
| `capmint_admin` | Own the database; run schema migrations and the one-time administrator bootstrap | `LOGIN`, `CREATEDB`, `CREATEROLE`, `NOSUPERUSER`, `NOBYPASSRLS` |
| `capmint_app` | Runtime identity for all seven backend services | `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, `NOBYPASSRLS`; owns no database object |

Do not run this procedure against `capmint_dev`. Do not run it against a
non-empty production database: `--bootstrap` intentionally refuses any object
already present in the target `public` schema. Existing-database reconciliation
requires a separate reviewed `--check` → `--plan` → `--apply` change.

The guarded wrapper in this repository does **not** create a database, create or
alter role passwords, create the first administrator, seed fixtures, or start
services. It only validates the owner, invokes the checksum-pinned
`--bootstrap`, and requires a clean `--check`.

## Preconditions

Before the maintenance window:

1. Check out the exact `v1.1.0` tag and run `npm ci`.
2. Confirm PostgreSQL is supported by the deployment platform and take a
   recoverable cluster backup/snapshot.
3. Allocate a new non-`capmint_dev` database name (examples below use
   `capmint_prod`).
4. Generate independent high-entropy passwords for `capmint_admin`,
   `capmint_app`, and the first application administrator. Store them only in
   the deployment secret manager.
5. Prepare production values for `JWT_SECRET`, Redis, CORS, inter-service URLs,
   and the runtime certifier Ed25519 keypair. Do not reuse development keys or
   credentials.
6. Stop application writers until schema bootstrap, administrator bootstrap,
   role verification, and service startup checks are complete.

Never put a real database URL, password, JWT, or PEM in source control, shell
history, a process argument, or this runbook. Commands below assume secrets are
injected into the operator process by the deployment secret manager.

## 1. Create the owner, runtime role, and empty database

Connect to the cluster maintenance database using the platform's privileged
operator identity:

```bash
psql "$PG_CLUSTER_ADMIN_URL" --set=ON_ERROR_STOP=1 --set=capmint_database=capmint_prod
```

In that secure `psql` session, create or normalize the two roles. `\password`
prompts interactively, so the secrets do not enter SQL or shell history:

```sql
SELECT 'CREATE ROLE capmint_admin'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capmint_admin')
\gexec

ALTER ROLE capmint_admin
  LOGIN CREATEDB CREATEROLE NOSUPERUSER NOINHERIT NOREPLICATION NOBYPASSRLS;
\password capmint_admin

SELECT 'CREATE ROLE capmint_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capmint_app')
\gexec

ALTER ROLE capmint_app
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

SELECT format('CREATE DATABASE %I OWNER capmint_admin', :'capmint_database')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'capmint_database'
)
\gexec
```

Inspect the result before continuing:

```sql
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin,
       rolinherit, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN ('capmint_admin', 'capmint_app')
ORDER BY rolname;

SELECT datname, pg_get_userbyid(datdba) AS owner
FROM pg_database
WHERE datname = :'capmint_database';
```

Stop if `capmint_admin` is not the database owner, or if `capmint_app` has any
elevated attribute, membership, or object ownership. Migration `0015` performs
additional fail-closed checks before granting the minimum runtime privileges.

## 2. Preview and apply the promoted schema

Inject the owner URL as `ADMIN_DATABASE_URL`. The URL username must be
`capmint_admin`, and its database must not be `capmint_dev` or a PostgreSQL
maintenance database.

The default invocation is a true dry run: it parses the target and repository
manifests, prints every planned migration, opens no database connection, and
makes no change.

```bash
node scripts/prod-migrate.js
```

Review the printed target and plan. It must show:

- the immutable `capmint-baseline-20260725.sql` baseline at schema cutoff
  `0009`, with `0010` as the next migration;
- `EXECUTE` entries for every migration from `0010` through `0020`;
- a final `node playground/run_migrations.js --check`;
- role creation, passwords, administrator bootstrap, development fixtures, and
  service startup as excluded steps.

Only after independent review, execute that exact plan:

```bash
node scripts/prod-migrate.js --confirm
```

`--confirm` first connects and requires both `current_user` and the target
database owner to be `capmint_admin`. It then delegates to:

```bash
DATABASE_URL="$ADMIN_DATABASE_URL" node playground/run_migrations.js --bootstrap
DATABASE_URL="$ADMIN_DATABASE_URL" node playground/run_migrations.js --check
```

The wrapper never passes the URL on the command line and never logs it.

### Migration verification

Connect to the target as `capmint_admin` and inspect the ledger:

```sql
SELECT id, filename, application_mode, checksum_sha256,
       baseline_identifier, baseline_cutoff, baseline_next_migration
FROM migrations_log
ORDER BY id;
```

Require exactly one `BASELINE` entry with cutoff `9` / next migration `10`, then
eleven `EXECUTED` entries for `0010`–`0020`. There are no individual
`0001`–`0009` rows on a bootstrapped database because the immutable baseline is
their recorded schema-equivalent. Historical migration `0006` fixture DML is
intentionally not replayed by that production-safe baseline. The final
migration check must report `SAFE / NO PENDING ACTIONS`.

Also require the complete RLS posture:

```sql
SELECT count(*) AS rls_enabled_tables
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p')
  AND relation.relrowsecurity;

SELECT count(*) AS policies
FROM pg_policy AS policy
JOIN pg_class AS relation ON relation.oid = policy.polrelid
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public';
```

Expected: 13 RLS-enabled application tables and 41 policies.

## 3. Enable the runtime login and bootstrap the first administrator

After migration `0015` has verified and granted the safe runtime surface,
return to the privileged secure `psql` session:

```sql
\password capmint_app
ALTER ROLE capmint_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
```

Inject the one-time administrator values from the secret manager. Use a unique
16–128 character password containing lowercase, uppercase, numeric, and symbol
characters. The command rejects known defaults and passwords containing the
username or email local part.

```bash
export CAPMINT_BOOTSTRAP_ADMIN_USERNAME='<operator-selected username>'
export CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME='<system administration organization>'
export CAPMINT_BOOTSTRAP_ADMIN_EMAIL='<operator-controlled email>'
# CAPMINT_BOOTSTRAP_ADMIN_PASSWORD is injected by the secret manager.
DATABASE_URL="$ADMIN_DATABASE_URL" npm run bootstrap:admin
```

Require the result code `ADMIN_BOOTSTRAPPED`. The organization, active ADMIN
user, and `SYSTEM_ADMIN_BOOTSTRAPPED` ledger event are committed atomically.
A second run refuses with `ADMIN_ALREADY_EXISTS`.

### Production seed policy

There is currently **no required production reference-data seed**. The
administrator bootstrap above is the only initial application-data operation.
Do **not** run `npm run seed:development`: it creates known fixture identities
and intentionally refuses `NODE_ENV=production` or `staging`. Never set
`CAPMINT_ALLOW_DEVELOPMENT_SEED=1` in a production environment.

## 4. Start every backend as `capmint_app`

The service secret set must contain:

```text
DATABASE_URL=postgresql://capmint_app:<secret>@<host>:<port>/<database>
```

Do not inject `ADMIN_DATABASE_URL` into any runtime service. Do not create
per-service `.env` files. All seven services use the single repository-root
configuration contract and call `assertRlsServiceRole` before binding:

- auth
- cpq
- mint
- resolver
- transparency
- verification
- integration

Build once, then start the seven services under the production process manager:

```bash
npm run build
npm run start
```

Require clean startup and HTTP 200 from each `/health` endpoint on its configured
port. While the processes are running, verify the effective database identities
from an owner connection:

```sql
SELECT usename, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
  AND backend_type = 'client backend'
GROUP BY usename
ORDER BY usename;
```

Every application connection must use `capmint_app`; `capmint_admin` is allowed
only for an active operator/migration session. The startup guard additionally
requires that `capmint_app` is not superuser, does not have `BYPASSRLS`, and
owns no RLS-enabled table.

### Prove the owner URL fails closed

In an isolated verification shell with an unused port, deliberately launch one
service with the owner URL:

```bash
DATABASE_URL="$ADMIN_DATABASE_URL" PORT=18081 \
  npm run start --workspace=backend/auth-service
```

Expected: non-zero exit before the port binds, with a message that
`auth-service refuses unsafe database role "capmint_admin"`. Treat a successful
start as a release blocker.

## 5. Rollback and failure handling

- The baseline is transactional. Each later migration and its `EXECUTED` ledger
  row are also one transaction. A failed migration is rolled back and not
  falsely recorded.
- Do not delete or edit `migrations_log` rows, baseline metadata, RLS policies,
  or checksums to force a retry. Capture the failure and prepare a reviewed
  forward-fix migration.
- Migrations through `0020` are additive/forward-only. There is no automatic
  down migration. If application code is rolled back, revert the release merge
  through the normal PR path; leave the compatible database changes applied.
- The administrator bootstrap is transactional. On a partial or ambiguous
  state it refuses; do not delete ledger history. Recovery is a reviewed
  disable/compensating-event operation.
- The transparency ledger is append-only and is never rewound.
- If service startup fails the runtime-role assertion, stop cutover. Correct
  deployment secrets or role posture; never switch off RLS, use the owner URL,
  or weaken `assertRlsServiceRole`.

## Operator evidence to retain

Retain redacted copies of:

1. the wrapper dry-run plan;
2. the confirmed wrapper output and final clean migration check;
3. the migration ledger (`BASELINE` + `0010`–`0020`);
4. the 13-table / 41-policy counts;
5. the `ADMIN_BOOTSTRAPPED` result and audit-event identifier;
6. service `/health` results and `pg_stat_activity` role counts;
7. the expected owner-role startup refusal;
8. backup/snapshot identifier and cutover timestamps.

Do not retain passwords, complete connection URLs, JWTs, PEMs, or other secret
values in the evidence bundle.
