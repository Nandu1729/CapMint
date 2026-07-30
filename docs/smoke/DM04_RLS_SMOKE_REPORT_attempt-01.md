# DM-04 RLS End-to-End Smoke Report

**Verdict: RED — verification gate blocked before any RLS-enforced service could start.**

Run date: 2026-07-28 (Asia/Kolkata)  
Scope: no product code, migration, policy, authorization, or service configuration changes were made. This report is uncommitted.

## Environment

| Item | Observed |
|---|---|
| Repository commit / branch | `57327ccc` / `feat/post-dm03-integration` |
| Node / npm | `v22.22.3` / `10.9.8` |
| PostgreSQL server | `16.14 (Homebrew)` |
| Redis / connectivity | `8.8.1`; `redis-cli ping` → `PONG` |
| Disposable database | local `capmint_dev` on `localhost:5432` |
| Provisioning role | `capmint_admin` (LOGIN, superuser, `BYPASSRLS=false`) |
| Intended service role | `capmint_app` (non-superuser, `BYPASSRLS=false`) |
| Actual app role after failed reset | `LOGIN=false`; provisioning step was not reached |

The test `.env` was created from `.env.example` with a locally generated, matching Ed25519 keypair and strong local passwords. `PORT` was deliberately unset before startup. No secret values are recorded here.

## Provisioning log

| Step | Expected | Observed | Verdict / class |
|---|---|---|---|
| `npm ci` | Clean dependency installation | Exit `EUSAGE`: lockfile is out of sync; missing `@capmint/shared@1.0.0` entries from lockfile | ANOMALY / E |
| `npm run db:reset` dry run (exported env) | Local plan and steps 3/4 enabled | Printed local `capmint_dev` plan; `3. provision capmint_app LOGIN (yes)` and `4. npm run seed (yes)` | PASS |
| `npm run db:reset -- --yes` | Recreate, migrate through `0019`, provision LOGIN, seed fixtures | Dropped/recreated `capmint_dev`, then `0001_add_certification_status_and_updated_at.sql` failed: `relation "lots" does not exist` | FAIL / E |
| Migration state after failure | `0015`–`0019` applied | `migrations_log` has 0 rows; only table is `migrations_log` | FAIL / E |
| Seed result | `DEVELOPMENT_FIXTURES_SEEDED` or `...ALREADY_PRESENT` | Not reached | NOT EXERCISED |

Evidence for the migration failure:

```text
Migration command failed: Migration 0001_add_certification_status_and_updated_at.sql failed and was rolled back: relation "lots" does not exist
db:reset failed at: node playground/run_migrations.js --apply
```

PostgreSQL recorded the same error at `2026-07-28 21:22:28.809 IST` while executing `ALTER TABLE lots ADD COLUMN certification_status ...`.

This is internally inconsistent with the repository’s documented empty-DB bootstrap path: `database/README.md` states that an empty DB needs `playground/run_migrations.js --bootstrap`, which applies the immutable baseline before migrations later than cutoff `0009`; `scripts/db-reset.js` instead always invokes `--apply`. I did not run `--bootstrap` manually because the requested exact reset path failed and doing so would mask the defect.

## Startup and health

No process was started: the post-reset database had no application schema, no app LOGIN, and no seed data. Starting the stack would not exercise the requested `capmint_app` RLS path.

| Process | Port | Clean start | `/health` |
|---|---:|---|---|
| frontend | 8080 | N/A — blocked | N/A |
| auth-service | 8081 | N/A — blocked | N/A |
| cpq-service | 8082 | N/A — blocked | N/A |
| mint-service | 8083 | N/A — blocked | N/A |
| resolver-service | 8084 | N/A — blocked | N/A |
| transparency-service | 8085 | N/A — blocked | N/A |
| verification-service | 8086 | N/A — blocked | N/A |
| integration-service | 8087 | N/A — blocked | N/A |

Configuration finding: shipped `.env.example` sets global `PORT=8080`. Under `npm run dev`, the frontend is fixed to 8080 and every backend reads the same `process.env.PORT`; this creates a cross-service port collision. Unsetting `PORT` correctly selects service defaults, but the template is unsafe for the documented dev command. Class E.

