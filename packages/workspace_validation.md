# CapMint — Workspace Validation (CP-005.1)

## 1. Executive Summary

This document represents the deliverables for **CP-005.1 (Workspace validation check)** under the Development Ready phase. It defines the npm workspaces architecture, package layouts, dependencies boundaries, and build scripts for the CapMint monorepo.

---

## 2. Monorepo Workspaces Layout

The monorepo is structured into shared packages (in `packages/`) and independent microservices (in `services/`):

```
capmint/
├── package.json               # Workspaces master definition
├── packages/                  # Shared libraries
│   ├── config/                # Shared env parser and config loader
│   ├── sdk/                   # Software Development Kit for integration
│   ├── shared/                # Shared helper functions
│   ├── types/                 # Standard typescript typings
│   └── ui/                    # Reusable web interface UI components
└── services/                  # Microservices (14 services)
    ├── auth-service/          # Authentication profile manager
    ├── budget-service/        # Quota allocation registry
    ├── gateway-service/       # API router entry gateway
    ├── identity-service/      # Accreditation checks
    ├── mint-service/          # Unique QR minting engine
    ├── transparency-service/  # Immutable cryptographic blockchain log
    └── verification-service/  # Scan verification and geovelocity validator
```

---

## 3. Dependency Scope Invariants

To avoid circular references and dependency bloat:

1.  **Shared Packages Dependency Hierarchy**:
    -   `packages/types` must have zero external dependencies.
    -   `packages/config` loads configurations and variables.
    -   `packages/shared` can import `packages/types` and `packages/config`.
    -   `packages/sdk` can import `packages/types` and `packages/shared`.
2.  **Microservices Dependency Hierarchy**:
    -   Services can import shared libraries (`packages/*`).
    -   Services cannot import other services directly; all inter-service communications must route through the HTTP gateways or asynchronous queue brokers.

---

## 4. Root Operations Commands

All development operations are executed from the root of the project:

-   **Install dependencies**: Runs installation across workspaces:
    ```bash
    npm run bootstrap
    ```
-   **Start database containers**: Launches local PostgreSQL and Redis servers:
    ```bash
    npm run dev:infra
    ```
-   **Stop database containers**: Stops PostgreSQL and Redis servers:
    ```bash
    npm run down:infra
    ```
-   **Compile workspaces**: Triggers production builds across packages:
    ```bash
    npm run build
    ```
-   **Run tests**: Executes testing suites:
    ```bash
    npm run test
    ```

---
*End of workspace_validation.md*
