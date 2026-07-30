# CapMint — `develop → main` Promotion Readiness Checklist

> **Purpose:** the gate list that must be satisfied before promoting the integration line
> `develop` to `main`. `main` is the production/release line; promotion is a deliberate,
> architect-gated event — not a routine merge. This document is the working checklist; each
> item is verified and checked off, and the final operator sign-off is recorded in
> [DECISIONS.md](DECISIONS.md).
>
> **Owned by:** Architect (governance). Implementation items hand off to Codex via
> [CODEX_HANDOFF.md](CODEX_HANDOFF.md). Risk-acceptance decisions belong to the Operator.

---

## Gating philosophy

- **[H] Hard gate** — must be GREEN before promotion. No exceptions without reopening this doc.
- **[S] Soft gate** — may ship with a **documented, operator-accepted risk** recorded as an AD in
  [DECISIONS.md](DECISIONS.md). "Soft" means *consciously deferred*, never *forgotten*.
- **[x]** = verified done this cycle · **[ ]** = open · each line names its **verifier**.

---

## Snapshot (as of this writing)

| | |
|---|---|
| `develop` HEAD | `882ba7ae` |
| `main` HEAD | `767a2f6d` |
| Distance | **`develop` is 215 commits ahead of `main`** (20 migrations, 7 real services) |
| Already GREEN | DM-04 RLS smoke gate (Review #18); observability O1–O4 (Reviews #19–#23); compliance 88/88 |
| Services | **7 real** (auth, cpq, mint, resolver, transparency, verification, integration) · **7 declared-but-empty** (analytics, audit, clone-detection, gateway, identity, notification, scan) |
| CI | `.github/workflows/ci.yml` — build, lint, test, migration-runner, migration-reconciliation, bootstrap-seed, compliance-suite, over-issuance canary |

**Headline risk:** `main` sits *before* the entire security-hardening series. Most of that series
is recorded as **asserted, not architect-verified** (see the Security row of
[ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md)). The largest gate below (A) is closing that gap.

---

## A. Security verification pass — **CLOSED (Review #24)**

Bounded architect review ratifying each asserted hardening closure since `767a2f6`, read against the
live implementation. **11/11 verified; 2 low-severity follow-ups; 0 blockers.**

- [x] **[H] A1 — Over-issuance / capacity guard.** `capacity.js` guards fail closed (404/400/422);
  confirmed live under RLS (Review #18).
- [x] **[H] A2 — Gateway path traversal.** `frontend-server.js` `path.resolve` + allow-list → 403;
  `/api/../.env` blocked. (Real static server; `gateway-service` dir is an empty placeholder.)
- [x] **[H] A3 — Signature enforcement.** `verifyBudgetAuthority` fail-closed on every path (empty
  bundle / missing key / verify exception → `false`); message binds `budget_id`+qty. No bypass.
- [x] **[H] A4 — Ledger auth + append identity.** Append routes `authenticate`-gated; `SERVICE_TOKEN`;
  `WITH CHECK` restricts public-context events. Forgery requires `JWT_SECRET`.
- [x] **[H] A5 — Fail-closed env.** All seven `process.exit(1)` on missing JWT/DB/Redis.
- [x] **[H] A6 — JWT HS256 pin.** All seven `verify: { algorithms: ['HS256'] }`; no unpinned verify.
- [x] **[H] A7 — Redis rate limiting.** Correct sliding-window on login+verify; fails closed on Redis
  outage. **↳ Follow-up F-A7 (config):** prod must set trust-proxy + `X-Forwarded-For` for per-client
  buckets (else global bucket behind a proxy). Non-blocking; belongs with H/deployment.
- [x] **[H] A8 — Cross-tenant scoping.** DB-enforced RLS, verified as `capmint_app` (Reviews #14–#18).
- [x] **[H] A9 — Secure bootstrap.** Dev seed fail-closed (explicit password, keypair validated,
  advisory-locked); passwords hashed with **bcrypt**. No weak default.
- [x] **[H] A10 — No hardcoded signing key in a prod path.** Only a `.env.example` placeholder; keys
  are env/DB-sourced.
- [x] **[H] A11 — Secret-scan of history.** `.env*` gitignored; no `.env`/node_modules/real key in the
  tree. **↳ Note F-A11 (hygiene):** a test-only Ed25519 key existed in range history (removed, no prod
  role); generate test keys at runtime.

> **Gate A follow-ups (non-blocking):** **F-A7** trust-proxy/XFF for production rate limiting ·
> **F-A11** runtime-generated test keys. Both carried to the deployment/hardening notes, not blockers.

---

## B. Data, RLS & tenancy

- [x] **[H] B1 — DM-04 RLS runtime-verified GREEN** (Review #18): fail-closed on empty GUC,
  cross-tenant denial proven as `capmint_app`.
- [x] **[H] B2 — Services run as non-owner `capmint_app`.** `assertRlsServiceRole` wired in all seven
  service startups (refuses super/BYPASSRLS/owner). Code-guaranteed; production must supply the
  `capmint_app` `DATABASE_URL`, which the guard verifies at boot.
- [ ] **[S] B3 — RLS ENABLE-not-FORCE** documented as intentional (owner runs migrations unimpeded);
  confirm no production actor uses the owner role for request-path queries.
- [x] **[H] B4 — Process control.** `CONTRIBUTING.md` documents the non-negotiable rule: migrations
  validated on disposable DBs; never apply an unmerged/unapproved migration to shared `capmint_dev`.
  Role split (`capmint_app` vs `capmint_admin`) documented.

---

## C. Transparency ledger hardening

- [x] **C1 — Chain integrity verified** (Review #18): full recompute, 0 broken links / 0 mismatches.
- [ ] **[S] C2 — External anchoring.** The unused `published_anchor_reference` is not wired to any
  external notary/anchor. Decide: post-GA acceptable (with recorded risk) or block.
- [ ] **[S] C3 — Append-identity restriction.** Tighten which actor/service may append which event
  types beyond the current `WITH CHECK`. Operator risk decision.
- [ ] **[S] C4 — Append serialization at scale.** `LOCK TABLE … SHARE ROW EXCLUSIVE` serializes all
  appends (correct, but a throughput ceiling). Document expected volume; revisit if it binds.

---

## D. Migration & schema integrity

- [x] **[H] D1 — Clean fresh-DB provision** (structural). Migrations `0001–0020` contiguous (no
  gaps/dups); baseline bootstrap + migrations engine present. CI "Verify PostgreSQL Bootstrap and
  Reconciliation" step passes (green in the failing run) — the authoritative fresh-DB run.
- [x] **[H] D2 — No schema/migration drift.** Migration-reconciliation CI step passes; signature-pinned
  RLS verifiers in the engine. (Contiguous set verified.)
- [ ] **[S] D3 — Reversibility.** Rollback/down path (or documented forward-fix) noted for the
  migrations introduced since `main`.

---

## E. Test & CI gates — **RED (blocked, root-caused)**

> **CI is currently failing on `develop`.** Root-caused during Gate E verification (2026-07-30) via
> `gh run view`. Failing job step: *"Verify Secure Administrator Bootstrap and Development Seed"*
> (`bootstrap-seed.test.ts`, 3 tests) — the compliance-suite step never runs (skipped after this). **Two
> independent root causes:**
>
> 1. **HO-010 PEM-literal regression** — the metrics probe hardcoded `-----BEGIN PRIVATE KEY-----…` in
>    `compliance-suite.test.ts`, tripping the bootstrap-seed credential-scan guard. **FIXED** (ephemeral
>    runtime key; merge `ac9166c2`), also closing F-A11.
> 2. **tsx/Node-24 incompatibility** — CI's `setup-node@v3` + `node-version: 18` is deprecated and the
>    runner forces Node 24, whose removal of `--loader` breaks `tsx ^3.12.0` → spawned services crash
>    ("Service exited before becoming healthy"). **Handed to Codex as HO-012** (tsx→^4 monorepo-wide +
>    `setup-node@v4` / Node 22); must be validated by a green CI run.

- [~] **[H] E1 — Compliance suite 88/88 in a clean cluster.** Green once HO-012 lands (the suite is
  currently skipped because bootstrap-seed fails first). Review #22 restored the LAB-04 check.
- [ ] **[H] E2 — Build 7/7 + workspace tests pass on the promotion commit.** Build/lint/unit green in
  CI today; the service-spawn integration tests are blocked by the tsx issue (HO-012).
- [ ] **[H] E3 — CI green on the promotion PR.** **Blocked on HO-012.** The exact promotion SHA must
  show a fully green `.github/workflows/ci.yml` (incl. the over-issuance canary).

---

## F. Observability operationalization

- [x] **F1 — O1–O4 shipped** (Reviews #19–#23): structured logging + redaction + correlation,
  readiness `/ready`, uniform leak-free errors, `/metrics`.
- [ ] **[S] F2 — Scrape + alerting.** `/metrics` is exposed but no Prometheus scrape target or alert
  rules exist. Define the minimal alert set (error rate, RLS-denial spike, ledger-append failures).
- [ ] **[S] F3 — Log destination.** Decide where the JSON logs are shipped/retained in production.
- [ ] **[S] F4 — `/ready` consumer.** Given D-003 (no orchestrator), define what actually calls
  `/ready` for rotation/restart decisions.

---

## G. Repo hygiene & documentation honesty

- [ ] **[H] G1 — No false status claims.** Purge any residual "GA / Production Release complete"
  language that predates and contradicts this hardening phase.
- [ ] **[S] G2 — Declared-but-empty services.** The 7 placeholder backend dirs (analytics, audit,
  clone-detection, gateway, identity, notification, scan) overstate the architecture. Either remove
  them or mark them explicitly as intentional future stubs in the docs.
- [x] **G3 — `node_modules` untracked** (M1 hygiene).
- [ ] **[S] G4 — Reconcile `state/` cards** with the architect layer (AD-002): wrong branch in
  `state/CURRENT.md`, false "all complete" in `state/MILESTONES.md`.

---

## H. Cutover & rollback

- [ ] **[H] H1 — Promotion mechanic decided.** How `main` advances (recommended: `--no-ff` merge of
  the reviewed `develop` SHA, annotated release tag `vX.Y.0`), and who executes it (never a direct
  push to `main`; via PR).
- [ ] **[H] H2 — Rollback plan.** How to revert (revert the merge commit) and the DB implication
  (which migrations are safe to leave vs. must be downed) if promotion is aborted.
- [ ] **[S] H3 — Release notes + version tag** summarizing DM-03/DM-04/observability for `main`.
- [ ] **[H] H4 — Operator sign-off** recorded as an AD in [DECISIONS.md](DECISIONS.md), listing which
  soft gates were consciously accepted as risk.

---

## Recommended sequencing

1. **Gate A (security verification pass)** — the biggest unknown; run as a bounded review series
   (one review per cluster of A-items), since `main` predates the whole hardening line.
2. **Gates D + E** (migration + CI) — mechanical, mostly already covered by CI; confirm on the SHA.
3. **Decide soft gates C + F + G2/G4** — each becomes either a closed item or a recorded AD risk.
4. **Gate G1** — documentation-honesty sweep.
5. **Gate H** — cutover, tag, operator sign-off.

Promotion proceeds only when **every [H] is checked** and **every open [S] has an accepted-risk AD**.

---

## Sign-off

| Role | Name | Gate confirmation | Date |
|---|---|---|---|
| Architect | | all [H] verified; [S] risks enumerated | |
| Operator | | soft-gate risks accepted (AD-___) | |
