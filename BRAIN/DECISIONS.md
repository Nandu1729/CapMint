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
*   **Consequences:** Capacity can only be consumed against a cryptographically verified certifier authorization. Verified: the compliance suite still passes 52/52 (CPQ-11..14) and an ACTIVE budget bearing `sig_default` is now rejected at drawdown with `consumed_quantity` unchanged. Note: rotating `CERTIFIER_PRIVATE_KEY` now also requires updating the seeded certifier public key (cpq/auth seeds), or activation signatures will no longer verify. Extended: fail-closed signature verification is now applied on ALL capacity-consuming paths — `cpq` drawdown, `mint-service` `/mint`, and `verification-service` `/verify/register` (both explicit-lot and quick paths) — via a per-service `verifyBudgetAuthority` helper. Verified: a `sig_default` budget is rejected (400 `INVALID_SIGNATURE`) at mint and register with `consumed_quantity` unchanged, and the compliance suite remains 52/52.

---

## D-010: Authenticated Transparency Ledger Writes and Integration Lookups

*   **Status:** APPROVED
*   **Context:** SEC-02/API-03 found the transparency-service append endpoints (`POST /api/v1/log`, `/log/api/v1/log`) and the integration-service AgriStack/TraceNet lookups had no authentication — making the tamper-evidence ledger world-writable and the registry lookups openly enumerable.
*   **Decision:** Registered `@fastify/jwt` on both services and gated the ledger append routes and both integration lookups behind an `authenticate` guard. Ledger READ routes (`/entries`, `/verify`) remain public so the chain stays independently verifiable. Because `verification-service` appends to the ledger server-side at ~9 call sites, it now signs a lightweight service token (HS256 over the shared `JWT_SECRET`) and sends it on those calls; the operator UI sends the user's token on its `appendToLedger` calls.
*   **Consequences:** Ledger entries can no longer be forged by an unauthenticated network client. Verified: `POST /log` without a token returns 401, reads still return 200, integration lookups return 401 without a token, and the compliance suite passes 52/52 (LAB-04's `LOT_LAB_TEST_REPLACED` audit event is written via the service token). Follow-up: the service token is unexpiring and shares the user JWT secret — a dedicated service credential or mTLS is the longer-term hardening.

---

## D-011: Temporary Tenant Authorization Containment

*   **Status:** APPROVED AND IMPLEMENTED
*   **Context:** Before explicit profile ownership columns can be introduced, several private operational routes trusted resource identifiers without consistently constraining them to the authenticated organization. This allowed cross-tenant budget, lot, mint, export, certification, revocation, and investigation access. Operational lot and unit-code lists were also public. The current database has no trusted lot-to-laboratory assignment.
*   **Decision:** As a temporary C0 containment measure, private producer resources require `producer_id = jwt.orgId`, certifier resources derive through `budget.certifier_id = jwt.orgId`, and investigations derive through unit code, lot, and budget ownership. Mutations lock and authorize the private resource before changing state. Inaccessible private IDs return 404, while actor type and role failures return 403. Only `SYSTEM_ADMINISTRATOR` users with the `ADMIN` role receive explicitly defined global operational access. Laboratory-result mutations fail closed with `403 LAB_ASSIGNMENT_REQUIRED` after authenticated, active-laboratory validation and before report processing or state changes. Public scan, resolver, and ledger-read routes remain public.
*   **Consequences:** Confirmed cross-tenant operational paths are contained without changing JWT claims, Ed25519 messages, schema, provenance IDs, capacity locking, or public verification behavior. Laboratory writes are temporarily unavailable until a trusted assignment relationship is added. The equal-ID predicates are explicitly temporary and must be replaced by `profile.organization_id` joins in DM-03 Phase C3.
*   **Verification:** Type checks passed for CPQ, mint, verification, and e2e projects. CPQ, mint, and verification unit suites passed 7/7 total. A disposable-database HTTP integration suite passed 7/7 scenarios covering cross-tenant denials with unchanged database/ledger snapshots, same-tenant success paths, scoped lists/exports, exact laboratory fail-closed behavior, and intentional public reads. The destructive legacy compliance suite was not run.

---

## D-012: State-Aware Migration Provenance and Immutable Baseline

*   **Status:** APPROVED AND IMPLEMENTED
*   **Context:** Migration files `0007` and `0009` could have exact effects present without ledger rows, `schema.sql` omitted the producer-branding trigger, and the legacy runner assumed a pre-existing schema. Blind history inserts would misstate provenance, while rerunning historical DDL could conflict with already-correct databases.
*   **Decision:** Forward migrations remain authoritative. The migration ledger now distinguishes `LEGACY`, `EXECUTED`, `ADOPTED`, and `BASELINE` provenance with immutable file checksums and adoption evidence fingerprints. Exact effects may be adopted only through deterministic state verifiers. Drift is repaired by forward migration `0010`, not by rewriting `0007` or `0009`. Completely empty databases use the immutable `capmint-baseline-20260725-cutoff-0009` artifact, record one baseline row, then run migrations newer than the cutoff. `schema.sql` is a version-labelled, CI-compared snapshot rather than a migration input for existing databases.
*   **Consequences:** Existing filename-only rows remain truthful `LEGACY` records. Normal apply fails closed on checksum mismatch, missing files, incompatible partial state, and concurrent execution. Baseline bootstrap contains schema only; seed data remains separate. Released baselines cannot be edited and future schema evolution requires numbered forward migrations.
*   **Verification:** Runner syntax and focused unit tests pass. A disposable PostgreSQL suite covers empty bootstrap, explicit adoption, supported and refused reconciliation states, checksum mismatch, missing logged files, advisory locking, idempotency, and normalized baseline/snapshot/forward schema equality. The development database was inspected read-only and was not mutated.

---

## D-013: Disposable Tenant-Scoped Compliance Baseline

*   **Status:** APPROVED AND IMPLEMENTED
*   **Context:** D-011 intentionally made operational lists and exports private and disabled laboratory writes until DM-03 provides a trusted lot assignment. The legacy HTTP suite still called private lot lists anonymously, treated the laboratory API as available, hid fatal execution errors behind a zero exit code, and could truncate the configured development ledger. Reconciliation also exposed that explicit lot creation reserved budget capacity without re-verifying the certifier signature.
*   **Decision:** The comprehensive suite now refuses to truncate any database outside the `capmint_suite_` namespace, propagates fatal and assertion failures, reports PASS/PENDING/FAIL separately, and runs through a harness that bootstraps exact-name disposable PostgreSQL databases, reserves an empty Redis logical database, starts a dedicated alternate-port stack, and always tears down its owned resources. Private list/export assertions authenticate and prove owner visibility, cross-tenant non-visibility, unauthenticated rejection, mutation denial, and unchanged state. Five laboratory validation assertions remain counted as `PENDING` behind the DM-03 lab-to-lot assignment, with an active exact `LAB_ASSIGNMENT_REQUIRED` gate assertion. Every capacity-consuming path, including explicit lot reservation, now fails closed on an invalid Ed25519 budget signature.
*   **Consequences:** The historical fixed “52/52” claim is replaced by an exact executable baseline of 83 active assertions, 5 explicit pending assertions, and 0 failures. Public scan, GS1 resolver, and ledger-read behavior remains intentionally unauthenticated. The suite is opt-in locally and mandatory in CI against disposable infrastructure. The laboratory pending set must be restored to active coverage when DM-03 implements trusted assignment.
*   **Verification:** A focused disposable containment suite passed 8/8. The full compliance harness passed twice against two independently bootstrapped disposable databases with 83 PASS, 5 PENDING, and 0 FAIL on each run. Teardown left no disposable databases or test-stack listeners.

---

## D-014: Explicit Administrator Bootstrap and Development Fixtures

*   **Status:** APPROVED AND IMPLEMENTED
*   **Context:** The schema-only cutoff-0009 baseline intentionally skips legacy seed migration 0006. Auth and CPQ startup nevertheless created known-password users, a compromised-key certifier, and a placeholder-signature budget in any environment. The standalone seed SQL duplicated the same unsafe legacy material, and fixed fixture UUIDs conflicted semantically with 0006.
*   **Decision:** Schema bootstrap remains data-free and production has no default domain/reference records. The first system administrator is created only through an explicit, migration-state-checked, advisory-locked command that commits the organization, user, and `SYSTEM_ADMIN_BOOTSTRAPPED` audit event atomically. Auth and CPQ startup perform no seed DML. Development/test identities and a valid signed demo budget are created only through an explicitly enabled, allowlisted command that validates a supplied Ed25519 pair, rejects the compromised key fingerprint, refuses mixed state, and is a no-op only on an exact fixture match.
*   **Consequences:** New environments have no known default credential, private signing key, default certifier, producer, or budget. Legacy 0006 and released baselines remain immutable; existing databases are not automatically altered. Forced first-login rotation is not claimed because the current schema/API cannot enforce it. Existing weak credentials and compromised-key budget relationships remain a separately governed incident.
*   **Verification:** Disposable PostgreSQL tests cover first-admin creation/refusal, weak/missing secrets, legacy/existing/partial administrator states, environment and key gates, signed fixture idempotency, fail-closed partial fixtures, production startup with zero seed DML, and static secret-pattern checks. The F1 harness consumes the explicit fixture command and retains its exact 83 PASS / 5 PENDING / 0 FAIL contract.
