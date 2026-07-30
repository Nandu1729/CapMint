# DM-04 RLS Smoke Report — Attempt 04

**Verdict: RED — root `.env` certifier keypair is aligned with the seeded DB, but CPQ activation still emits an unverifiable signature, blocking the required fresh-lot/lab path. No A–D RLS anomaly was observed.**

## Environment

Branch/commit: `fix/smoke-provisioning-blockers` / `8a9f3fab` (no new commit). PostgreSQL local `capmint_dev`; provisioning as `capmint_admin`; runtime services use non-owner `capmint_app` (LOGIN, non-superuser, `BYPASSRLS=false`). Root `.env` used one freshly generated Ed25519 pair for all four certifier variables; no environment pre-source was used.

## Provisioning log

`npm run db:reset -- --yes` succeeded: immutable baseline recorded, 0010–0019 `EXECUTED`, `capmint_app` LOGIN provisioned, and `DEVELOPMENT_FIXTURES_SEEDED` returned. Root-key fingerprint evidence: derived `CERTIFIER_PRIVATE_KEY`, `CAPMINT_DEVELOPMENT_CERTIFIER_PUBLIC_KEY`, and `certifiers.public_key` each had SHA-256 SPKI fingerprint `bfda42a29b23f726679c5fedcb3f34ec244d94f7275deadae405dbeba2512105`.

## Startup / health

Frontend and auth, CPQ, resolver, transparency, verification, and integration `/health` endpoints returned 200. Mint `:8083/health` returned 404 (tracked P1b; no change made).

## Flow results

| Flow | Observed | Verdict / class |
|---|---|---|
| 1 Health | 7/8 200; mint 404 | ANOMALY / E (P1b) |
| 2 Login / pre-auth | producer, certifier, lab, isolation-lab, admin, exporter all 200 with JWT | PASS |
| 3 Registration | prior attempt remains PASS; not repeated after stop | PASS (prior evidence) |
| 4 Budget → lot → mint/capacity | activation 200, but fresh producer lot returns 400 `INVALID_SIGNATURE`; DB check of returned 128-hex signature against aligned DB public key is `false` | FAIL / E |
| 5 Public scan/verify | blocked: no unit code can be minted | NOT EXERCISED / E prerequisite |
| 6 Fresh-lot lab flow | blocked at fresh lot creation; no lab request sent | NOT EXERCISED / E prerequisite |
| 7 Investigation | blocked: no scan/counterfeit trigger | NOT EXERCISED / E prerequisite |
| 8 Cross-tenant negatives | prior attempt: exporter drawdown 403; lab list 1 vs isolation-lab list 0 | PASS (prior evidence) |
| 9 Ledger | prior attempt: public verify and entries 200 | PASS (prior evidence) |

## RLS error scan

No `42501`, `permission denied`, `row-level security`, empty-where-data-expected, cross-tenant leak, or fail-open empty-GUC result was observed in Attempt 04. Reached non-owner paths (login, budget activation, fresh-lot creation) returned expected authorization/RLS behavior; the blocker is cryptographic signature verification, class E.

## Cross-tenant negatives

No new cross-tenant result was produced after the stop condition. Preserved evidence: exporter certifier-only drawdown returned 403 without disclosure; assigned lab list had one row and isolation-lab list zero.

## Prioritized defects

1. **P0 — CPQ re-sign output remains incompatible with aligned root `.env`/seed keypair (E).** Although all root/seed key fingerprints match, activation 200 stores a signature that `crypto.verify` returns false against the matching database public key. Fresh lot creation returns `INVALID_SIGNATURE`. This blocks flows 4–7.
2. **P1a — seed non-RFC ID `…0050` fails strict lab-route UUID validation (E).** Tracked only; fresh v4 lot was requested to avoid it but P0 blocked creation.
3. **P1b — mint has no `/health` (E).** Tracked only.

## Not exercised

Full fresh-lot lab success/isolation-403, capacity overfill, public scan/verify, investigation lifecycle, and remaining cross-tenant mutation tests were not rerun after P0 blocked the prerequisite fresh lot. No product code, seed, migration, RLS policy, GUC context, role, validator, or service-local configuration was changed.
