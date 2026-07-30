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

## A. Security verification pass — **the primary gate**

Bounded architect review ratifying (or reopening) each asserted hardening closure since `767a2f6`.
Until verified, each is *claimed*, not *confirmed*.

- [ ] **[H] A1 — Over-issuance / capacity guard.** Partially verified (smoke Attempt 05 exercised
  `/verify/register` + mint → 422 under RLS). Confirm no remaining bypass on any issuance path.
- [ ] **[H] A2 — Gateway path traversal** (`6b57685`). Verify the fix; confirm no residual traversal.
- [ ] **[H] A3 — Signature enforcement** (`173b53e`/`5b9d019`/`e63bae6`). Verify no unsigned/forged
  acceptance path; `INVALID_SIGNATURE` fails closed. (Now also counted by O3 metrics.)
- [ ] **[H] A4 — Ledger auth + append identity** (`f456646`). Appends require auth; `WITH CHECK`
  restricts public-context event types. Confirm no forgeable append.
- [ ] **[H] A5 — Fail-closed env** (`2cd8eae`). Services refuse to start on missing secrets.
- [ ] **[H] A6 — JWT HS256 pin** (`207cba0`). Verify algorithm is pinned (no `alg` confusion / `none`).
- [ ] **[H] A7 — Redis rate limiting** (`9892c90`). Confirm limits actually enforced on auth/verify.
- [x] **[H] A8 — Cross-tenant scoping** (`175a25d`/`9969579`/`38253c7`). **Verified** at the DB layer
  by the DM-04 RLS smoke gate (Reviews #14–#18).
- [ ] **[H] A9 — Secure bootstrap** (`682ceb4`). Admin bootstrap + dev seed create no weak default.
- [ ] **[H] A10 — No hardcoded signing key in a prod path.** Confirm the historical hardcoded
  Ed25519 dev key is dev-only / env-injected; production keys come from env or a secret store.
- [ ] **[H] A11 — Secret-scan of git history.** No committed `.env`, private keys, or credentials in
  the range promoted to `main`.

---

## B. Data, RLS & tenancy

- [x] **[H] B1 — DM-04 RLS runtime-verified GREEN** (Review #18): fail-closed on empty GUC,
  cross-tenant denial proven as `capmint_app`.
- [ ] **[H] B2 — Services run as non-owner `capmint_app`** on the target env (startup guard refuses
  super/BYPASSRLS/owner). Verify against the production role, not just dev.
- [ ] **[S] B3 — RLS ENABLE-not-FORCE** documented as intentional (owner runs migrations unimpeded);
  confirm no production actor uses the owner role for request-path queries.
- [ ] **[H] B4 — Process control:** no unapproved feature-branch migration is ever applied to a
  shared DB. Encode the "disposable-DB validation only" rule in CONTRIBUTING/CI.

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

- [ ] **[H] D1 — Clean fresh-DB provision.** Baseline bootstrap + all 20 migrations apply cleanly on
  an empty database (`db:reset` / `--bootstrap`) → GREEN, no manual steps.
- [ ] **[H] D2 — No schema/migration drift.** Signature-pinned RLS verifiers + reconciliation pass;
  live schema matches the migration set.
- [ ] **[S] D3 — Reversibility.** Rollback/down path (or documented forward-fix) noted for the
  migrations introduced since `main`.

---

## E. Test & CI gates

- [ ] **[H] E1 — Compliance suite 88/88 in a clean cluster** (the CI environment, where no
  operator-managed `capmint_app` LOGIN role pre-exists). Note: Review #22 restored this to 88/88.
- [ ] **[H] E2 — Build 7/7 + workspace tests pass** on the promotion commit.
- [ ] **[H] E3 — CI green on the promotion PR.** `.github/workflows/ci.yml` (incl. the over-issuance
  canary `check-overfilled-lots.mjs`) passes on the exact SHA being promoted.

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
