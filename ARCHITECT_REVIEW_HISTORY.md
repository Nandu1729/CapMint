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
