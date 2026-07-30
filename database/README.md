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

## Profile Tenant Ownership 0011

`0011_add_profile_organization_id.sql` introduces the additive DM-03 C2 tenant
foundation:

- nullable `producers.organization_id` and `certifiers.organization_id` UUID
  columns;
- validated foreign keys to `organizations(id)`;
- `idx_producers_organization_id` and `idx_certifiers_organization_id`;
- guarded equal-ID backfill only when the matching organization exists.

Unmapped profiles remain `NULL`; the migration does not synthesize organizations
or modify orphan profiles. The columns are intentionally non-unique so the
approved structural model permits an organization to own multiple profiles,
while current activation continues to create one equal-ID profile.

JWTs continue to carry only `orgId`. C3a replaced the temporary equal-ID
authorization predicates with explicit profile ownership joins. C3c makes
producer ownership mandatory, and migration 0014 makes certifier ownership
mandatory after deleting the operator-approved zero-reference orphan. RLS
enforcement remains separately gated work.

The reserved tenant-session convention for future RLS policies is the
transaction-local PostgreSQL GUC `app.current_org`. A future application
transaction will set it with `SET LOCAL app.current_org = '<organization UUID>'`
and policies will read it with `current_setting('app.current_org', true)`.
Migration 0011 does not set the GUC, create policies, enable RLS, or change
database roles.

`verify0011` is the adoption authority for out-of-band exact state. It accepts
the original nullable C2 shape, the approved 0013 successor shape, and the
post-0014 certifier tightening only when 0014 is recorded in `migrations_log`.
It requires both named validated foreign keys and both named single-column
btree indexes. A completely absent shape returns `absent`; partial or
incompatible state fails closed.

## Derived Tenant Relationships 0012

`0012_add_derived_tenant_relationships.sql` is the additive DM-03 C3a
relationship layer:

- nullable `investigations.unit_code_id`,
  `lab_results.submitted_by_organization_id`, and
  `lots.assigned_laboratory_organization_id` UUID columns;
- unique reference support on `budgets(id, producer_id)` and a validated
  composite lot-to-budget producer foreign key;
- validated restrictive foreign keys for the investigation unit, laboratory
  submitter, and laboratory assignment relationships;
- plain single-column indexes on each nullable relationship column;
- deterministic investigation backfill from an exact
  `public_identifier` match.

The migration refuses lot/budget producer drift, unmatched or ambiguous
investigation identifiers, incompatible pre-existing links, and incompatible
named schema objects. It does not fabricate laboratory submitters or
assignments, so legacy values remain `NULL`.

`verify0012` is the exact/absent/incompatible adoption authority and also
requires zero lot/budget producer mismatches and exact investigation links.
The corresponding application authorization resolves producer and certifier
scope through `profile.organization_id = jwt.orgId`; JWT claims are unchanged.

C3a did not enable RLS, set `NOT NULL`, or add investigation uniqueness.
Laboratory assignment and write enforcement are implemented by C3b application
code without further DDL. C3c supplies the deterministic producer and
investigation tightening; RLS remains behind the DM-04 approval gate.

## Laboratory Assignment Enforcement

DM-03 C3b uses the nullable 0012 relationships without changing schema:

- a certifier may assign an activated `NABL_LABORATORY` only to a lot controlled
  through its budget and `certifiers.organization_id`;
- the lot is locked before the ownership predicate is accepted, and repeat
  assignment to the same laboratory is an idempotent success;
- activated laboratories list only lots whose
  `assigned_laboratory_organization_id` matches their JWT organization;
- lab-result inserts and replacements require that same assignment and persist
  `submitted_by_organization_id` from the JWT, never from request data;
- legacy lab results retain a `NULL` submitter and remain readable through their
  lot-derived ownership;
- denied lab writes finish before PDF processing or lot/code/provenance/ledger
  mutation.

The assignment and submitter columns remain nullable for legacy compatibility.
C3b adds no migration, RLS policy, database role, `NOT NULL`, or uniqueness
constraint.

## Tenant Constraint Tightening 0013

`0013_tighten_tenant_constraints.sql` completes the approved DM-03 C3c
constraint slice:

- fail-closed preflight requires zero producer ownership NULLs, zero
  investigation unit NULLs, and zero duplicate investigation unit links;
- non-empty legacy environments must contain exactly the approved orphan
  certifier `00000000-0000-0000-0000-000000000003` with zero budget
  references; an entirely empty certifier table is permitted for the immutable
  schema-only bootstrap;
