# DM-04 RLS End-to-End Smoke Report — Attempt 06

**Summary verdict: RED — migration 0020, public organization visibility, definer registration, the seeded assigned-lab success pair, service health, runtime role enforcement, capacity integrity, and the A–D RLS taxonomy all pass; the full compliance run nevertheless fails `LAB-04` because the mandated root `.env` sends verification ledger appends to transparency-service `/`, which returns 404, leaving no `LOT_LAB_TEST_REPLACED` audit event.**

Run date: 2026-07-29 (Asia/Kolkata). Branch/commit: `develop` / `d0c5ce98ca2902bb31e84111e3102d6d9144e83a`. This report and the archived Attempt 05 remain uncommitted.

## Gate outcome

The requested GREEN gate cannot be issued:

- targeted 0020/P1a acceptance checks passed;
- the extended compliance runner completed with **87 passed, 0 pending, 1 failed**;
- the sole failure was `LAB-04`: the replacement request returned 200, but the expected `LOT_LAB_TEST_REPLACED` ledger event count was 0;
- no product, migration, policy, seed, manifest, or service change was made after the failure.

## Environment

| Item | Observed |
|---|---|
| Node / npm | `v26.3.1` / `11.16.0` |
| PostgreSQL / Redis | PostgreSQL 16.14 (Homebrew); Redis 8.8.1 / `PONG` |
| Database | local sanctioned `capmint_dev` |
| Provisioning role | `capmint_admin` |
| Runtime service role | `capmint_app`, LOGIN, non-superuser, `BYPASSRLS=false` |
| Runtime env | repo-root `.env` loaded directly; no per-service `.env` and no global `PORT` |
| Certifier keys | one freshly generated Ed25519 keypair aligned across all four certifier variables |

`npm ci` succeeded from the committed lockfile and installed 218 packages. It emitted the existing `fast-jwt` Node-engine warning and reported the existing npm audit findings; neither changed this verification run.

## Provisioning and migration evidence

The sanctioned command `npm run db:reset -- --yes` completed successfully:

- reset `capmint_dev`;
- recorded immutable baseline `capmint-baseline-20260725.sql`;
- recorded migrations `0010` through `0020`, including `0020_tighten_organizations_public_read.sql`;
- reported `verify0020: exact`;
- provisioned `capmint_app` with LOGIN;
- seeded `DEVELOPMENT_FIXTURES_SEEDED` (`development-v2`).

The recorded migration sequence was:

`capmint-baseline-20260725.sql`, `0010_reconcile_pre_dm03_schema.sql`, `0011_add_profile_organization_id.sql`, `0012_add_derived_tenant_relationships.sql`, `0013_tighten_tenant_constraints.sql`, `0014_tighten_certifier_organization_id.sql`, `0015_add_capmint_app_role.sql`, `0016_enable_identity_table_rls.sql`, `0017_enable_provenance_chain_rls.sql`, `0018_enable_supporting_table_rls.sql`, `0019_enable_users_and_ledger_rls.sql`, and `0020_tighten_organizations_public_read.sql`.

The post-flow capacity canary also passed:

`Capacity integrity canary passed: no over-issued lots found.`

## Runtime DB identity proof

All services started from the repo-root `.env`, whose runtime URL names `capmint_app`. After DB-backed requests, owner inspection of `pg_stat_activity` observed six idle `capmint_app` connections and one active `capmint_admin` inspection connection. No idle service connection used the owner role.

The integration mock route does not open a database connection during its checked request. Its startup role guard completed under the same runtime configuration; service startup would reject an owner-capable runtime role.

## Startup and health

| Process | Port | `/health` |
|---|---:|---:|
| frontend dev proxy | 8080 | 200 |
| auth | 8081 | 200 |
| CPQ | 8082 | 200 |
| mint | 8083 | 200 |
| resolver | 8084 | 200 |
| transparency | 8085 | 200 |
| verification | 8086 | 200 |
| integration | 8087 | 200 |

All eight processes were live simultaneously. DB-backed spot checks returned auth 200, CPQ 200, transparency 200, verification 200, and integration 200. Expected lookups of a random nonexistent lot/code returned mint 404 and resolver 404 without a server error.

## Targeted 0020 and assigned-lab checks

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| Seeded actor logins | producer, certifier, lab, lab-isolation, exporter, admin authenticate | all six returned 200 | PASS |
| Public registration | definer registration path | 201 with new organization and admin user | PASS |
| Pending login | inactive organization denied | 403 `INACTIVE_ORGANIZATION` | PASS |
| Duplicate tax ID | distinguishable conflict | 409 `REGISTRATION_EXISTS` | PASS |
| Duplicate registration number | distinguishable conflict | 409 `REGISTRATION_EXISTS` | PASS |
| Admin activation | activate registered organization | 200 | PASS |
| Activated login | new producer authenticates | 200 | PASS |
| Registration audit | exact registration audit append | one matching audit row | PASS |
| Ledger immediately after registration | chain remains intact | 200, `unbroken=true`, `logCount=10` | PASS |
| F-org, empty GUC at seed baseline | only three activated certifier/lab directory organizations | count 3; every row matched the directory predicate | PASS |
| Seeded lab assignment | certifier assigns lot `…0050` to lab org `…0004` | 200 | PASS |
| Assigned-lab submission | assigned `lab` submits valid result | 200 | PASS |
| Lab isolation | unassigned `lab-isolation` submits same lot | 403 `LAB_ASSIGNMENT_REQUIRED` | PASS |
| Scoped lab list | assigned lab includes lot; isolation excludes it | assigned count 1; isolation count 0 | PASS |
| Ledger after targeted pair | intact | 200, `unbroken=true`, `logCount=12` | PASS |

