# CapMint Release Notes — v1.1.0 ("Tenant Harvest")

**Target:** promotion of `develop` → `main`
**Status:** PROPOSED — pending operator sign-off (AD-006) and the `develop → main` merge
**Promoted SHA:** `develop` HEAD at promotion time (record the exact SHA in the merge/tag)

> Authoritative state: [docs/architecture/ARCHITECTURE_STATUS.md](../../docs/architecture/ARCHITECTURE_STATUS.md).
> Promotion gates: [docs/architecture/PROMOTION_READINESS.md](../../docs/architecture/PROMOTION_READINESS.md).
> This supersedes the historical, unverified "production-ready" framing of v1.0.0.

---

## 1. Overview

v1.1.0 is the first **architect-verified** promotion to `main`. It carries the Security-Hardening +
Multi-Tenancy Remediation phase that `main` (`767a2f6`) predated. Tenancy is now enforced at two
layers, the security-hardening series has been verified against the live code, a full observability
layer is in place, and CI is green.

## 2. What's included

- **DM-03 — application-layer tenancy** (Reviews #1–#4): FK-backed `organization_id` ownership,
  derived-ownership authorization across cpq/mint/verification, tightened NOT NULL provenance.
- **DM-04 — database Row-Level Security** (Reviews #14–#18): RLS on all 13 application tables,
  ENABLE-not-FORCE, fail-closed on empty GUC, per-request `withTenantTx` as non-owner `capmint_app`.
  Cross-tenant denial proven at the DB layer; transparency ledger immutable to the app role.
- **Capacity / over-issuance safeguards**: shared fail-closed guard (`packages/shared/capacity.js`);
  primary UI issuance path covered.
- **Observability O1–O4** (Reviews #19–#23): structured logging + secret redaction + `x-request-id`
  correlation; readiness `/ready`; uniform leak-free error handling; Prometheus `/metrics`
  (latency + security counters).
- **Security verification pass** (Review #24, promotion Gate A): signatures, RLS, ledger auth, JWT
  HS256 pin, fail-closed env, rate limiting, traversal defense, bcrypt bootstrap, secret hygiene —
  all verified fail-closed.
- **CI green** (Review #26): compliance 88/88, bootstrap-seed 9/9, on Node 22 / tsx 4.

## 3. Migrations

Additive / forward-only: `0014`–`0020` (certifier org NOT NULL, DM-04 RLS D1–D3c, definer-based
organization registration). Post-promotion, run bootstrap/migrations against production as
`capmint_admin`; services then boot as `capmint_app` (startup guard enforced).

## 4. Accepted risks (soft gates — ratified in AD-006)

Ledger external anchoring (C2), append-identity restriction (C3), append serialization at scale (C4),
migration reversibility policy (D3), scrape/alerting + log destination + `/ready` consumer (F2–F4),
over-issuance canary secret (F-E3), RLS ENABLE-not-FORCE (B3). See the disposition table in
PROMOTION_READINESS.md.

## 5. Known follow-ups

- **F-A7**: configure trust-proxy / `X-Forwarded-For` in production for per-client rate limiting.
- **F2**: wire a Prometheus scrape target + baseline alert rules.
- **7 placeholder services** (analytics, audit, clone-detection, gateway, identity, notification,
  scan) remain unimplemented stubs (see each dir's README).

## 6. Rollback

Revert the promotion merge on `main` via PR (never force-push). Promoted migrations are additive and
remain compatible with pre-promotion code; prefer a forward-fix over a destructive down-migration.
The ledger is append-only (correct via compensating entries, never rewound).
