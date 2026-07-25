# CapMint Changelog

All notable changes to the CapMint platform will be documented in this file. This project adheres to Semantic Versioning (`vMAJOR.MINOR.PATCH`).

---

## [v1.0.3] - "Capacity Integrity" (2026-07-25)
Critical security remediation of the code-serialization capacity bypass, plus gateway and secret hardening.

### Security
- **Capacity-Bound Serialization (Critical)**: `POST /api/v1/verify/register` now enforces budget capacity atomically — explicit lots are bounded by `batch_size`, and the quick path draws down one unit under a row lock. Closes an over-issuance bypass on the primary UI serialization path. Verified with a direct over-issuance test and the full compliance suite (52/52).
- **Gateway Path-Traversal Guard (Critical)**: The static file handler in `scripts/frontend-server.js` now rejects paths outside an allowlist of roots; requests like `/api/../.env` return 403 instead of leaking secrets.
- **Fail-Closed Secrets (Critical)**: Removed the hardcoded `JWT_SECRET` and `CERTIFIER_PRIVATE_KEY` in-source fallbacks; services refuse to start without them. Scrubbed the real Ed25519 key from `.env.example`.
- **Fail-Closed Signature Verification (High)**: Every capacity-consuming path — `cpq` budget drawdown, `mint-service` `/mint`, and `verification-service` `/verify/register` (explicit-lot and quick paths) — now rejects any budget whose Ed25519 certifier signature does not verify, removing the `sig_default` bypass and the silent skip when the certifier record is missing. Verified: an ACTIVE budget bearing a placeholder signature is rejected with `400 INVALID_SIGNATURE` at all paths instead of drawing down.

### Fixed
- Operator UI no longer issues a redundant `/drawdown` call when minting (prevents double-counting after the register-path fix).

### Known Gaps (carried forward, not yet fixed)
- The `DATABASE_URL`/`REDIS_URL` in-source password fallbacks and Redis rate limiting (described in v1.0.1 but not present in code) remain open.

---

## [v1.0.2] - "Workflow Gap Closures" (2026-07-24)
Feature release addressing core product workflow gaps and final real-world operational flows.

### Added
- **Onboarding Review Evidence**: Support for registration document uploads, system admin review notes, and verification evidence logging.
- **Certifier Budget Lifecycles**: Multi-state budget approval workflows (submit, review, revision-requested, reject) with complete status history tracking.
- **Explicit Packaging Lots**: Manufacturers can explicitly create lot batches to draw down active budget capacities separate from code serialization.
- **NABL Laboratory Verification Check**: Registry-based validation checking that laboratories are active/authorized before allowing test report uploads.
- **Cryptographic PDF Lab Uploads**: Restrict lab uploads to valid PDF magic bytes and SHA-256 integrity hash verification.
- **Print-ready QR Exports**: Downloadable CSV lists and print-ready PDF metadata layout spreadsheets.
- **Caseworker Investigations Alert View**: Caseworker assignment, notes log, risk level escalation, verification evidence timeline, and resolution/closure triggers.
- **Revocation Warnings**: Public warnings shown to consumer verification scans of revoked batch lots.

---

## [v1.0.1] - "Zero Trust Hardening" (2026-07-24)
Critical security hardening release implementing strict environment configurations and rate limit safeguards.

### Hardened
- **Strict Environment Assertions**: Enforced server boot validations checking for required variables (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `CERTIFIER_PRIVATE_KEY`) to prevent silent fallbacks to local credentials.
- **Ed25519 Certifier Key Isolation**: Relocated signed budget certificate keys out of application code to strict environment lookup.
- **Secured Admin Seed Passwords**: Enforced dynamic cryptographically secure random password generation for seeded default organizational admins if no fallback is defined.
- **CORS Lockdowns**: Locked down manual cross-origin filters in `verification-service` to allow only matches from the configured `CORS_ORIGIN` variable.
- **Sliding-Window Rate Limiting**: Added Redis-backed sliding-window rate limiters on public login and verification scan lookup paths.

---

## [v1.0.0] - "Genesis Harvest" (2026-07-20)
Initial stable production-grade release of CapMint.

### Added
- **Multi-Replica Deployment**: Kubernetes manifests, services, and Horizontal Pod Autoscalers (HPA).
- **Security & WAF Hardening**: ModSecurity web application firewall and OWASP Core Rule Set integrated.
- **Dynamic SaaS branding**: Dynamic theme customization support based on customer brand rules.
- **D2C Marketing Panels**: Interactive verified CTA portals for loyalty sign-ups.
- **Laboratory LIMS Integration**: API for automated PDF testing uploads and duplicate verification hash checks.
- **Cryptographic Co-Signing**: Ed25519 signatures for certifying bodies.
- **Telemetry Analytics**: Real-time geolocation consumer scan analytics.
- **Database Migration 0007**: Added `producer_brandings` table.

---

## [v0.2.0] - "Hardened Prototype" (2026-07-18)
Security validation and database triggers.

### Added
- **Database Migration Engine**: Added `migrations_log` and migration tracking schemas `0001` through `0006`.
- **Automatic Triggers**: Timestamp modification triggers on row update.
- **Compliance Suite**: 52 integration test scenarios with 100% success rate.
- **Geovelocity Risk Checker**: Spatial travel speed calculations.
- **Suspicious Scans Queue**: Investigations management dashboard.

---

## [v0.1.0] - "Local Sandbox" (2026-07-10)
Initial prototype release.

### Added
- Initial 7-microservice architecture setup.
- Standard routing gateway.
- Interactive consumer portal and barcode scanner simulator.
