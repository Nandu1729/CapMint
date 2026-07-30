# CapMint — Historical Sprint Log

> **Reconciled:** 2026-07-31 under
> [AD-002](../docs/architecture/DECISIONS.md#ad-002-state-cards-are-input-material-not-authoritative-status).
> All Sprint 0–9 completion labels were self-reported before architect governance and
> have been reclassified as historical assertions. [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md)
> is authoritative.

## Current sprint

No active sprint is maintained in this card. Determine current work from the checked-out
feature branch, its handoff, and the architect review boundary. The last entry below is
history, not an instruction to resume that branch.

## Historical sprint register

| Sprint | Recorded theme | Recorded branch | Reconciled status |
|---|---|---|---|
| 9 | Workflow gap closures | `feature/workflow-gaps` | Self-reported history; not independently verified as a sprint |
| 8 | Production release and hardening | `feature/security-hardening` / `feature/releases` | Self-reported history; did not establish CP-023 or GA |
| 7 | Quality assurance and testing | `feature/qa` | Self-reported history |
| 6 | Infrastructure and integrations | Not recorded | Self-reported history |
| 5 | Frontend implementation | Not recorded | Self-reported history |
| 4 | Backend implementation | Not recorded | Self-reported history |
| 3 | API and contract design | Not recorded | Self-reported history |
| 2 | Domain and database design | Not recorded | Self-reported history |
| 1 | Architecture and project OS | Not recorded | Self-reported history |
| 0 | Foundation | Not recorded | Self-reported history |

## Corrections to legacy claims

- Sprint 8's Docker and Helm packaging claims are not shipped; those artifacts were
  purged under D-003.
- Sprint 8 did not establish a production release. The later `v1.1.0` promotion was a
  separate operator-approved event under AD-006.
- Sprint 9 task checkboxes recorded implementation activity, not architect verification
  or proof that all workflow gaps were closed.
- Historical compliance counts and branch names must not be used as current status.

The original task-level history remains recoverable from Git if needed; it is omitted
here to prevent self-reported checkboxes from being mistaken for current verification.