- `producers.organization_id` and `investigations.unit_code_id` become
  `NOT NULL`;
- `idx_investigations_unit_code_id` is replaced in place by a same-name unique
  btree index;
- the approved orphan is changed from `ACTIVE` to the existing reversible
  `REVOKED` key lifecycle state by an exact-ID update.

`certifiers.organization_id`,
`lab_results.submitted_by_organization_id`, and
`lots.assigned_laboratory_organization_id` remain nullable. No RLS role,
policy, or tenant GUC enforcement is created. `verify0013` classifies the
tightening and quarantine together as exact, absent, or incompatible; the
0011/0012 verifiers recognize the approved successor shape without accepting
partial tightening. After an empty bootstrap has recorded 0013, the verifier
also accepts a later all-mapped certifier population with zero orphans; the
same non-empty zero-orphan state remains incompatible before 0013 execution.

## Certifier Organization Tightening 0014

`0014_tighten_certifier_organization_id.sql` completes the operator-approved
certifier disposition and constraint follow-up:

- shape preflight requires the complete 0013 state, keeps both laboratory
  relationship columns nullable, and accepts only stable pre-0014 or fully
  tightened certifier nullability;
- the exact certifier `00000000-0000-0000-0000-000000000003` is deleted only
  while locked, `REVOKED`, and referenced by zero budgets;
- a non-revoked or referenced approved row fails closed, as does any other
  certifier with `NULL organization_id`;
- a temporary `NOT VALID` CHECK is validated before
  `certifiers.organization_id` is set `NOT NULL`, then the redundant CHECK is
  removed;
- empty schema-only bootstrap and direct re-execution are no-ops for orphan
  deletion and remain idempotent.

`verify0014` classifies exact, absent, and incompatible physical states.
`verify0011`, `verify0012`, and `verify0013` recognize the post-0014 successor
only when the 0014 migration record exists, so raw over-tightening is not
silently accepted. `lab_results.submitted_by_organization_id` and
`lots.assigned_laboratory_organization_id` remain nullable. No RLS role,
policy, tenant GUC enforcement, service behavior, or authorization predicate is
changed by 0014.

## Non-Owner Runtime Foundation 0015

`0015_add_capmint_app_role.sql` establishes the DM-04 D1 runtime foundation
without enabling row-level security:

- creates the global `capmint_app` role as `NOLOGIN`, non-owner,
  `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`,
  `NOREPLICATION`, and `NOBYPASSRLS`;
- grants only database `CONNECT`, public-schema `USAGE`, application-table
  `SELECT`/`INSERT`/`UPDATE`/`DELETE`, and public-sequence
  `USAGE`/`SELECT`;
- adds owner-scoped default privileges for future public tables and sequences;
- rejects role membership, object ownership, unexpected privileges, any
  existing policy, and any table with enabled or forced RLS;
- records 0015 as `EXECUTED`; `verify0015` classifies the database-local
  effects as exact, absent, or incompatible.

All six PostgreSQL-backed services use the single
`packages/shared/tenant-db.js` helper. `withTenantTx` checks out one pooled
client, starts a transaction, sets transaction-local
`app.current_organization_id` and `app.actor_is_system_admin`, runs the query
callback on that client, and commits or rolls back before release.
Authenticated actors without an organization fail before checkout unless the
existing JWT claims identify a system administrator. Public registration,
login, resolver, transparency-read, and consumer-verification paths select an
explicit public context. D3 must define their RLS policies before public
enforcement is enabled.

Migration 0015 intentionally cannot provision a login secret. After applying
and verifying the migration, an operator must inject a generated credential
from the deployment secret manager:

```sql
ALTER ROLE capmint_app LOGIN PASSWORD '<operator-injected secret>';
```

Rotate `DATABASE_URL` independently for auth, CPQ, mint, resolver,
transparency, and verification so its username is `capmint_app`. Do not place
the password in source, migration SQL, images, or committed environment files.
Migration, first-admin bootstrap, and development-seed commands must continue
to receive a separate owner `DATABASE_URL` for `capmint_admin`. Integration
service has no PostgreSQL pool and requires no database-role rotation.

No policy is created and no table has RLS enabled or forced in D1. Consequently
the runtime result set and authorization behavior remain unchanged. D2/D3 are
separate approval gates.

## Identity-Table RLS Enforcement 0016

`0016_enable_identity_table_rls.sql` implements DM-04 D2 for only the three
tables with direct organization identity:

