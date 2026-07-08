# Database Schema: `[table_name]`

> **Database Schema Documentation** — CapMint Anti-Counterfeiting Platform

---

## Overview

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Table Name**     | `[schema].[table_name]` <!-- e.g., public.labels -->         |
| **Module**         | <!-- e.g., auth, labeling, verification, blockchain -->      |
| **Purpose**        | <!-- What data does this table store and why? -->            |
| **Introduced In**  | [CP-NNN](../checkpoints/CP-NNN.md)                          |
| **Last Modified**  | [CP-NNN](../checkpoints/CP-NNN.md) — YYYY-MM-DD             |
| **Owner**          | @[github-handle]                                             |
| **Row Estimate**   | <!-- Expected scale: ~10K, ~1M, ~100M+ rows -->             |

---

## 1. Columns

| # | Column Name       | Type                | Nullable | Default              | Description                                      | Constraints                          |
|---|-------------------|---------------------|----------|----------------------|--------------------------------------------------|--------------------------------------|
| 1 | `id`              | `UUID`              | NO       | `gen_random_uuid()`  | Primary key                                      | `PK`                                 |
| 2 | `created_at`      | `TIMESTAMPTZ`       | NO       | `NOW()`              | Row creation timestamp                           |                                      |
| 3 | `updated_at`      | `TIMESTAMPTZ`       | NO       | `NOW()`              | Last modification timestamp (auto-updated)       |                                      |
| 4 | `[column_name]`   | `[TYPE]`            | YES/NO   | `[default]`          | <!-- Description of what this column stores -->  | <!-- FK, UNIQUE, CHECK, etc. -->     |
| 5 | `[column_name]`   | `[TYPE]`            | YES/NO   | `[default]`          | <!-- Description -->                             | <!-- Constraints -->                 |

**Supported Types Reference:** `UUID`, `TEXT`, `VARCHAR(N)`, `INTEGER`, `BIGINT`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB`, `BYTEA`, `NUMERIC(P,S)`, `ENUM(...)`, `ARRAY[TYPE]`

## 2. Keys

### Primary Key

```sql
CONSTRAINT pk_[table_name] PRIMARY KEY (id)
```

### Foreign Keys

| Constraint Name              | Column(s)         | References                    | On Delete      | On Update      |
| ---------------------------- | ----------------- | ----------------------------- | -------------- | -------------- |
| `fk_[table]_[ref_table]`    | `[column]`        | `[ref_table].[ref_column]`    | `CASCADE` / `SET NULL` / `RESTRICT` | `CASCADE`      |

### Unique Constraints

| Constraint Name              | Column(s)                        | Description                     |
| ---------------------------- | -------------------------------- | ------------------------------- |
| `uq_[table]_[columns]`      | `[col1], [col2]`                 | <!-- Why this must be unique --> |

### Check Constraints

| Constraint Name              | Expression                       | Description                     |
| ---------------------------- | -------------------------------- | ------------------------------- |
| `ck_[table]_[rule]`         | `[column] > 0`                   | <!-- Business rule -->          |

## 3. Indexes

| Index Name                   | Column(s)             | Type       | Unique | Partial Condition     | Purpose                          |
| ---------------------------- | --------------------- | ---------- | ------ | --------------------- | -------------------------------- |
| `idx_[table]_[columns]`     | `[col1], [col2]`      | `BTREE`    | No     | —                     | <!-- Query pattern served -->    |
| `idx_[table]_[column]_gin`  | `[jsonb_col]`         | `GIN`      | No     | —                     | JSONB containment queries        |
| `idx_[table]_[column]_part` | `[col]`               | `BTREE`    | No     | `WHERE status = 'active'` | Filter on active records only |

## 4. Relationships

```
┌─────────────────────┐         ┌─────────────────────┐
│  [parent_table]      │ 1───M  │  [this_table]        │
│                     │         │                     │
│  id (PK)            │────────▶│  parent_id (FK)      │
└─────────────────────┘         └─────────────────────┘
                                        │
                                        │ 1───M
                                        ▼
                                ┌─────────────────────┐
                                │  [child_table]       │
                                │                     │
                                │  this_table_id (FK)  │
                                └─────────────────────┘
```

<!-- Replace the diagram above with actual table relationships.
     Document cardinality: 1:1, 1:M, M:M (with junction table). -->

| Relationship             | Type  | Related Table          | Via Column          | Notes                      |
| ------------------------ | ----- | ---------------------- | ------------------- | -------------------------- |
| <!-- Description -->     | 1:M   | `[related_table]`      | `[fk_column]`       | <!-- Additional notes -->  |
| <!-- Description -->     | M:M   | `[related_table]`      | `[junction_table]`   | <!-- Junction details -->  |

## 5. Sample Data

```sql
INSERT INTO [schema].[table_name] ([col1], [col2], [col3])
VALUES
  ('value1', 'value2', 'value3'),
  ('value4', 'value5', 'value6');
```

| id (truncated) | [col1]    | [col2]    | [col3]         | created_at               |
| -------------- | --------- | --------- | -------------- | ------------------------ |
| `a1b2c3...`    | `value1`  | `value2`  | `value3`       | `2026-07-08T00:00:00Z`   |
| `d4e5f6...`    | `value4`  | `value5`  | `value6`       | `2026-07-08T00:00:00Z`   |

## 6. Migration Notes

### Current Migration

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Migration File** | `migrations/[YYYYMMDDHHMMSS]_create_[table].sql`    |
| **Direction**      | `UP` — Creates table, indexes, and constraints       |
| **Reversible**     | Yes / No                                             |
| **Data Migration** | Yes / No — <!-- describe if data needs transformation --> |

### Migration History

| Version            | Date       | Change Description                               | Author     |
| ------------------ | ---------- | ------------------------------------------------ | ---------- |
| `[timestamp]`      | YYYY-MM-DD | Initial table creation                           | @[handle]  |
| `[timestamp]`      | YYYY-MM-DD | <!-- e.g., Added column X, dropped index Y -->   | @[handle]  |

### Rollback

```sql
-- DOWN migration: reverse the changes above
-- DROP TABLE IF EXISTS [schema].[table_name] CASCADE;
```

## 7. Access Patterns

<!-- Document the primary query patterns that drive index design. -->

| Pattern                          | Query Type | Frequency    | Index Used                  |
| -------------------------------- | ---------- | ------------ | --------------------------- |
| <!-- e.g., "Get label by ID" --> | `SELECT`   | Very High    | `pk_[table_name]`          |
| <!-- e.g., "List by status" -->  | `SELECT`   | High         | `idx_[table]_status`       |
| <!-- e.g., "Search by text" -->  | `SELECT`   | Medium       | `idx_[table]_[col]_gin`    |

---

## Related Documents

- **Feature Spec:** [feature-name.md](../docs/features/feature-name.md)
- **API Doc:** [api-endpoint.md](../docs/api/api-endpoint.md)
- **ADR:** [ADR-NNN](../docs/adr/ADR-NNN.md)
- **Threat Model:** [threat-model.md](../docs/security/threat-model.md) <!-- data security considerations -->

---

> **Usage:** Copy this template → rename to `[table_name].md` → fill all sections → update when schema changes via migration.
