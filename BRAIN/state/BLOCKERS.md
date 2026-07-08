# CapMint — Blockers

> **Last Updated:** 2026-07-08  
> **Active Blockers:** 0  
> **Status:** 🟢 ALL CLEAR

---

## Current Blockers

**No active blockers.** The project is proceeding without impediments.

---

## Blocker Tracking Table

| ID      | Severity | Checkpoint | Summary | Raised | Owner | Status | Resolution | Resolved |
|---------|----------|------------|---------|--------|-------|--------|------------|----------|
| _BLK-001_ | _—_    | _—_        | _—_     | _—_    | _—_   | _—_    | _—_        | _—_      |

### Column Definitions

| Column      | Description                                              |
|-------------|----------------------------------------------------------|
| **ID**      | Unique identifier: `BLK-XXX`                            |
| **Severity**| 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low              |
| **Checkpoint** | Which checkpoint is blocked                           |
| **Summary** | Brief description of the blocker                         |
| **Raised**  | Date the blocker was identified (YYYY-MM-DD)             |
| **Owner**   | Person or agent responsible for resolution               |
| **Status**  | 🔴 BLOCKED · 🟡 IN PROGRESS · ✅ RESOLVED · ⬜ DEFERRED  |
| **Resolution** | How the blocker was resolved (or mitigation plan)     |
| **Resolved**| Date resolved (YYYY-MM-DD)                               |

---

## Severity Levels

| Level      | Impact                                                    | Response Time |
|------------|-----------------------------------------------------------|---------------|
| 🔴 Critical | Blocks all progress; checkpoint cannot advance           | Immediate     |
| 🟠 High     | Blocks a specific module or feature                      | Within 1 day  |
| 🟡 Medium   | Slows progress but workaround exists                     | Within 3 days |
| 🟢 Low      | Minor inconvenience; does not block progress             | Next sprint   |

---

## Escalation Process

```
1. Identify blocker
   └── AI Agent or Human raises BLK-XXX in this file

2. Classify severity
   └── Use severity matrix above

3. Assign owner
   └── Person or agent best suited to resolve

4. Attempt resolution
   ├── 🟢🟡 Resolve within normal workflow
   └── 🟠🔴 Escalate immediately:
        ├── Notify project lead
        ├── Update CURRENT_STATE.md with blocker reference
        └── Consider checkpoint rollback if Critical

5. Document resolution
   └── Update this file with resolution details and date

6. Post-mortem (Critical only)
   └── Document root cause and prevention measures
```

### Escalation Contacts

| Role            | Contact    | Escalation Scope       |
|-----------------|------------|------------------------|
| Project Lead    | TBD        | 🔴 Critical blockers    |
| Tech Lead       | TBD        | 🟠 High technical issues |
| AI Agent        | Automated  | 🟡🟢 Self-resolvable     |

---

## Resolved Blockers (Archive)

| ID | Severity | Summary | Resolution | Duration |
|----|----------|---------|------------|----------|
| _No resolved blockers yet_ | | | | |

---

## Blocker Metrics

| Metric                     | Value |
|----------------------------|-------|
| Total Blockers Raised      | 0     |
| Currently Active           | 0     |
| Resolved                   | 0     |
| Average Resolution Time    | N/A   |
| Critical Blockers (all time)| 0    |

---

## Cross-References

| Document                                    | Purpose                    |
|---------------------------------------------|----------------------------|
| [CURRENT_STATE.md](../CURRENT_STATE.md)     | Project state (refs blockers) |
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md)| Checkpoint affected by blockers |
| [PROGRESS.md](PROGRESS.md)                  | Progress impact tracking     |
| [SPRINT.md](SPRINT.md)                      | Sprint-level blocker impact  |

---

## AI Agent Instructions

- **Check this file** before starting any checkpoint to verify no blockers exist.
- **Raise blockers immediately** when identified — do not wait for a review cycle.
- **Self-resolve** 🟢 and 🟡 blockers when possible; document the resolution.
- **Escalate** 🟠 and 🔴 blockers by updating [CURRENT_STATE.md](../CURRENT_STATE.md).