- enables, but does not force, row-level security on `organizations`,
  `producers`, and `certifiers`;
- gives `capmint_app` owner-scoped SELECT/INSERT/UPDATE/DELETE policies using
  `NULLIF(current_setting('app.current_organization_id', true), '')::uuid`;
- includes the system-administrator branch
  `current_setting('app.actor_is_system_admin', true) = 'on'` in every policy;
- permits public organization reads needed by registration duplicate checks
  and login, while public inserts are limited to `PENDING` registrations of
  the four registrable organization types;
- permits authenticated reads of activated certification-body and laboratory
  organizations for cross-organization workflow validation;
- permits public producer reads only when the producer has a registered unit
  code, and permits a certifier to read only producers attached to budgets it
  controls;
- permits authenticated cross-organization reads of only `ACTIVE` certifier
  rows so signature-verification paths can obtain the certifier public key.

PostgreSQL RLS controls rows rather than projected columns. The login and
registration queries therefore make public organization rows visible, and an
active cross-organization certifier row is visible rather than only its
`public_key` field. Those exceptions are read-only; all UPDATE and DELETE
policies remain owner-or-system-administrator only.

The certifier laboratory-assignment flow validates an activated laboratory
with an ordinary SELECT. A cross-organization `SELECT ... FOR SHARE` also
requires the UPDATE policy in PostgreSQL and would therefore hide the row under
the owner-only write rule. Removing that read lock preserves the legitimate
validation without granting cross-organization writes.

Migration 0016 fails closed unless 0015 is recorded, `capmint_app` remains
non-elevated, and the database is in either the pre-D2 state or the exact D2
successor state. `verify0016` classifies exact, absent, and incompatible
states, including policy definitions, roles, commands, enabled-versus-forced
RLS, and unexpected policy surfaces. `verify0015` accepts the successor only
when 0016 is recorded and its physical policy state is exact.

The owner `capmint_admin` remains exempt because no table uses FORCE. Migration
bootstrap, first-administrator bootstrap, and development seed must continue
to use the owner URL. The six PostgreSQL-backed services continue to use the
operator-provisioned `capmint_app` URL. RLS on transactional and join-scoped
tables remains deferred to D3.

## Provenance-Chain RLS Enforcement 0017

`0017_enable_provenance_chain_rls.sql` implements DM-04 D3a for only the core
join-scoped provenance chain:

- enables, but does not force, row-level security on `budgets`, `lots`, and
  `unit_codes`;
- derives producer ownership and controlling-certifier access through the
  existing producer, budget, lot, and certifier relationships;
- permits an assigned laboratory to read and update its assigned lot and
  related unit-code state;
- permits public reads only for a fully registered unit code and the linked lot
  and budget required by consumer verification or GS1 resolution;
- permits public UPDATE only on a registered, non-revoked unit-code row with no
  revocation timestamp, preserving clone-state writes from the consumer scan
  path;
- permits producer INSERT only when the new budget/lot/unit is linked to the
  authenticated producer organization;
- permits mapped producer, controlling-certifier, or assigned-laboratory
  updates where the service workflow requires them;
- creates no DELETE policy because no application flow deletes provenance
  rows, leaving DELETE at PostgreSQL's default deny for `capmint_app`.

Every policy contains the system-administrator branch and uses
`NULLIF(current_setting('app.current_organization_id', true), '')::uuid` for
tenant comparisons. Public branches require the normalized empty tenant
setting and never cast the empty string.

The D2 producer policy already traverses `budgets` to support a controlling
certifier's producer read. A new budget policy that directly traversed the RLS
protected producer table would create a policy dependency cycle. Migration
0017 therefore installs six owner-executed, boolean-only relationship helpers.
They return no row data, use a fixed `pg_catalog, public` search path, revoke
EXECUTE from PUBLIC, and grant it only to `capmint_app`. The helpers evaluate
the same foreign-key joins while the owner bypass prevents transitive RLS
recursion. The runner verifies their definitions, security mode, owner,
language, search path, privileges, volatility, arguments, and result type.

RLS is row-scoped rather than column-scoped. The public unit-code UPDATE policy
cannot independently restrict the update to `clone_flag`; the public
verification handler remains responsible for issuing only that scan-state
write. The policy narrows the eligible row as far as the current schema
permits: it must be a fully registered code, must not be `REVOKED`, and must
have no `revoked_at` value.

