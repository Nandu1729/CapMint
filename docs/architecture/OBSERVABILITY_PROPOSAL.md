# CapMint — Observability Milestone Proposal

> Architect scoping for the operational-observability milestone. The platform currently has
> **no** observability; this is the top pre-production priority before a `develop → main`
> promotion discussion. Part of the governance layer (see
> [ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md)).
>
> **Date:** 2026-07-29

---

## Baseline (verified against the code)

- All seven Fastify backends run `logger: true` (default pino) — but **no secret redaction, no
  correlation IDs, no readiness checks, no metrics**; `setErrorHandler` on only 5 of 8.
- `/health` is static liveness only (`{status:'healthy'}`); it does not reflect DB/Redis health.
- `scripts/frontend-server.js` is a plain HTTP server using `console` logging.
- **Constraint:** no Docker/k8s (D-003 purged them), no external monitoring. Approach must be
  **in-process, zero-infra-commitment**, exposing standard endpoints scrapeable later.

## Ratified decisions (2026-07-29)

1. **Metrics backend** — expose `/metrics` (prom-client) per service **now**; scrapeable whenever a
   collector exists. No Prometheus/k8s commitment.
2. **External error tracking** (Sentry-like) — **DEFERRED**; log-based first.
3. **Log sink** — **stdout JSON** (12-factor); shipping/aggregation is a deploy concern, deferred.

## Phases (each separately gated, small HO each)

| Phase | Scope | Handoff |
|---|---|---|
| **O1 — Structured logging + redaction + correlation** ✅ **DONE** | Shared pino config: env level; **secret redaction** (`authorization`/`cookie` headers, `*password*`, JWT, `CERTIFIER_*_KEY`, `signature_bundle`); request-id (`genReqId` + inbound `x-request-id`, forwarded on service→service calls); one request-completion log (method, route, status, latency, reqId, orgId-if-authed). | HO-008 — **EXECUTED (Review #19, `be7d00a9`)**; delivered `packages/shared/logging.js` with recursive field-name redaction beyond the static paths |
| **O2 — Health/readiness** ← **next** | Keep `/health` liveness; add `/ready` checking `pgPool` (`SELECT 1`) + Redis (`ping`) → 200/503. Shared helper. | HO-009 |
| **O3 — Metrics** | `prom-client` `/metrics` per service: HTTP histograms + domain-security counters (RLS `42501` denials, capacity rejections, `INVALID_SIGNATURE`, auth failures/rate-limits, ledger append rate). | HO-010 |
| **O4 — Uniform error handling** | `setErrorHandler` on all 8: safe client mapping, structured error log, error counter, no stack/secret leakage. | HO-011 |

## Sequencing

Confirm-live smoke (HO-007) establishes the GREEN baseline first, then **O1 → O2 → O3 → O4**,
each with its own approval gate. O1 leads because it is foundational *and* closes the one item
here with a security edge (unredacted secrets in logs).

## Milestone success criteria

- No secret appears in any log line; every log line carries a correlation id that propagates
  across service boundaries.
- Every service exposes liveness **and** readiness; readiness reflects DB + Redis health.
- HTTP + domain-security metrics are scrapeable per service.
- Uniform error handling; no stack traces or secrets leak to clients.
