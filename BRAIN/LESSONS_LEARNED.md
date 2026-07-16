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
