# CapMint — Change Approvals

> **Document**: `governance/CHANGE_APPROVALS.md`
> **Created**: 2026-07-08
> **Last Updated**: 2026-07-08
> **Status**: ACTIVE
> **Owner**: Core Team

---

## 1. Purpose

This document defines the **change approval process** for the CapMint project and serves
as the **official log** of all approved changes. Every architectural decision, scope
modification, quality-gate waiver, or significant configuration change must be recorded
here before implementation.

---

## 2. Change Categories

| Category | Code | Examples | Required Approver |
|----------|------|----------|-------------------|
| **Architecture** | ARCH | New module, technology choice, schema change | Tech Lead |
| **Scope** | SCOPE | Feature addition/removal, checkpoint re-ordering | PM + Tech Lead |
| **Security** | SEC | Auth flow change, crypto algorithm swap, policy update | Security Lead |
| **Infrastructure** | INFRA | CI/CD pipeline change, deployment target, env config | DevOps Lead |
| **Dependency** | DEPS | New library, major version upgrade, removal | Tech Lead |
| **Quality Waiver** | WAIVER | Gate criterion exemption, coverage floor exception | Tech Lead + PM |
| **Process** | PROC | Branching strategy, review policy, governance update | PM |
| **Data** | DATA | Schema migration, data model change, retention policy | Tech Lead + DBA |

---

## 3. Approval Process

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. PROPOSE  │────►│  2. REVIEW   │────►│  3. APPROVE  │────►│  4. EXECUTE  │
│              │     │              │     │   / REJECT   │     │              │
│ Author opens │     │ Reviewer(s)  │     │ Approver     │     │ Author       │
│ CA entry     │     │ assess risk  │     │ signs off    │     │ implements   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                      │
                                                               ┌──────▼──────┐
                                                               │  5. VERIFY  │
                                                               │             │
                                                               │ Reviewer    │
                                                               │ confirms    │
                                                               └─────────────┘
