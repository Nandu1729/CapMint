# CapMint — Active Branch

> **Last Updated:** 2026-07-08  
> **Current Branch:** `develop`  
> **Strategy:** Trunk-Based Development with Short-Lived Feature Branches

---

## Current Branch State

| Property        | Value                              |
|-----------------|------------------------------------|
| Active Branch   | `main`                             |
| Checkpoint      | All Checkpoints Complete ✅         |
| Last Commit     | GA Release Sign-Off (2026-07-11)   |
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
| CP-001 | `feature/architecture-lock` | `develop` | ✅ COMPLETE |
| CP-002 | `feature/database-design` | `develop` | ✅ COMPLETE |
| CP-003 | `feature/api-contracts` | `develop` | ✅ COMPLETE |
| CP-004 | `feature/auth` *(and modules)*| `develop`| ✅ COMPLETE |
| CP-005 | `feature/frontend` | `develop` | ✅ COMPLETE |
| CP-006 | `feature/infrastructure` | `develop` | ✅ COMPLETE |
| CP-007 | `feature/qa` | `develop` | ✅ COMPLETE |
| CP-008 | `feature/production-readiness` | `develop` | ✅ COMPLETE |


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