## Flow results

`row count` is N/A for every flow because no RLS-visible data exists and no HTTP request was safely issued.

| Step | Actor | Method + path | Expected | Observed (status, key fields, row count) | Verdict | Class |
|---|---|---|---|---|---|---|
| 1 Health | unauthenticated | `GET /health` on 8080–8087 | 200 | Not issued; startup blocked; rows N/A | NOT EXERCISED | E prerequisite |
| 2 Login / pre-auth RLS | producer, certifier, lab, lab-isolation, admin | `POST :8081/api/v1/auth/login` | JWTs; no empty pre-auth user read | Not issued; no seeded users; rows N/A | NOT EXERCISED | E prerequisite |
| 3 Org registration | new user | `POST :8081/api/v1/auth/register-org` | insert/read-back under RLS | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 4 Budget → lot → mint / capacity | certifier, producer | CPQ, verification, mint endpoints | correct state changes; over-capacity rejected | Not issued; seed budget/lot absent; rows N/A | NOT EXERCISED | E prerequisite |
| 5 Public scan / verify | public | resolver and verification public endpoints | public read and `scan_events` insert | Not issued; registered code absent; rows N/A | NOT EXERCISED | E prerequisite |
| 6 Lab assignment / isolation | certifier, lab, lab-isolation | assignment, results, lots reads | assigned success; isolation 403/empty | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 7 Investigation lifecycle | applicable actor | investigation endpoints | scoped list and lifecycle | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 8 Cross-tenant negatives | producer, exporter | budget/lot/certifier actions | 404 non-disclosing / 403 | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 9 Ledger | public | `GET :8085/api/v1/log/verify`, `/entries` | valid chain/readable entries | Not issued; rows N/A | NOT EXERCISED | E prerequisite |

## RLS error scan

Service stderr: no services were started, so no service stderr exists for this run.

PostgreSQL log scanned after the reset attempt (`/opt/homebrew/var/log/postgresql@16.log`):

| Pattern | Count | Occurrences / attribution |
|---|---:|---|
| SQLSTATE `42501` / `permission denied` | 0 | None |
| `row-level security` | 0 | None |
| HTTP/service 500 | 0 | No services started |
| Other PostgreSQL ERROR | 1 | `relation "lots" does not exist`, migration `0001`, provisioning step |

No RLS result can be inferred from this run: neither a permissive policy nor an over-filtering policy was exercised.

## Cross-tenant negatives

Not exercised. The required identities, budget, lots, and RLS-enabled tables were not provisioned. Expected results remain 404 non-disclosing for cross-tenant producer reads/mutations and 403 for exporter certifier-only actions.

## Prioritized defects

1. **P0 — `db:reset` cannot provision an empty disposable DB (class E, gate-blocking).** Reproduce with exported valid local `.env`, then run `npm run db:reset -- --yes`. Observed: reset creates an empty DB and calls migration runner `--apply`; migration `0001` fails because `lots` does not exist. Expected: the documented reset completes the immutable baseline/bootstrap, applies through `0019`, provisions `capmint_app LOGIN`, and returns a seed result. This blocks all required frontend→API→RLS evidence.
2. **P1 — `npm ci` is not reproducible (class E).** Reproduce with `npm ci`. Observed: `EUSAGE`, missing `@capmint/shared@1.0.0` from lockfile. Expected: clean install succeeds under the declared Node/npm prerequisites.
3. **P1 — shipped `.env.example` causes port collisions (class E).** Reproduce with the template unchanged and `npm run dev`. Observed by configuration inspection: frontend hardcodes 8080 while all backend services read one global `PORT=8080`. Expected: backend service defaults/independent ports under the documented command.

## Not exercised

All eight health checks and all nine specified flows were not exercised because the required `db:reset` provisioning gate failed before RLS policies, the `capmint_app` LOGIN grant, seed fixtures, or any service could exist in a valid state. I did not apply the alternative bootstrap command, alter migrations, create roles manually, weaken enforcement, or otherwise repair/bypass the failure.
