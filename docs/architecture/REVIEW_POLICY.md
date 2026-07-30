# CapMint — Architect Review Policy

> Permanent review policy for the Principal Architect role. Ratified by
> [AD-001](DECISIONS.md).

---

## Principles

1. **Review only commit deltas.** A review is bounded by an explicit commit range,
   starting from the last **"Next Review Starts From"** boundary in
   [ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md).
2. **Never re-read approved history.** Prior milestones are assumed correct unless a
   review explicitly reopens them (and says why).
3. **Git is the architectural memory.** Conversation memory is temporary and must never
   be the source of truth.
4. **Repository documentation overrides conversation memory** — and the architect layer
   (`docs/architecture/`) overrides other docs where they conflict, until reconciled.
5. **Prefer targeted inspection over repository scans.** No repository-wide scanning
   unless the operator explicitly requests it.
6. **Every milestone ends with an approval gate** — APPROVED / REJECTED / CONDITIONAL.
   Never auto-continue into the next milestone.

---

## Precedence of evidence

```
Git commit history  →  Documentation  →  ADRs  →  ERDs  →  Targeted source inspection
```

Only descend to source inspection when higher-precedence evidence is insufficient. If
older files must be inspected, the review must state **why** they were required, **which**
files were read, and **why** commit-delta review was insufficient.

---

## Default review workflow

**Input:** start commit, end commit, branch, milestone.

1. Read only commits in the range.
2. Reconstruct architectural intent from the delta.
3. Validate: architecture · service boundaries · security · migrations · data integrity
   · performance · maintainability · documentation · operational safety.
4. Identify: architectural drift · technical debt · unnecessary complexity · hidden
   risks · migration risks · security issues.
5. Produce **delta-based findings only**. Do not regenerate prior-milestone explanations.

**Output format:** Executive Summary · Findings · Risks · Recommendations ·
Approval Status · Next Actions.

---

## Milestone rule

Every milestone must close with:
- architectural review,
- implementation review,
- approval or rejection,
- an implementation specification for the next milestone (archived in
  [CODEX_HANDOFF.md](CODEX_HANDOFF.md)).

Then **stop for approval.**

---

## After every review

1. Append a numbered entry to [ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md),
   including the new **"Next Review Starts From"** boundary.
2. Record any new decisions in [DECISIONS.md](DECISIONS.md) (`AD-NNN`).
3. Update [ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md).
4. If a Codex spec was produced, archive it in [CODEX_HANDOFF.md](CODEX_HANDOFF.md).

---

## Long-term objective

As the project grows, conversation size must not grow with it. Each review should require
only: the latest commit range, the architecture documents, the review history, and the
latest implementation summary. The repository must become increasingly self-describing.
