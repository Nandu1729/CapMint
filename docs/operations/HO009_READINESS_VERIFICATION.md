# HO-009 Observability O2 Verification

Date: 2026-07-30

Branch: `feat/ho-009-observability-o2`

Base: `develop` at `5e71f90c`

## Result

GREEN. All seven Fastify backends now expose dependency-aware readiness without changing their
existing liveness responses.

## Implementation checks

- `packages/shared/readiness.js` exports one shared `registerReadiness(server, deps)` helper;
  `readiness.d.ts` provides structural PostgreSQL and Redis client types.
- PostgreSQL readiness runs `SELECT 1`; Redis readiness runs `ping()`.
- Configured dependency checks run concurrently and each has a one-second timeout.
- Failed checks log the dependency and exception through the request logger, while the response
  exposes only `ok` or `fail`.
- Auth, CPQ, mint, resolver, transparency, and verification pass their PostgreSQL and Redis clients.
  Integration passes only its PostgreSQL pool.
- Existing `/health` handlers are unchanged.

## Acceptance evidence

- With dependencies available, all seven live `/ready` endpoints returned 200. The six
  Redis-backed services returned
  `{"status":"ready","checks":{"db":"ok","redis":"ok"}}`; integration returned
  `{"status":"ready","checks":{"db":"ok"}}`.
- All eight running processes, including the frontend process, retained their existing `/health`
  200 behavior.
- A separate auth instance using unreachable Redis at an unused local port returned 503 in
  1032.4 ms with
  `{"status":"unready","checks":{"db":"ok","redis":"fail"}}`.
- The failed readiness body contained no exception, connection string, port, password, or stack
  text. Its request-scoped warning contained the timeout detail and correlation ID.
- The same failure-probe process immediately returned `/health` 200 afterward.
- Focused readiness/runtime tests: 12/12 passed, including success, optional dependencies,
  secret-free failure, recovery, and a hung-client timeout.
- Workspace tests: 48 passed; 59 opt-in integration cases remained skipped behind their existing
  default gates.
- Full compliance suite: 88 passed, 0 pending, 0 failed.
- Builds: all seven service TypeScript builds passed.

## Commands and isolation

Successful verification commands included:

```text
npm ci
ADMIN_DATABASE_URL=<disposable-owner-url> DATABASE_URL=<disposable-app-url> npm run db:reset -- --yes
npm run build --workspaces --if-present
npm run test --workspace=backend/e2e-tests -- --run test/readiness-helper.test.ts test/service-runtime-config.test.ts
npm test
DATABASE_URL=<disposable-owner-url> node playground/test_runner.js
```

Database work used only `capmint_ho009_20260730_0950`, supplied through process-level URL
overrides. It was reset from the baseline through `0020`, seeded, and dropped after verification.
The repository's ignored `.env` was not changed, and the shared `capmint_dev` database was not
touched.

## Scope audit

No health handler, migration, schema, seed, dependency version, lockfile, CI workflow,
environment file, or architecture-owned document changed. No response contract outside the new
`/ready` route changed. No `.env` or `.codex/` content is tracked.
