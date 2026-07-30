# DM-04 RLS End-to-End Smoke Report — Attempt 05

**Summary verdict: YELLOW — the first proven `capmint_app` RLS run passes every reachable tenant, capacity, public-scan, investigation, cross-tenant, and ledger check with no A–D RLS anomaly; tracked non-RLS defects P1a (seed UUIDs) and P1b (mint health) remain, and P1a blocks assigned-lab success.**

Run date: 2026-07-29 (Asia/Kolkata). Branch/commit: `fix/smoke-provisioning-blockers` / `8a9f3fab` (base `57327ccc`; no new commit). Attempts 01–04 and this report remain uncommitted.

## Environment

| Item | Observed |
|---|---|
| Node / npm | `v22.22.3` / `10.9.8` |
| PostgreSQL / Redis | local `capmint_dev`; PostgreSQL 16.14; Redis 8.8.1 / `PONG` |
| Provisioning role | `capmint_admin` |
| Runtime service role | `capmint_app`, LOGIN, non-superuser, `BYPASSRLS=false` |
| Runtime env | all seven started service `.env` paths are local symlinks to `../../.env`; no global `PORT` |
| Certifier key | one aligned Ed25519 pair for runtime signing and seeded public-key verification |

## Provisioning log

`npm run db:reset -- --yes` completed:

- immutable `capmint-baseline-20260725.sql` recorded as `BASELINE`;
- migrations `0010`–`0019` recorded `EXECUTED`;
- `capmint_app` LOGIN provisioned from the root-env password;
- seed returned `DEVELOPMENT_FIXTURES_SEEDED` (`development-v2`).

The capacity integrity canary completed after the flows: `Capacity integrity canary passed: no over-issued lots found.`

## Runtime DB identity proof

This proof was captured before trusting functional results:

1. All seven service env paths resolved to `../../.env`, whose runtime URL identifies `capmint_app`.
2. A direct connection using that exact `DATABASE_URL` returned `current_user = capmint_app` and database `capmint_dev`.
3. DB-backed requests were issued to auth (login), CPQ (budget list), verification (public lookup), and mint (scoped lot lookup).
4. Immediately afterward, owner inspection of `pg_stat_activity` showed:

| `usename` | state | connections | Attribution |
|---|---|---:|---|
| `capmint_app` | idle | 4 | auth, CPQ, verification, and mint requests just issued |
| `capmint_admin` | active | 1 | the inspection query itself |

No service connection showed `capmint_admin`. This makes Attempt 05 the first valid live RLS observation.

## Startup / health

| Process | Port | Clean start | `/health` |
|---|---:|---|---:|
| frontend | 8080 | Y | 200 |
| auth | 8081 | Y | 200 |
| CPQ | 8082 | Y | 200 |
| mint | 8083 | Y | **404** |
| resolver | 8084 | Y | 200 |
| transparency | 8085 | Y | 200 |
| verification | 8086 | Y | 200 |
| integration | 8087 | Y | 200 |

Mint’s missing route is tracked P1b and is not an RLS blocker.

## Flow results

