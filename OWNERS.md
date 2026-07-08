# OWNERS — CapMint

> **Directory Ownership, Review Requirements & Decision Authority**

---

## 1. Directory Ownership Map

> Each directory has a **primary owner** responsible for code quality, architecture decisions, and review. **Secondary owners** can review and approve in the primary owner's absence.

| Directory / Path              | Primary Owner | Secondary Owner(s) | Description                              |
| ----------------------------- | ------------- | ------------------- | ---------------------------------------- |
| `/` (root)                    | @[tech-lead]  | @[co-lead]          | Project-wide config, root docs           |
| `src/auth/`                   | @[owner]      | @[backup]           | Authentication and authorization module  |
| `src/labeling/`               | @[owner]      | @[backup]           | Label generation and management          |
| `src/verification/`           | @[owner]      | @[backup]           | AI verification and counterfeit detection|
| `src/blockchain/`             | @[owner]      | @[backup]           | Blockchain integration and smart contracts|
| `src/api/`                    | @[owner]      | @[backup]           | API gateway, routing, middleware         |
| `src/shared/`                 | @[tech-lead]  | @[any-module-owner] | Shared utilities, types, constants       |
| `tests/`                      | @[qa-lead]    | @[owner-per-module] | Test suites across all modules           |
| `migrations/`                 | @[owner]      | @[tech-lead]        | Database migrations and schema changes   |
| `docs/`                       | @[tech-lead]  | @[any-contributor]  | All project documentation                |
| `docs/adr/`                   | @[tech-lead]  | @[module-owners]    | Architecture Decision Records            |
| `docs/security/`              | @[sec-lead]   | @[tech-lead]        | Threat models and security docs          |
| `templates/`                  | @[tech-lead]  | @[co-lead]          | Document templates                       |
| `checkpoints/`                | @[tech-lead]  | @[product-owner]    | Checkpoint completion records            |
| `config/`                     | @[devops]     | @[tech-lead]        | Configuration and environment            |
| `scripts/`                    | @[devops]     | @[tech-lead]        | Build, deploy, and utility scripts       |

> **Instructions:** Replace `@[handle]` placeholders with actual GitHub handles as team members are assigned.

---

## 2. Review Requirements

### 2.1 PR Approval Matrix

| Change Type                              | Min Reviewers | Required Reviewers                    | Approval Rule          |
| ---------------------------------------- | ------------- | ------------------------------------- | ---------------------- |
| **Feature (single module)**              | 2             | Module Owner + 1 team member          | All must approve       |
| **Feature (cross-module)**               | 3             | All affected Module Owners + Tech Lead| All must approve       |
| **Bug Fix**                              | 1             | Module Owner                          | Must approve           |
| **Security-sensitive change**            | 2             | Security Lead + Module Owner          | Both must approve      |
| **Database migration**                   | 2             | DB Owner + Tech Lead                  | Both must approve      |
| **API contract change (breaking)**       | 3             | API Owner + Tech Lead + Product Owner | All must approve       |
| **API contract change (non-breaking)**   | 2             | API Owner + 1 team member             | All must approve       |
| **Documentation only**                   | 1             | Any team member                       | Must approve           |
| **Config / CI / Infra**                  | 2             | DevOps Owner + Tech Lead              | Both must approve      |
| **Hotfix (production emergency)**        | 1             | Tech Lead OR Security Lead            | Must approve; post-review within 24h |
| **Template change**                      | 2             | Tech Lead + 1 team member             | All must approve       |
| **ADR (Architecture Decision)**          | 3             | Tech Lead + Security Lead + Product Owner | All must approve   |

### 2.2 Auto-Assignment Rules

<!-- Configure in `.github/CODEOWNERS` or equivalent CI tool -->

```
# CODEOWNERS (GitHub format)
# Each line maps a path pattern to the required reviewer(s)

*                           @[tech-lead]
/src/auth/                  @[auth-owner]
/src/labeling/              @[labeling-owner]
/src/verification/          @[verification-owner]
/src/blockchain/            @[blockchain-owner]
/src/api/                   @[api-owner]
/src/shared/                @[tech-lead]
/migrations/                @[db-owner] @[tech-lead]
/docs/security/             @[sec-lead]
/docs/adr/                  @[tech-lead]
/config/                    @[devops]
```

### 2.3 Review SLA

