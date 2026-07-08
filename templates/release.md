# Release: v[MAJOR.MINOR.PATCH]

> **Release Document** — CapMint Anti-Counterfeiting Platform

---

## Release Overview

| Field                | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| **Version**          | `v[MAJOR.MINOR.PATCH]` <!-- Semantic versioning -->            |
| **Release Date**     | YYYY-MM-DD                                                     |
| **Release Branch**   | `release/v[MAJOR.MINOR.PATCH]`                                 |
| **Release Tag**      | `v[MAJOR.MINOR.PATCH]`                                         |
| **Release Type**     | `Major` · `Minor` · `Patch` · `Hotfix`                         |
| **Checkpoint(s)**    | [CP-NNN](../checkpoints/CP-NNN.md)                             |
| **Release Manager**  | @[github-handle]                                               |
| **Status**           | `DRAFT` · `RC` · `RELEASED` · `ROLLED_BACK`                    |

**Release Type Guide:**
- **Major:** Breaking changes, architectural shifts, major new capabilities
- **Minor:** New features, non-breaking API additions
- **Patch:** Bug fixes, security patches, minor improvements
- **Hotfix:** Emergency production fix outside normal release cycle

---

## 1. Summary of Changes

<!-- High-level overview of what this release delivers. 2-3 paragraphs max. -->

## 2. Features

| Feature                          | Module       | Checkpoint | PR(s)   | Description                      |
| -------------------------------- | ------------ | ---------- | ------- | -------------------------------- |
| <!-- e.g., "QR Label Gen" -->    | labeling     | CP-[NNN]   | #[PR]   | <!-- Brief description -->       |
| <!-- Feature 2 -->               | <!-- mod --> | CP-[NNN]   | #[PR]   | <!-- Brief description -->       |

## 3. Bug Fixes

| Bug ID        | Title                          | Severity | Module       | PR      |
| ------------- | ------------------------------ | -------- | ------------ | ------- |
| BUG-[NNN]    | <!-- Bug title -->              | S[0-3]   | <!-- mod --> | #[PR]   |
| BUG-[NNN]    | <!-- Bug title -->              | S[0-3]   | <!-- mod --> | #[PR]   |

## 4. Improvements & Refactors

| Change                           | Module       | PR      | Description                      |
| -------------------------------- | ------------ | ------- | -------------------------------- |
| <!-- e.g., "Perf optimization" -->| <!-- mod --> | #[PR]   | <!-- Brief description -->       |

## 5. Breaking Changes

> ⚠️ **Action Required:** The following changes are not backward-compatible.

| Change                           | Module       | Impact                            | Migration                        |
| -------------------------------- | ------------ | --------------------------------- | -------------------------------- |
| <!-- e.g., "Removed /v1/old" --> | api          | <!-- Who/what is affected -->     | See Migration Guide §6 below    |

<!-- If no breaking changes, replace with: "No breaking changes in this release." -->

## 6. Migration Guide

<!-- Step-by-step instructions for upgrading from the previous version. -->

### 6.1 Prerequisites

- <!-- e.g., "Node.js >= 20.x" -->
- <!-- e.g., "PostgreSQL >= 16" -->
- <!-- e.g., "Backup database before proceeding" -->

### 6.2 Database Migrations

```bash
# Run pending migrations
npm run migrate:up

# Verify migration status
npm run migrate:status
```

**Migration Files:**

| Migration                                  | Description                          | Reversible |
| ------------------------------------------ | ------------------------------------ | ---------- |
| `[YYYYMMDDHHMMSS]_[description].sql`      | <!-- What this migration does -->    | Yes / No   |

### 6.3 Configuration Changes

| Variable / Config Key            | Change        | Old Value     | New Value    | Required |
| -------------------------------- | ------------- | ------------- | ------------ | -------- |
| `[ENV_VAR]`                      | Added/Changed | `[old]`       | `[new]`      | Yes / No |

### 6.4 API Changes

<!-- Document endpoint changes, deprecated endpoints, and new required headers. -->

| Endpoint                  | Change                    | Action Required                   |
| ------------------------- | ------------------------- | --------------------------------- |
| `[METHOD] /api/v[N]/...` | Deprecated / Modified     | <!-- Migration instructions -->   |

## 7. Deployment Checklist

> **Execute items in order.** Check each item as completed.

### Pre-Deployment

- [ ] Release branch created and frozen
- [ ] All checkpoint quality gates passed ([CP-NNN](../checkpoints/CP-NNN.md))
- [ ] Changelog reviewed and finalized
- [ ] Database backup completed
- [ ] Configuration changes prepared
- [ ] Monitoring alerts configured for rollout
- [ ] Stakeholders notified of deployment window

### Deployment

- [ ] Database migrations executed successfully
- [ ] Application deployed to staging
- [ ] Smoke tests passed on staging
- [ ] Application deployed to production
- [ ] Health checks passing
- [ ] DNS / load balancer verified

### Post-Deployment

- [ ] Smoke tests passed on production
- [ ] API endpoints responding correctly
- [ ] Monitoring dashboards nominal
- [ ] Error rate within acceptable threshold (< [N]%)
- [ ] Performance metrics within baseline
- [ ] Release tag created and pushed
- [ ] Release notes published

## 8. Rollback Plan

### Rollback Trigger Criteria

<!-- Define when a rollback should be initiated. -->

- Error rate exceeds [N]% for > [N] minutes
- P0 bug discovered with no immediate fix
- Data integrity issue detected
- Core feature completely non-functional

### Rollback Steps

1. <!-- Step 1: e.g., "Revert application to previous image/tag" -->
2. <!-- Step 2: e.g., "Run rollback migration: `npm run migrate:down`" -->
3. <!-- Step 3: e.g., "Restore configuration to previous values" -->
4. <!-- Step 4: e.g., "Verify health checks and smoke tests" -->
5. <!-- Step 5: e.g., "Notify stakeholders of rollback" -->

### Rollback Limitations

<!-- Document any cases where rollback is not straightforward. -->

- <!-- e.g., "Data migration X is not reversible — requires manual data repair" -->

## 9. Verification

### Smoke Test Results

| Test                            | Environment | Result | Notes                     |
| ------------------------------- | ----------- | ------ | ------------------------- |
| <!-- e.g., "Auth flow" -->      | Staging     | ✅ / ❌ |                           |
| <!-- e.g., "Label creation" --> | Staging     | ✅ / ❌ |                           |
| <!-- e.g., "Auth flow" -->      | Production  | ✅ / ❌ |                           |

### Performance Verification

| Metric                  | Baseline (prev)  | This Release    | Status     |
| ----------------------- | ---------------- | --------------- | ---------- |
| **p95 Latency**         | [N]ms            | [N]ms           | ✅ / ⚠️ / ❌ |
| **Throughput**           | [N] req/s        | [N] req/s       | ✅ / ⚠️ / ❌ |
| **Error Rate**           | [N]%             | [N]%            | ✅ / ⚠️ / ❌ |

---

## Approval

| Role               | Name            | Date       | Sign-off |
| ------------------ | --------------- | ---------- | -------- |
| **Release Manager**| @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Tech Lead**      | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **QA Lead**        | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Product Owner**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |

---

> **Usage:** Copy this template → rename to `v[MAJOR.MINOR.PATCH].md` → fill progressively during release prep → complete verification post-deployment.
