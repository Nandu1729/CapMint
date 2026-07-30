# HO-010 Observability O3 Verification

Date: 2026-07-30

Branch: `feat/ho-010-observability-o3`

Base: `develop` at `c1217a07`

## Result

GREEN. All seven backend services expose Prometheus metrics from one shared, process-local
registry. Request latency, normalized errors, signature failures, and verification ledger append
outcomes are observable without placing request data or concrete identifiers in labels.

## Implementation

- `packages/shared/metrics.js` owns a dedicated `prom-client` `Registry` singleton. Default metrics
  use the `capmint_` prefix; the global default registry is not used.
- `registerMetrics(server)` exposes `GET /metrics` with the Prometheus 0.0.4 content type and records
  `http_request_duration_seconds{method,route,status_code}` from `onResponse`.
- `route` comes only from `request.routeOptions.url`; unmatched traffic is labeled `unmatched` and
  `/metrics` excludes itself.
- `recordError(code)` increments `errors_total`. Error codes must match a bounded uppercase enum
  format or become `UNKNOWN`, preventing arbitrary or sensitive label values.
- `recordSignatureFailure()` increments `signature_verification_failures_total` at both CPQ
  signature denials and the shared capacity failure path.
- `recordLedgerAppend(result)` accepts only `ok` or `error`. All seven verification-to-transparency
  fetches record 2xx as `ok`, non-2xx as `error`, and thrown attempts as `error`.
- Auth, CPQ, integration, mint, resolver, transparency, and verification all register the shared
  metrics module. No service-local registry or metric definition was added.

## Acceptance evidence

| Check | Result |
|---|---|
| Lockfile reproduction | `npm ci` passed; only `prom-client@15.1.3` and its three transitives were added |
| Focused metrics/error/runtime tests | 18/18 passed |
| Workspace tests | 58 active passed; 59 existing opt-in tests skipped |
| TypeScript build | 7/7 service builds passed |
| Disposable compliance suite | 88 passed, 0 pending, 0 failed |
| Live `/metrics` endpoints | 7/7 returned 200 Prometheus text with populated request histograms |
| Histogram acceptance | Live 401, 429, and capacity 422 samples present with method, route template, and status code |
| RLS denial acceptance | Forced raw `42501` returned 403 and incremented `errors_total{code="FORBIDDEN"}` |
| Signature acceptance | Compliance INVALID_SIGNATURE requests produced positive signature-failure counters |
| Ledger acceptance | Successful verification ledger traffic produced `ledger_append_total{result="ok"}` |
| Scrape self-exclusion | Zero `route="/metrics"` samples |
| Label leak scan | **0 hits** for the probe JWT, password, PEM, organization ID, username, and raw UUID across all seven complete scrape bodies |
| Route cardinality scan | Every dynamic route label remained a template containing placeholders such as `:id`; zero route labels contained a UUID |

The disposable run used PostgreSQL 16.14 on an isolated local cluster and the F1 harness-created
`capmint_suite_ho010o3final_1` database. The harness dropped the database, restored
`capmint_app` to `NOLOGIN`, and cleared its isolated Redis logical database. The temporary cluster
was then stopped and moved to Trash. Shared `capmint_dev` was not modified.

Tool versions: Node 22.22.3, npm 10.9.8, PostgreSQL 16.14, Redis 8.8.1.

## Scope audit

No migration, RLS policy, service authorization/business response, environment file, or unrelated
dependency changed. The only O4 handler behavior change is the intended `recordError(code)` call at
its O3 insertion point. No `.env` or `.codex/` content is tracked.
