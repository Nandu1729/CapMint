## [CP-NNN]-[MODULE] — [Short Description]

<!-- 
  PR Title Format: [CP-NNN]-[MODULE] Short description
  Examples:
    [CP-001]-AUTH — Implement JWT token refresh
    [CP-002]-LABEL — Add QR code generation endpoint
    [CP-003]-VERIFY — Blockchain hash verification
-->

---

### Summary

<!-- Concise description of what this PR does and WHY.
     Link to the feature spec, bug report, or task that motivated this change.
-->

**Checkpoint:** [CP-NNN](../checkpoints/CP-NNN.md)
**Feature/Bug:** [Reference](../docs/features/feature-name.md) <!-- or ../docs/bugs/BUG-NNN.md -->

---

### Change Type

- [ ] 🆕 Feature — New functionality
- [ ] 🐛 Bug Fix — Corrects existing behavior
- [ ] ♻️ Refactor — No behavior change, code improvement
- [ ] 📄 Documentation — Docs only
- [ ] 🧪 Test — Test additions or fixes only
- [ ] 🔧 Config/Infra — Build, CI/CD, or config changes
- [ ] 💥 Breaking Change — Incompatible API or schema change

---

### Changes Made

<!-- Bullet list of concrete changes. Be specific about files and modules affected. -->

- [ ] <!-- Change 1 -->
- [ ] <!-- Change 2 -->
- [ ] <!-- Change 3 -->

---

### Testing

#### Tests Added / Modified

| Test File                  | Type        | Coverage Area                     |
| -------------------------- | ----------- | --------------------------------- |
| `tests/[module]/[file]`   | Unit/Integ  | <!-- What does this test cover --> |

#### Test Results

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing completed (describe below)
- [ ] No regressions in existing tests

**Manual Testing Notes:**
<!-- Describe any manual testing steps performed and results -->

---

### Documentation Update Checklist

> **Every PR must update the relevant project docs.** Check each item after updating.

- [ ] **CURRENT_STATE.md** — Updated current system state and capabilities
- [ ] **CHANGELOG.md** — Added entry under the appropriate version/checkpoint
- [ ] **PROGRESS.md** — Updated completion percentage and task status
- [ ] **MODULE_STATUS.md** — Updated module readiness and health indicators
- [ ] **ACTIVE_CHECKPOINT.md** — Updated active checkpoint progress if applicable
- [ ] **NEXT_TASK.md** — Updated or confirmed next task in queue
- [ ] **API docs** — Updated if API surface changed ([API template](../templates/API.md))
- [ ] **Database docs** — Updated if schema changed ([DB template](../templates/database.md))
- [ ] **README.md** — Updated if user-facing behavior changed

---

### Quality Gate Checklist

> **All items must be checked before merge.** See [checkpoint template](../templates/checkpoint.md) for gate criteria.

#### Code Quality
- [ ] Code follows project style guide and conventions
- [ ] No TODO/FIXME without linked issue
- [ ] No hardcoded secrets, tokens, or credentials
- [ ] Error handling is comprehensive (no silent failures)

#### Security
- [ ] Input validation on all user-facing inputs
- [ ] Authentication/authorization checks in place
- [ ] No sensitive data logged or exposed in responses
- [ ] SQL injection / XSS / CSRF protections verified (if applicable)
- [ ] Threat model reviewed ([threat-model template](../templates/threat-model.md))

#### Performance
- [ ] No N+1 queries or unbounded loops introduced
- [ ] Database indexes exist for new query patterns
- [ ] Response payloads are reasonably sized

#### Compatibility
- [ ] No breaking changes to public APIs (or documented in changelog)
- [ ] Database migrations are backward-compatible (or migration guide added)
- [ ] Environment variables documented if added/changed

---

### Screenshots / Recordings

<!-- If this PR has UI changes, attach screenshots or screen recordings here. -->

---

### Reviewer Notes

<!-- Any specific areas you'd like reviewers to focus on? 
     Any known limitations or follow-up work? -->

---

### Related PRs / Issues

- <!-- #[PR/Issue number] — Description -->
- <!-- #[PR/Issue number] — Description -->
