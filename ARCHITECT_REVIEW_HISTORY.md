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
