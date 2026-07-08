# Changelog

All notable changes to the CapMint project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Checkpoint-based entries are prefixed with `[CP-XXX]` to align with the
[MASTER_PLAN.md](../governance/MASTER_PLAN.md) roadmap.

---

## [Unreleased]

### Planned
- CP-001: Brain Complete — populate all BRAIN/ subdirectories
- CP-002: Core Architecture — system design & API contracts

---

## [CP-000] — 2026-07-08

### Summary
**Foundation Initialized** — Established all project governance, state tracking,
branching strategy, AI development rules, and architectural decision records.

### Added

#### Governance Documents
- `governance/MASTER_PLAN.md` — Full project roadmap with 20+ checkpoints
- `governance/MODULE_STATUS.md` — Module-level status tracking
- `governance/CONVENTIONS.md` — Coding and documentation conventions
- `governance/ARCHITECTURE.md` — High-level architecture overview

#### State Tracking (`BRAIN/state/`)
- `state/ACTIVE_CHECKPOINT.md` — Checkpoint roadmap and transition rules
- `state/PROGRESS.md` — Overall project progress metrics
- `state/ACTIVE_BRANCH.md` — Branch strategy and mapping
- `state/BLOCKERS.md` — Blocker tracking template
- `state/CURRENT.md` — Quick-reference for AI agents
- `state/MILESTONES.md` — Full milestone descriptions and dependencies
- `state/ROADMAP.md` — Phased delivery roadmap
- `state/SPRINT.md` — Sprint tracking

#### Brain Core Documents
- `BRAIN/CURRENT_STATE.md` — Central project state document
- `BRAIN/NEXT_TASK.md` — Next task breakdown and acceptance criteria
- `BRAIN/CHANGELOG.md` — This file
- `BRAIN/AI_RULES.md` — AI agent behavioral rules and constraints

#### Templates
- `templates/ADR_TEMPLATE.md` — Architectural Decision Record template
- `templates/CHECKPOINT_TEMPLATE.md` — Checkpoint definition template

#### Architectural Decision Records
- `ADR-001` — AI-first development methodology
- `ADR-002` — Trunk-based branching strategy
- `ADR-003` — Checkpoint-driven milestone tracking

#### Infrastructure
- Git repository initialized on `main` branch
- `.gitignore` configured for the project stack
- Branch protection rules documented

### Changed
- Nothing (initial creation)

### Deprecated
- Nothing

### Removed
- Nothing

### Fixed
- Nothing

### Security
- AI agent access rules established in `AI_RULES.md`
- Governance review process defined for all checkpoint transitions

---

## Version History

| Checkpoint | Date       | Description              | Breaking Changes |
|------------|------------|--------------------------|------------------|
| CP-000     | 2026-07-08 | Foundation Initialized   | N/A (initial)    |

---

## Cross-References

| Document                                           | Purpose                        |
|----------------------------------------------------|--------------------------------|
| [CURRENT_STATE.md](CURRENT_STATE.md)               | Current project state          |
| [NEXT_TASK.md](NEXT_TASK.md)                       | Next task details              |
| [MASTER_PLAN.md](../governance/MASTER_PLAN.md)     | Full project roadmap           |
| [ACTIVE_CHECKPOINT.md](state/ACTIVE_CHECKPOINT.md) | Checkpoint transitions         |
| [PROGRESS.md](state/PROGRESS.md)                   | Progress metrics               |

---

## Conventions

- Each checkpoint gets its own `## [CP-XXX]` section
- Entries use Keep a Changelog categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Dates use ISO 8601 format (YYYY-MM-DD)
- Cross-references use relative paths
- Breaking changes are called out explicitly
