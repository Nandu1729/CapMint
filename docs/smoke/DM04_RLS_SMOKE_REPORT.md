# DM-04 RLS End-to-End Smoke Report — Attempt 07

**Summary verdict: GREEN — both ledger fixes are confirmed live on `fix/ledger-append-rls-and-url`: the full compliance suite passes 88/88 with `LAB-04`, every verification append uses `/api/v1/log`, and the final ledger remains `unbroken=true` with 46 entries, zero errors, and zero broken links after registration, public verification, and a seeded-lab result replacement.**

Run date: 2026-07-30 (Asia/Kolkata). Branch/commit: `fix/ledger-append-rls-and-url` / `85ed7974f8b5ffe01b2c46866a805d15e75b7dc0`.

Fixes under verification:

- `f98921d0` — derive the transparency ledger append URL from the configured service base;
- `85ed7974` — serialize ledger writers with a `SHARE ROW EXCLUSIVE` table lock and read the tail with a plain SELECT.

Attempts 01–06 are preserved. This report remains uncommitted.

## Gate result

| Gate | Result |
|---|---|
| Mandatory clean reset | PASS |
| Baseline plus migrations `0010`–`0020` | PASS |
| `capmint_app` LOGIN / non-owner runtime role | PASS |
| Eight `/health` endpoints | PASS |
| F-org empty-GUC directory count | PASS — exactly 3 |
| Full compliance suite | PASS — 88/88 |
| `LAB-04` | PASS |
| `LOT_LAB_TEST_REPLACED` after compliance | PASS — count 1 |
| Seeded assigned-lab submission and replacement | PASS |
| Definer registration lifecycle and duplicate conflicts | PASS |
| Public verification scans | PASS |
| Final ledger integrity | PASS — 46 entries, zero errors |
| Capacity canary | PASS |
| RLS A–D taxonomy | PASS — all zero |
| HTTP 500 scan | PASS — zero |

## Environment

| Item | Observed |
|---|---|
| Node / npm | `v26.3.1` / `11.16.0` |
| PostgreSQL / Redis | PostgreSQL 16.14 (Homebrew); Redis 8.8.1 / `PONG` |
| Database | sanctioned local `capmint_dev` |
| Provisioning role | `capmint_admin` |
| Runtime service role | `capmint_app`, LOGIN, non-superuser, `BYPASSRLS=false` |
| Runtime env | repo-root `.env`; no per-service `.env` or env symlinks |
| `PORT` | unset |
| Certifier keys | one aligned Ed25519 keypair across all four certifier variables |
| Configured ledger base | `http://localhost:8085` |
| Derived append endpoint | `http://localhost:8085/api/v1/log` |

`npm ci` succeeded from the committed lockfile and installed 218 packages. It emitted the existing `fast-jwt` Node-engine warning and existing npm audit findings.

## Mandatory reset and migrations

`npm run db:reset -- --yes` completed successfully before any live validation:

- dropped and recreated local `capmint_dev`;
- recorded `capmint-baseline-20260725.sql`;
- recorded migrations `0010`–`0020`;
- provisioned `capmint_app` LOGIN;
- seeded `DEVELOPMENT_FIXTURES_SEEDED` (`development-v2`).

The owner-run migration check then reported:

`Result: SAFE / NO PENDING ACTIONS`

There were 12 migration-log rows: the baseline plus `0010`–`0020`, with `0020_tighten_organizations_public_read.sql` last.

## Runtime role proof

Direct role inspection returned:

- `rolcanlogin=true`;
- `rolsuper=false`;
- `rolbypassrls=false`.

After live DB-backed requests, `pg_stat_activity` showed four idle `capmint_app` connections. The only `capmint_admin` connection was the active inspection query itself.

## Health

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

Mint returned the expected `{ "status": "healthy", "service": "mint-service" }` body.

## F-org

Before the compliance suite created additional organizations, an empty-GUC `capmint_app` query returned exactly:

| Organization | Type | Status |
|---|---|---|
| `…0001` | `CERTIFICATION_BODY` | `ACTIVATED` |
| `…0004` | `NABL_LABORATORY` | `ACTIVATED` |
| `…0007` | `NABL_LABORATORY` | `ACTIVATED` |

Count: **3**. No producer, exporter, or system-administrator organization was visible.

## Full compliance suite

`playground/test_runner.js` completed against the live stack:

| Area | Result |
|---|---|
| Authentication and identity | all pass |
| RBAC | all pass |
| CPQ / capacity / concurrency | all pass |
| Signature containment | all pass |
| Mint / resolver | all pass |
| Lot lifecycle | all pass |
| NABL assignment, result, replacement, isolation | all pass |
| Certification | all pass |
| Verification and clone detection | all pass |
| Tenant isolation `TENANT-01`–`TENANT-25` | all 25 pass |
| Transparency checks | all pass |
| Integration, security, performance, audit | all pass |
| End-to-end business flow | pass |
| Redis rate limits | both pass |
| **Total** | **88 passed / 0 pending / 0 failed** |

