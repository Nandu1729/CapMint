# HO-011 Observability O4 Verification

Date: 2026-07-30

Branch: `feat/ho-011-observability-o4`

Base: `develop` at `d54b7f4e` (includes HO-009/O2)

## Result

GREEN for O4. All seven Fastify services use one shared error handler. Existing explicit-error
responses are preserved, uncaught errors no longer expose raw diagnostics to clients, PostgreSQL
errors receive safe mappings, and every handled failure emits one correlated structured error log.

## Implementation

- `packages/shared/errors.js` exports `createErrorHandler()`; `errors.d.ts` publishes the Fastify
  handler type and `@capmint/shared/errors` is exported by the shared package.
- Errors that already carry `statusCode` retain their status, code, and message. This includes
  Fastify validation errors.
- Raw PostgreSQL errors map as follows: `23505`/`23503` to `409 CONFLICT`, `42501` to
  `403 FORBIDDEN`, and `22P02`/`23514` to `400 BAD_REQUEST`.
- Other uncaught errors return `500 INTERNAL_SERVER_ERROR` with `Internal server error`; raw
  messages, database detail, and stacks remain absent from the client body.
- The handler emits `request.log.error({ err, code, statusCode }, 'request failed')`. The request
  child logger supplies `reqId`, and the existing O1 logger supplies redaction.
- One comment marks the future O3 error-counter insertion point. No metrics dependency or metric
  behavior was added.
- Auth, CPQ, integration, mint, resolver, transparency, and verification all install the shared
  handler. The five local copies were removed.

## Acceptance evidence

| Check | Result |
|---|---|
| Focused shared-handler and seven-service wiring tests | 16/16 passed |
| Workspace tests | 56 active passed; 59 existing opt-in tests skipped |
| TypeScript build | 7/7 service builds passed |
| Correctly configured disposable compliance run | 88 passed, 0 pending, 0 failed |
| Live raw PostgreSQL `23505` probe | `409`, `CONFLICT`, `Conflict`, no database detail in body |
| Live unmapped-error probe | `500`, `INTERNAL_SERVER_ERROR`, `Internal server error` |
| Live structured-log probe | Two failures produced exactly two `request failed` records with `reqId` values `ho011-23505` and `ho011-500` |
| Leakage/redaction probe | Known request secret absent from both failure logs and bodies; stack text absent from bodies |

The live probes used PostgreSQL 16.14 in an isolated temporary cluster. The compliance harness
created and dropped its own `capmint_suite_ho011o4configured_1` database and used an isolated Redis
logical database. Tool versions were Node 26.3.1, npm 11.16.0, PostgreSQL 16.14, and Redis 8.8.1.

## Existing compliance-wrapper anomaly

The checked-in disposable wrapper first completed at 87/88. Only `LAB-04` failed: the replacement
request returned 200 but the expected `LOT_LAB_TEST_REPLACED` ledger event count was zero. This is
independent of O4: `backend/e2e-tests/test/compliance-suite.test.ts` supplies
`TRANSPARENCY_SERVICE_URL` with `/api/v1/log` already appended, while verification treats the
variable as a service base and appends `/api/v1/log` itself. The resulting doubled path returns 404,
which the existing ledger call ignores.

For regression evidence only, the wrapper was rerun with the documented service-base value. That
run passed 88/88. The temporary one-line verification change was immediately reverted; this branch
does not change the compliance wrapper or the verification ledger logic.

## Scope audit

No migration, RLS policy, service authorization/business logic, dependency, metric, environment
file, or lockfile changed. Neither `.env` nor `.codex/` is tracked. After HO-009 merged, this branch
was rebased from its requested starting point (`5e71f90c`) onto `develop` at `d54b7f4e`; the full
workspace test, build, and correctly configured 88-check compliance gates passed again afterward.
