# CapMint — Architect Decision Log

> **Scope:** Governance- and milestone-level architectural decisions approved by the
> Principal Architect during review. This log uses the **`AD-NNN`** namespace.
>
> **Relationship to other logs (do not duplicate):**
> - `BRAIN/DECISIONS.md` — engineering-level ADRs (`D-NNN`, e.g. D-001…D-006). The
>   day-to-day decisions made during implementation.
> - `templates/ADR.md` — the long-form ADR template (`ADR-NNN`) for full records.
> - This file — architect-level approvals, cross-cutting rulings, and ratification of
>   the above. When an architect decision ratifies or supersedes a `D-NNN`, reference
>   it rather than restating it.

---

## AD-001: Adopt commit-delta architect review process

| Field | Value |
|---|---|
| **Decision ID** | AD-001 |
| **Title** | Commit-delta, repository-as-memory architect review process |
| **Date** | 2026-07-26 |
| **Status** | APPROVED |

**Context.** The project already carries substantial memory (`state/`, `BRAIN/`,
`governance/`), but there was no dedicated architect review boundary, so every review
risked re-reading the whole repository. Conversation memory is volatile and must not be
the source of truth.

**Decision.** Establish a governance layer under `docs/architecture/` plus a root
`ARCHITECT_REVIEW_HISTORY.md`. Reviews operate strictly on commit deltas from the last
recorded boundary. Git history → documentation → ADRs/ERDs → targeted source inspection
is the fixed precedence. Repository documentation overrides conversation memory.

