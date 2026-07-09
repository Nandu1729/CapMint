# CapMint — Active Branch

> **Last Updated:** 2026-07-08  
> **Current Branch:** `develop`  
> **Strategy:** Trunk-Based Development with Short-Lived Feature Branches

---

## Current Branch State

| Property        | Value                              |
|-----------------|------------------------------------|
| Active Branch   | `develop`                          |
| Checkpoint      | CP-000 ✅ → CP-001 ⏳               |
| Last Commit     | Foundation docs (2026-07-08)       |
| Protected       | Yes — no direct pushes to `main`   |
| CI Status       | N/A (CI not yet configured)        |

---

## Branching Strategy

The project follows a strict development workflow:

```
      main
       │ (stable, protected releases)
       ▼
    develop
       │ (integration and testing)
       ▼
feature branches
         (individual task/checkpoint development)
```

1. **`main`**: Production-ready code only. Tagged releases.
2. **`develop`**: Integration branch. All features merge here first. This is the base branch for active development.
3. **`feature/*`**: Individual short-lived feature branches, branched off of `develop`.

---

## Checkpoint-to-Branch Mapping

| Checkpoint | Working Branch | Merge Target | Status |
|------------|----------------|--------------|--------|
| CP-000 | `develop` | `main` | ✅ COMPLETE |
| CP-001 | `feature/architecture-lock` | `develop` | ⏳ PENDING |
| CP-002 | `feature/database-design` | `develop` | ⬜ NOT STARTED |
| CP-003 | `feature/api-contracts` | `develop` | ⬜ NOT STARTED |
| CP-004 | `feature/infrastructure` | `develop` | ⬜ NOT STARTED |
| CP-005 | `feature/development-ready` | `develop` | ⬜ NOT STARTED |
| CP-006 | `feature/auth` | `develop` | ⬜ NOT STARTED |
| CP-007 | `feature/authz` | `develop` | ⬜ NOT STARTED |
| CP-008 | `feature/cpq` | `develop` | ⬜ NOT STARTED |
| CP-009 | `feature/gs1-engine` | `develop` | ⬜ NOT STARTED |
| CP-010 | `feature/mint-engine` | `develop` | ⬜ NOT STARTED |
| CP-011 | `feature/qr-engine` | `develop` | ⬜ NOT STARTED |
| CP-012 | `feature/resolver` | `develop` | ⬜ NOT STARTED |
| CP-013 | `feature/transparency-log` | `develop` | ⬜ NOT STARTED |
| CP-014 | `feature/verification` | `develop` | ⬜ NOT STARTED |
| CP-015 | `feature/clone-detection` | `develop` | ⬜ NOT STARTED |
| CP-016 | `feature/revocation` | `develop` | ⬜ NOT STARTED |
| CP-017 | `feature/dashboards` | `develop` | ⬜ NOT STARTED |
| CP-018 | `feature/pwa` | `develop` | ⬜ NOT STARTED |
| CP-019 | `feature/tracenet` | `develop` | ⬜ NOT STARTED |
| CP-020 | `feature/agristack` | `develop` | ⬜ NOT STARTED |
| CP-021 | `feature/testing` | `develop` | ⬜ NOT STARTED |
| CP-022 | `release/pilot` | `main` | ⬜ NOT STARTED |
| CP-023 | `release/production` | `main` | ⬜ NOT STARTED |

---

## Merge Rules

### Feature → Develop
1. All acceptance criteria for the checkpoint must be met.
2. All lint checks and tests pass (when CI is configured).
3. No merge conflicts.
4. State tracking documents updated.
5. Conventional commit messages used throughout.
6. Squash merge preferred for clean history.

### Develop → Main (Release Transitions)
1. Checkpoint sign-off completed by Tech Lead.
2. Integration tests pass.
3. No regressions in existing functionality.
4. `CHANGELOG.md` updated.
5. Version tag created (e.g., `v0.1.0-cp000`).
6. Merge commit (no squash) to preserve history.

---

## Commit Message Convention

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | Usage |
|------|-------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `chore` | Maintenance, tooling, config |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `ci` | CI/CD pipeline changes |

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [AI_RULES.md](../AI_RULES.md) | AI agent behavioral rules |
| [CURRENT_STATE.md](../CURRENT_STATE.md) | Current project state |
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md) | Checkpoint roadmap |

---

## AI Agent Branch Instructions

1. **Always verify** the current branch before making changes: `git branch --show-current`
2. **Never commit directly** to `main` — use feature branches.
3. **Create the branch** if it doesn't exist yet for the active checkpoint.
4. **Sync frequently** with `develop` to avoid large merge conflicts.
5. Follow the commit convention above for all commits.
