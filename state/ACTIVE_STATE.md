# Active State Tracking [ACTIVE_STATE]

This document maps the active runtime execution state, active checkpoint checklists, branch tracking, blockers register, and conventional commit rules for CapMint.

---

## 1. Executive Summary [STATE-001]

*   **Active Branch**: `feature/doc-indexing`
*   **Active Checkpoint**: `CP-008` (Production Readiness)
*   **Branching Strategy**: Trunk-Based Development with Short-Lived Feature Branches
*   **Overall Health**: 🟢 Green
*   **Blockers**: None

---

## 2. Checkpoint Progress Tracker [STATE-002]

| Checkpoint | Milestone Name | Status | Branch |
| :--- | :--- | :--- | :--- |
| **CP-000** | Project Operating System | ✅ COMPLETE | `develop` |
| **CP-001** | Architecture Lock | ✅ COMPLETE | `feature/architecture-lock` |
| **CP-002** | Database Design | ✅ COMPLETE | `feature/database-design` |
| **CP-003** | API Contracts | ✅ COMPLETE | `feature/api-contracts` |
| **CP-004** | Backend Implementation | ✅ COMPLETE | `feature/auth` |
| **CP-005** | Frontend Implementation | ✅ COMPLETE | `feature/frontend` |
| **CP-006** | Infrastructure | ✅ COMPLETE | `feature/infrastructure` |
| **CP-007** | Quality Assurance | ✅ COMPLETE | `feature/qa` |
| **CP-008** | Production Readiness | ⏳ PENDING | `feature/production-readiness` |

---

## 3. Active Checkpoint Checklist: CP-008 [STATE-003]

### Objective
Perform security environment variables secret audits, build docker production artifacts, verify edge routing rules, and obtain release freeze approval.

### Acceptance Criteria
- [ ] Ingress security SSL context verification complete.
- [ ] secrets configuration security audit complete.
- [ ] Docker production images verified and cached.
- [ ] Release freeze approval logged.

---

## 4. Conventional Commit & Merge Rules [STATE-004]

Commit message format: `<type>(<scope>): <description>`
*   `feat`: New feature or capability.
*   `fix`: Bug fix.
*   `docs`: Documentation change.
*   `chore`: Maintenance/configs.
*   `refactor`: Restructuring.
*   `test`: Adding/updating tests.

### Merge Rules
*   **Feature $\rightarrow$ Develop**: Squash merges preferred. Requires all lints/tests passing and state tracking files updated.
*   **Develop $\rightarrow$ Main**: Merge commits preferred (no squash). Requires Tech Lead sign-off, tags created (e.g. `v0.1.0-cp000`), and changelog updated.

---

## 5. Blocker & Risk Register [STATE-005]

No active blockers are obstructing current development checkpoint milestones.
*   *Risk R-001 (GS1 Specs)*: Low / Med. *Mitigation*: Pin to GS1 DL v1.3.
*   *Risk R-002 (Clone Model)*: Med / High. *Mitigation*: Gather anomaly dataset early.
