# CapMint — Active Branch

> **Last Updated:** 2026-07-08  
> **Current Branch:** `main`  
> **Strategy:** Trunk-Based Development with Short-Lived Feature Branches

---

## Current Branch State

| Property        | Value                              |
|-----------------|------------------------------------|
| Active Branch   | `main`                             |
| Checkpoint      | CP-000 ✅ → CP-001 ⏳               |
| Last Commit     | Foundation docs (2026-07-08)       |
| Protected       | Yes — no direct pushes             |
| CI Status       | N/A (CI not yet configured)        |

---

## Branching Strategy

### Trunk-Based Development

```
main ──────────────────────────────────────────────► (stable, protected)
  │
  └── develop ─────────────────────────────────────► (integration)
       │
       ├── feature/mint ──► (CP-001 work) ──► PR → develop
       │
       ├── feature/arch ──► (CP-002 work) ──► PR → develop
       │
       └── hotfix/xxx ────► (urgent fixes) ──► PR → main + develop
```

### Branch Naming Convention

| Pattern              | Purpose                    | Lifetime    | Base Branch |
|----------------------|----------------------------|-------------|-------------|
| `main`               | Production-ready code      | Permanent   | —           |
| `develop`            | Integration branch         | Permanent   | `main`      |
| `feature/<name>`     | New features / checkpoints | Short-lived | `develop`   |
| `hotfix/<name>`      | Urgent production fixes    | Short-lived | `main`      |
| `release/<version>`  | Release preparation        | Short-lived | `develop`   |

---

## Branch-to-Checkpoint Mapping

| Checkpoint | Branch             | Status        | Merge Target |
|------------|--------------------|---------------|--------------|
| CP-000     | `main`             | ✅ COMPLETE    | —            |
| CP-001     | `feature/mint`     | ⏳ PENDING     | `develop`    |
| CP-002     | `feature/arch`     | ⬜ NOT STARTED | `develop`    |
| CP-003     | `feature/auth`     | ⬜ NOT STARTED | `develop`    |
| CP-004     | `feature/engine`   | ⬜ NOT STARTED | `develop`    |
| CP-005     | `feature/verify`   | ⬜ NOT STARTED | `develop`    |
| CP-006     | `feature/dashboard`| ⬜ NOT STARTED | `develop`    |
| CP-007     | `feature/chain`    | ⬜ NOT STARTED | `develop`    |
| CP-008     | `feature/ml`       | ⬜ NOT STARTED | `develop`    |
| CP-009     | `feature/supply`   | ⬜ NOT STARTED | `develop`    |
| CP-010     | `feature/mobile`   | ⬜ NOT STARTED | `develop`    |

---

## Merge Rules

### Feature → Develop

1. All acceptance criteria for the checkpoint must be met
2. All tests pass (when CI is configured)
3. No merge conflicts
4. State tracking documents updated
5. Conventional commit messages used throughout
6. Squash merge preferred for clean history

### Develop → Main

1. Checkpoint sign-off completed
2. Integration tests pass
3. No regressions in existing functionality
4. CHANGELOG.md updated
5. Version tag created (e.g., `v0.1.0-cp001`)
6. Merge commit (no squash) to preserve history

### Hotfix → Main

1. Critical bug or security fix only
2. Minimal change scope
3. Must also be cherry-picked to `develop`
4. Post-merge: update state docs if checkpoint affected

---

## Commit Message Convention

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type       | Usage                                |
|------------|--------------------------------------|
| `feat`     | New feature or capability            |
| `fix`      | Bug fix                              |
| `docs`     | Documentation changes                |
| `chore`    | Maintenance, tooling, config         |
| `refactor` | Code restructuring (no behavior change) |
| `test`     | Adding or updating tests             |
| `ci`       | CI/CD pipeline changes               |

---

## Cross-References

| Document                              | Purpose                        |
|---------------------------------------|--------------------------------|
| [AI_RULES.md](../AI_RULES.md)        | AI agent behavioral rules      |
| [CURRENT_STATE.md](../CURRENT_STATE.md) | Current project state        |
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md) | Checkpoint roadmap      |

---

## AI Agent Branch Instructions

1. **Always verify** the current branch before making changes: `git branch --show-current`
2. **Never commit directly** to `main` — use feature branches
3. **Create the branch** if it doesn't exist yet for the active checkpoint
4. **Sync frequently** with `develop` to avoid large merge conflicts
5. Follow the commit convention above for all commits
