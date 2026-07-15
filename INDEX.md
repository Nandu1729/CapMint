# Repository Documentation Index [INDEX]

This master index serves as the entry point for all documentation across the CapMint repository. It provides structured pathways for developers and AI agents to locate specifications, blueprints, schemas, and policies.

## 1. Documentation Structure & Consumption Hierarchy

AI agents and contributors MUST navigate the codebase using the following structured path to ensure alignment and minimize token usage:

1. **Repository master index (`INDEX.md`)** - Locate major domain boundaries and directory pointers.
2. **Folder-level indexes (`INDEX.md`)** - Identify canonical files, document ownership, and specific metadata.
3. **Canonical documents** - Read the targeted source of truth.
4. **Stable section identifiers** - Reference stable section anchors (e.g. `[PB-001]`, `[NN-001]`) for specific context.

---

## 2. Directory Index Mapping

| Major Folder | Purpose | Link to Folder Index | Canonical Owner |
|---|---|---|---|
| **Platform Core State** (`BRAIN/`) | Operating system configs, rules, invariants, and session logs. | [BRAIN/INDEX.md](BRAIN/INDEX.md) | CapMint Core OS |
| **System Architecture** (`architecture/`) | C4 models, service boundaries, technology choices, and data flows. | [architecture/INDEX.md](architecture/INDEX.md) | Architecture Board |
| **Database Blueprint** (`database/`) | PostgreSQL entity relationship diagrams, database schemas, and state transitions. | [database/INDEX.md](database/INDEX.md) | Database Architect |
| **API Blueprint** (`api/`) | OpenAPI schemas, webhooks, and endpoint contracts. | [api/INDEX.md](api/INDEX.md) | Integration Team |
| **Services Blueprint** (`services/`) | Domain services logic, package layout, and configurations. | [services/INDEX.md](services/INDEX.md) | Service Engineers |
| **Security Blueprint** (`security/`) | Security matrices, KMS setups, and encryption schemes. | [security/INDEX.md](security/INDEX.md) | Security Officer |
| **Deployment Blueprint** (`deployment/`) | Terraform environments, Docker configs, and CD pipelines. | [deployment/INDEX.md](deployment/INDEX.md) | DevOps / SRE |
| **Testing Blueprint** (`testing/`) | Integration tests, performance suites, and verification rules. | [testing/INDEX.md](testing/INDEX.md) | QA Lead |
| **Governance Policies** (`governance/`) | Master plan, change approvals, quality gates, and debt metrics. | [governance/INDEX.md](governance/INDEX.md) | Repository Owner |

---

## 3. How to Use Section Pointers

Large Markdown specifications are annotated with stable section identifiers (e.g. `[PB-001]`, `[SC-001]`, `[DF-001]`, `[NN-001]`). When referencing requirements or rules in pull requests, commit messages, or AI system prompts, use these stable codes to prevent ambiguity and ensure references do not drift when documents evolve.
