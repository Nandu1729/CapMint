# CapMint — Architect Review History

> **Purpose:** Maintain the review boundary for every milestone. Each future review
> begins from the last recorded **"Next Review Starts From"** boundary instead of
> re-reading earlier work.
>
> **Policy:** See [docs/architecture/REVIEW_POLICY.md](docs/architecture/REVIEW_POLICY.md).
> Git history is the architectural memory; this file records only what was reviewed,
> when, and with what verdict.

---

## How to read this file

- Reviews are numbered sequentially (`Review #N`).
- Each review is bounded by an explicit **commit range** (`<start>..<end>`).
- A review only validates commits inside its range. History before the range is
  assumed correct unless a review explicitly reopens it.
- Every milestone ends with an **approval gate** (APPROVED / REJECTED / CONDITIONAL).

---

## Review #0 — Governance Baseline (no code reviewed)

| Field | Value |
|---|---|
| **Review Number** | #0 |
| **Milestone** | Architect governance bootstrap |
| **Branch** | `feat/dm03-tenant-column` |
| **Commit Range Reviewed** | _none_ — baseline only (HEAD at `9070970`) |
| **Architecture Status** | N/A (baseline) |
| **Security Status** | N/A (baseline) |
| **Migration Status** | N/A (baseline) |
| **Testing Status** | N/A (baseline) |
| **Approved Decisions** | `AD-001` (adopt commit-delta architect review process) — see [DECISIONS.md](docs/architecture/DECISIONS.md) |
| **Outstanding Items** | 1. In-repo state docs are **stale/contradictory** and must not be trusted verbatim (see note below). 2. Large unreviewed body of security-hardening + multi-tenancy work exists on `feat/dm03-tenant-column` since merge-base `767a2f6`; none formally architect-reviewed. |
| **Next Review Starts From** | `767a2f6` (merge-base of `feat/dm03-tenant-column` and `main`). First formal review (#1) should cover the DM03 tenant-column milestone: `fd6ba35..9070970`, or a range the operator specifies. |

### Baseline note — documentation vs. reality drift (must-fix trust issue)

At baseline, the pre-existing project state docs materially misrepresent reality:

- `state/CURRENT.md` (dated 2026-07-24) records branch **`feature/workflow-gaps`** and
  status **"100% Core Gaps Addressed 🚀"**. The actual working branch is
  **`feat/dm03-tenant-column`**.
- `state/MILESTONES.md` marks **all 24 milestones CP-000…CP-023 including
  "CP-023 Production Release" as COMPLETE.** This is contradicted by the actual
  commit stream, which is an active **security-hardening + multi-tenancy remediation
  phase** (over-issuance/gateway-traversal fixes, ledger auth, JWT HS256 pinning,
  Redis rate limiting, cross-tenant scoping, `organization_id` tenant column, RLS
  preparation) — work that would not exist if GA were truly complete.

**Consequence for reviews:** Treat `docs/architecture/ARCHITECTURE_STATUS.md` (this
governance layer) as the authoritative status. The `state/` cards are input material,
not ground truth, until reconciled.

---

## Review #1 — DM-03 C2: Tenant-Profile Ownership

| Field | Value |
|---|---|
| **Review Number** | #1 |
| **Milestone** | DM-03 C2 — add `organization_id` ownership to producer & certifier profiles (tenancy *preparation*) |
| **Branch** | `feat/dm03-tenant-column` |
| **Commit Range Reviewed** | `fd6ba35..9070970` (5 commits: `fd6ba35`, `0f033e8`, `cc072c9`, `3b0e56a`, `9070970`) |
| **Architecture Status** | PASS |
| **Security Status** | PASS (tenancy *prepared*, not enforced — by design) |
| **Migration Status** | PASS |
| **Testing Status** | PASS (unit 6/6 re-run independently; integration 10/10 + F2 8/8 + F1 83/5/0 accepted from `VERIFICATION.md`, not re-executed — need disposable Postgres) |
| **Approved Decisions** | `AD-003` (approve C2 as bounded milestone) — see [DECISIONS.md](docs/architecture/DECISIONS.md) |
| **Outstanding Items** | 1. RLS not enforced — application remains the tenancy enforcement layer (deferred to C3). 2. Unmapped/orphan profiles remain `NULL`; a legacy sysadmin certifier is attached to a cert-body org — both block any future `NOT NULL` tightening until operator-resolved. 3. FK uses default `NO ACTION` on delete — revisit during RLS/C3 design. |
| **Next Review Starts From** | `9070970` (Review #2 = DM-03 C3, once approved). |

### Findings (delta only)
- **Migration `0011` is production-safe.** Idempotent (`ADD COLUMN/CREATE INDEX IF NOT EXISTS`, catalog-guarded FK); column asserted **nullable, no default, non-unique** with explicit `RAISE EXCEPTION` if tightened; backfill assigns equal-ID ownership only when the org exists, orphans stay `NULL`; correct low-lock FK pattern (`ADD CONSTRAINT ... NOT VALID` then separate `VALIDATE CONSTRAINT`). Named constraints + named indexes.
- **Scope discipline held.** No RLS enabled, no `NOT NULL`, no JWT/authz change. The lone `auth-service/src/index.ts` edit only adds `organization_id` to the activation `INSERT` (set to the org's own id) — ownership population, not an authorization change. No unrelated services touched.
- **Model.** Currently 1:1 (profile shares the org UUID) but structurally 1:N-ready (nullable, non-unique, FK) — consistent with the approved DM03 proposal.

### Approval
`APPROVED` — C2 is complete **as a bounded milestone**. This does **not** approve C3, and DM-03 tenancy overall is **not** finished (enforcement remains). Do not auto-continue into C3.

---

## Review #2 — DM-03 C3a: Additive Schema + Derived-Ownership Authorization

| Field | Value |
|---|---|
| **Review Number** | #2 |
| **Milestone** | DM-03 C3a (first sub-phase of HO-001) |
| **Branch** | `feat/dm03-tenant-column` |
| **Commit Range Reviewed** | `15cf956..a87dfa4` (7 commits: `ed8e59f`, `b1e7722`, `bb8022d`, `bd6a083`, `dd38eca`, `1549d6b`, `a87dfa4`) |
| **Architecture Status** | PASS |
| **Security Status** | PASS |
| **Migration Status** | PASS |
| **Testing Status** | PASS (unit re-run 7/7 independently; integration 8/8 tenant + C1 11/11 + F2 8/8 + F1 83/5/0 accepted from Codex report, not re-executed — need disposable Postgres) |
| **Approved Decisions** | (covered by `AD-003`/`AD-004`; no new AD) |
| **Outstanding Items** | 1. Orphan certifier still 1 `NULL` — blocks C3c only. 2. Pre-existing F2 TS typing errors in `bootstrap-seed.test.ts` (`ChildProcessByStdio` vs `ChildProcessWithoutNullStreams`) — NOT introduced by C3a (file not in range); worth a future chore. 3. Lab submitter/assignment columns remain `NULL` (behavioral wiring is C3b). |
| **Next Review Starts From** | `a87dfa4` (Review #3 = DM-03 C3b, once its lab-assignment API contract is approved). |

### Findings (delta only)
- **Migration `0012` is high quality.** Additive nullable UUID columns (asserted nullable/no-default); composite `budgets(id, producer_id)` uniqueness + composite `lots(budget_id, producer_id)→budgets` FK; investigation/lab FKs all `NOT VALID`→separate `VALIDATE`; plain non-unique indexes with a rigorous btree/unique/valid/ready/unfiltered verifier. **Fail-closed data preflight** rejects lot/budget producer drift, unmatched, ambiguous, and conflicting investigation links *before* backfill. Backfill is exact-`public_identifier`-only (38/38). Idempotent, catalog-guarded. No RLS, no `NOT NULL`.
- **Authorization rewrites are genuine ownership joins.** Verified predicate + lock co-located in one statement, e.g. `WHERE producer.organization_id = $2 ... FOR UPDATE OF budget FOR SHARE OF producer` (no fetch-then-check race; profile org pinned via `FOR SHARE`). `organization_id` join usage across cpq(10)/mint(2)/verification(15). No equal-ID authorization remnants (the lone `organizations WHERE id = orgId` hit is a legitimate caller-identity/NABL-lab check). Cross-tenant identifiers return non-disclosing 404; lab mutation fails closed; system-admin global is explicit.
- **Scope discipline held.** No transparency-service, integration-service, or frontend changes; no capacity/ceiling/`FOR UPDATE`/Ed25519/ledger-ordering changes; no RLS; no `NOT NULL`. Exactly the C3a boundary.
- **Tests are substantive.** `tenant-authorization.test.ts` asserts cross-tenant denial (403 unauth actors, 404 non-disclosing on A-resources/exports), investigation scoping, lab fail-closed, capacity-reservation denial, **and** a positive same-tenant + public-workflow preservation case.
- **Hygiene.** Atomic conventional commits, explicit path staging, no attribution, no push/PR; vitest cache blob unchanged; `.codex/` untracked.

### Approval
`APPROVED` — C3a complete and correct. Boundary advances to `a87dfa4`. This does **not** approve C3b or C3c. C3b requires an approved lab-assignment API contract; C3c requires operator orphan resolution.

---

## Review #3 — DM-03 C3b: Lab Assignment + Investigation Write-Path + Integration Allowlists + Frontend

| Field | Value |
|---|---|
| **Review Number** | #3 |
| **Milestone** | DM-03 C3b (second sub-phase of HO-001) |
| **Branch** | `feat/dm03-tenant-column` |
| **Commit Range Reviewed** | `ee9bccb..f0b8b9a` (10 commits: `b27d82d`, `c8a7454`, `59ff2e6`, `fc673d6`, `060e346`, `2875219`, `61f764d`, `ebb871f`, `c1915e2`, `f0b8b9a`) |
| **Architecture Status** | PASS |
| **Security Status** | PASS |
| **Migration Status** | N/A (no migration — correct; columns exist from 0012) |
| **Testing Status** | PASS (unit re-run 7/7 independently; integration/compliance suites accepted from Codex report, not re-executed — need disposable Postgres) |
| **Approved Decisions** | (lab-assignment API contract from HO-001/C3b prompt ratified; no new AD) |
| **Outstanding Items** | 1. Orphan certifier still 1 `NULL` — blocks C3c only. 2. Pre-existing F2 TS typing errors in `bootstrap-seed.test.ts` still open (unrelated). 3. Re-assigning a lot to a new lab leaves the prior lab's result replaceable — acceptable per model; note for C3c/audit. |
| **Next Review Starts From** | `f0b8b9a` (Review #4 = DM-03 C3c, once operator resolves the orphan certifier). |

### Findings (delta only)
- **Lab-assignment endpoint** `POST /api/v1/lots/:id/assign-laboratory` (verification-service): certifier-scoped via a locked lot→certifier ownership join (`FOR UPDATE OF l FOR SHARE OF c`), 404 non-disclosing when not owned; target validated as `type='NABL_LABORATORY' AND status='ACTIVATED'` (`FOR SHARE`); idempotent; transactional. Matches the approved contract exactly.
- **Lab-result write enforcement** `POST /api/v1/verify/lab-results`: the scoped-lot check (`assigned_laboratory_organization_id = jwt.orgId` + activated NABL, `FOR UPDATE OF l`) runs **before** field inspection and returns `403 LAB_ASSIGNMENT_REQUIRED` with rollback — a denied/FAILED report changes no lot/code/ledger state. `submitted_by_organization_id` persisted on both insert and replacement. Legacy NULL-submitter results remain readable; PDF-hash + signature/capacity logic unchanged.
- **Lab list scope** `GET /verify/lots`: NABL actor sees only lots assigned to its org (test confirms empty for unassigned).
- **Investigation creation** now writes `unit_code_id` (and re-populates on upsert).
- **Integration allowlists** (integration-service): explicit `orgType:role` allowlist, 403 for unlisted actors (labs/exporters); authenticated lookup preserved.
- **Frontend/cpq compatibility**: frontend adds Bearer/authenticated CSV/certify-revoke; budget proposal `producer_id` made non-authoritative (backend resolves server-side; `signature_bundle` still required — no capacity/signature change).
- **Scope discipline**: no migration, no `NOT NULL`/UNIQUE, no RLS, no capacity/ceiling/Ed25519/ledger-ordering changes, transparency-service untouched. Atomic conventional commits, explicit paths, no attribution, no push.
- **Tests substantive**: unassigned-lab empty list, integration allowlist 403, certifier-B-cannot-assign (404), controlling-certifier idempotent assign, legacy-null-submitter readable, unassigned FAILED denied without state/ledger change, assigned lab submit+replace with provenance, investigation `unit_code_id` on automation, capacity denial, same-tenant + public preservation.

### Approval
`APPROVED` — C3b complete and correct. Boundary advances to `f0b8b9a`. This does **not** approve C3c, which remains hard-gated on operator resolution of the orphan certifier.

---

## Review #4 — DM-03 C3c: Constraint Tightening + Orphan Quarantine (DM-03 enforceable scope COMPLETE)

| Field | Value |
|---|---|
| **Review Number** | #4 |
| **Milestone** | DM-03 C3c (final sub-phase of HO-001) |
| **Branch** | `feat/dm03-tenant-column` |
| **Commit Range Reviewed** | `e3c6eec..cff29e6` (5 commits: `dba3ab8`, `fc38c1b`, `bc707e9`, `b663e68`, `cff29e6`) |
| **Architecture Status** | PASS |
| **Security Status** | PASS |
| **Migration Status** | PASS |
| **Testing Status** | PASS (migration unit re-run 8/8 independently; C1 12/12, tenant 14/14, F2 8/8, F1 88/0/0 accepted from Codex report, not re-executed — need disposable Postgres) |
| **Approved Decisions** | Implements `AD-005` (empty-bootstrap orphan exception); no new AD |
| **Outstanding Items** | 1. **`certifiers.organization_id NOT NULL`** deferred — needs real orphan disposition (attach/create/delete). 2. **Scale note:** `SET NOT NULL` + unique-index rebuild take ACCESS EXCLUSIVE locks/full scans; fine at current volume, use `NOT VALID CHECK→VALIDATE→SET NOT NULL` + `CREATE UNIQUE INDEX CONCURRENTLY` for large production (per proposal §21). 3. `state/` cards still overstate status (AD-002) — good moment to reconcile. |
| **Next Review Starts From** | `cff29e6`. No further DM-03 work without a new milestone (certifier-NOT-NULL follow-up, or DM-04 RLS) — both separately gated. |

### Findings (delta only)
- **Migration `0013` is exceptional.** Shape preflight actively asserts the *deferred* columns (`certifiers.organization_id`, `lab_results.submitted_by_organization_id`, `lots.assigned_laboratory_organization_id`) **stay nullable** — it fails on over-tightening. A `0013_PARTIAL_TIGHTENING` guard ties producer-NOT-NULL ≡ investigation-NOT-NULL ≡ index-unique so no half-applied state passes and re-runs are safe. Data preflight implements AD-005 exactly (empty→0 orphans; else exactly `...0003` with 0 budget refs; status ACTIVE↔REVOKED consistency vs. tightening state). Tightening sets `producers.organization_id`/`investigations.unit_code_id NOT NULL` and replaces the plain index with a unique one (drop-if-not-unique → `CREATE UNIQUE INDEX IF NOT EXISTS`). Quarantine (`key_status→'REVOKED'`) is ID-scoped, budget-ref-guarded, and no-ops on empty bootstrap / re-run.
- **Successor-aware verifiers are sound.** `verify0011`/`verify0012` tolerate the post-`0013` tightened state **only when the `0013` record exists in `migrations_log`** (anchored on `migration_recorded`, not on column state) — preserving fail-closed detection. `verify0013` is a proper three-state (exact/absent/incompatible) verifier.
- **Scope discipline held.** No service/authorization/RLS/capacity/signature/ledger/transparency changes; `certifiers.organization_id` remains nullable. Migration + verifier + tests + docs only.
- **Positive completeness signal.** F1 moved from 83 PASS / 5 PENDING to **88 PASS / 0 PENDING / 0 FAIL** — the previously-pending lab controls are now active and passing.
- **capmint_dev** applied `0013` via the reviewed runner, ending `SAFE / NO PENDING ACTIONS`; recorded EXECUTED. Hygiene: atomic commits, explicit paths, no attribution, no push.

### Approval
`APPROVED` — C3c complete. **DM-03's enforceable scope is now COMPLETE (C2 → C3a → C3b → C3c).** Boundary advances to `cff29e6`. Remaining tenancy work is separately gated: the `certifiers.organization_id NOT NULL` follow-up (needs orphan disposition) and DM-04 (PostgreSQL RLS).

---

## Reviews #5–#13 — Post-DM-03 batch: certifier NOT NULL · DM-04 RLS (D1–D3c) · M1 hygiene · capacity/over-issuance

Four separately-gated items were built on sub-branches off the integration branch **A**
(`feat/post-dm03-integration`, based at `b67410b`) and, after individual review, merged into A.
Each review verified against git (migrations / RLS policies / service code read directly;
disposable-Postgres suites accepted from Codex reports as behavioral confirmation; key DB
states re-queried live).

| # | Milestone | Branch / range | Verdict |
|---|---|---|---|
| #5 | **Item 1 — `certifiers.organization_id NOT NULL`** (migration `0014`; operator-approved DELETE of quarantined orphan `…0003`; successor-aware verifiers) | `feat/tenant-rls-enforcement` `b67410b..9886cbef` | APPROVED |
| #6 | **Item 3 — M1 repo hygiene / factual-docs** (state-card reconciliation; `node_modules`/`dist` untracked; README architecture reconciled to shipped reality — gateway is a placeholder; `.env*` ignore) | `chore/repo-hygiene-m1` `b67410b..64e9094f` | APPROVED |
| #7 | **Item 4 — capacity / over-issuance** (per-lot ceiling now enforced under row lock — the real defect; signature required; budget-status gate aligned mint↔verify; read-only overfilled report; CI integrity canary) | `fix/capacity-overissuance` `b67410b..c414f0c8` | APPROVED |
| #8 | **DM-04 D1 — RLS foundation** (`0015`: non-owner `capmint_app` role + grants; `packages/shared/tenant-db.js` `withTenantTx` per-tx GUC lifecycle; six services routed; **no policies yet**) | `feat/tenant-rls-enforcement` `9886cbef..36a4b19c` | APPROVED |
| #9 | **DM-04 D2 — identity-table RLS** (`0016`: ENABLE-not-FORCE fail-closed policies on `organizations`/`producers`/`certifiers`; DB-layer cross-tenant denial proven) | `36a4b19c..85eea753` | APPROVED |
| #10 | **DM-04 D3a — provenance-chain RLS** (`0017`: `budgets`/`lots`/`unit_codes`; six boolean-only `SECURITY DEFINER` helpers break policy recursion, machine-verified in preflight; public consumer read + scan-write) | `85eea753..e284f174` | APPROVED |
| #11 | **DM-04 D3b — supporting-table RLS** (`0018`: `lab_results`/`investigations`/`scan_events`/`plots_or_hive_clusters`/`producer_brandings`; public inserts tied to registered codes) | `e284f174..dd97c0ab` | APPROVED |
| #12 | **DM-04 D3c — users + ledger RLS** (`0019`: completes all 13 tables; ledger immutable — no UPDATE/DELETE policy) | `dd97c0ab..894eeadb` | **CONDITIONAL → APPROVED** |
| #13 | **Capacity ↔ RLS integration + guard dedup** (compose item 4 capacity guards inside `withTenantTx`; guards extracted to `packages/shared/capacity.js`; `/lots` ledger emission moved post-commit) | integration branch → A `7f7cd320` | APPROVED |

**On #12 (CONDITIONAL → APPROVED):** the initial ledger read policy was a tautology
(`GUC IS NULL OR GUC IS NOT NULL`) written to smuggle the required substring past the
preflight's pattern check. Investigation confirmed the ledger is a **single global hash chain**
whose public verify/entries endpoints must read the full chain — so global readability is
correct *by design*. The revision made it honest `USING (true)` (documented) and made the
preflight **non-gameable** (pinned exemption asserting exactly `USING (true)` + restored
per-command shape checks). The runner's checksum guard was **not** weakened; `capmint_dev` was
reprovisioned instead.

**On #13 (rollback-by-construction):** verified that `reserveBudgetCapacity` writes only after
all checks and `reserveLotIssuance` never writes, so every guard rejection is before-write
(safe `return`) and every post-reservation failure throws (`withTenantTx` rolls back) — no
partial-commit path. Run 2: builds pass, C0 23/23, F1 88/0/0, F2 8/8, C1 21/21, runner 14/14;
canary exit 0 and 13 RLS tables / 0 forced / 0 overfilled verified live.

**Result:** all four merged into A at `7f7cd320`. **DM-04 (PostgreSQL RLS) is COMPLETE** — all
13 application tables enforce fail-closed, ENABLE-not-FORCE tenant RLS with owner
(migration/bootstrap/seed) bypass; database-enforced tenant isolation is real and verified.
Certifier tightening, M1 hygiene, and the capacity/over-issuance defect are all closed.

**New tracked items (separately gated, not started):**
1. **Transparency-ledger hardening** — the ledger is an internal global hash chain; RLS now
   enforces app-role immutability, but true tamper-evidence needs **external anchoring** (the
   unused `published_anchor_reference` column), plus append-identity restriction and scale (the
   global tail-lock serializes all appends). Prioritize external anchoring.
2. **Process fix** — stop applying unapproved feature-branch migrations to shared `capmint_dev`;
   validate on disposable DBs until architect-approved, keep `capmint_dev` reprovisionable
   (root cause of the D3c checksum blocker).

**Next Review Starts From** `7f7cd320` (A). No further work on A without a new gated milestone;
merging A into `main` is a separate decision.

---

## Review #14 — DM-04 RLS live smoke gate + provisioning fixes (RLS runtime-verified)

| Field | Value |
|---|---|
| **Review Number** | #14 |
| **Milestone** | The smoke gate: verify the live frontend→API→RLS path with services running as the non-owner `capmint_app`. Compliance suites already passed; runtime enforcement was unverified. |
| **Branch** | `fix/smoke-provisioning-blockers` → merged into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `7f7cd320..3c287868` — four fixes (`b9a80823`, `3ba6ed95`, `8b0bc6f5`, `8a9f3fab`) + integration merge `3c287868` |
| **Architecture Status** | PASS |
| **Security Status** | PASS (tenant isolation runtime-verified) **with tracked findings** (see below) |
| **Migration Status** | N/A (no migration; `db:reset` now uses `--bootstrap`) |
| **Testing Status** | PASS — Attempt 05 YELLOW; architect re-verified RLS live against `capmint_dev` as `capmint_app` |
| **Approved Decisions** | none new |
| **Outstanding Items** | Four tracked defects (below); `develop→main` still gated. |
| **Next Review Starts From** | `3c287868`. |

### What the gate found (five attempts, RED→YELLOW)
- **Provisioning was broken and had never been run end-to-end.** `db:reset` called `run_migrations.js --apply` on a freshly-**emptied** DB; migration `0001` `ALTER`s `lots`, which only the immutable baseline (cutoff `0009`) creates → `relation "lots" does not exist`. Fixed to `--bootstrap` (`b9a80823`). Also: stale lockfile missing the `@capmint/shared` workspace broke `npm ci` (`3ba6ed95`); a global `PORT=8080` in `.env.example` collided across services (`8b0bc6f5`); `db:reset`/seed read `process.env` without dotenv, so the literal-`\n` dev certifier PEM never expanded (`8a9f3fab`).
- **Critical — attempts 03–04 "RLS clean" were FALSE POSITIVES.** Each service starts via `npm run dev --workspace=…`, so its `dotenv.config()` loads `backend/<svc>/.env` — **not** the root `.env`. Those stale local files set `DATABASE_URL=…capmint_admin` (the **owner**, which bypasses ENABLE-not-FORCE RLS) and carried the project's own blacklisted certifier key (`7ee5…`, the seed's `COMPROMISED_PUBLIC_KEY_FINGERPRINT`) → CPQ signed with `7ee5` while the DB public key was `bfda` → `INVALID_SIGNATURE`, and RLS was bypassed entirely. Per-service `.env` are untracked and **never in git history** (no committed-secret incident). Unblocked for the run by symlinking each `backend/<svc>/.env → ../../.env` (config only).
- **Attempt 05 (first genuine `capmint_app` run): YELLOW.** Runtime proof captured 4 `capmint_app` connections (auth/CPQ/verification/mint) in `pg_stat_activity`; none used `capmint_admin`. All nine flows pass except the assigned-lab **success** case (blocked by P1a). RLS scan A/B/C/D = 0, HTTP 500 = 0.

### Architect independent DB verification (as `capmint_app`, live)
`capmint_app`: `rolsuper=false`, `rolbypassrls=false`. Tenant-**data** isolation confirmed at the DB layer: bogus tenant → 0 budgets / 0 lots / 0 unit_codes (fail-closed); producer org → own rows; public/empty-GUC → only public-code-registered rows. **DM-04 tenant-provenance isolation is real in live execution.**

### Findings / tracked defects (delta)
1. **CRITICAL (config-integrity) — per-service `.env` shadow the root `.env` and default services to the owner role.** Services run with RLS **off** unless each `backend/*/.env` is aligned to the non-owner root config; a deploy following the documented root-`.env` model would run RLS-disabled. Local-only (no git incident). Durable fix: canonical single-env strategy + purge the blacklisted key. Currently masked only by symlinks.
2. **F-org (medium, defense-in-depth) — `organizations_tenant_select` is world-readable under the public/empty-GUC path** (`OR NULLIF(app.current_organization_id,'') IS NULL` exposes all 7 orgs, defeating the policy's own narrower ACTIVATED-certifier/lab directory clause). Latent — no public endpoint enumerates orgs (`GET /auth/organizations` is `SYSTEM_ADMINISTRATOR`-only) — but contradicts fail-closed intent. Provenance data unaffected.
3. **P1a (low) — seed fixtures use non-RFC UUIDs** (e.g. lab org `…0004`, lot `…0050`; version/variant nibble `0`) that the strict `[1-5]/[89ab]` validators on `/assign-laboratory` and lab routes reject, while lenient budget-route regexes accept them. Blocks only the assigned-lab-success positive case.
4. **P1b (low, cosmetic) — `mint-service` has no `/health` route** (the other seven do). Not an RLS blocker.

Evidence: `docs/smoke/DM04_RLS_SMOKE_REPORT.md` (Attempt 05) + preserved attempts 01–04.

### Approval
`APPROVED` — **smoke gate PASSED (YELLOW); DM-04 RLS is runtime-verified as `capmint_app`.** The four provisioning fixes are integrated at `3c287868`. The four tracked defects do not reopen DM-04's tenant-data isolation but must be triaged before `develop→main`; the per-service `.env` config-integrity issue (#1) is the top priority. Boundary advances to `3c287868`.

---

## Review #15 — HO-004: Canonical non-owner service DB role + startup guard (closes defect #1)

| Field | Value |
|---|---|
| **Review Number** | #15 |
| **Milestone** | HO-004 — eliminate the per-service `.env` owner-role shadowing (Review #14 tracked defect #1, CRITICAL config-integrity) |
| **Branch** | `fix/canonical-service-env` → merged into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `3c287868..fa6df817` — `81c1444a` (fix) + merge `fa6df817` |
| **Architecture Status** | PASS |
| **Security Status** | PASS (verified live) |
| **Migration Status** | N/A |
| **Testing Status** | PASS — 27 e2e/unit + service tests green; HO-002 rerun RLS A–D=0; architect re-verified the guard query live |
| **Approved Decisions** | none new |
| **Outstanding Items** | Tracked defects F-org, P1a, P1b remain (defect #1 now closed). |
| **Next Review Starts From** | `fa6df817`. |

### Findings (delta only)
- **Deterministic root-env load.** All seven services replaced bare `dotenv.config()` with
  `dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })`, resolving
  to the repo-root `.env` from both `src/` (dev/`tsx`) and `dist/` (prod/`node`) — CWD-independent.
  Per-service `.env` files and the smoke-run symlinks are **gone** (verified absent on disk).
- **Fail-fast owner-role guard.** New `assertRlsServiceRole(pool, serviceName)` in
  `packages/shared/tenant-db.js` runs at each service's `start()` **before** `listen()`; it
  refuses to bind unless `current_user = 'capmint_app'` **and** `rolsuper=false` **and**
  `rolbypassrls=false` **and** the role owns **no** RLS-enabled table. Architect ran the exact
  guard query live: `capmint_app` → SAFE; any owner/super/bypass identity → refused.
- **Uniform application.** `integration-service` (previously no DB dependency) gains a `pg` pool
  solely to assert the role — defense-in-depth uniformity (all services prove non-owner), plus a
  fail-fast on missing `DATABASE_URL`. Acceptable added startup dependency.
- **Key hygiene.** Blacklisted `7ee5…` key material purged from local env; only the intentional
  seed denylist fingerprint remains in `development.js`. `.env.example`/`CONTRIBUTING.md` updated
  to document the canonical model.
- **Hygiene.** Single atomic security commit; no attribution; no `.env`/`.codex`/smoke artifact
  committed (only `.env.example` template).

### Approval
`APPROVED` — **the critical config-integrity defect #1 is CLOSED.** Services can no longer
silently run as the RLS-bypassing owner; the durable fix supersedes the symlink workaround.
Boundary advances to `fa6df817`. F-org, P1a, P1b remain separately gated.

---

## Review #16 — HO-005: Tighten organizations public read (F-org closed)

| Field | Value |
|---|---|
| **Review Number** | #16 |
| **Milestone** | HO-005 — remove the blanket public-read clause on `organizations` (Review #14 tracked defect 2, F-org) without breaking public org self-registration |
| **Branch** | `feat/ho-005-organizations-public-read` → merged into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `fa6df817..4891d54a` — `c8567466` (migration+runner) + `47da6442` (auth) + merge `4891d54a` |
| **Architecture Status** | PASS |
| **Security Status** | PASS (definer hardened; ledger chain preserved; verified against git) |
| **Migration Status** | PASS (`0020`, idempotent, successor-aware verifiers) |
| **Testing Status** | PASS — compliance 88/0/0, tenant-auth 23/23, reconciliation 22/22, bootstrap 8/8, 41 default; validated on a disposable DB (`capmint_dev` untouched) |
| **Approved Decisions** | none new |
| **Outstanding Items** | P1a, P1b remain. |
| **Next Review Starts From** | `4891d54a`. |

### Findings (delta only)
- **Root cause correctly handled.** The blanket `OR NULLIF(app.current_organization_id,'') IS NULL`
  clause was load-bearing for public `register-org` (cross-tenant tax_id/registration_number
  uniqueness reads + `INSERT…RETURNING` read-back). `0020` moves that privileged work into a
  `SECURITY DEFINER` function `capmint_register_organization` (owner `capmint_admin`,
  `SET search_path=public`, `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO capmint_app`, input +
  type validation, uniqueness→`23505`), then drops the blanket clause so the public path sees only
  sysadmin ∪ own-org ∪ ACTIVATED certifier/lab directory.
- **Ledger integrity preserved (top risk, cleared).** The function's inline hash-chain —
  `current_hash = sha256(entity_type‖entity_id‖event_type‖payload_hash‖previous_hash)`, tail read by
  `created_at DESC, id DESC`, `SHARE ROW EXCLUSIVE` table lock — is byte-for-byte consistent with
  `appendAuditLog` and the `/log/verify` recomputation (`transparency:171`). A registration does not
  fork the chain.
- **Defense-in-depth.** Partial `UNIQUE` indexes on `tax_id` / `registration_number`.
- **Runner correctness.** `organizations_tenant_select` signature re-pinned (`15a8d09c…`), legacy
  `bb7d4d8f…` retained; **successor-aware** reconciliation keyed on `0020` in `migrations_log`
  validates both the `0019` (pre-0020) and `0020` states; `verify0020` exact; **checksum guard not
  weakened**.
- **auth rewrite.** `register-org` calls the definer function; 400 validations preserved; `201`
  shape intact; `23505`/`REGISTRATION_EXISTS`→`409`; rate-limit preserved.
- **Minor (non-blocking):** function's `22023` input/type raises aren't mapped in auth (app validates
  first — unreachable); new SELECT policy is `TO capmint_app` while sibling org policies are unscoped
  (more restrictive; cosmetic).
- **Note.** `0020` verified by code + tests on a disposable DB; it applies to `capmint_dev` on the
  next `db:reset` on `develop` (where a smoke re-run confirms live). No live `capmint_dev` mutation
  in this review (correct process discipline).

### Approval
`APPROVED` — **F-org closed.** Public reads of `organizations` are now limited to the intended
certifier/lab directory, registration integrity preserved and hardened, ledger chain intact.
Boundary advances to `4891d54a`. P1a and P1b remain.

---

## Review #17 — HO-006: P1a (UUID validators) + P1b (mint /health) — defect ledger cleared

| Field | Value |
|---|---|
| **Review Number** | #17 |
| **Milestone** | HO-006 — the two remaining low-severity smoke-gate defects (Review #14 P1a, P1b) |
| **Branch** | `fix/ho-006-uuid-health` → merged into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `4891d54a..0fee1579` — `13a214af` (verify) + `60e877dd` (mint) + merge `0fee1579` |
| **Architecture Status** | PASS |
| **Security Status** | PASS (format-guard only; authorization unchanged) |
| **Migration Status** | N/A |
| **Testing Status** | PASS — tests added (`bootstrap-seed` +129, `verification.test` +26, `compliance-suite` +11) |
| **Approved Decisions** | none new |
| **Outstanding Items** | **None from the smoke gate** — ledger cleared. |
| **Next Review Starts From** | `0fee1579`. |

### Findings (delta only)
- **P1a — validators standardized (not re-seed; see HO-006 rationale).** A single exported
  `isWellFormedUuid()` helper (well-formed form matching PostgreSQL's `uuid` type and `cpq:463`)
  replaces all three RFC version/variant-strict regexes in `verification-service`
  (`public_identifier`, `assign-laboratory` lot id + `laboratory_organization_id`, `lab-results`
  `lot_id`). No version/variant-strict pattern remains; null/malformed still 400; **no
  authorization/ownership/RLS logic touched** — the tenancy gate is unchanged. Unblocks the
  seeded lab/lot fixtures.
- **P1b — mint `/health`.** `mint-service` now serves `{status:'healthy', service:'mint-service'}`,
  matching the other six services; all eight processes report health.
- **Hygiene.** Two atomic commits, no attribution, no `.env`/`.codex`; branch linear on `develop`.

### Approval
`APPROVED` — **the entire smoke-gate defect ledger is now closed** (defect #1 per-service env,
#2 F-org, P1a, P1b). DM-04 RLS is runtime-verified and all findings from the live smoke are
resolved. Boundary advances to `0fee1579`. Recommended before `develop→main`: a `db:reset` +
short smoke re-run on `develop` to confirm `0020` + the assigned-lab success path live; then the
**observability** milestone.

---

## Review #18 — HO-007 confirm-live: ledger append RLS/URL fix (smoke gate GREEN)

| Field | Value |
|---|---|
| **Review Number** | #18 |
| **Milestone** | HO-007 confirm-live smoke — turn the DM-04 RLS gate GREEN by fixing the two ledger defects the live re-run exposed |
| **Branch** | `fix/ledger-append-rls-and-url` → merged into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `0fee1579..4c0cc026` — `f98921d0` (verify URL) + `85ed7974` (transparency+auth lock) + merge `4c0cc026` |
| **Architecture Status** | PASS |
| **Security Status** | PASS (ledger tamper-evidence restored; verified live) |
| **Migration Status** | N/A (code-only) |
| **Testing Status** | PASS — Attempt 07 **GREEN**: compliance 88/88, `LAB-04` PASS, chain `unbroken=true`/46 entries/0 broken links |
| **Approved Decisions** | none new |
| **Outstanding Items** | None from the smoke gate — **gate GREEN**. Observability (O1–O4) is the next milestone. |
| **Next Review Starts From** | `4c0cc026`. |

### Findings (delta only)
Attempt 06 (first live confirm-run) was RED for two chained reasons; both fixed here:
- **Ledger URL (`LAB-04`).** `LEDGER_URL` used `TRANSPARENCY_SERVICE_URL` (a base, `.env.example`
  `http://localhost:8085`) verbatim → verification `POST /` → 404 → audit events silently
  dropped. Fixed to derive `LEDGER_URL = base + /api/v1/log`.
- **`FOR UPDATE` on an immutable table under RLS.** `log_entries` has INSERT/SELECT policies
  only (no UPDATE), so `SELECT … FOR UPDATE` returns **0 rows** for the non-owner `capmint_app`
  role → the append fell back to the all-zero `previous_hash` and forked the chain. Fixed by
  taking the same `LOCK TABLE … SHARE ROW EXCLUSIVE` the 0020 registration definer uses, then a
  plain SELECT of the tail — across **all** app append paths (transparency ×2, auth ×1; definer
  already so). No `FOR UPDATE` on `log_entries` remains.
- **Architect implemented the fix directly** (operator-directed; verification-scope, no
  migration, append authorization/`WITH CHECK` unchanged).
- **Independent verification.** Live probe: `FOR UPDATE`→0 rows vs `LOCK TABLE`+plain→real tail as
  `capmint_app`. Post-run I recomputed the full chain against `capmint_dev`
  (`sha256(entity_type‖entity_id‖event_type‖payload_hash‖previous_hash)`, genesis-aware):
  **45 links checked, 0 broken, 0 hash mismatches.** Evidence: `docs/smoke/DM04_RLS_SMOKE_REPORT.md`
  (Attempt 07) + preserved 01–06.

### Approval
`APPROVED` — **the DM-04 RLS smoke gate (opened at Review #14) is COMPLETE and GREEN.** Tenant
isolation, capacity, F-org, registration-via-definer, the assigned-lab pair, and the transparency
ledger are all verified live as `capmint_app`. Boundary advances to `4c0cc026`. Next: observability
(HO-008 O1 unparks), then a `develop → main` promotion discussion.

---

## Review #19 — HO-008: Observability O1 — shared structured logging (redaction + correlation)

| Field | Value |
|---|---|
| **Review Number** | #19 |
| **Milestone** | Observability O1 (first slice) — replace ad-hoc `logger: true` with a shared, hardened logging layer: secret redaction, cross-service `x-request-id` correlation, one structured completion log per request |
| **Branch** | `feat/ho-008-observability-o1` → merged (`--no-ff`) into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `b76e09da..be7d00a9` — `124e4950` (implementation) + merge `be7d00a9` |
| **Architecture Status** | PASS — single shared module `packages/shared/logging.js`, no per-service copies; all seven backends wired identically |
| **Security Status** | PASS — independently proven: 0 secret leaks; logs are JSON with `reqId` |
| **Migration Status** | N/A (code-only, no DB impact) |
| **Testing Status** | PASS — `npm run build` exit 0 (7/7 tsc clean); new `vitest` suites pass in-process (redaction/correlation + runtime-config); Codex report: 44 workspace tests, compliance 88/88 |
| **Approved Decisions** | none new (executes OBSERVABILITY_PROPOSAL O1) |
| **Outstanding Items** | O2 readiness (`/ready`), O3 metrics (`/metrics`, prom-client), O4 uniform error handling — future HO-009/010/011 |
| **Next Review Starts From** | `be7d00a9`. |

### Findings (delta only)
- **Redaction exceeds spec, in the right direction.** Beyond pino's static `redact` paths, a
  `logMethod` hook runs a recursive `sanitizeLogValue` that censors sensitive field names
  **wherever** they appear in a logged object (top level, nested, array elements), guards circular
  refs via a `WeakMap`, and skips non-plain prototypes so `Buffer`/`Error` instances aren't
  mangled. Field set also adds `token`/`jwt`/`refresh_token`. `disableRequestLogging: true` prevents
  Fastify's default header-dumping req/res logs from bypassing the sanitizer.
- **Correlation.** `genReqId` reuses an inbound `x-request-id` else mints `crypto.randomUUID()`;
  Fastify stamps `reqId` on every line. `forwardHeaders(request)` (throws on empty id) is applied
  at **all 7** `fetch(LEDGER_URL)` sites in verification-service — the only outbound caller.
- **Completion log.** One `onResponse` line `{ method, routerPath, statusCode, responseTimeMs,
  orgId? }`; `orgId` reads `user.orgId`, which matches the real JWT claim (signed `orgId` in
  auth-service) — no silent-undefined.
- **Independent verification (not from the report).** Built a real pino logger from the module's
  own options and attempted to leak 8 secrets (password, admin_password, PEM/`certifier_signing_key`,
  `device_private_key`, JWT via `authorization`, `signature_bundle`, `token`, `jwt`) nested and in
  an array → **`LEAKED: NONE`**, all `[REDACTED]`, non-secret field preserved; `forwardHeaders`
  reuses inbound id and throws when absent. Ran the e2e logging test → shared `reqId` across records,
  exactly one completion log, response body/status unchanged. Evidence:
  `docs/operations/HO008_OBSERVABILITY_VERIFICATION.md`.

### Approval
`APPROVED` — the first observability slice is clean: secrets can no longer leak into logs, requests
are correlatable across the verification→transparency hop, and there is one structured completion
line per request, with no change to any response. Boundary advances to `be7d00a9`. Next: O2
(readiness), then O3 (metrics) / O4 (uniform errors); the `develop → main` promotion discussion
remains open.

---

## Review #20 — HO-009: Observability O2 — dependency readiness probes (`/ready`)

| Field | Value |
|---|---|
| **Review Number** | #20 |
| **Milestone** | Observability O2 — add a `/ready` probe that fails fast (503) when Postgres/Redis is unreachable, while keeping `/health` as pure liveness |
| **Branch** | `feat/ho-009-observability-o2` → merged (`--no-ff`) into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `5e71f90c..2100be9d` — `c1eb06f7` (implementation) + merge `2100be9d` |
| **Architecture Status** | PASS — single shared module `packages/shared/readiness.js`, deps-parameterized; all seven backends wired additively |
| **Security Status** | PASS — 503 body carries no secret/connection-string/stack (independently asserted) |
| **Migration Status** | N/A (code-only) |
| **Testing Status** | PASS — `npm run build` exit 0 (7/7 tsc clean); `vitest` 12/12 incl. adversarial 503 + hung-dep timeout; Codex report: 48 workspace tests, compliance 88/88 |
| **Approved Decisions** | none new (executes OBSERVABILITY_PROPOSAL O2) |
| **Outstanding Items** | O4 uniform error handling (HO-011, next in the O4→O3 lane), then O3 metrics (HO-010) |
| **Next Review Starts From** | `2100be9d`. |

### Findings (delta only)
- **Deps-parameterized, wiring matches reality.** `registerReadiness(server, { pgPool?, redisClient? })`
  probes only what is passed. Cross-referenced against actual client construction: `integration-service`
  (no Redis) passes `{ pgPool }` and checks db only; the six Redis-having services pass both. No
  service under- or over-reports readiness.
- **Fail-fast + no leaked timers.** Each check runs under a 1s `Promise.race` timeout with
  `clearTimeout` in `finally`. A hung dependency yields 503 in ~1s (measured 1016ms in-test) and
  `/health` stays 200 — liveness is unaffected.
- **No leakage.** Check failures go to `request.log.warn` (redacted by the O1 layer), never into the
  response. Test asserts the 503 body contains no `known-secret`/`ECONNREFUSED`/`redis://`/`stack`.
- **`/health` untouched** — diff is purely additive (0 deletions); all seven liveness routes unchanged.
- **Independent verification.** Built all services (exit 0), ran the readiness suite (12/12) — the
  1016ms runtime confirms the timeout test genuinely waited ~1s. Evidence:
  `docs/operations/HO009_READINESS_VERIFICATION.md`.

### Approval
`APPROVED` — readiness is clean, fail-fast, leak-free, and correctly scoped per service. Boundary
advances to `2100be9d`. Next: O4 (HO-011, uniform error handling) — merges after rebasing onto this
`develop` — then O3 (HO-010, metrics).

---

## Review #21 — HO-011: Observability O4 — uniform shared error handling

| Field | Value |
|---|---|
| **Review Number** | #21 |
| **Milestone** | Observability O4 — replace ad-hoc/absent per-service error handlers with one shared `setErrorHandler`: safe client mapping, one structured (redacted) error log, no stack/secret leakage |
| **Branch** | `feat/ho-011-observability-o4` (rebased onto `develop@d54b7f4e`) → merged (`--no-ff`) into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `d54b7f4e..7ced845a` — `07d44547` (implementation) + merge `7ced845a` |
| **Architecture Status** | PASS — single shared `packages/shared/errors.js`; all seven backends wired, no ad-hoc handlers remain |
| **Security Status** | PASS — unmapped errors return a generic 500; secret in the thrown message does **not** reach the client (independently proven) |
| **Migration Status** | N/A (code-only) |
| **Testing Status** | PASS — `npm run build` exit 0 (7/7); `vitest` 16/16; Codex report: 56 workspace tests, disposable compliance 88/88 |
| **Approved Decisions** | none new (executes OBSERVABILITY_PROPOSAL O4) |
| **Outstanding Items** | O3 metrics (HO-010) — hangs its error counter off the insertion point O4 left. **Pre-existing LAB-04 harness debt** surfaced here (see below) — tracked as its own fix (Review #22). |
| **Next Review Starts From** | `7ced845a`. |

### Findings (delta only)
- **Contract preserved.** Errors carrying an explicit `statusCode` pass through unchanged (status,
  `code`, raw message, `details:[]`) — byte-compatible with the prior per-service handlers.
- **Hardening.** Errors with no `statusCode` → generic **500** `INTERNAL_SERVER_ERROR` with message
  `"Internal server error"` (raw `error.message`/stack no longer sent). Safe additive Postgres map:
  `23505`/`23503`→409, `42501`→403, `22P02`/`23514`→400.
- **Structured log.** `request.log.error({ err, code, statusCode }, 'request failed')` — one line,
  carries `reqId`, redacted by the O1 layer. O3 counter insertion point left as a comment; **no
  `prom-client` introduced** (grep-verified — O4 stayed in scope).
- **Uniform wiring.** All seven `index.ts` call `createErrorHandler()`; the five ad-hoc handlers were
  replaced and `mint`/`verification` (previously none) now covered.
- **Independent verification.** Direct injection through the handler: explicit → `409/USERNAME_TAKEN`
  message intact; unmapped error whose message held `postgres://user:SUPERSECRETpw@…` → generic 500
  with `SUPERSECRET`/`postgres://` **absent** from the body; simulated `23505` → clean 409 with no DB
  `detail` leaked. Build exit 0, `vitest` 16/16. Evidence:
  `docs/operations/HO011_OBSERVABILITY_O4_VERIFICATION.md`.
- **Codex conduct.** Surfaced a pre-existing compliance-harness anomaly (LAB-04), proved it
  independent of O4, reverted its temporary check, and made **no** out-of-scope fix — correct.

### Approval
`APPROVED` — uniform error handling is in place, leak-free, and contract-preserving with no scope
creep. Boundary advances to `7ced845a`. The observability lane is now O1–O2–O4 done; **O3 (metrics)
remains**. The LAB-04 harness debt is fixed separately in Review #22.

---

## Review #22 — LAB-04 compliance-harness fix (HO-007 URL debt)

| Field | Value |
|---|---|
| **Review Number** | #22 |
| **Milestone** | Test-harness correctness — restore the checked-in compliance suite to 88/88 by fixing the `TRANSPARENCY_SERVICE_URL` double-append surfaced during Review #21 |
| **Branch** | `fix/compliance-harness-transparency-url` → merged (`--no-ff`) into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `98c8492e..4f1b7f5c` — `7f158698` (fix) + merge `4f1b7f5c` |
| **Architecture Status** | PASS — aligns the e2e harness with the documented base-URL contract (`.env.example`); no production code touched |
| **Security Status** | N/A |
| **Migration Status** | N/A |
| **Testing Status** | PASS — root cause proven deterministically (OLD env → 404 path, NEW env → `/api/v1/log`); all three edited suites parse/collect clean. Full F1 run not executed locally (harness safely refuses the shared cluster's operator-managed `capmint_app`); Codex verified 88/88 in a disposable cluster with this config. |
| **Approved Decisions** | none new |
| **Outstanding Items** | O3 metrics (HO-010) — the last observability slice. |
| **Next Review Starts From** | `4f1b7f5c`. |

### Findings (delta only)
- **Architect-owned debt from HO-007 (Review #18).** HO-007 redefined `TRANSPARENCY_SERVICE_URL`
  as a service **base** (verification appends `/api/v1/log`), but three e2e env values still carried
  the full path: `compliance-suite.test.ts:256`, `bootstrap-seed.test.ts:630`,
  `tenant-authorization.test.ts:169`. Only the first fails a *checked* case (LAB-04 → the doubled
  `/api/v1/log/api/v1/log` 404s → the compliance suite sat at **87/88**); the other two are opt-in
  integration suites (`RUN_F2_INTEGRATION`/`RUN_C0_INTEGRATION`). Review #18 read GREEN because the
  *smoke harness* used the correct base URL — these vitest env values were never updated.
- **Fix.** Dropped the `/api/v1/log` suffix from all three so each passes a base URL. The `:9`
  dead-port negative test stays unreachable (intent preserved).
- **Independent verification.** Replicated verification-service's real `LEDGER_URL` construction
  (`index.ts:27-28`): OLD `…:PORT/api/v1/log` → `…/api/v1/log/api/v1/log` (≠ route → 404); NEW
  `…:PORT` → `/api/v1/log` (= route → 201/LAB-04 passes). All three edited files transform/collect
  cleanly. The full disposable F1 suite was **not** run here: the harness refuses to run while the
  shared cluster's `capmint_app` holds LOGIN (an operator-managed credential) — respected, not
  overridden.

### Approval
`APPROVED` — a one-line-per-file test-config correction that clears my HO-007 debt and returns the
checked-in compliance gate to 88/88, with the root cause proven deterministically. Boundary advances
to `4f1b7f5c`. Next: O3 (HO-010, metrics) — the final observability slice.

---

## Review #23 — HO-010: Observability O3 — Prometheus metrics (`/metrics`) — **milestone complete**

| Field | Value |
|---|---|
| **Review Number** | #23 |
| **Milestone** | Observability O3 (final slice) — `prom-client` `/metrics` per service: HTTP latency histogram + domain-security counters (errors/RLS, signature failures, ledger appends). Closes the observability milestone (O1–O4). |
| **Branch** | `feat/ho-010-observability-o3` → merged (`--no-ff`) into `feat/post-dm03-integration` (`develop`) |
| **Commit Range Reviewed** | `c1217a07..ddb6e638` — `3fe07a5b` (implementation) + merge `ddb6e638` |
| **Architecture Status** | PASS — single shared `packages/shared/metrics.js` (dedicated registry); all seven backends wired |
| **Security Status** | PASS — **no secret/PII/high-cardinality labels** (independently proven); free-form `code` label regex-clamped; route labels are templates |
| **Migration Status** | N/A (code-only; adds `prom-client` dep + regenerated lockfile) |
| **Testing Status** | PASS — `npm ci` exit 0 (lockfile in sync), `npm run build` 7/7, `vitest` 10/10; Codex report: 58 workspace tests, compliance 88/88, live `/metrics` 7/7 |
| **Approved Decisions** | none new (executes OBSERVABILITY_PROPOSAL O3) |
| **Outstanding Items** | Observability milestone complete. Next phase: **`develop → main` promotion** (pre-production hardening pass). |
| **Next Review Starts From** | `ddb6e638`. |

### Findings (delta only)
- **Safe-by-construction metrics.** Dedicated `prom-client` Registry (not the global default →
  no cross-process/test pollution), `capmint_` default-metrics prefix, `http_request_duration_seconds`
  labeled only `{ method, route, status_code }`. `route` is the matched **template**
  (`request.routeOptions?.url`), unmatched → `'unmatched'`; `/metrics` excluded from its own histogram.
- **Cardinality/label guard.** `safeErrorCode` clamps the one free-form label to
  `^[A-Z][A-Z0-9_]{0,63}$` else `UNKNOWN` — bounds cardinality and blocks exposition injection.
- **Counter placement.** `recordError(code)` wired at the exact O4 insertion point (the **only** edit
  to `errors.js`). `recordSignatureFailure()` hooked once in the shared `capacityFailure()` (which is
  called with `INVALID_SIGNATURE` at two real guard sites) plus cpq's separate drawdown path;
  `recordLedgerAppend()` at all seven verification→transparency append sites (ok + error).
- **Justified deviations.** `capacity.js` (+1 guarded, side-effect-only line) and cpq's two direct
  calls go slightly beyond the "errors.js-only" constraint, but achieve the spec's intent (count
  signature failures where raised) via the DRY shared guard — accepted, no behavior change.
- **Independent verification.** Scraped `/metrics` after hitting `/thing/:id?token=…` + a
  secret-bearing 500: **0 leaked labels** (ids/token/message absent), route labels are templates,
  300-char and newline-injection error codes both clamped to `UNKNOWN`; error/signature/ledger/default
  series all present. `npm ci`/build/tests clean. Evidence:
  `docs/operations/HO010_OBSERVABILITY_O3_VERIFICATION.md`.

### Approval
`APPROVED` — metrics are exposed safely (no PII/secret/high-cardinality labels), with the domain-security
signal the milestone targeted. **The observability milestone (O1 logging · O2 readiness · O4 uniform
errors · O3 metrics) is COMPLETE.** Boundary advances to `ddb6e638`. Next: the `develop → main`
promotion discussion and its pre-production hardening pass.

---

## Review #24 — Promotion Gate A: security-verification pass (asserted hardening series ratified)

| Field | Value |
|---|---|
| **Review Number** | #24 |
| **Milestone** | `develop → main` promotion — **Gate A**. Bounded architect verification of the security-hardening series that `main` (`767a2f6`) predates, converting "asserted" closures into "confirmed" against the live code. |
| **Branch** | verification-only against `develop` (`252aea8f`); no code change |
| **Commit Range Reviewed** | `767a2f6..252aea8f` (security-relevant surfaces) |
| **Architecture Status** | PASS |
| **Security Status** | **PASS** — 11/11 controls verified; 2 low-severity follow-ups (config/hygiene), 0 blockers |
| **Migration Status** | N/A |
| **Testing Status** | PASS — code-level verification + earlier live proofs (Review #18 RLS/capacity smoke) |
| **Approved Decisions** | none new |
| **Outstanding Items** | F-A7 (prod trust-proxy/XFF for per-client rate limiting), F-A11 (runtime-generate test keys). Both tracked; neither blocks promotion. |
| **Next Review Starts From** | `252aea8f` (Gate A closed; Gates B/D/E/G/H next). |

### Findings — each control read against the live implementation
- **A1 over-issuance** — `packages/shared/capacity.js` `reserveBudgetCapacity`/`reserveLotIssuance`
  fail closed (404/400/422); confirmed live under RLS at Review #18.
- **A2 gateway traversal** — `scripts/frontend-server.js` canonicalizes (`path.resolve`) then enforces
  an allow-list (`=== root || startsWith(root+sep)`, prefix-bypass safe) → 403. `/api/../.env` blocked.
- **A3 signature enforcement** — `verifyBudgetAuthority` returns `false` on empty/non-string bundle,
  missing certifier key, or any `crypto.verify` exception (try/catch); the only `true` is a real
  Ed25519 verify. Signed message binds `budget_id`+`approved_quantity` (quantity anti-replay). No bypass.
- **A4 ledger auth** — both transparency append routes are `preValidation:[authenticate]`; verification
  appends with an HMAC `SERVICE_TOKEN`; public-context appends restricted by the `log_entries`
  `WITH CHECK` (Review #18). Append forgery requires `JWT_SECRET`.
- **A5 fail-closed env** — all seven services `process.exit(1)` on missing `JWT_SECRET`/`DATABASE_URL`
  (and `REDIS_URL` for the six that use Redis). Only fallback is a `NODE_ENV==='test'` secret.
- **A6 JWT HS256 pin** — all seven `register(jwt, { verify: { algorithms: ['HS256'] } })`; no unpinned verify.
- **A7 rate limiting** — correct Redis sliding-window (zset) on auth `login` and verification `verify`;
  Redis outage fails closed (throws → 500). **Follow-up F-A7:** behind a proxy `request.ip` is the
  proxy IP → global bucket; production must set trust-proxy + forward `X-Forwarded-For` for per-client
  limiting (already noted in-code).
- **A8 cross-tenant** — DB-enforced RLS, verified as `capmint_app` at Reviews #14–#18.
- **A9 secure bootstrap** — `database/seed/development.js` fail-closed (requires
  `CAPMINT_DEVELOPMENT_SEED_PASSWORD`, validates the Ed25519 keypair, advisory-locked, identity-guarded);
  passwords hashed with **bcrypt** (`fastify-bcrypt` hash/compare). No weak default.
- **A10 hardcoded key** — repo-wide sweep: only a `.env.example` placeholder; certifier private key from
  env, public keys from DB. No hardcoded production key.
- **A11 secret scan** — `.env*` gitignored (`!.env.example`), no `.env` ever tracked, 0 tracked
  node_modules, no real key material in the current tree. **Note F-A11:** a test-only Ed25519 key
  appeared in the range's history (since removed, no production role); generate test keys at runtime.

### Approval
`APPROVED` — the entire asserted security-hardening series is now **architect-verified against the live
code**: signatures, RLS, ledger auth, JWT pinning, fail-closed env, rate limiting, traversal defense,
bootstrap, and secret hygiene all hold, fail-closed. **Promotion Gate A is CLOSED** with two
low-severity, non-blocking follow-ups (F-A7 prod proxy config, F-A11 test-key hygiene). Boundary for
promotion work advances to `252aea8f`; next are Gates B (prod role), D (migrations), E (CI), G (docs),
H (cutover).

---

<!--
## Review #N — <Milestone> (template — copy for each new review)

| Field | Value |
|---|---|
| **Review Number** | #N |
| **Milestone** | <name> |
| **Branch** | <branch> |
| **Commit Range Reviewed** | `<start>..<end>` |
| **Architecture Status** | PASS / CONCERNS / FAIL |
| **Security Status** | PASS / CONCERNS / FAIL |
| **Migration Status** | PASS / CONCERNS / FAIL / N/A |
| **Testing Status** | PASS / CONCERNS / FAIL |
| **Approved Decisions** | AD-NNN, ... |
| **Outstanding Items** | ... |
| **Next Review Starts From** | `<end-commit>` |

### Findings
- ...

### Approval
`APPROVED` / `REJECTED` / `CONDITIONAL (conditions: ...)`
-->
