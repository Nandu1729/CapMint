# Folder Index: Database Blueprint [DATABASE-INDEX]

This directory maps the logical relational database blueprint, entity models, schema definitions, and validation checks.

## 1. Canonical Documents

| Document | Purpose | Canonical Owner | Related Documents | Stable Section Identifiers |
|---|---|---|---|---|
| **[erd/erd.md](erd/erd.md)** | Entity relationship diagrams and primary tables catalog. | Database Architect | [schema/schema.sql](schema/schema.sql) | None |
| **[erd/entity_catalog.md](erd/entity_catalog.md)** | Detailed mapping of tables, columns, constraints, and datatypes. | Database Architect | [erd/erd.md](erd/erd.md) | None |
| **[erd/domain_discovery.md](erd/domain_discovery.md)** | Logical domain entities and descriptions. | Database Architect | None | None |
| **[erd/domain_relationships.md](erd/domain_relationships.md)** | Structural foreign key maps and join behaviors. | Database Architect | [erd/erd.md](erd/erd.md) | None |
| **[erd/state_machines.md](erd/state_machines.md)** | Budgets, Lots, and Unit state machine mapping. | Database Architect | [sequence/DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md) | None |
| **[erd/business_rules_mapping.md](erd/business_rules_mapping.md)** | Budget capacity constraints and cascading logic. | Database Architect | None | None |
| **[erd/checkpoint_review.md](erd/checkpoint_review.md)** | Pre-development schema reviews and quality logs. | Database Architect | None | None |

---

## 2. SQL Schemas

The physical schema files exist in the database folder structure:
*   **[schema/schema.sql](schema/schema.sql)** - Canonical DDL schema script creating tables, constraints, checks, and foreign keys.
