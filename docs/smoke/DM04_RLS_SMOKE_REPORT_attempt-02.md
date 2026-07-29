# DM-04 RLS End-to-End Smoke Report — Attempt 02

**Summary verdict: RED — provisioning advances through bootstrap and `capmint_app` LOGIN, but the required development seed rejects the documented literal-`\\n` PEM environment format; no RLS service flow was run.**

Run date: 2026-07-28 (Asia/Kolkata). Commit under test: `8b0bc6f5` on `fix/smoke-provisioning-blockers` (base `57327ccc`). This report and attempt 01 are uncommitted. No security control, service logic, migration, policy, migration runner, or shared package code was changed.

## Environment

| Item | Observed |
|---|---|
| Node / npm | `v22.22.3` / `10.9.8` |
| PostgreSQL / database | `16.14 (Homebrew)` / local `capmint_dev` |
| Redis | `8.8.1`; `PONG` |
| Provisioning role | `capmint_admin` |
| Service role | `capmint_app`, non-superuser and `BYPASSRLS=false` |
| Intended service authentication | `DATABASE_URL` uses `capmint_app`; no service was started |

The `.env` was recreated from the fixed template, with `PORT` unset, strong local passwords, and a newly generated matching Ed25519 PEM pair. Per the operator instruction, each PEM was stored as a single line containing literal `\\n`, then exported with `set -a; . ./.env; set +a`.

## Provisioning log

| Step | Expected | Observed | Verdict / class |
|---|---|---|---|
| Fix 1: reset caller | Empty DB runs baseline bootstrap | `db:reset` dry/apply plan says `--bootstrap`; runner applied baseline then 0010–0019 | PASS |
| Fix 2: clean install | `npm ci` succeeds | Succeeded; only pre-existing `fast-jwt@3.3.3` Node `<22` engine warning. Lockfile change is exactly two `@capmint/shared@1.0.0` workspace linkage entries (8 lines); no transitive version movement | PASS |
| Fix 3: template port | No active global PORT | `.env.example` has explanatory comment and no active `PORT` assignment | PASS |
| Migration ledger | BASELINE + 0010–0019 EXECUTED | `capmint-baseline-20260725.sql` is `BASELINE`; each 0010–0019 is `EXECUTED` | PASS |
| App role | `capmint_app` LOGIN provisioned | `rolcanlogin=true`, `rolsuper=false`, `rolbypassrls=false` | PASS |
| Seed | `DEVELOPMENT_FIXTURES_SEEDED` | `{"success":false,"code":"INVALID_DEVELOPMENT_KEYPAIR","message":"Development Ed25519 key material is malformed."}` | FAIL / E |

Seed-format evidence (values redacted): after the documented shell export, both key variables contained three literal `\\n` sequences. Node `crypto.createPrivateKey` / `crypto.createPublicKey` rejected them with `DECODER routines::unsupported`. The seed reads `process.env` directly and passes the strings straight to `crypto.create*Key`; it does not decode literal `\\n`. This conflicts with the prescribed `.env` format plus direct-export provisioning path. No alternate key formatting or seed change was attempted.

## Startup / health

No process was started. The seed failure means the required users, budget, lot, and certifier fixtures do not exist; starting services would not provide the requested end-to-end test state.

| Process | Port | Clean start | `/health` |
|---|---:|---|---|
| frontend | 8080 | N/A — seed blocked | N/A |
| auth-service | 8081 | N/A — seed blocked | N/A |
| cpq-service | 8082 | N/A — seed blocked | N/A |
| mint-service | 8083 | N/A — seed blocked | N/A |
| resolver-service | 8084 | N/A — seed blocked | N/A |
| transparency-service | 8085 | N/A — seed blocked | N/A |
| verification-service | 8086 | N/A — seed blocked | N/A |
| integration-service | 8087 | N/A — seed blocked | N/A |

## Flow results

| Step | Actor | Method + path | Expected | Observed (status, key fields, row count) | Verdict | Class |
|---|---|---|---|---|---|---|
| 1 Health | public | `GET /health` 8080–8087 | 200 | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 2 Login / pre-auth RLS | seeded actors | auth login | JWT / non-empty pre-auth lookup | Not issued; users absent; rows N/A | NOT EXERCISED | E prerequisite |
| 3 Org registration | new actor | register-org | RLS insert/read-back | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 4 Budget → lot → mint + capacity | certifier / producer | CPQ, verification, mint | valid state and rejected over-issue | Not issued; fixtures absent; rows N/A | NOT EXERCISED | E prerequisite |
| 5 Public scan / verify | public | resolver / verification | public read and scan insert | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 6 Lab assignment / isolation | certifier / labs | verification routes | success / 403 / scoped lists | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 7 Investigation | applicable actor | investigation routes | scoped lifecycle | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 8 Cross-tenant negatives | producer / exporter | budget, lot, certifier routes | 404 / 403 | Not issued; rows N/A | NOT EXERCISED | E prerequisite |
| 9 Ledger | public | transparency routes | chain valid / entries readable | Not issued; rows N/A | NOT EXERCISED | E prerequisite |

## RLS error scan

No services were started, so no service stderr or HTTP 500s exist for this attempt. PostgreSQL had no `42501`, `permission denied`, or `row-level security` occurrence attributable to this attempt. The seed rejection occurred before any application RLS query. No A–D classification can be assessed.

## Cross-tenant negatives

Not exercised: fixtures were not seeded. No read result or row count was observed.

## Prioritized defects

1. **P0 — documented literal-`\\n` PEM export is incompatible with `db:reset` seed (E, gate-blocking).** Reproduce with a fresh Ed25519 pair represented in `.env` as a single quoted line with literal `\\n`, export via the documented `set -a; . ./.env; set +a`, and run `npm run db:reset -- --yes`. Observed: baseline, 0010–0019, and app LOGIN complete; seed exits `INVALID_DEVELOPMENT_KEYPAIR` because its direct `process.env` input contains literal backslash-n rather than PEM newlines. Expected: the exact documented provisioning path seeds fixtures.
2. **P1 — Node engine range warning.** `npm ci` succeeds but reports `fast-jwt@3.3.3` requires Node `>=16 <22`, while the operator environment has Node 22.22.3. This did not cause the seed failure.

## Not exercised

All eight health checks and all nine required flows remain unexercised. Per the gate instruction, testing stopped at the new provisioning failure and did not alter key decoding, seed behavior, RLS enforcement, roles, GUC handling, or the migration runner.