### Ledger URL / `LAB-04`

- `LAB-04`: PASS;
- `LOT_LAB_TEST_REPLACED` count immediately after compliance: **1**;
- captured verification-to-transparency appends to `POST /api/v1/log`: **8**;
- `POST /` route misses: **0**;
- ledger after compliance: `unbroken=true`, `logCount=34`, `errors=[]`;
- direct chain scan: zero broken links.

The compliance runner’s deliberate `LEDGER-06` fake entry was removed as designed; the independent post-suite integrity check remained GREEN.

## Targeted regression

The rate-limit assertions intentionally filled the two local Redis windows. Their exact ephemeral keys were cleared before the independent continuation:

- `ratelimit:login:127.0.0.1`;
- `ratelimit:verify:127.0.0.1`.

No application or database state was bypassed.

| Check | Observed | Verdict |
|---|---|---|
| Seeded producer, certifier, lab, lab-isolation, exporter, admin login | six 200 responses | PASS |
| Definer registration | 201 | PASS |
| Ledger immediately after registration | `unbroken=true`, `logCount=41`, zero errors | PASS |
| Pending organization login | 403 `INACTIVE_ORGANIZATION` | PASS |
| Duplicate tax ID | 409 `REGISTRATION_EXISTS` | PASS |
| Duplicate registration number | 409 `REGISTRATION_EXISTS` | PASS |
| Admin activation | 200 | PASS |
| Activated producer login | 200 | PASS |
| Public GTIN/serial verification | 200 | PASS |
| Public-identifier verification | 200 | PASS |
| Ledger after public verification | `unbroken=true`, `logCount=43`, zero errors | PASS |
| Assign seed lot `…0050` to lab org `…0004` | 200 | PASS |
| Assigned lab initial result | 200 | PASS |
| Assigned lab replacement | 200 | PASS |
| Isolation lab submission | 403 `LAB_ASSIGNMENT_REQUIRED` | PASS |
| Assigned lab list | contains seed lot | PASS |
| Isolation lab list | excludes seed lot | PASS |
| Registration audit | exactly one matching event | PASS |
| Seed-lot replacement audit | exactly one matching event | PASS |
| Total replacement events | 2 | PASS |

## Final ledger integrity

Final `GET :8085/api/v1/log/verify`:

```json
{
  "unbroken": true,
  "logCount": 46,
  "error": null,
  "errors": []
}
```

The count is accounted for:

- 34 entries after the full compliance suite;
- six seeded-user login audit entries plus one definer registration append: 41;
- activation and activated-login audit entries: 43;
- initial seeded-lab result append: 44;
- replacement and replacement-pass appends: 46.

The two public verification calls returned 200 and did not add a ledger event in this run. A direct owner-ordered link scan independently found **0 broken links**.

## Chain-tail / taxonomy B proof

In a `capmint_app` transaction with the system-admin GUC:

1. `LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE` succeeded.
2. The following plain ordered tail SELECT returned exactly one row.

This is the same lock/read sequence used by the fixed service append path. The previous empty-tail behavior is absent, so taxonomy B is zero.

## Capacity and A–E scan

`Capacity integrity canary passed: no over-issued lots found.`

| Taxonomy | Count | Evidence |
|---|---:|---|
| A — `42501` / permission denied | 0 | no current-run service-log occurrence |
| B — empty where data expected | 0 | locked chain-tail read returned one row; all expected tenant rows were present |
| C — cross-tenant leak | 0 | `TENANT-01`–`TENANT-25` all passed; isolation lab excluded the seed lot |
| D — fail-open empty GUC | 0 | pre-flow public organization count was exactly the three activated directory organizations |
| E — other functional | 0 | no functional acceptance failure |
| HTTP 500 | 0 | parsed 798 structured service-log records; no 500 response |

Final service-log totals:

- verification-to-transparency `POST /api/v1/log` requests: **11**;
- `POST /` route misses: **0**;
- PostgreSQL `42501`: **0**;
- permission-denied records: **0**.

## Commands run

- environment/key/role validation without printing secrets
- `npm ci`
- `npm run db:reset -- --yes`
- owner-run `playground/run_migrations.js --check`
- empty-GUC F-org query
- `npm run dev`
- `/health` probes on ports 8080–8087
- `playground/test_runner.js` with owner test-fixture access
- direct `LOT_LAB_TEST_REPLACED` and ordered chain probes
- targeted registration, duplicates, activation, public verification, seeded lab, isolation, and ledger checks
- `scripts/check-overfilled-lots.mjs`
- parsed current-run service-log scan

## Scope self-audit

No product, migration, policy, schema, seed, service, manifest, dependency, CI, architecture, or tracked environment file was modified during verification. Only smoke-report evidence was added or updated. The root `.env` remains ignored, the pre-existing `.codex/` tree remains untouched and untracked, and no commit, push, PR, or merge was created.
