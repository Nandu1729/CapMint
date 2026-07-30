# DM-04 RLS End-to-End Smoke Report — Attempt 06 ledger-tail rerun

**Summary verdict: RED — the corrected live ledger endpoint makes the extended compliance suite pass 88/88, but the resulting transparency ledger is broken. Under `capmint_app`, the chain-tail query returns a row as a plain SELECT and zero rows with `FOR UPDATE`; service appends consequently use the genesis zero hash instead of the actual tail.**

Run date: 2026-07-29 (Asia/Kolkata). Branch/commit: `develop` / `d5dc86df892bf8f09a0eac1d95c3f13f861f0300`. Commit `d5dc86df` is the architect documentation-only successor to the originally specified `d0c5ce98`. This rerun supplements Attempt 06. All report changes remain uncommitted.

## Gate outcome

HO-007 is not a GREEN baseline, so HO-008 was not started.

- clean lockfile installation, reset, migration verification, runtime-role checks, health checks, F-org, capacity canary, and the extended compliance assertions passed;
- the compliance runner reported **88 passed, 0 pending, 0 failed**, including `LAB-04`;
- the required post-registration `/api/v1/log/verify` probe returned 200 with `unbroken=false`;
- the chain contained eight broken service-appended links;
- investigation stopped at that failure; no source, migration, policy, schema, service, manifest, dependency, or CI change was made.

## Environment

| Item | Observed |
|---|---|
| Node / npm | `v26.3.1` / `11.16.0` |
| PostgreSQL / Redis | PostgreSQL 16.14 (Homebrew); Redis 8.8.1 / `PONG` |
| Database | sanctioned local `capmint_dev` |
| Provisioning role | `capmint_admin` |
| Runtime service role | `capmint_app`, LOGIN, non-superuser, `BYPASSRLS=false` |
| Runtime env | repo-root `.env`; no per-service `.env`; global `PORT` unset |
| Ledger URL for this rerun | ignored local `.env` set to `http://localhost:8085/api/v1/log` |

The local endpoint correction was necessary because the earlier Attempt 06 phase proved that the unchanged `.env.example` value points to transparency-service `/` rather than its append route. `.env.example` was not modified.

`npm ci` succeeded from the committed lockfile and installed 218 packages. It emitted the existing `fast-jwt` engine warning and existing npm audit findings.

## Reset and migration evidence

`npm run db:reset -- --yes` completed successfully:

- reset `capmint_dev`;
- recorded `capmint-baseline-20260725.sql`;
- recorded migrations `0010`–`0020`;
- reported every migration state-compatible;
- the owner-run migration check reported `SAFE / NO PENDING ACTIONS`;
- provisioned `capmint_app` LOGIN;
- seeded `DEVELOPMENT_FIXTURES_SEEDED` (`development-v2`).

The post-flow capacity integrity canary passed:

`Capacity integrity canary passed: no over-issued lots found.`

## Runtime identity and health

The runtime role query confirmed `capmint_app` has LOGIN, is not a superuser, and does not have `BYPASSRLS`.

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

All eight processes were live simultaneously.

## Migration 0020 / F-org

Immediately after the clean seed and before test-created organizations, an empty-GUC `capmint_app` query returned exactly three organizations:

| ID suffix | Type | Status |
|---|---|---|
| `…0001` | `CERTIFICATION_BODY` | `ACTIVATED` |
| `…0004` | `NABL_LABORATORY` | `ACTIVATED` |
| `…0007` | `NABL_LABORATORY` | `ACTIVATED` |

No producer, exporter, or system-administrator organization was visible. Migration `0020_tighten_organizations_public_read.sql` was present in `migrations_log`.

## Extended compliance result

The live `playground/test_runner.js` run completed:

| Area | Result |
|---|---|
| Authentication and identity | pass |
| RBAC | pass |
| CPQ / capacity / concurrency | pass |
| Invalid-signature containment | pass |
| Mint / resolver | pass |
| Lot lifecycle | pass |
| NABL assignment, result, replacement, and isolation | pass |
| `LAB-04` replacement audit row | pass |
| Certification | pass |
| Verification and clone detection | pass |
| Tenant isolation `TENANT-01`–`TENANT-25` | all 25 pass |
| Transparency runner assertions | pass |
| Integration, security, performance, and audit | pass |
| End-to-end business flow | pass |
| Redis rate limits | pass |
| **Total** | **88 passed / 0 pending / 0 failed** |

