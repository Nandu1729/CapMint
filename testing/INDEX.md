# Folder Index: Test Suites & Quality Gates [TESTING-INDEX]

This directory houses the test suites, mock fixtures, and validation gates for CapMint.

## 1. Test Configurations & Directories

| Directory | Purpose | Canonical Owner | Related Quality Gate |
|---|---|---|---|
| **Unit Tests** (`unit/`) | Isolated function and model correctness validations. | Service Engineers | Checkpoint test verification. |
| **Integration Tests** (`integration/`) | Multi-module service communication checks. | QA Lead | Deployment PR block. |
| **End-to-End Tests** (`e2e/`) | Flow validation from operator minting to public verification. | QA Lead | Release gate clearance. |
| **Contract Tests** (`contract/`) | API route matching and schema conformance reviews. | Integration Team | Gateway routing check. |
| **Performance Tests** (`performance/`) | Throughput verification and cache-hit SLAs under load. | SRE Team | CDN performance gate. |
| **Security Tests** (`security/`) | Verification of RBAC, fail-closed handlers, and injection resistance. | Security Officer | Security audit verification. |
| **Fixtures** (`fixtures/`) | Mock payloads (signed budgets, lab PDFs, scan logs) for local runs. | QA Lead | None |

---

## 2. Canonical Test Quality Gates

*   **[Repository Quality Gates Checklist](../BRAIN/NON_NEGOTIABLES.md#validation-checklist-nn-016)** (`[NN-016]`)
    *   *Purpose*: The checklist that must be passed before committing or merging any code changes.
    *   *Canonical Owner*: CapMint Core OS.
*   **[AI Agent Quality Gates](../BRAIN/AI_RULES.md#quality-gates-ar-011)** (`[AR-011]`)
    *   *Purpose*: Checklist for AI agents to prevent drift and ensure code cleanliness.
    *   *Canonical Owner*: CapMint Core OS.
