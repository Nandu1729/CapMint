# CapMint — Branch State

> **Reconciled:** 2026-07-31 under
> [AD-002](../docs/architecture/DECISIONS.md#ad-002-state-cards-are-input-material-not-authoritative-status).
> [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) is authoritative.
> This card describes the workflow; it does not claim which branch a worktree currently
> has checked out.

## Branch baseline

| Property | Reconciled state |
|---|---|
| Development baseline | `develop` |
| Active work | Short-lived feature branches created from `develop` |
| Release branch | `main`; updated only through the sanctioned promotion path |
| Latest architect-recorded release | `v1.1.0`, promoted through PR #2 under AD-006 |
| Checked-out branch | Run `git branch --show-current`; do not rely on this card |
| CI | Configured; use Architecture Status and the current GitHub checks for the latest result |

The historical claim that `main` was the active development branch with “all
checkpoints complete” has been withdrawn. The CP-000–CP-023 branch mapping predated
architect governance and is only asserted history; it is not completion evidence.

## Branching strategy

```text
main
  └── tagged releases promoted through review
develop
  └── integration baseline
feature/*
  └── bounded implementation work
```

1. Never commit or push directly to `main`.
2. Branch active implementation work from the current `develop` baseline.
3. Merge reviewed feature work into `develop` before any release promotion.
4. Use a reviewed PR and merge commit for `develop` → `main`.
5. Check the live branch and review boundary before starting work.

## Commit convention

```text
<type>(<scope>): <description>
```

Common types are `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, and `ci`.
Repository-specific task instructions and architect decisions take precedence over this
summary.

## Cross-references

| Document | Purpose |
|---|---|
| [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) | Authoritative current state and reviewed boundaries |
| [Architect Decisions](../docs/architecture/DECISIONS.md) | Governance decisions, including AD-002 and AD-006 |
| [Current State](CURRENT.md) | Reconciled non-authoritative summary |
| [Milestones](MILESTONES.md) | Reviewed milestones and qualified historical CP catalog |