The empty-GUC directory count was captured immediately after the reset and before the compliance runner created additional activated certifier/lab test organizations. After those fixtures, the same policy still returned only rows satisfying the activated-directory predicate, so the larger post-run count was expected and was not treated as seed evidence.

## Full compliance result

`playground/test_runner.js` ran against the live eight-process stack with owner access limited to its test-fixture and direct-verification operations:

| Area | Result |
|---|---|
| Authentication and identity | all assertions passed |
| RBAC | all assertions passed |
| CPQ / budget and concurrency | all assertions passed |
| Signature validation | all assertions passed |
| Mint / resolver | all assertions passed |
| Lot lifecycle | all assertions passed |
| NABL authorization and validation | all except `LAB-04` audit append passed |
| Certification | all assertions passed |
| Public verification and clone detection | all assertions passed |
| Tenant isolation `TENANT-01`–`TENANT-25` | all 25 passed |
| Transparency ledger chain checks | passed, including deliberate break detection and cleanup |
| Integration, security, performance, audit | all assertions passed |
| End-to-end business flow | passed |
| Redis rate limits | both passed |
| **Total** | **87 passed / 0 pending / 1 failed** |

The runner’s deliberate fake ledger entry was deleted after `LEDGER-06`. A final live verification returned 200 with `unbroken=true`, `logCount=26`, and no chain errors.

## Failure detail

`LAB-04` expected both a 200 replacement response and at least one `LOT_LAB_TEST_REPLACED` row. It observed:

`200 / 0 events`

The failure is tied to the required root-env startup path:

1. `.env` was copied from `.env.example` as instructed.
2. `.env.example` defines `TRANSPARENCY_SERVICE_URL=http://localhost:8085`.
3. verification-service treats `TRANSPARENCY_SERVICE_URL` as the complete POST target; only its fallback value contains `/api/v1/log`.
4. The service log shows verification posting ledger events to `POST /` on port 8085.
5. transparency-service returned `404 Route POST:/ not found`.
6. verification-service did not treat the non-2xx fetch response as a failure and returned 200 to the lab-results caller.
7. The service log contains nine `Route POST:/ not found` occurrences during the combined run, and the database contains zero `LOT_LAB_TEST_REPLACED` events.

This is not an RLS denial: the request reached transparency-service, no `42501`/permission error occurred, and the failure was an HTTP 404 at the wrong path. It is recorded here only; no fix was attempted.

## RLS A–E scan

| Taxonomy | Count | Evidence |
|---|---:|---|
| A — `42501` / permission denied | 0 | no matching current-run service-log occurrence and no request-level database permission failure |
| B — empty where tenant data is expected | 0 | expected budget, lot, unit-code, investigation, assigned-lab, and export rows were returned; all relevant runner assertions passed |
| C — cross-tenant leak | 0 | `TENANT-01`–`TENANT-25` all passed; lab-isolation received 403 and excluded the assigned lot |
| D — fail-open empty GUC | 0 | seed baseline returned exactly the three activated certifier/lab directory organizations; protected routes remained authenticated |
| E — functional/configuration | 1 | `LAB-04` audit append posted to transparency-service `/` and received 404 |
| HTTP 500 | 0 | service-log scan found no 500 response |

PostgreSQL’s logging collector was not active in this local Homebrew instance, so the current-run scan used the captured service log plus HTTP and direct database evidence. No current service-log occurrence matched `42501`, `permission denied`, `row-level security`, or `violates row-level security`.

**RLS verdict: A–D clean. Overall gate verdict: RED because the full smoke suite is not green.**

## Commands run

- `cp .env.example .env`, followed by local secret/key configuration without setting `PORT`
- `npm ci`
- `npm run db:reset -- --yes`
- migration-log, role, empty-GUC policy, audit, ledger, and `pg_stat_activity` read-only probes
- `npm run dev`
- `/health` probes on ports 8080–8087
- targeted registration, activation, duplicate, F-org, assigned-lab, isolation, and ledger probes
- `node -r dotenv/config -e 'process.env.DATABASE_URL = process.env.ADMIN_DATABASE_URL; require("./playground/test_runner.js")'`
- `node -r dotenv/config -e 'process.env.DATABASE_URL = process.env.ADMIN_DATABASE_URL; import("./scripts/check-overfilled-lots.mjs")'`
- current-run service-log scans for HTTP 500, RLS/permission errors, and failed ledger POST paths

## Scope self-audit

No tracked source, migration, policy, schema, seed, manifest, dependency, CI, architecture, or service configuration file was modified. Only this smoke report and the verbatim Attempt 05 archive are uncommitted; the required local repo-root `.env` remains ignored.
