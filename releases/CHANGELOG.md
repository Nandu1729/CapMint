# CapMint Changelog

All notable changes to the CapMint platform will be documented in this file. This project adheres to Semantic Versioning (`vMAJOR.MINOR.PATCH`).

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