| Step | Actor | Method + path | Expected | Observed (status, key fields, row count) | Verdict | Class |
|---|---|---|---|---|---|---|
| 1 Health | public | `/health` on 8080–8087 | eight 200s | seven 200; mint 404 `Route GET:/health not found` | ANOMALY | E / P1b |
| 2 Login / pre-auth RLS | producer, certifier, lab, lab-isolation, exporter, admin | `POST :8081/api/v1/auth/login` | 200 + JWT | all six 200 with token and user; valid cross-tenant username lookup before org context | PASS | — |
| 3 Org registration | public / admin / new producer | register, activate, login | 201 / 200 / 200 | 201 with organization/admin user; activation 200; new-user login 200 + JWT | PASS | — |
| 4 Budget review/activate | certifier | seed budget `/review`, `/activate` | 200 / 200 | 200 `REVIEWING`; 200 active budget | PASS | — |
| 4 Budget scoped read | producer | `GET :8082/api/v1/budgets` | own rows | 200, row count 1 | PASS | — |
| 4 Lot create | producer | `POST :8086/api/v1/lots` | fresh v4 lot | 200, lot `300fd94e-a072-43f6-b58c-3023eecac56e` | PASS | — |
| 4 UI register path | producer | `POST :8086/api/v1/verify/register` | persist one code | 200, persisted successfully | PASS | — |
| 4 Mint | producer | `POST :8083/api/v1/mint` quantity 2 | 201 | 201, `mintedCount=2` | PASS | — |
| 4 Lot over-capacity | producer | mint 3 more into 5-unit lot with 3 already issued | reject | 422 `EXCEEDS_LOT_CAPACITY`; message reports `3/5.00 already issued` | PASS | — |
| 4 Drawdown | producer | amount 1 | 200 | 200 with budget | PASS | — |
| 4 Budget over-capacity | producer | amount 20000 | reject | 422 `EXCEEDS_CAPACITY`, remaining 9993 | PASS | — |
| 5 Resolver | public | `GET /01/:gtin/21/:serial` | redirect | 302 to frontend verify URL | PASS | — |
| 5 Verify | public | `POST /verify/:gtin/:serial` | verified + scan insert | 200, verdict payload returned | PASS | — |
| 5 Public identifier | public | `POST /verify/v/:public_identifier` | public read + scans | two 200 responses; public identifier tied to registered code | PASS | — |
| 6 Fresh lab lot | producer | `POST /lots` | v4 lot | 200, lot `76666d4d-4f43-4f16-9305-010afb5d5c8d` | PASS | — |
| 6 Assign laboratory | certifier | fresh lot `/assign-laboratory`, lab org `…0004` | 200 | 400 `BAD_REQUEST`: seeded lab organization ID fails strict UUID version/variant validator | ANOMALY | E / P1a |
| 6 Assigned lab result | lab | `POST /verify/lab-results` | success | 403 `LAB_ASSIGNMENT_REQUIRED` because assignment was rejected first | NOT EXERCISED | E prerequisite |
| 6 Isolation fail-closed | lab-isolation | same fresh lot result | 403 | 403 `LAB_ASSIGNMENT_REQUIRED` | PASS (fail-closed) | — |
| 6 Lab list scope | lab / lab-isolation | `GET /verify/lots` | assigned only / empty | lab 200, row count 1 (seed assignment); isolation 200, row count 0 | PASS | — |
| 7 Investigation trigger | public duplicate/geovelocity scan | two public-identifier scans | one investigation | scans 200; certifier list 200, row count 1 | PASS | — |
| 7 Investigation lifecycle | certifier | `/assign`, `/approve`, `/close` | 200 each | 200 / 200 / 200; product revoked then case closed | PASS | — |
| 8 Other-tenant read | new producer | `GET /budgets` | empty | 200, row count 0 | PASS | — |
| 8 Other-tenant budget mutation | new producer | seed budget `/drawdown` | 404 non-disclosing | 404 `NOT_FOUND`, no budget details | PASS | — |
| 8 Other-tenant lot mutation | new producer | mint from producer lot | 404 non-disclosing | 404 `NOT_FOUND`, “revoked, or unauthorized” | PASS | — |
| 8 Role negative | exporter | certifier-only `/activate` | 403 | 403 `FORBIDDEN` | PASS | — |
| 9 Ledger chain | public | `GET :8085/api/v1/log/verify` | intact | 200; `unbroken=true`, `logCount=12`, no errors | PASS | — |
| 9 Ledger entries | public | `GET :8085/api/v1/log/entries` | readable | 200, row count 12 | PASS | — |

Post-flow owner counts were: organizations 7, users 7, budgets 1, lots 3, unit codes 3, scan events 3, investigations 1, lab results 1, and ledger entries 12.

## RLS error scan

| Taxonomy | Count | Evidence |
|---|---:|---|
| A — `42501` / permission denied | 0 | no current-run PostgreSQL or captured service occurrence |
| B — empty where data expected | 0 | producer budget row count 1; assigned lab seed-list count 1; investigation count 1 |
| C — cross-tenant leak | 0 | other producer budget list 0; budget/lot mutations 404; isolation lab list 0 |
| D — fail-open empty GUC | 0 | public routes returned only registered public code data; protected routes required JWT |
| E — functional/non-RLS | 2 tracked defects | P1a seed UUID validation; P1b missing mint health |
| HTTP 500 | 0 | no request returned 500 |

The PostgreSQL log tail for the run contains no current `42501`, permission-denied, RLS-policy violation, or other current-run ERROR. Older July 26/28 compliance/provisioning errors were excluded by timestamp.

**RLS verdict: clean for every exercised `capmint_app` path.**

## Cross-tenant negatives

All reached negative checks passed:

- another producer saw zero budgets;
- the same actor received non-disclosing 404s for the seed budget drawdown and another producer’s lot mint;
- exporter received 403 for certifier activation;
- isolation lab saw zero lots and received fail-closed `LAB_ASSIGNMENT_REQUIRED`;
- no leaked response row or 500 occurred.

## Prioritized defects

1. **P1a — seed IDs conflict with strict route UUID validation (E).** The fresh v4 lot is accepted, but seeded lab organization ID `00000000-0000-0000-0000-000000000004` has version nibble `0`; `/assign-laboratory` validates both path and lab organization IDs using RFC version/variant constraints and returns 400. The same inconsistency affects seed lot `…0050`. This prevents the assigned-lab success half of flow 6. Logged only.
2. **P1b — mint service has no `/health` route (E).** Port 8083 serves mint requests correctly but returns 404 for `/health`. Logged only.

## Not exercised

The assigned laboratory’s successful result submission could not be exercised because P1a rejects the only seeded assigned-lab organization ID before authorization/RLS evaluation. All other requested flow groups were exercised. No product code, seed, migration, policy, validator, role, tenant GUC, or `withTenantTx` behavior was changed or bypassed.