The runner does not establish an intact chain before its deliberate `LEDGER-06` corruption check. `LEDGER-04` only checks that the latest `current_hash` is present and 64 characters long; `LEDGER-06` expects `unbroken=false` after adding a fake row. Thus 88/88 does not contradict the independent integrity failure below.

## Blocking ledger failure

After the compliance run, a new organization registered successfully through the 0020 definer path with HTTP 201. The immediately following required ledger probe returned:

- HTTP 200;
- `unbroken=false`;
- `logCount=41`;
- eight broken-link errors.

The first broken service event was `LOT_CREATED`; later broken events included another `LOT_CREATED`, `LOT_LAB_TEST_PASSED`, `LOT_LAB_TEST_REPLACED`, `LOT_CERTIFIED`, and `INVESTIGATION_CREATED`.

The current service log showed:

- eight verification-to-transparency `POST /api/v1/log` requests;
- all eight append requests returned 201;
- no append was sent to `/`;
- no HTTP 500.

Each affected row was inserted with:

`previous_hash = 0000000000000000000000000000000000000000000000000000000000000000`

instead of the prior row’s `current_hash`.

## Read-only root-cause proof

transparency-service obtains its chain tail with:

`SELECT current_hash FROM log_entries ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`

In one `capmint_app` transaction with the system-admin GUC enabled, read-only probes produced:

| Query | Rows |
|---|---:|
| same ordered tail query without `FOR UPDATE` | 1 |
| same ordered tail query with `FOR UPDATE` | 0 |

Migration 0019 gives `capmint_app` a global SELECT policy and a constrained INSERT policy on `log_entries`, but no UPDATE policy. PostgreSQL row locking requires update-capable row visibility, so the `FOR UPDATE` form silently returns no tail row under this policy shape. transparency-service then falls back to the all-zero previous hash and returns 201.

This is an empty-where-data-is-required RLS/implementation interaction, not a `42501` exception. No fix was attempted.

## A–E taxonomy

| Taxonomy | Count | Evidence |
|---|---:|---|
| A — `42501` / permission denied | 0 | no actual current-run permission exception |
| B — empty where data expected | 1 | chain-tail SELECT returns one row, but its `FOR UPDATE` form returns zero under `capmint_app` |
| C — cross-tenant leak | 0 | all `TENANT-01`–`TENANT-25` assertions passed |
| D — fail-open empty GUC | 0 | seed baseline exposed exactly the three activated certifier/lab directory organizations |
| E — other functional | 0 | the observed blocker is classified as B |
| HTTP 500 | 0 | no current-run 500 response |

**Overall gate verdict: RED.**

## Commands run

- updated only the ignored local `.env` ledger endpoint for this rerun
- `npm ci`
- `npm run db:reset -- --yes`
- owner-run `playground/run_migrations.js --check`
- runtime-role and empty-GUC organization probes
- `npm run dev`
- `/health` probes on ports 8080–8087
- owner-backed `playground/test_runner.js`
- registration and `/api/v1/log/verify` acceptance probes
- plain SELECT versus `SELECT … FOR UPDATE` chain-tail comparison under `capmint_app`
- `scripts/check-overfilled-lots.mjs`
- current-run service-log scan for append status, RLS exceptions, and HTTP 500

## Not completed after stop condition

The separate seeded sentinel assignment (`lot …0050` to lab organization `…0004`), pending-login/activation continuation, duplicate registration probes, and final nine-flow ledger check were not rerun after this phase’s ledger failure. The earlier Attempt 06 phase had already exercised those route outcomes, but this ledger-tail rerun does not claim them as a GREEN result.

## Scope self-audit

No tracked product, migration, policy, schema, seed, service, manifest, dependency, CI, architecture, or environment file was modified. The ignored local `.env` remains untracked. No HO-008 branch, commit, push, PR, or merge was created.
