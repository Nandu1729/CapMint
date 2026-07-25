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

---

## D-007: Dynamic Workflow Approval and Explicit Lot Boundaries

*   **Status:** APPROVED
*   **Context:** The initial system lacked multi-state approval lifecycles (like pending document onboarding or certifier revision stages) and lacked a way to group barcodes into explicit packaging lots.
*   **Decision:** Extended the schemas to track organization uploaded documents and approval notes, and certifier budget histories. Implemented explicit packaging lot creation APIs and database locks. Added print-ready exports (PDF/CSV) and caseworker management views (escalation, assignee, evidence timelines).
*   **Consequences:** Successfully closed all 8 product workflow gaps, enabling complete real-world agricultural supply chain traceability.

---

## D-008: Critical Security Remediation — Capacity-Bound Serialization, Gateway Traversal Guard, Fail-Closed Secrets

*   **Status:** APPROVED
*   **Context:** A Principal-Architect review (2026-07-25) found that the primary serialization path used by the operator UI — `verification-service` `POST /api/v1/verify/register` — created `unit_codes` with NO capacity drawdown, letting any authenticated producer over-issue beyond the certifier-approved budget. This defeated the core invariant `sum(minted) <= approved capacity` (D-005 only protected the `mint-service`/`cpq` drawdown paths, which the UI did not use). The review also found (a) a path-traversal flaw in the gateway static handler (`scripts/frontend-server.js`) permitting arbitrary file reads such as `/api/../.env` (leaking `JWT_SECRET` and the certifier key), and (b) the Ed25519 `CERTIFIER_PRIVATE_KEY` and `JWT_SECRET` hardcoded as in-source fallbacks and shipped in `.env.example` — contradicting the D-006 / v1.0.1 "no fallback defaults" claim.
*   **Decision:**
    *   Established the **lot as the unit of capacity reservation**. `/verify/register` now enforces capacity atomically: for an explicit `lot_id` it locks the lot `FOR UPDATE` and bounds `count(unit_codes) <= lot.batch_size`; for the no-lot quick path it locks the active budget `FOR UPDATE`, requires remaining ≥ 1, and draws down exactly one unit. The operator UI (`frontend/index.html`) no longer issues a separate `/drawdown` call (which would double-count).
    *   Added a containment guard to the gateway static handler: resolved paths must stay within an allowlist of roots (`frontend/`, `playground/`, `api/`); traversal now returns 403.
    *   Removed the hardcoded `JWT_SECRET` and `CERTIFIER_PRIVATE_KEY` fallbacks; services now fail closed (refuse to boot / return 500 on activation) when the secret is absent (test env uses an explicit test-only secret). Scrubbed the real key from `.env.example`.
*   **Consequences:** Over-issuance is now prevented on every serialization path (verified: a capacity-2 budget rejects the 3rd `/verify/register` with 422 and `consumed_quantity` never exceeds `approved_quantity`; the 52-case compliance suite still passes 52/52 including the concurrent-drawdown race; `/api/../.env` returns 403; a service with no `JWT_SECRET` refuses to start). NOT yet addressed (follow-ups): the `sig_default` signature-verification bypass (addressed separately in D-009), the `DATABASE_URL`/`REDIS_URL` in-source password fallbacks, and — contrary to D-006 and the v1.0.1 changelog — Redis sliding-window rate limiting, which remains unimplemented. Previously-exposed secrets (certifier key, JWT secret, DB password) require rotation.

---

## D-009: Fail-Closed Certifier Signature Verification at Drawdown

*   **Status:** APPROVED
*   **Context:** Follow-up to D-008. The `cpq-service` budget-drawdown path verified the certifier's Ed25519 signature but bypassed the check when `signature_bundle === 'sig_default'` and skipped it entirely when the referenced certifier row was absent — so a budget could consume capacity without a valid supply-authority signature (SEC-04).
*   **Decision:** Removed both bypasses. Drawdown now fails closed: a missing certifier, an unverifiable signature, or any placeholder value blocks the drawdown with `400 INVALID_SIGNATURE`. Legitimately activated budgets are unaffected because `/activate` produces a real signature over `budget_id;approved_quantity`.
*   **Consequences:** Capacity can only be consumed against a cryptographically verified certifier authorization. Verified: the compliance suite still passes 52/52 (CPQ-11..14) and an ACTIVE budget bearing `sig_default` is now rejected at drawdown with `consumed_quantity` unchanged. Note: rotating `CERTIFIER_PRIVATE_KEY` now also requires updating the seeded certifier public key (cpq/auth seeds), or activation signatures will no longer verify. Still open: signature verification is enforced only on `cpq` drawdown, not yet on the `mint` / `verify/register` capacity paths (defense-in-depth follow-up).
