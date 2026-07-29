# CapMint — Architecture Status

> **Authoritative current-state record** for the architect governance layer (see
> [AD-002](DECISIONS.md)). Updated at each milestone approval gate. Where this file and
> the `state/` cards disagree, this file wins until reconciliation.
>
> **Last updated:** 2026-07-29 (Review #17 — P1a/P1b closed; **all smoke-gate defects resolved**. #16 F-org (defect #2). #15 canonical service DB role (defect #1). #14 DM-04 RLS runtime-verified (YELLOW))

---

## Current milestone

- **Milestone:** **DM-04 (PostgreSQL Row-Level Security) COMPLETE**, plus the post-DM-03
  batch — all four items reviewed (#5–#13) and merged into integration branch **A**.
  Tenancy is now enforced at **two layers**: application-layer FK-backed ownership (DM-03) and
  **database-enforced RLS on all 13 application tables** (DM-04). RLS is ENABLE-not-FORCE
  (owner runs migrations/bootstrap/seed unimpeded), fail-closed on empty GUC, with a per-request
  `withTenantTx` tenant-context lifecycle as non-owner role `capmint_app`. Cross-tenant denial
  is proven at the DB layer; the transparency ledger is immutable to the app role.
- **Integration line:** `develop` (== `feat/post-dm03-integration`), **pushed to `origin/develop`**
  for frontend + backend integration testing. Requires `npm ci` (node_modules untracked) and a
  `.env` with the `capmint_app` `DATABASE_URL`.
- **HEAD:** `0fee1579` (Review #17 — P1a/P1b closed; **all four smoke-gate defects resolved**)
- **RLS runtime status:** **VERIFIED (Review #14).** The first genuine `capmint_app` run
  (services as the non-owner role, `rolbypassrls=false`) passed the live frontend→API→RLS
  smoke (Attempt 05, YELLOW). Architect re-verified at the DB layer: fail-closed for a foreign
  tenant (0 budgets/lots/unit_codes), scoped for the real tenant, public-code-only for the
  consumer path. Earlier "RLS clean" reads (Attempts 03–04) were **false positives** — services
  had loaded stale per-service `.env` and run as the RLS-bypassing owner (see tracked defect 1).
- **Integrated into A:** item 1 (`certifiers.organization_id NOT NULL`, migration `0014`) ·
  DM-04 D1–D3c (migrations `0015`–`0019`, `packages/shared/tenant-db.js`) · M1 repo hygiene
  (`node_modules` untracked, docs reconciled) · capacity/over-issuance fix + shared
  `packages/shared/capacity.js` guard.
- **`main`:** unchanged at `767a2f6`. Promotion **`develop → main`** is a separate decision, gated
  on a pre-production hardening pass (transparency-ledger external anchoring + bounded security
  review) after integration testing on `develop`.
- **Tracked defects from the smoke gate (Review #14; triage before `develop→main`):**
  1. ~~CRITICAL (config-integrity) — per-service `.env` shadow root, defaulting services to the
     owner role → RLS off.~~ **RESOLVED (Review #15, `fa6df817`).** All seven services now load the
     repo-root `.env` (CWD-independent) and a startup guard refuses to bind unless the role is
     `capmint_app` (non-super, non-BYPASSRLS, non-RLS-table-owner); per-service `.env`/symlinks
     removed; blacklisted key purged.
  2. ~~F-org (medium) — `organizations_tenant_select` world-readable under public/empty-GUC.~~
     **RESOLVED (Review #16, `4891d54a`).** Migration `0020` moves registration's cross-tenant
     work into a hardened `SECURITY DEFINER` function and drops the blanket clause; the public
     path now sees only the ACTIVATED certifier/lab directory. Ledger chain preserved.
  3. ~~P1a — seed non-RFC UUIDs rejected by strict lab-route validators.~~ **RESOLVED (Review #17,
     `0fee1579`)** — shared `isWellFormedUuid()` helper accepts any well-formed UUID (as PostgreSQL
     does); authorization unchanged.
  4. ~~P1b — `mint-service` has no `/health`.~~ **RESOLVED (Review #17)** — `/health` added; all
     eight processes report health.

  **→ All four smoke-gate defects are now closed.** Remaining pre-production work is the tracked
  follow-ups below plus the observability milestone.
- **Tracked follow-ups (separately gated, not started):** (1) **transparency-ledger hardening**
  — external anchoring (the unused `published_anchor_reference`), append-identity restriction,
  append-serialization scale; (2) **process fix** — do not apply unapproved feature-branch
  migrations to shared `capmint_dev`.
- **Phase context:** Completes the broader **Security-Hardening + Multi-Tenancy Remediation**
  phase that post-dates (and contradicts) the previously recorded "GA / Production Release
  complete" status.

---

## Completed milestones

**Formally architect-reviewed under this governance process:**
- **Review #1 — DM-03 C2** (`fd6ba35..9070970`): APPROVED. See
  [ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md) and
  [AD-003](DECISIONS.md).
- **Review #2 — DM-03 C3a** (`15cf956..a87dfa4`): APPROVED. Additive migration `0012` +
  derived-ownership authorization joins across cpq/mint/verification services.
- **Review #3 — DM-03 C3b** (`ee9bccb..f0b8b9a`): APPROVED. Certifier-scoped lab-assignment
  endpoint, fail-closed lab-result enforcement with actor provenance, investigation
  write-path, integration allowlists, frontend auth compatibility.
- **Review #4 — DM-03 C3c** (`e3c6eec..cff29e6`): APPROVED. Migration `0013` tightens
  `producers.organization_id` / `investigations.unit_code_id` to `NOT NULL` + unique
  provenance index, quarantines orphan `...0003`; successor-aware verifiers. **DM-03
  enforceable scope complete.**

**Pre-governance history (assumed built, not architect-verified):** the CP-000…CP-023
series recorded in `state/MILESTONES.md`, plus the security-hardening series on the
current branch since `767a2f6`. These are treated as *asserted*, not *verified*, until a
bounded review confirms them.

---

## Maturity assessment (baseline; conservative)

| Dimension | Rating | Basis |
|---|---|---|
| **Architecture** | Moderate | ~7 real Fastify services (each a single `index.ts`); several declared services are empty `.gitkeep` placeholders (e.g. analytics/gateway/identity). Monorepo via npm workspaces (D-001). |
| **Security** | Improving, unverified | Recent commits assert closure of major gaps (over-issuance/gateway traversal `6b57685`, signature enforcement `173b53e`/`5b9d019`/`e63bae6`, ledger auth `f456646`, fail-closed env `2cd8eae`, JWT HS256 pin `207cba0`, Redis rate limiting `9892c90`, cross-tenant scoping `175a25d`/`9969579`/`38253c7`, secure bootstrap `682ceb4`). **Architect verification pending.** |
| **Migration** | Improving | Migration engine + state-aware reconciliation (`ab4f1d9`), drift alignment 0007/0009 (`1852b00`), consistency CI (`29b1dff`). DM03 adds tenant column with backfill + FK + tests. |
| **Testing** | Moderate | Compliance suite runs on disposable Postgres (`876ed03`); tenant containment + backfill tests present. Coverage breadth unverified. |
| **Operational** | Low | No container/orchestration by design (D-003 purged Docker/k8s/nginx); **no monitoring/alerting** recorded. |

Ratings are deliberately conservative because no bounded architect review has yet
confirmed the asserted closures.

---

## Outstanding work

1. **Reconcile `state/` cards with reality** (`state/CURRENT.md` wrong branch;
   `state/MILESTONES.md` false "all complete"). Tracked by [AD-002](DECISIONS.md).
2. **Review #1 (DM03):** verify tenant column migration safety, backfill correctness,
   FK/orphan handling, and RLS readiness (`fd6ba35..9070970`).
3. **Verify asserted security closures** from the hardening series (see Security row).
4. **Complete or remove placeholder services** (empty `.gitkeep` service dirs) so
   declared architecture matches shipped code.
5. **Operational maturity:** define monitoring/alerting posture.

---

## Current risks

| Risk | Severity | Status |
|---|---|---|
| Over-issuance guard historically bypassed on primary UI path `/verify/register` | High | **Closed** — smoke Attempt 05 exercised `/verify/register` + mint; lot/budget capacity guards rejected over-issuance (422) under `capmint_app`/RLS. |
| Multi-tenancy isolation incomplete until `organization_id` + RLS land everywhere | High | **Closed** — DM-04 RLS enforced and **runtime-verified** as `capmint_app` (Review #14). |
| Services default to owner role (RLS off) via stale per-service `.env` | High | **Closed (Review #15)** — canonical root-`.env` load + fail-fast owner-role startup guard on all seven services; per-service `.env`/symlinks removed; key purged. |
| `organizations` public/empty-GUC read broader than intended (F-org) | Medium | **Closed (Review #16)** — migration `0020` + definer registration path; public reads limited to the certifier/lab directory. |
| Documentation drift eroding trust in project memory | Medium | Contained by AD-002; reconciliation outstanding. |
| Declared-but-empty services overstate architecture | Medium | Open. |
| No monitoring/observability | Medium | Open. |

---

## Future milestones (indicative)

- **DM-03 C3 (spec issued, not started):** enforce tenancy at the application layer —
  see [CODEX_HANDOFF.md](CODEX_HANDOFF.md) HO-001, decomposed into C3a/C3b/C3c
  ([AD-004](DECISIONS.md)). C3c is hard-gated on operator orphan resolution.
- **DM-04:** Enforce PostgreSQL Row-Level Security using the `organization_id` roots DM-03
  prepares (separate DB role/GUC/lifecycle design; explicitly out of C3 scope).
- **Security verification pass:** bounded review ratifying (or reopening) the hardening
  series closures.
- **State reconciliation:** bring `state/` cards in line with the architect layer.

---

## Source-of-truth map

| Question | Look here |
|---|---|
| What was reviewed / boundaries | [ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md) |
| Architect decisions | [DECISIONS.md](DECISIONS.md) |
| Engineering ADRs | `BRAIN/DECISIONS.md`, `templates/ADR.md` |
| Review rules | [REVIEW_POLICY.md](REVIEW_POLICY.md) |
| Codex specs archive | [CODEX_HANDOFF.md](CODEX_HANDOFF.md) |
| Observability plan (next milestone) | [OBSERVABILITY_PROPOSAL.md](OBSERVABILITY_PROPOSAL.md) |
| Raw progress cards (unverified) | `state/` |
