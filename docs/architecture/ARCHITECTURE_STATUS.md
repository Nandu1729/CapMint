# CapMint — Architecture Status

> **Authoritative current-state record** for the architect governance layer (see
> [AD-002](DECISIONS.md)). Updated at each milestone approval gate. Where this file and
> the `state/` cards disagree, this file wins until reconciliation.
>
> **Last updated:** 2026-07-26 (Review #4 — DM-03 C3c approved; enforceable scope COMPLETE)

---

## Current milestone

- **Milestone:** Multi-tenancy data migration — **DM-03: enforceable scope COMPLETE.**
  C2 (Review #1) → C3a (Review #2) → C3b (Review #3) → C3c (Review #4) all APPROVED.
  Tenancy is now *enforced* at the application layer with FK-backed ownership, fail-closed
  lab controls, and tightened `producers.organization_id` / `investigations.unit_code_id`
  (`NOT NULL` + unique provenance).
- **Branch:** `feat/dm03-tenant-column`
- **HEAD:** `cff29e6`
- **Deferred (separately gated):** `certifiers.organization_id NOT NULL` (needs real
  disposition of the quarantined orphan `...0003`); **DM-04** = PostgreSQL RLS.
- **Merge-base with `main`:** `767a2f6`
- **Phase context:** Part of a broader **Security-Hardening + Multi-Tenancy Remediation**
  phase that post-dates (and contradicts) the previously recorded "GA / Production
  Release complete" status.
- **Key caveat:** Tenancy is **prepared, not enforced**. The application layer remains
  the tenancy boundary until C3 lands.

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
| Over-issuance guard historically bypassed on primary UI path `/verify/register` | High | Claimed addressed (`6b57685`); **verify the `/verify/register` path specifically** in Review #1. |
| Multi-tenancy isolation incomplete until `organization_id` + RLS land everywhere | High | In progress (DM03); RLS only *prepared*, not enforced. |
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
| Raw progress cards (unverified) | `state/` |
