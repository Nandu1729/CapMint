# Architectural Decisions Log

This document records the key architectural decisions (ADRs) made during the design, development, and scaling of CapMint.

---

## D-001: Monorepo Workspaces Structure

*   **Status:** APPROVED
*   **Context:** Shared types, schemas, and helper packages must be distributed across 7 microservices without copy-pasting or publishing to public package registries.
*   **Decision:** We adopted `npm workspaces` in a single monorepo layout.
*   **Consequences:** Keeps shared logic localized in `packages/` (e.g. `@capmint/crypto` and `@capmint/database`) where it can be directly imported in `backend/*` configurations.

---

## D-002: Interactive Developer Bypass Switcher

*   **Status:** APPROVED
*   **Context:** Testing the 5 workspace dashboards (Producer, Lab, Certifier, Exporter, System Admin) required setting up multiple database records and authentication profiles.
*   **Decision:** Created a client-side dev bypass (`bypassLoginDev()`) that logs in a dummy session automatically and injected an interactive Workspace Switcher dropdown in the user header menu.
*   **Consequences:** Developers can instantly toggle the active dashboard view without requiring credentials or logging out.

---

## D-003: Pure Node Native Deployment

*   **Status:** APPROVED
*   **Context:** Many deployment platforms provide native load balancing, edge routing, and containers management, making custom local Nginx and Docker setups redundant.
*   **Decision:** Purged all Dockerfiles, docker-compose manifests, and nginx.conf files, moving all microservices to run directly on standard Node.js ports.
*   **Consequences:** Highly portable, fast startup times, and ready to deploy on any serverless or Node-compatible hosting provider.

---

## D-004: FIPS-compliant Cryptography

*   **Status:** APPROVED
*   **Context:** Organic certifications and capacity allocation budgets require cryptographic signatures to prevent tampering by administrators.
*   **Decision:** Utilized the Ed25519 signature algorithm (using libsodium-wrappers) for signing and verifying authorization envelopes.
*   **Consequences:** Extremely fast, constant-time validation that is resistant to side-channel analysis and complies with modern cryptographic standards.

---

## D-005: Database Row Locks

*   **Status:** APPROVED
*   **Context:** Multiple concurrent packaging lots drawing from the same budget cap could lead to over-issuance (race conditions).
*   **Decision:** Applied explicit database row locking (`SELECT ... FOR UPDATE`) during quota updates.
*   **Consequences:** Guarantees absolute capacity compliance under heavy transactional load at the cost of serialization queue delays.

---

## D-006: Environment-based Secrets & Sliding-Window Rate Limiting

*   **Status:** APPROVED
*   **Context:** Hardcoded fallback values, hardcoded keys, and wildcard CORS headers create security leak surfaces in production. Also, public auth and scan lookup endpoints require defense against spambots.
*   **Decision:** Enforced strict environment variable assertions on startup (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `CERTIFIER_PRIVATE_KEY`) with no fallback defaults, and locked down CORS to the trusted origin. Implemented Redis-backed sliding-window rate limiters utilizing sorted sets (`ZADD`, `ZCARD`) on `/login` and `/verify` public endpoints, with configurable max limits in `.env` to support local testing.
*   **Consequences:** Complete alignment with zero trust security guidelines and robust protection against brute-force attacks, while allowing custom testing tolerances.
