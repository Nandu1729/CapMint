# Changelog

All notable changes to the CapMint project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Checkpoint-based entries are prefixed with `[CP-XXX]` to align with the
[MASTER_PLAN.md](../governance/MASTER_PLAN.md) roadmap.

---

## [Unreleased]

### Planned
- CP-001: Architecture Lock — Lock system layout, C4 blueprints, threat models.
- CP-002: Database Design — Relational schemas, indexing strategies, migrations.

---

## [CP-000] — 2026-07-08

### Summary
**Project Operating System Initialized** — Established all project governance, state tracking registries, templates, AI agent rules, branching workflows, and locked core architectural decision records.

### Added

#### Governance Documents (`governance/`)
- `governance/MASTER_PLAN.md` — Authoritative project roadmap with 24 checkpoints
- `governance/MODULE_STATUS.md` — Module status register mapping all 16 modules
- `governance/PROJECT_STATE.md` — Executive status summary and project risk log
- `governance/QUALITY_GATES.md` — Simplified quality gate checklist framework (Gates 0 to 5)
- `governance/TECH_DEBT.md` — Technical debt register
- `governance/CHANGE_APPROVALS.md` — Configuration and decision approvals log

#### State Tracking (`BRAIN/state/`)
- `state/ACTIVE_CHECKPOINT.md` — Active checkpoint trackers and rules
- `state/PROGRESS.md` — Completion status metrics (binary Foundation vs Application)
- `state/ACTIVE_BRANCH.md` — Branch mappings and merge rules
- `state/BLOCKERS.md` — Blocker tracking registry
- `state/CURRENT.md` — Quick-reference summary card
- `state/MILESTONES.md` — Milestone descriptions and topologicalSort graph (CP-000 to CP-023)
- `state/ROADMAP.md` — Phased delivery roadmap
- `state/SPRINT.md` — Sprint details

#### Brain Core Documents (`BRAIN/`)
- `BRAIN/PROJECT_CONTEXT.md` — Platform identity, mission, 16 modules, and tech stack overview
- `BRAIN/PROJECT_BRAIN.md` — Document index map and Golden Loop instructions
- `BRAIN/AI_RULES.md` — AI agent behavioral guidelines and pre/post checklists
- `BRAIN/NON_NEGOTIABLES.md` — Inviolable security and quality constraints
- `BRAIN/DEPENDENCIES.md` — Runtime, dev, infrastructure, and external dependencies manifest
- `BRAIN/ARCHITECTURE_SUMMARY.md` — Microservice topologies and product flow pipelines
- `BRAIN/DECISIONS.md` — Architectural Decision Records (ADRs 001 to 007)
- `BRAIN/CURRENT_STATE.md` — Living project state snapshot
- `BRAIN/NEXT_TASK.md` — Active task breakdown and preconditions check
- `BRAIN/SESSION.md` — Short-term memory log for AI agent developer sessions
- `BRAIN/LESSONS_LEARNED.md` — Living repository of discoveries and resolutions

#### Templates (`templates/`)
- `templates/ADR.md` — Architecture Decision Record template
- `templates/API.md` — API endpoint definition template
- `templates/PR-template.md` — Pull request template
- `templates/bug.md` — Bug report template
- `templates/checkpoint.md` — Checkpoint completion record template
- `templates/database.md` — Database schema template
- `templates/feature.md` — Feature specification template
- `templates/meeting.md` — Meeting notes template
- `templates/release.md` — Release record template
- `templates/test-plan.md` — Test plan template
- `templates/threat-model.md` — STRIDE threat model template

#### Root Files
- `README.md` — Comprehensive project README with module index and monorepo diagram
- `OWNERS.md` — Directory ownership mapping and code approval matrix

### Changed
- **Refinement after Architectural Review:**
  - Pruned all speculative/future ADRs from `DECISIONS.md`, keeping only locked choices.
  - Adjusted the checkpoint roadmap to a sequential 24-step roadmap (CP-000 to CP-023) across all files.
  - Updated branching workflows to show the correct flow `main` ← `develop` ← `feature/*`, setting `develop` as the active base working branch.
  - Simplified Quality Gates to Gates 0 to 5 in `QUALITY_GATES.md`.
  - Removed speculative progress percentages, replacing them with a binary progress statement ("Foundation Completed", "Application Not Started").
  - Created `SESSION.md` and `LESSONS_LEARNED.md`.
  - Audited and updated relative path cross-references for all files.

---

## Version History

| Checkpoint | Date       | Description              | Breaking Changes |
|------------|------------|--------------------------|------------------|
| CP-000     | 2026-07-08 | OS & Foundation Init     | N/A (initial)    |

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [CURRENT_STATE.md](CURRENT_STATE.md) | Current project state snapshot |
| [NEXT_TASK.md](NEXT_TASK.md) | Next task details |
| [MASTER_PLAN.md](../governance/MASTER_PLAN.md) | Authoritative project roadmap |
| [ACTIVE_CHECKPOINT.md](state/ACTIVE_CHECKPOINT.md) | Active checkpoint status |
| [PROGRESS.md](state/PROGRESS.md) | Progress metrics |
| [SESSION.md](SESSION.md) | Session memory |

---

## Conventions

- Each checkpoint gets its own `## [CP-XXX]` section
- Entries use Keep a Changelog categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Dates use ISO 8601 format (YYYY-MM-DD)
- Cross-references use relative paths
- Breaking changes are called out explicitly
