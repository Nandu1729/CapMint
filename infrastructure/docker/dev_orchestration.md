# CapMint — Local Dev Orchestration (CP-004.2)

## 1. Executive Summary

This document represents the deliverables for **CP-004.2 (Local multi-container dev orchestration)** under the Infrastructure phase. It details the runtime configurations, helper scripts, and local workflows designed to enable developers to orchestrate, debug, and monitor the CapMint container environment.

---

## 2. Dev Runner Script: `scripts/dev.sh`

To simplify standard container operations, a bash helper script has been created at [dev.sh](file:///Users/nandyyy/project/CapMint/scripts/dev.sh). It wraps common Docker commands and performs sanity checks (e.g. verifying that the Docker daemon is active).

### 2.1 Available Commands

-   **Start environment**: Spins up Postgres, Redis, and Gateway in detatched background mode:
    ```bash
    ./scripts/dev.sh up
    ```
-   **Stop and purge**: Stops active containers and deletes mapped volumes (resetting database tables):
    ```bash
    ./scripts/dev.sh down
    ```
-   **Restart services**: Restarts containers without dropping volumes:
    ```bash
    ./scripts/dev.sh restart
    ```
-   **View logs**: Streams aggregated stdout/stderr logs from all containers:
    ```bash
    ./scripts/dev.sh logs
    ```
-   **Check status**: Inspects the health check outcome of PostgreSQL and Redis:
    ```bash
    ./scripts/dev.sh status
    ```

---

## 3. Environment Variables Configuration

The template file [.env.example](file:///Users/nandyyy/project/CapMint/.env.example) has been set up at the repository root. To initialize the environment:

1.  Copy the example to a local `.env` file:
    ```bash
    cp .env.example .env
    ```
2.  Adjust host settings or keys (e.g. `JWT_SECRET`). The container configurations automatically read parameters to configure port mapping and database credentials.

---
*End of dev_orchestration.md*
