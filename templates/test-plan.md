# Test Plan: [Test Plan Title]

> **Test Plan** — CapMint Anti-Counterfeiting Platform

---

## Overview

| Field              | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| **Test Plan ID**   | TP-[NNN] <!-- Sequential: TP-001, TP-002 -->                  |
| **Module**         | <!-- e.g., auth, labeling, verification, blockchain -->        |
| **Checkpoint**     | [CP-NNN](../checkpoints/CP-NNN.md)                            |
| **Feature**        | [feature-name.md](../docs/features/feature-name.md)           |
| **Author**         | @[github-handle]                                               |
| **Created**        | YYYY-MM-DD                                                     |
| **Last Updated**   | YYYY-MM-DD                                                     |
| **Status**         | `DRAFT` · `APPROVED` · `IN_PROGRESS` · `COMPLETE`             |

---

## 1. Objective

<!-- What is this test plan validating? What confidence does it provide?
     Link back to the feature spec and acceptance criteria being tested. -->

## 2. Scope

### 2.1 In Scope

- <!-- Component/feature 1 being tested -->
- <!-- Component/feature 2 being tested -->
- <!-- Integration points being tested -->

### 2.2 Out of Scope

- <!-- What is explicitly NOT covered by this test plan -->
- <!-- Covered by a different test plan: [TP-NNN](./TP-NNN.md) -->

## 3. Test Types

<!-- Check all test types included in this plan. -->

- [ ] **Unit Tests** — Isolated function/method testing
- [ ] **Integration Tests** — Cross-module or service interaction testing
- [ ] **API Tests** — HTTP endpoint contract testing
- [ ] **End-to-End (E2E)** — Full user-flow testing
- [ ] **Security Tests** — Auth bypass, injection, privilege escalation
- [ ] **Performance Tests** — Load, stress, soak testing
- [ ] **Regression Tests** — Verify no existing functionality breaks
- [ ] **Smoke Tests** — Critical-path validation post-deployment
- [ ] **Contract Tests** — API schema backward compatibility

## 4. Test Environment

| Component            | Specification                                          |
| -------------------- | ------------------------------------------------------ |
| **Environment**      | `Local` · `CI` · `Staging` · `Production`               |
| **OS**               | <!-- e.g., Ubuntu 22.04, Docker (node:20-alpine) -->   |
| **Database**         | <!-- e.g., PostgreSQL 16.2, SQLite (for unit tests) --> |
| **Runtime**          | <!-- e.g., Node.js 20.x -->                            |
| **Test Framework**   | <!-- e.g., Jest, Vitest, Mocha, Playwright -->          |
| **CI System**        | <!-- e.g., GitHub Actions, Jenkins -->                  |
| **External Services**| <!-- Mocked / Stubbed / Live sandbox -->                |

### Test Data

<!-- Describe test data strategy: fixtures, seeds, factories, or shared test DB. -->

- **Fixtures:** `tests/fixtures/[module]/`
- **Seed Script:** `scripts/seed-test-data.ts`
- **Data Reset:** <!-- How is test data cleaned between runs? -->

## 5. Test Cases

### 5.1 Unit Tests

| TC ID      | Description                              | Input                     | Expected Output                  | Priority | Status     |
| ---------- | ---------------------------------------- | ------------------------- | -------------------------------- | -------- | ---------- |
| TC-U-001   | <!-- e.g., "Valid label creation" -->     | <!-- Input description --> | <!-- Expected result -->          | P0       | ✅ / ❌ / 🔄 |
| TC-U-002   | <!-- e.g., "Invalid input rejected" -->  | <!-- Input description --> | <!-- Expected result -->          | P0       | ✅ / ❌ / 🔄 |
| TC-U-003   | <!-- e.g., "Edge case: empty string" --> | <!-- Input description --> | <!-- Expected result -->          | P1       | ✅ / ❌ / 🔄 |

### 5.2 Integration Tests