Migration 0017 fails closed unless 0016 is recorded, the exact D2 identity
surface is present, `capmint_app` remains non-elevated, and the D3a surface is
either absent or exact. `verify0017` classifies exact, absent, and incompatible
states. `verify0015` and `verify0016` accept the D3a successor only when 0017
is recorded and its combined six-table policy/helper state is exact.

The owner `capmint_admin` remains exempt because no table uses FORCE.
Migration bootstrap, first-administrator bootstrap, and development seed
continue to use the owner URL.

## DM-04 D3b Supporting-Table RLS

Migration `0018_enable_supporting_table_rls.sql` enables, but does not force,
RLS on `lab_results`, `investigations`, `scan_events`,
`plots_or_hive_clusters`, and `producer_brandings`. It requires the recorded
and physically exact D2/D3a surface before making changes. The preflight
rejects partial or forced target state, unexpected RLS/policies/helpers,
elevated `capmint_app` attributes, and unsafe helper definitions.

The exact policy surface contains 14 policies:

- `lab_results`: relationship-scoped/public SELECT plus producer-or-assigned-lab
  INSERT and assigned-actor UPDATE. Access derives from `lot_id`, so legacy
  rows with `submitted_by_organization_id IS NULL` remain readable.
- `investigations`: controlling-certifier/public SELECT, registered-code public
  INSERT, and controlling-certifier/public-conflict UPDATE.
- `scan_events`: provenance-actor/public SELECT and registered-code public
  INSERT.
- `plots_or_hive_clusters`: producer-owner SELECT, INSERT, and UPDATE.
- `producer_brandings`: producer-owner or registered-producer public SELECT,
  plus producer-owner INSERT and UPDATE.

Every policy includes the system-administrator branch. Authenticated tenant
branches cast only
`NULLIF(current_setting('app.current_organization_id', true), '')`, and public
branches require that same safe expression to resolve to NULL. There are no
D3b DELETE policies.

Five new owner-executed boolean helpers resolve joins without policy
recursion: `capmint_rls_registered_unit_code`,
`capmint_rls_unit_certifier`, `capmint_rls_unit_code_actor`,
`capmint_rls_lab_result_writer`, and
`capmint_rls_producer_has_public_code`. Each is SQL, STABLE, SECURITY DEFINER,
owned by `capmint_admin`, fixed to the `pg_catalog, public` search path,
non-executable by PUBLIC, and executable by `capmint_app` in addition to its
owner.

Public scan and investigation writes are row-bounded to a fully registered
unit code. Investigation inserts also require `public_identifier` to match the
linked code. PostgreSQL RLS cannot constrain which columns a permitted INSERT
or UPDATE supplies, so the public verification handler remains responsible
for scan-event values and the investigation conflict update. Public lab and
branding reads are limited to provenance that has a fully registered public
code.

`verify0018` classifies exact, absent, and incompatible states using exact
policy and helper signatures. `verify0015`, `verify0016`, and `verify0017`
accept the D3b successor surface only when migration 0018 is recorded.
`capmint_admin` continues to bypass these policies because the migration never
uses FORCE; migrations, bootstrap, and seed remain owner operations.

RLS on `users` and `log_entries` remains deferred to D3c.

## DM-04 D3c Completion

Migration `0019_enable_users_and_ledger_rls.sql` completes RLS coverage on all
13 application tables. `users` has tenant SELECT/INSERT/UPDATE/DELETE policies
with system-admin bypass; the public SELECT branch preserves pre-auth login and
the public INSERT branch is limited to active ADMIN registration rows. Because
RLS is row-scoped, the auth handler's username predicate remains the backstop
for password-hash exposure and credential lookup.

`log_entries` has SELECT and INSERT policies only. There is deliberately no
UPDATE or DELETE policy for `capmint_app`, enforcing append-only ledger
immutability at the database layer. Public reads preserve transparency
integrity/entry endpoints. Public inserts are limited to genesis, login audit,
and registration audit shapes required by existing public auth/genesis flows;
authenticated and system-admin contexts append normally.

`verify0019` validates the complete 13-table/41-policy RLS surface. Earlier
D1–D3b verifiers accept it only after the recorded 0019 successor migration.
No table uses FORCE, so owner-run migrations, bootstrap, and seed still bypass
RLS.

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
key and creates a correctly signed, non-active demo budget, two activated
laboratory identities, and one explicitly assigned demonstration lot. An exact
rerun is a no-op; it never overwrites credentials or uses blind conflict
suppression.

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