| Priority       | Initial Review | Final Decision | Escalation After |
| -------------- | -------------- | -------------- | ---------------- |
| **P0 (Hotfix)**| 1 hour         | 2 hours        | 2 hours          |
| **P1 (High)**  | 4 hours        | 1 business day | 1 business day   |
| **P2 (Normal)**| 1 business day | 2 business days| 3 business days  |
| **P3 (Low)**   | 2 business days| 3 business days| 5 business days  |

---

## 3. Escalation Paths

### 3.1 Escalation Hierarchy

```
Level 0: Module Owner
    ↓ (unresolved after SLA)
Level 1: Tech Lead
    ↓ (unresolved or cross-cutting)
Level 2: Security Lead (security issues) / Product Owner (product issues)
    ↓ (unresolved or strategic)
Level 3: Project Lead / Stakeholders
```

### 3.2 Escalation Triggers

| Trigger                                          | Escalate To        | Action                              |
| ------------------------------------------------ | ------------------ | ----------------------------------- |
| PR review SLA exceeded                           | Tech Lead          | Reassign or unblock                 |
| Module Owner unavailable > 2 days                | Secondary Owner    | Temporary ownership transfer        |
| Security concern raised in PR                    | Security Lead      | Mandatory security review           |
| Disagreement between reviewers                   | Tech Lead          | Mediate and decide                  |
| Breaking API change disputed                     | Product Owner      | Business impact assessment          |
| Checkpoint deadline at risk                      | Tech Lead + PO     | Scope adjustment discussion         |
| Production incident during deployment            | Tech Lead + DevOps | Incident response protocol          |

### 3.3 Escalation Procedure

1. **Document** the issue clearly in the PR or a dedicated issue
2. **Tag** the appropriate escalation contact with `@mention`
3. **Set priority** based on impact and urgency
4. **Follow up** within the SLA window for the assigned priority
5. **Record** the resolution in the PR or meeting notes using [meeting template](templates/meeting.md)

---

## 4. Decision Authority Matrix

> Defines who has the authority to make or approve specific types of decisions.

| Decision Type                            | Proposes          | Approves             | Veto Power           | Record In                |
| ---------------------------------------- | ----------------- | -------------------- | -------------------- | ------------------------ |
| **Architecture / Design**                | Any engineer      | Tech Lead            | Security Lead        | [ADR](templates/ADR.md)  |
| **Technology Choice (new dependency)**   | Module Owner      | Tech Lead            | Security Lead        | [ADR](templates/ADR.md)  |
| **API Contract (public-facing)**         | API Owner         | Tech Lead + PO       | PO                   | [API doc](templates/API.md) |
| **Database Schema Change**               | Module Owner      | DB Owner + Tech Lead | Tech Lead            | [DB doc](templates/database.md) |
| **Security Policy / Control**            | Security Lead     | Tech Lead            | —                    | [Threat Model](templates/threat-model.md) |
| **Feature Scope / Prioritization**       | Any team member   | Product Owner        | Tech Lead (technical)| [Feature spec](templates/feature.md) |
| **Release Go/No-Go**                     | Release Manager   | Tech Lead + QA + PO  | Any approver         | [Release doc](templates/release.md) |
| **Checkpoint Completion**                | Tech Lead         | Tech Lead + QA + PO  | Any approver         | [Checkpoint](templates/checkpoint.md) |
| **Hotfix Deployment**                    | Any engineer      | Tech Lead OR SecLead | —                    | Post-mortem + [Release](templates/release.md) |
| **Template / Process Change**            | Any team member   | Tech Lead            | —                    | PR + meeting notes       |

### Decision-Making Process

1. **Propose** — Author creates a proposal (ADR, feature spec, or PR description)
2. **Discuss** — Team reviews async via PR comments or sync via meeting
3. **Decide** — Approver(s) make the final call per the matrix above
4. **Record** — Decision is documented in the appropriate template
5. **Communicate** — Decision is shared with affected parties

---

## 5. Onboarding Checklist for New Owners

When a new team member is assigned ownership of a directory:

- [ ] Add to the Directory Ownership Map (Section 1)
- [ ] Update `CODEOWNERS` file (Section 2.2)
- [ ] Grant appropriate repository permissions
- [ ] Schedule knowledge transfer with outgoing owner
- [ ] Review all open PRs and issues for the owned area
- [ ] Read existing ADRs, threat models, and feature specs for the module
- [ ] Familiarize with [templates/](templates/) and development workflow

---

> **Maintenance:** This file should be updated whenever team composition changes or ownership transfers occur. Changes to `OWNERS.md` require Tech Lead approval.