**Alternatives considered.**
- *Re-review full tree each milestone* — rejected: token cost grows without bound.
- *Rely on existing `state/` cards* — rejected: they are stale and self-contradictory
  (see `ARCHITECT_REVIEW_HISTORY.md` Review #0 baseline note).

**Consequences.** Reviews stay bounded and cheap as the project grows. Requires
discipline: every milestone must close with an approval gate and an updated boundary.

**Related Commits.** _governance bootstrap (this change)_
**Related Documents.** [REVIEW_POLICY.md](REVIEW_POLICY.md), [ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md), [ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md)

---

## AD-002: `state/` cards are input material, not authoritative status

| Field | Value |
|---|---|
| **Decision ID** | AD-002 |
| **Title** | Authoritative status lives in the architect layer until `state/` is reconciled |
| **Date** | 2026-07-26 |
| **Status** | APPROVED |

**Context.** `state/CURRENT.md` and `state/MILESTONES.md` claim GA completion
(CP-000…CP-023 all COMPLETE, branch `feature/workflow-gaps`), contradicted by the active
security-hardening + multi-tenancy branch `feat/dm03-tenant-column`.

**Decision.** Until the `state/` cards are reconciled against reality, treat
[ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md) as the authoritative current-state
record. Reconciling the `state/` cards is tracked as outstanding work.

**Alternatives considered.**
- *Rewrite `state/` cards now* — deferred: reconciliation should follow a real review
  (#1), not a baseline assumption, to avoid replacing one unverified claim with another.

**Consequences.** Prevents the governance layer from inheriting overstated "GA Ready"
claims. Creates a temporary two-source situation that must be closed by a reconciliation
task.

**Related Commits.** _n/a (baseline ruling)_
**Related Documents.** [ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md), `state/CURRENT.md`, `state/MILESTONES.md`

---

## AD-003: Approve DM-03 C2 (tenant-profile ownership) as a bounded milestone

| Field | Value |
|---|---|
| **Decision ID** | AD-003 |
| **Title** | DM-03 C2 tenant-column preparation approved; C3 enforcement remains gated |
| **Date** | 2026-07-26 |
| **Status** | APPROVED |

**Context.** Review #1 validated `fd6ba35..9070970`: migration `0011` adds a nullable,
non-unique `organization_id` FK + indexes to producer/certifier profiles, backfills
equal-ID ownership, leaves orphans `NULL`, and reserves `app.current_org` for future RLS
without enforcing it. Verified against source; unit tests re-run 6/6.

**Decision.** Approve C2 as a **completed bounded milestone**. Tenancy is *prepared*, not
*enforced*. Enforcement (predicate joins, `NOT NULL`, RLS policies, orphan resolution,
laboratory assignment) is explicitly deferred to **C3**, which remains **unapproved**.

**Alternatives considered.**
- *Enforce RLS / `NOT NULL` now* — rejected: services use autocommit `pool.query`; safe
  RLS needs a non-owner app role and a transaction-local GUC layer (per DM03 proposal §16),
  and orphan/NULL profiles would make `NOT NULL` fail. Correct to defer.

**Consequences.** The application remains the tenancy enforcement layer until C3. A known
orphan (legacy sysadmin certifier on a cert-body org) plus unmapped `NULL` profiles must be
operator-resolved before `NOT NULL` tightening.

**Related Commits.** `fd6ba35`, `0f033e8`, `cc072c9`, `3b0e56a`, `9070970`
**Related Documents.** [ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md) (Review #1), `.codex/brain/DM03_PROPOSAL.md`, `.codex/brain/VERIFICATION.md`, `BRAIN/DECISIONS.md` (D-015)

---

## AD-004: Decompose DM-03 C3 into three gated sub-phases

| Field | Value |
|---|---|
| **Decision ID** | AD-004 |
| **Title** | C3 enforcement split into C3a / C3b / C3c with the irreversible step hard-gated |
| **Date** | 2026-07-26 |
| **Status** | APPROVED |

**Context.** C3 completes DM-03 enforcement: remaining additive schema, predicate rewrites
from equal-ID to `organization_id` joins, lab assignment, investigation FK, frontend
compatibility, and `NOT NULL` tightening. Shipping this as one release combines identity
migration, query remediation, and irreversible constraint changes in a single high-risk
step — contrary to the DM03 proposal's small-atomic-boundary principle.

**Decision.** Author C3 as three reviewable sub-phases with approval gates between them
(spec [HO-001](CODEX_HANDOFF.md)): **C3a** additive schema + derived-ownership predicates
(reversible); **C3b** lab assignment + investigation FK + integration allowlists + frontend;
**C3c** constraint tightening (`NOT NULL`), **hard-gated on operator orphan resolution**.
PostgreSQL RLS is explicitly deferred to a later milestone (DM-04).

**Alternatives considered.**
- *Single C3 release* — rejected: unreviewable blast radius; irreversible `NOT NULL` mixed
  with code changes.
- *Fold RLS into C3* — rejected: DM03-D2 requires a separate DB role/GUC/lifecycle design.

**Consequences.** Longer sequence, more gates, but each step is independently
reviewable/rollback-safe and the irreversible step is isolated behind a human action.

**Related Commits.** _spec only (no code yet)_
**Related Documents.** [CODEX_HANDOFF.md](CODEX_HANDOFF.md) (HO-001), `.codex/brain/DM03_PROPOSAL.md` §§19–21, 28–29

---

## AD-005: Empty-database exception for the 0013 certifier-orphan preflight

| Field | Value |
|---|---|
| **Decision ID** | AD-005 |
| **Title** | Migration 0013 certifier-orphan preflight tolerates the empty-bootstrap state |
| **Date** | 2026-07-26 |
| **Status** | APPROVED |

**Context.** The C3c prompt specified a fail-closed preflight requiring *exactly one* orphan
certifier. But the immutable pre-DM03 baseline `database/baselines/capmint-baseline-20260725.json`
has `includes_seed_data: false`, and the known orphan (`00000000-0000-0000-0000-000000000003`)
is seeded only by migration `0006`, which the baseline excludes. A fresh `--bootstrap` therefore
reaches `0013` with **zero** certifiers, so a literal "exactly one orphan" rule would abort and
break the verified fresh-baseline and schema-parity paths. (Verified 2026-07-26: baseline flag,
orphan seed id in `0006`, and `key_status` CHECK allowing `REVOKED`.)

**Decision.** `0013`'s certifier-orphan preflight tolerates exactly two states, else RAISE
`0013_UNEXPECTED_CERTIFIER_ORPHANS`:
- **State A:** zero `NULL`-org certifiers (fresh bootstrap, or fully-resolved legacy); and
- **State B:** exactly one `NULL`-org certifier whose id = `00000000-0000-0000-0000-000000000003`
  with zero budget references (legacy environments).
Quarantine (`key_status → 'REVOKED'`, reversible) is idempotent and a no-op when the orphan is
absent. This does **not** change the deferral of `certifiers.organization_id NOT NULL`.

**Alternatives considered.**
- *Exactly-one-orphan* — rejected: breaks empty bootstrap / schema-parity.
- *Skip the check on empty tables only* — rejected: weaker; the explicit two-state assertion
  keeps fail-closed detection of unexpected orphans.
- *Gate on the baseline `includes_seed_data` flag* — rejected: couples the migration to baseline
  metadata; a self-contained data assertion is simpler and more robust.

**Consequences.** `0013` runs on legacy, fresh-baseline, and snapshot paths; any unexpected
certifier drift still fails closed. `key_status='REVOKED'` used as an administrative tenancy
quarantine must be documented so it is not misread as a cryptographic key-compromise revocation
(separate incident track).

**Related Commits.** _pre-implementation ruling (C3c not yet built)_
**Related Documents.** [CODEX_HANDOFF.md](CODEX_HANDOFF.md) (HO-001), `.codex/brain/DM03_PROPOSAL.md` §20/§25, `database/baselines/capmint-baseline-20260725.json`

---

<!--
## AD-NNN: <Title> (template)

| Field | Value |
|---|---|
| **Decision ID** | AD-NNN |
| **Title** | <title> |
| **Date** | YYYY-MM-DD |
| **Status** | PROPOSED / APPROVED / SUPERSEDED (by AD-NNN) / DEPRECATED |

**Context.** ...
**Decision.** ...
**Alternatives Considered.** ...
**Consequences.** ...
**Related Commits.** ...
**Related Documents.** ...
-->
