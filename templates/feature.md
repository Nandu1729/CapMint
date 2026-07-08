# Feature: [Feature Name]

> **Feature Specification** — CapMint Anti-Counterfeiting Platform

---

## Metadata

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Feature Name**   | [Descriptive feature name]                                      |
| **Module**         | <!-- e.g., auth, labeling, verification, blockchain, api -->    |
| **Status**         | `DRAFT` · `APPROVED` · `IN_PROGRESS` · `COMPLETE` · `DEFERRED` |
| **Branch**         | `feature/CP-NNN-short-name`                                     |
| **Checkpoint**     | [CP-NNN](../checkpoints/CP-NNN.md)                             |
| **Author**         | @[github-handle]                                                |
| **Created**        | YYYY-MM-DD                                                      |
| **Last Updated**   | YYYY-MM-DD                                                      |
| **Reviewers**      | @[handle], @[handle]                                            |

---

## 1. User Story

<!-- Use the standard format. Write multiple stories if the feature serves different personas. -->

**As a** [persona — e.g., manufacturer, inspector, supply chain manager],
**I want to** [action — what the user wants to do],
**So that** [value — the benefit or outcome they expect].

### Additional Stories (if applicable)

- **As a** [persona], **I want to** [action], **so that** [value].
- **As a** [persona], **I want to** [action], **so that** [value].

## 2. Acceptance Criteria

<!-- Each criterion must be testable. Use Given/When/Then format. -->

- [ ] **AC-1:** Given [precondition], when [action], then [expected result].
- [ ] **AC-2:** Given [precondition], when [action], then [expected result].
- [ ] **AC-3:** Given [precondition], when [action], then [expected result].
- [ ] **AC-4:** Given [precondition], when [action], then [expected result].

### Edge Cases

- [ ] <!-- Edge case 1: e.g., "Empty input returns 400 with validation error" -->
- [ ] <!-- Edge case 2: e.g., "Concurrent updates resolve with last-write-wins" -->

## 3. Technical Approach

### 3.1 Architecture

<!-- Describe the high-level technical approach. Include a diagram if helpful. -->

```
<!-- ASCII diagram, Mermaid reference, or description of component interactions -->
[Client] → [API Gateway] → [Service Layer] → [Database]
                                    ↓
                            [Blockchain Layer]
```

### 3.2 Implementation Plan

<!-- Step-by-step implementation order. Reference specific files/modules. -->

1. <!-- Step 1: e.g., "Create database migration for `labels` table" -->
2. <!-- Step 2: e.g., "Implement `LabelService` in `src/labeling/service.ts`" -->
3. <!-- Step 3: e.g., "Add API endpoint `POST /api/v1/labels`" -->
4. <!-- Step 4: e.g., "Write unit and integration tests" -->

### 3.3 Key Design Decisions

<!-- Reference existing ADRs or note decisions that may warrant a new ADR. -->

- <!-- Decision 1: e.g., "Use UUID v7 for time-sortable IDs (see ADR-003)" -->
- <!-- Decision 2: e.g., "Store metadata as JSONB for schema flexibility" -->

## 4. API Changes

<!-- List new or modified endpoints. Link to full API docs when created. -->

| Method   | Path                        | Action                    | Status  |
| -------- | --------------------------- | ------------------------- | ------- |
| `POST`   | `/api/v1/[resource]`        | Create resource           | New     |
| `GET`    | `/api/v1/[resource]/:id`    | Get resource by ID        | New     |
| `PUT`    | `/api/v1/[resource]/:id`    | Update resource           | Modified|

> Full API docs: [API-endpoint.md](../docs/api/endpoint.md) (use [API template](../templates/API.md))

## 5. Database Changes

<!-- List new or modified tables. Link to full schema docs when created. -->

| Table                | Change Type   | Description                           |
| -------------------- | ------------- | ------------------------------------- |
| `[table_name]`       | New / Modified | <!-- What changes and why -->         |

> Full schema docs: [table-name.md](../docs/database/table-name.md) (use [DB template](../templates/database.md))

## 6. Security Considerations

<!-- Every feature must address security. Reference threat model if applicable. -->

| Concern                      | Mitigation                                           |
| ---------------------------- | ---------------------------------------------------- |
| **Authentication**           | <!-- How is the user authenticated? -->               |
| **Authorization**            | <!-- What RBAC rules apply? -->                       |
| **Input Validation**         | <!-- What validation is applied? -->                  |
| **Data Privacy (PII)**       | <!-- Any PII stored? Encryption? -->                  |
| **Audit Logging**            | <!-- What events are logged? -->                      |
| **Blockchain Integrity**     | <!-- On-chain hash implications? -->                  |

> Threat model: [threat-model.md](../docs/security/threat-model.md) (use [threat model template](../templates/threat-model.md))

## 7. Performance Requirements

| Metric                   | Target                | Measurement Method            |
| ------------------------ | --------------------- | ----------------------------- |
| **Response Time (p95)**  | < [N]ms               | Load testing / APM            |
| **Throughput**           | [N] req/s             | Load testing                  |
| **Database Query Time**  | < [N]ms               | Query profiling               |
| **Payload Size**         | < [N]KB               | Response inspection           |

## 8. Test Plan

<!-- High-level test strategy. Create detailed test plan using [test-plan template](../templates/test-plan.md). -->

| Test Type           | Scope                              | Priority   |
| ------------------- | ---------------------------------- | ---------- |
| **Unit Tests**      | Service layer, validators          | P0         |
| **Integration**     | API endpoints, DB queries          | P0         |
| **E2E**             | Full user flow                     | P1         |
| **Security**        | Auth bypass, injection             | P0         |
| **Performance**     | Load, stress                       | P1         |

> Detailed test plan: [test-plan.md](../docs/testing/test-plan.md) (use [test plan template](../templates/test-plan.md))

## 9. Dependencies

### 9.1 Blocked By (prerequisites)

| Dependency                   | Status      | Owner       | ETA        |
| ---------------------------- | ----------- | ----------- | ---------- |
| <!-- e.g., "Auth module" --> | ✅ / 🔄 / ❌ | @[handle]   | YYYY-MM-DD |

### 9.2 Blocks (downstream)

| Dependent Feature            | Module      | Checkpoint  |
| ---------------------------- | ----------- | ----------- |
| <!-- e.g., "Label scan" -->  | verification| CP-[NNN]    |

## 10. Effort Estimate

| Task                         | Estimate     | Assignee    |
| ---------------------------- | ------------ | ----------- |
| Database schema + migration  | [N]h / [N]d  | @[handle]   |
| Service layer implementation | [N]h / [N]d  | @[handle]   |
| API endpoints                | [N]h / [N]d  | @[handle]   |
| Tests (unit + integration)   | [N]h / [N]d  | @[handle]   |
| Documentation                | [N]h / [N]d  | @[handle]   |
| **Total**                    | **[N]h / [N]d** |           |

---

## Approval

| Role               | Name            | Date       | Decision |
| ------------------ | --------------- | ---------- | -------- |
| **Tech Lead**      | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Product Owner**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Security Lead**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |

---

> **Usage:** Copy this template → rename to `[feature-name].md` → fill all sections → submit for review → update status as work progresses.