| TC ID      | Description                              | Components Under Test     | Expected Behavior                | Priority | Status     |
| ---------- | ---------------------------------------- | ------------------------- | -------------------------------- | -------- | ---------- |
| TC-I-001   | <!-- e.g., "API → Service → DB" -->      | <!-- Components -->       | <!-- Expected result -->          | P0       | ✅ / ❌ / 🔄 |
| TC-I-002   | <!-- e.g., "Auth middleware chain" -->    | <!-- Components -->       | <!-- Expected result -->          | P0       | ✅ / ❌ / 🔄 |

### 5.3 API Tests

| TC ID      | Method | Endpoint                 | Auth    | Request Body           | Expected Status | Expected Response         | Priority |
| ---------- | ------ | ------------------------ | ------- | ---------------------- | --------------- | ------------------------- | -------- |
| TC-A-001   | POST   | `/api/v1/[resource]`     | Bearer  | `{ "field": "value" }` | `201`           | Created resource          | P0       |
| TC-A-002   | POST   | `/api/v1/[resource]`     | None    | `{ "field": "value" }` | `401`           | Unauthorized error        | P0       |
| TC-A-003   | POST   | `/api/v1/[resource]`     | Bearer  | `{}`                   | `400`           | Validation error          | P0       |

### 5.4 Security Tests

| TC ID      | Attack Vector                     | Test Description                      | Expected Defense              | Priority |
| ---------- | --------------------------------- | ------------------------------------- | ----------------------------- | -------- |
| TC-S-001   | <!-- e.g., "SQL Injection" -->    | <!-- How the attack is performed -->  | <!-- How it should be blocked --> | P0    |
| TC-S-002   | <!-- e.g., "Auth Bypass" -->      | <!-- How the attack is performed -->  | <!-- How it should be blocked --> | P0    |

### 5.5 Performance Tests

| TC ID      | Test Type  | Scenario                       | Metric              | Target          | Tool       |
| ---------- | ---------- | ------------------------------ | -------------------- | --------------- | ---------- |
| TC-P-001   | Load       | <!-- e.g., "100 concurrent" --> | p95 Latency         | < [N]ms         | <!-- k6 --> |
| TC-P-002   | Stress     | <!-- e.g., "Ramp to 500" -->   | Error Rate          | < [N]%          | <!-- k6 --> |

## 6. Coverage Targets

| Module / Component   | Line Coverage Target | Branch Coverage Target | Current   |
| -------------------- | -------------------- | ---------------------- | --------- |
| `[module/component]` | [N]%                 | [N]%                   | [N]%      |
| `[module/component]` | [N]%                 | [N]%                   | [N]%      |
| **Overall**          | **[N]%**             | **[N]%**               | **[N]%**  |

## 7. Exit Criteria

> **All exit criteria must be met before the test plan is marked COMPLETE.**

- [ ] All P0 test cases passing
- [ ] All P1 test cases passing (or deferred with justification)
- [ ] Coverage targets met for all modules
- [ ] No open S0 or S1 bugs
- [ ] Security tests show no critical/high findings
- [ ] Performance tests meet all defined targets
- [ ] Test results reviewed and signed off

## 8. Risks & Assumptions

### Risks

| Risk                              | Impact    | Mitigation                              |
| --------------------------------- | --------- | --------------------------------------- |
| <!-- e.g., "Flaky integration" --> | Medium   | <!-- e.g., "Add retry and isolation" --> |

### Assumptions

- <!-- e.g., "External blockchain testnet is available" -->
- <!-- e.g., "Test database is seeded before each run" -->

---

## Approval

| Role               | Name            | Date       | Sign-off |
| ------------------ | --------------- | ---------- | -------- |
| **QA Lead**        | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Tech Lead**      | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Module Owner**   | @[handle]       | YYYY-MM-DD | ✅ / ❌   |

---

> **Usage:** Copy this template → rename to `TP-NNN-[module]-[feature].md` → fill all sections → execute tests → update status and coverage → submit for sign-off.
