# DM-04 RLS End-to-End Smoke Report — Attempt 03

**Summary verdict: RED — provisioning and non-owner runtime start succeed, but required flows are blocked by health, signature, and seeded-ID validation failures (all class E); no A–D RLS defect was observed in the exercised paths.**

Run date: 2026-07-28 (Asia/Kolkata). Branch/commit: `fix/smoke-provisioning-blockers` / `8a9f3fab` (base `57327ccc`). Reports are uncommitted.

## Environment

| Item | Observed |
|---|---|
| Node / npm | `v22.22.3` / `10.9.8` (`fast-jwt` warns that Node 22 is outside its `<22` range) |
| PostgreSQL / Redis | local `capmint_dev`; PostgreSQL 16.14; Redis 8.8.1 / `PONG` |
| Provisioning role | `capmint_admin` |
| Runtime service role | `capmint_app`: LOGIN, non-superuser, `BYPASSRLS=false` |
| Runtime configuration | `.env` loaded by dotenv; global `PORT` unset; backend defaults 8081–8087 |

## Provisioning log

| Step | Expected | Observed | Verdict |
|---|---|---|---|
| `npm ci` | clean install | success; lockfile has `@capmint/shared` workspace linkage | PASS |
| `db:reset` | baseline, 0010–0019, app LOGIN, seed | success; baseline recorded `BASELINE`, 0010–0019 `EXECUTED`, app LOGIN provisioned, `DEVELOPMENT_FIXTURES_SEEDED` | PASS |
| PEM run path | literal `\\n` expands under dotenv | success; no pre-export was used | PASS |

## Startup / health

| Process | Port | Clean start | `/health` |
|---|---:|---|---|
| frontend | 8080 | Y | 200 |
| auth | 8081 | Y | 200 |
| cpq | 8082 | Y | 200 |
| mint | 8083 | Y | **404** |
| resolver | 8084 | Y | 200 |
| transparency | 8085 | Y | 200 |
| verification | 8086 | Y | 200 |
| integration | 8087 | Y | 200 |

## Flow results

| Step | Actor | Method + path | Expected | Observed (status, key fields, row count) | Verdict / class |
|---|---|---|---|---|---|
| 1 Health | public | all `/health` | 200 each | 7/8 returned 200; mint `:8083/health` returned 404 | FAIL / E |
| 2 Login / pre-auth RLS | producer, certifier, lab, isolation-lab, admin, exporter | `POST :8081/api/v1/auth/login` | JWT despite no org context | all six 200 with JWT | PASS |
| 3 Register + read-back | new producer | register-org, activate, login | insert then activated login | register 201; pending login 403 (expected lifecycle); admin activation 200; activated login 200 | PASS |
| 4 Budget activation/read | certifier / producer | activate seed budget; `GET /budgets` | active and scoped | activation 200; producer budget read 200, row count 1 | PASS |
| 4 Lot + capacity/mint | producer | `POST :8086/api/v1/lots` | lot creation then mint / over-capacity rejection | lot creation 400 `INVALID_SIGNATURE`; no lot/unit rows created (lots remains 1 seed lot, unit_codes 0) | FAIL / E |
| 4 Drawdown capacity | producer | seed budget drawdown | valid signed authority | 400 `INVALID_SIGNATURE` | FAIL / E |
| 5 Public scan/verify | public | resolver + verify with minted code | public read/scan insert | not exercised: no mintable code due prior flow; scan rows 0 | NOT EXERCISED / E prerequisite |
| 6 Lab scoped reads | lab / isolation-lab | `GET :8086/api/v1/verify/lots` | assigned only / empty | lab 200, row count 1; isolation 200, row count 0 | PASS |
| 6 Lab result fail-closed | lab / isolation-lab | `POST /verify/lab-results` on seed lot | lab success; isolation 403 | both 400 `BAD_REQUEST`: seed lot `00000000-0000-0000-0000-000000000050` fails route UUID version validator before assignment check | FAIL / E |
| 7 Investigation | certifier | `GET /verify/investigations` | scoped list/lifecycle | 200, row count 0; lifecycle not exercisable (no investigation) | PARTIAL / E prerequisite |
| 8 Cross-tenant/RBAC negative | exporter | seed budget drawdown | 403 certifier-only action | 403 `FORBIDDEN`; no row leak | PASS |
| 9 Ledger | public | `GET :8085/api/v1/log/verify`, `/entries` | readable / valid chain | both 200 | PASS |

## RLS error scan

Service stderr and PostgreSQL logs for this run: 0 occurrences of `42501`, `permission denied`, or `row-level security`; no observed HTTP 500. The exercised non-owner RLS results were non-empty where expected (seed logins, producer budget list, lab lot list) and empty where expected (isolation-lab lot list). No cross-tenant leak or fail-open empty-GUC result was observed.

## Cross-tenant negatives

Exporter drawdown returned 403 before DB mutation, with no disclosed budget data. Isolation laboratory listed zero lots while the assigned laboratory listed one. Producer list showed one own budget. These are PASS observations; producer mutation of another tenant’s resource and investigation lifecycle remain blocked by the signature/mint prerequisite.

## Prioritized defects

1. **P0 — activated seed budget cannot pass its own signature verification (E).** Certifier activation returns 200, but producer lot creation and drawdown return 400 `INVALID_SIGNATURE`. This blocks lot, mint, capacity-overfill, public verification, and investigation flows.
2. **P1 — seed lot ID violates endpoint UUID validator (E).** Seed ID ending `0050` has UUID version nibble `0`; lab-result/assignment routes require `[1-5]`, returning 400 before assignment authorization. This blocks the required lab success/403 pair.
3. **P1 — mint service does not implement required `/health` (E).** `GET :8083/health` returns 404 while the other seven required processes return 200.

## Not exercised

Capacity overfill checker, public scan/verify, investigation trigger/lifecycle, producer cross-tenant 404 mutation, certifier lab assignment, and lab result success/isolation-403 were not completed because the required preceding budget signature or seed lot validation failed. No workaround, role change, GUC bypass, RLS-policy change, migration, seed change, or service-logic change was made.
