# Folder Index: Database Blueprint [DATABASE-INDEX]

This directory maps the logical relational database blueprint, entity models, schema definitions, and validation checks.

## 1. Canonical Documents

| Document | Purpose | Canonical Owner | Related Documents | Stable Section Identifiers |
|---|---|---|---|---|
| **[DATABASE_BLUEPRINT.md](DATABASE_BLUEPRINT.md)** | Consolidated entity database schemas, relationships, state lifecycles, triggers, and rules mapping. | Database Architect | [schema/schema.sql](schema/schema.sql) | `[DB-001]` to `[DB-008]` |

---

## 2. SQL Schemas

The physical schema files exist in the database folder structure:
*   **[schema/schema.sql](schema/schema.sql)** - Canonical DDL schema script creating tables, constraints, checks, and foreign keys.

---

## 3. Section Identifier Mappings

### DATABASE_BLUEPRINT Section Identifiers
- `[DB-001]` : [1. Executive Summary](DATABASE_BLUEPRINT.md#1-executive-summary-db-001)
- `[DB-002]` : [2. Business Domain Discovery](DATABASE_BLUEPRINT.md#2-business-domain-discovery-db-002)
- `[DB-003]` : [3. Entity Catalog](DATABASE_BLUEPRINT.md#3-entity-catalog-db-003)
- `[DB-004]` : [4. Domain Relationships](DATABASE_BLUEPRINT.md#4-domain-relationships-db-004)
- `[DB-005]` : [5. Visual Entity Relationship Diagram](DATABASE_BLUEPRINT.md#5-visual-entity-relationship-diagram-db-005)
- `[DB-006]` : [6. Entity State Machines](DATABASE_BLUEPRINT.md#6-entity-state-machines-db-006)
- `[DB-007]` : [7. Business Rules & Constraints Mapping](DATABASE_BLUEPRINT.md#7-business-rules--constraints-mapping-db-007)
- `[DB-008]` : [8. Checkpoint Review Logs](DATABASE_BLUEPRINT.md#8-checkpoint-review-logs-db-008)
