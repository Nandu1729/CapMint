# Change Management

This document outlines the change management process, database migration rules, and Git branching policies that protect the stability and performance of the CapMint platform.

---

## 1. Code Branching & Review Policy

CapMint enforces a strict branching model to isolate development and prevent regression bugs:

*   **`main` Branch:** Represents the stable production state. Direct commits to `main` are strictly prohibited.
*   **`develop` Branch:** Integration branch for upcoming releases. All feature pull requests merge here first.
*   **`feature/*` Branches:** Individual tasks (e.g. `feature/auth`). Created by developers; require review before merging.
*   **PR Requirements:** Pull requests must obtain at least one senior developer approval, compile successfully, and pass all unit/E2E test suites in CI/CD pipelines.

---

## 2. Database Migrations

Direct schema alterations on live databases are prohibited. All database changes must follow this workflow:

1.  **SQL Scripting:** Changes must be written as incremental SQL scripts under `database/migrations/` (naming pattern: `YYYYMMDDHHMMSS_migration_name.sql`).
2.  **Idempotence:** Scripts must be idempotent (using `IF NOT EXISTS` or `CREATE OR REPLACE` commands).
3.  **Local Testing:** Migrations must run and pass locally before staging.
4.  **Rollback Script:** Every migration script must be accompanied by a matching rollback SQL script.

---

## 3. Environment & Variables Control

*   **Configuration Drift:** Secrets, database URIs, and integration keys must never be hardcoded.
*   **Deployment Templates:** Changes in environment variables require updating the environment file templates (`.env.example`) and deployment manifests before push.
