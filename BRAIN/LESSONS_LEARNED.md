# Lessons Learned

This document records the engineering lessons learned, optimization findings, and workflow takeaways during the development and implementation of the CapMint platform.

---

## 1. Shared Cryptographic Library Integration

*   **Takeaway:** Packing cryptographic logic (such as `libsodium-wrappers` signature routines) inside a dedicated `@capmint/crypto` workspace package saved significant engineering time.
*   **Result:** By importing this package in both the `mint-service` (for verifying certifier signatures during lot registration) and the `verification-service` (for public verifier signatures validation), code duplication was reduced to zero.

---

## 2. Concurrency Safety & Database Locking

*   **Takeaway:** High-volume concurrent requests for quota allocation from the same budget will cause double-drawdown errors if left to simple application-layer checks.
*   **Result:** Implementing an explicit database row lock using `SELECT * FROM budgets WHERE id = $1 FOR UPDATE` blocks concurrent transactions from drawing from the same budget until the running transaction commits. This enforces quota integrity under load.

---

## 3. Microservice Network Overhead

*   **Takeaway:** Local Docker and Nginx environments are useful for emulation but add substantial startup, network resolution, and resource overhead for developers.
*   **Result:** Running standard microservices directly on native port ranges (`8080-8087`) using node run scripts increases startup speed, simplifies debugging, and allows seamless deployments to modern serverless runtimes.

---

## 4. Developer Authentication Bypass

*   **Takeaway:** Rigid authentication barriers block developers and reviewers from testing dashboard states without going through login, organization onboarding, and verification wizard loops.
*   **Result:** Injecting a simulated session bypass (`bypassLoginDev()`) coupled with a client-side Workspace Switcher `<select>` element in the user profile menu allowed immediate testing of all 5 tenant dashboard contexts without logging out or seeding dummy databases.

---

## 5. Strict Environment Injection & Telemetry Rate Limiting

*   **Takeaway:** Permitting hardcoded secrets, connection string fallbacks, and wildcard CORS headers inside development repositories introduces high-risk production leak vectors. Additionally, public routes without limiters can easily be spammed by bots.
*   **Result:** Hardened startup configurations by validating required variables (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `CERTIFIER_PRIVATE_KEY`) immediately on server start, throwing fatal errors if missing. Implemented Redis-backed sliding-window rate limiters utilizing atomic transactions (`multi()`) on the public login and verify paths, using configurable limits in `.env` to support rapid local integration tests.

---

## 6. Workflow Gap Closures & Real-world Flow Finalization

*   **Takeaway:** A system with complete security and basic features still needs realistic operational lifecycles (like pending document uploads, revision states, explicit lot boundaries, and caseworker details) to be viable for pilot users.
*   **Result:** Extended database schemas to track status history and caseworker assignment. Decoupled code serialization from explicit lot creation to draw down capacity budgets correctly, and enabled download capabilities for print-ready GS1 packages. Integrated caseworker dashboards showing chronological timeline histories, notes, escalations, and warnings, resulting in a cohesive enterprise-grade workflow.
