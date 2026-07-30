# HO-008 Observability O1 Verification

Date: 2026-07-30

Branch: `feat/ho-008-observability-o1`

Base: `develop` at `b76e09da`

## Result

GREEN. All seven Fastify services use the shared structured-logging configuration. Request
completion logs are correlated, sensitive values are redacted, and existing API behavior remains
unchanged.

## Implementation checks

- `packages/shared/logging.js` provides the Fastify logging-options factory, completion hook, and
  outbound `x-request-id` forwarding helper; `logging.d.ts` provides its public types.
- `LOG_LEVEL` is honored with an `info` default.
- Fastify reuses inbound `x-request-id` values and otherwise generates UUID request IDs.
- Default Fastify request logging is disabled so the shared hook emits exactly one completion log
  per request: method, route pattern, status, latency, and authenticated organization ID when
  present. The request child logger supplies the `reqId`.
- Pino paths redact authorization/cookie headers and the named body-secret fields with
  `[REDACTED]`. The shared log hook recursively covers matching private-key and
  `certifier_*_key` field names without service-local copies.
- The outbound HTTP audit found seven calls, all verification-to-transparency ledger appends. Every
  call applies `forwardHeaders(request)`. No other service source performs outbound HTTP today.

## Acceptance evidence

- Focused logging/runtime tests: 10/10 passed. A probe containing an Authorization header, cookie, password
  fields, `signature_bundle`, a private-key field, and a `certifier_*_key` field produced
  `[REDACTED]`; the known raw values had zero matches. The probe also confirmed one completion line,
  the expected response body/status, configured/default levels, UUID generation, and forwarding.
- Live built-service probe: 12/12 application stdout records parsed as JSON with zero invalid lines.
  Verification `POST /api/v1/lots` returned 200 and transparency `POST /api/v1/log` returned 201;
  both completion records carried `reqId=ho008-live-ledger-success-v2`. The authenticated
  verification line also carried its organization ID.
- Live secret scan: zero matches for the issued JWT, development password, PEM key probe, and known
  `signature_bundle`.
- Full compliance suite: 88 passed, 0 pending, 0 failed.
- Workspace tests: 44 passed; 59 opt-in integration cases were skipped by their existing default
  gates. The full 88-check live suite above covered the application regression gate.
- Builds: all seven service TypeScript builds passed.

## Commands and isolation

Successful verification commands included:

```text
npm ci
npm run db:reset -- --yes
npm run build --workspaces --if-present
npm test
node -r dotenv/config -e 'process.env.DATABASE_URL = process.env.ADMIN_DATABASE_URL; require("./playground/test_runner.js")'
```

Database work used only `capmint_ho008_20260730_0833`; it was reset from the baseline through
`0020`, seeded, and dropped after verification. The shared `capmint_dev` database was not touched.
The ignored worktree-local `.env` copy was removed after the run.

## Scope audit

No migration, schema, seed, dependency version, lockfile, CI, environment, or architecture-owned
document changed. No response contract or authorization/RLS behavior changed. No `.env` or
`.codex/` content is tracked.