```

### Step Details

| Step | Actor | Action | SLA |
|------|-------|--------|-----|
| **Propose** | Author | Create a new row in the Approval Log (Section 6). Fill in all fields except `Approved By` and `Verdict`. Set status to `PROPOSED`. | — |
| **Review** | Reviewer(s) | Assess impact, risk, and alignment with master plan. Add comments. | 24 hours for standard; 4 hours for critical. |
| **Approve / Reject** | Approver | Set verdict to `APPROVED` or `REJECTED` with rationale. | Within review SLA. |
| **Execute** | Author | Implement the change. Reference the CA-ID in commit messages and PR descriptions. | Per checkpoint estimate. |
| **Verify** | Reviewer | Confirm implementation matches the approved proposal. Update status to `VERIFIED`. | 24 hours after merge. |

---

## 4. Approval Matrix (RACI)

| Category | Author | Module Lead | Tech Lead | PM | Security Lead | DevOps Lead |
|----------|--------|-------------|-----------|----|--------------|----|
| ARCH | R | C | A | I | C | I |
| SCOPE | R | I | A | A | I | I |
| SEC | R | I | C | I | A | I |
| INFRA | R | I | C | I | I | A |
| DEPS | R | C | A | I | C | I |
| WAIVER | R | C | A | A | C | I |
| PROC | R | I | C | A | I | I |
| DATA | R | C | A | I | I | C |

> **R** = Responsible, **A** = Accountable (approver), **C** = Consulted, **I** = Informed.

---

## 5. Change Impact Assessment

Before proposing a change, the author must assess:

| Dimension | Question | Rating |
|-----------|----------|--------|
| **Scope** | How many modules are affected? | Low (1) / Med (2–3) / High (4+) |
| **Risk** | What is the probability of negative side-effects? | Low / Med / High |
| **Reversibility** | Can this change be easily rolled back? | Easy / Hard / Irreversible |
| **Timeline** | Does this change affect the critical path? | No / Minor / Major |
| **Security** | Does this change alter the attack surface? | No / Minimal / Significant |

### Impact Score

```
Impact = max(Scope, Risk, Reversibility, Timeline, Security)
```

- **Low**: Standard review process.
- **Medium**: Requires Tech Lead sign-off.
- **High**: Requires Tech Lead + PM sign-off; may need team-wide review.

---

## 6. Approval Log

| CA-ID | Date | Category | Summary | Impact | Proposed By | Approved By | Verdict | Status |
|-------|------|----------|---------|--------|-------------|-------------|---------|--------|
| CA-001 | 2026-07-08 | PROC | **Project OS Initialisation** — Establish governance documents, repository scaffold, CI skeleton, and branching strategy (`feature/*` → `develop` → `release/*` → `main`). Create BRAIN knowledge base. Define quality gates and checkpoint roadmap. | Low | Core Team | Tech Lead | ✅ APPROVED | VERIFIED |

---

## 7. Approval Detail — CA-001

### CA-001: Project OS Initialisation

- **Category**: PROC (Process)
- **Date Proposed**: 2026-07-08
- **Date Approved**: 2026-07-08
- **Proposed By**: Core Team
- **Approved By**: Tech Lead

#### Description

Initialise the CapMint project operating system comprising:

1. **Governance documents** (7 files):
   - `MASTER_PLAN.md` — phased roadmap with 21 checkpoints.
   - `DEPENDENCY_GRAPH.md` — module dependency matrix and critical path.
   - `MODULE_STATUS.md` — status tracker for 15 modules.
   - `PROJECT_STATE.md` — executive state summary.
   - `QUALITY_GATES.md` — gate criteria (Gate 0 through Gate 5).
   - `TECH_DEBT.md` — debt register (empty — greenfield).
   - `CHANGE_APPROVALS.md` — this document.

2. **Repository scaffold**: `src/`, `tests/`, `docs/`, `governance/`, `BRAIN/`.

3. **CI skeleton**: Lint + format + placeholder test stages.

4. **Branching strategy**: `feature/*` → `develop` → `release/*` → `main`.

#### Impact Assessment

| Dimension | Rating |
|-----------|--------|
| Scope | Low — foundational, no code dependencies. |
| Risk | Low — documentation only; easily amended. |
| Reversibility | Easy — files can be modified or replaced. |
| Timeline | No — establishes the timeline itself. |
| Security | No — no runtime code introduced. |

#### Decision Rationale

A governance-first approach ensures all contributors share a common understanding of
scope, quality expectations, and process **before** any implementation begins. This
reduces rework and misalignment in later phases.

#### Verdict

✅ **APPROVED** — Proceed with implementation. This change corresponds to checkpoint
**CP-000** and satisfies **Gate 0** criteria as defined in
[`QUALITY_GATES.md`](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md).

---

## 8. Log Entry Template

```markdown
### CA-NNN: [Short Title]

- **Category**: ARCH / SCOPE / SEC / INFRA / DEPS / WAIVER / PROC / DATA
- **Date Proposed**: YYYY-MM-DD
- **Date Approved**: YYYY-MM-DD
- **Proposed By**: @person
- **Approved By**: @person

#### Description
[Detailed description of the proposed change.]

#### Impact Assessment
| Dimension | Rating |
|-----------|--------|
| Scope | Low / Med / High |
| Risk | Low / Med / High |
| Reversibility | Easy / Hard / Irreversible |
| Timeline | No / Minor / Major |
| Security | No / Minimal / Significant |

#### Decision Rationale
[Why this change is being made and what alternatives were considered.]

#### Verdict
✅ APPROVED / ❌ REJECTED — [Brief justification.]
```

---

## 9. Cross-References

| Document | Path |
|----------|------|
| Decisions (BRAIN) | [`../BRAIN/DECISIONS.md`](file:///Users/nandyyy/project/CapMint/BRAIN/DECISIONS.md) |
| Changelog (BRAIN) | [`../BRAIN/CHANGELOG.md`](file:///Users/nandyyy/project/CapMint/BRAIN/CHANGELOG.md) |
| Quality Gates | [`QUALITY_GATES.md`](file:///Users/nandyyy/project/CapMint/governance/QUALITY_GATES.md) |
| Master Plan | [`MASTER_PLAN.md`](file:///Users/nandyyy/project/CapMint/governance/MASTER_PLAN.md) |
| Tech Debt | [`TECH_DEBT.md`](file:///Users/nandyyy/project/CapMint/governance/TECH_DEBT.md) |

---

*End of CHANGE_APPROVALS.md*
