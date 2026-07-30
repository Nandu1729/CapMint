# CapMint — Codex Handoff Archive

> Every implementation specification produced for **Codex** (the implementation engineer)
> is archived here. The architect authors specs; Codex implements them. Specs are
> append-only historical records — do not delete superseded specs, mark them SUPERSEDED.
>
> **Spec authoring rules:** the architect produces specifications, **not code**. Each spec
> must be self-contained enough that an engineer with only the repository (no conversation
> history) can execute it.

---

## Handoff index

| Spec ID | Title | Milestone | Date | Status |
|---|---|---|---|---|
| [HO-001](#ho-001-dm-03-c3--tenancy-enforcement) | DM-03 C3 — Tenancy Enforcement | DM-03 C3 | 2026-07-26 | HANDED-OFF |
| [HO-002](#ho-002-dm-04-rls-end-to-end-smoke-test) | DM-04 RLS End-to-End Smoke Test | DM-04 smoke gate | 2026-07-28 | EXECUTED (Review #14) |
| [HO-003](#ho-003-smoke-gate-provisioning-remediation) | Smoke-gate provisioning remediation (+ re-runs) | DM-04 smoke gate | 2026-07-28 | EXECUTED (Review #14) |
| [HO-004](#ho-004-canonical-service-env--purge-blacklisted-key) | Canonical service env + purge blacklisted key | Post-smoke defect #1 | 2026-07-29 | EXECUTED (Review #15) |
| [HO-005](#ho-005-tighten-organizations-public-read-f-org) | Tighten organizations public read (F-org) | Post-smoke defect #2 | 2026-07-29 | EXECUTED (Review #16) |
| [HO-006](#ho-006-close-p1a-uuid-validators--p1b-mint-health) | Close P1a (UUID validators) + P1b (mint /health) | Post-smoke defects P1a/P1b | 2026-07-29 | EXECUTED (Review #17) |
| [HO-007](#ho-007-confirm-live-smoke-re-run) | Confirm-live smoke re-run (validate 0020 + assigned-lab) | DM-04 smoke gate | 2026-07-29 | HANDED-OFF |
| [HO-008](#ho-008-observability-o1--structured-logging--redaction--correlation) | Observability O1 — structured logging + redaction + correlation | Observability | 2026-07-29 | EXECUTED (Review #19, `be7d00a9`) |
| [HO-009](#ho-009-observability-o2--dependency-readiness-probe) | Observability O2 — dependency readiness probe (`/ready`) | Observability | 2026-07-30 | EXECUTED (Review #20, `2100be9d`) |
| [HO-011](#ho-011-observability-o4--uniform-shared-error-handling) | Observability O4 — uniform shared error handling | Observability | 2026-07-30 | EXECUTED (Review #21, `7ced845a`) |

---

## HO-001: DM-03 C3 — Tenancy Enforcement

- **Spec ID:** HO-001
- **Milestone:** DM-03 C3 (enforcement stage; follows approved C2 — [AD-003](DECISIONS.md))
- **Date:** 2026-07-26
- **Status:** HANDED-OFF
- **Related Decision(s):** AD-003, AD-004; Codex `.codex/brain/DM03_PROPOSAL.md` (DM03-D1…D4), `BRAIN/DECISIONS.md` D-015
- **Related Review:** Review #1

### Objective
Convert the *prepared* tenant boundary from C2 into an *enforced* one at the application
layer: every tenant-sensitive route authorizes by an explicit
`profile.organization_id = jwt.orgId` join (never by equal-ID aliasing), the remaining
ownership relationships become FK-backed, laboratory writes fail closed unless assigned,
and profile ownership is tightened to `NOT NULL` once the orphan is resolved. This
completes DM-03. **PostgreSQL RLS is explicitly out of scope** and remains a later
milestone (DM-04) per DM03-D2.

### Architectural Intent
Preserve DM03-D1…D4: independent profile IDs with explicit `organization_id` FKs; `orgId`
as the sole tenant JWT claim with server-side profile resolution; direct tenant keys on
profiles/actor rows and derived ownership for provenance descendants; prepare-then-enforce
(app layer now, RLS later). Tenant predicates live **in the same SQL statement** that
reads/locks/mutates the resource (no fetch-then-check races). Capacity row locks, the DB
over-issuance ceiling, and Ed25519 signature format are **unchanged**.

### Scope
**In scope (C3):** remaining additive schema; predicate rewrites from equal-ID to
`organization_id` joins; lab assignment write path + fail-closed lab mutation; investigation
`unit_code_id` FK; integration route allowlists; frontend auth compatibility; constraint
tightening gated on orphan resolution.
**Out of scope (do NOT implement):** PostgreSQL RLS policies/roles/GUC enforcement (DM-04);
the `/mint` capacity-reservation semantics and the 20 overfilled lots (separate capacity
security decision); ledger event authorization on transparency-service (separate hotfix);
new independent profile-ID generation (post-rollback-window); multi-profile selection
(fails closed in Phase 1); credential/key incident (proposal-only).

### Affected Services
`backend/auth-service`, `backend/cpq-service`, `backend/mint-service`,
`backend/verification-service`, `backend/integration-service`. (Not transparency-service.)

### Affected Files
`backend/{auth,cpq,mint,verification,integration}-service/src/index.ts`;
`database/schema/schema.sql`; new forward migrations `0012_*`, `0013_*` + matching
`verify0012`/`verify0013`; `database/seed/seed.sql`, `database/seed/development.js`;
`frontend/index.html`; `playground/test_runner.js`;
`backend/e2e-tests/test/*` (tenant-isolation suite + migration tests);
`api/openapi.yaml` + bundled output + affected schemas; `database/erd/*`;
`architecture/{SECURITY_ARCHITECTURE,DATA_FLOW}.md`; `BRAIN/DECISIONS.md`;
`releases/CHANGELOG.md`; `.codex/brain/*`.

### Database Impact
- New nullable columns: `investigations.unit_code_id` (UUID),
  `lab_results.submitted_by_organization_id` (UUID),
  `lots.assigned_laboratory_organization_id` (UUID).
- New unique support `(budgets.id, budgets.producer_id)`; new composite FK
  `(lots.budget_id, lots.producer_id) → (budgets.id, budgets.producer_id)` `ON DELETE RESTRICT`.
- FK policies: profile org FKs `ON DELETE RESTRICT ON UPDATE CASCADE`; investigation unit FK
  `ON DELETE RESTRICT ON UPDATE CASCADE`; lab submitter/assignment FKs `ON DELETE RESTRICT`.
- Indexes: `investigations(unit_code_id)` (UNIQUE after backfill),
  `lab_results(submitted_by_organization_id)`, `lots(assigned_laboratory_organization_id)`.
- Tightening (C3c only): `producers.organization_id NOT NULL`,
  `certifiers.organization_id NOT NULL` (after orphan resolution),
  `investigations.unit_code_id NOT NULL UNIQUE`; validate lab FKs while **keeping legacy
  rows NULL** (submitter/assignment stay nullable).
- Add the producer-branding `updated_at` trigger to `schema.sql` (schema-parity fix).

### Migration Impact
- All migrations additive-first, `NOT VALID` → separate `VALIDATE`, `IF NOT EXISTS`,
  idempotent, each with a deterministic `verifyNNNN` (exact/absent/incompatible) matching
  the C2 pattern. Never edit published migrations; forward-fix only.
- Deterministic backfill only: `investigations.unit_code_id` from exact
  `public_identifier` match (expect 38). Orphan certifier, 272 lab submitters, and legacy
  lab assignments are **not deterministic — do not fabricate**; leave NULL.
- Test every migration against: a clone of the configured DB, a fresh pre-DM03 baseline +
  all DM-03 forwards, and a `schema.sql` snapshot; diff tables/columns/constraints/
  indexes/triggers for parity. Fail the migration if orphan/ambiguity preflight returns
  unexpected rows.

### Security Considerations
- Replace every equal-ID predicate with an ownership join (§22 rules): producer joins
  `producers.organization_id`; certifier joins `certifiers.organization_id`; lab requires
  activated org **and** lot assignment. System-admin global access is explicit, never a
  default `else`. Return 404 (not 403) where enumeration matters. Denied mutations roll
  back before any capacity/state change; ledger events emit only after scoped success.
- Legacy request `producer_id` accepted only when it resolves to a caller-owned profile.
- Lab mutation fails closed until `lot.assigned_laboratory_organization_id = orgId`.
- No secrets in fixtures; JWT shape/expiry unchanged.

### Testing Strategy
Implement the §28 tenant-isolation matrix (producer, certifier, laboratory, public, data/
migration) plus regression that signature/capacity/concurrency/gateway/JWT/ledger/
rate-limit tests still pass. Every "denied" case must assert **no** change to budget
consumption, code count, or lot/case state. Integration + compliance suites run on
disposable Postgres with explicit approval; `capmint_dev` is applied only through the
reviewed runner ending `SAFE / NO PENDING ACTIONS`.

### Rollback Strategy
- Additive columns/indexes/`NOT VALID` FKs remain in place on app rollback (never dropped
  as rollback). Predicate rewrites are code-only but must not be reverted if that reopens
  confirmed cross-tenant access.
- If backfill validation fails: roll back the batch, leave columns nullable, stop.
- If constraint validation fails: keep `NOT VALID`, investigate, do not broaden access.
- C3c `NOT NULL` is the point of no easy return — do not enter it until C3a/C3b are
  approved and the orphan is resolved.

### Acceptance Criteria
Satisfy DM03_PROPOSAL §29 (items 3–14 apply to C3): no route authorizes by comparing
`orgId` to a profile PK; ownership is FK-backed; no unclassified profile before `NOT NULL`;
every investigation FK-linked; new lab writes record+validate assignment; operational bulk
lists/exports require scoped auth; public verification/resolver/ledger stay public; denied
attacks change nothing; same-tenant workflows pass; capacity locks + ceiling + Ed25519
unchanged; existing and fresh-prebaseline migration tests pass with schema parity; schema/
ERD/OpenAPI/decisions/changelog/Codex memory agree.

### Commit Boundaries
Three gated sub-phases, each a reviewable stopping point. Atomic commits, explicit path
staging, no `--no-verify`, no push/PR without approval.

- **C3a — additive schema + derived-ownership predicates (reversible):** migration `0012`
  (+`verify0012`) for the three nullable columns, composite budget uniqueness + lot/budget
  composite FK, indexes, deterministic investigation backfill; then rewrite all equal-ID
  predicates to `organization_id` joins across the five services (drawdown, `/verify/
  register`, `/lots`, exports, certify/revoke, investigations, budget lifecycle), accepting
  legacy `producer_id` only when caller-owned. **→ STOP for approval.**
- **C3b — lab assignment + investigation FK + integration allowlists + frontend:**
  certifier-scoped lot lab-assignment endpoint (OpenAPI contract first), fail-closed lab
  mutation persisting `submitted_by_organization_id`, investigation reads/mutations via
  `unit_code_id`, integration role allowlists, and frontend Bearer/CSV-blob/certify-revoke
  fixes + stop sending `orgId` as `producer_id`. **→ STOP for approval.**
- **C3c — constraint tightening (HARD-GATED):** only after operator resolves the orphan
  certifier and confirms zero unclassified NULL profiles — migration `0013` (+`verify0013`)
  sets profile `NOT NULL`, `investigations.unit_code_id NOT NULL UNIQUE`, validates lab FKs
  (legacy rows stay NULL). **→ final DM-03 acceptance.**

### Stopping Point
Codex stops at the end of **C3a** and returns for architect review before C3b, and again
before C3c. **C3c must not begin until the operator has resolved the orphan certifier**
(§20: quarantine → attach/create; deletion only with separate destructive approval) — this
is an operator action, not a Codex action. Do not implement RLS.

### Approval Gate
Architect will verify per sub-phase: (a) migration idempotency + `verifyNNNN` +
schema-parity diff; (b) every rewritten predicate is a single locked ownership-join
statement with no equal-ID fallback; (c) the §28 attack tests prove denied actions mutate
nothing; (d) scope discipline — no RLS, no capacity/signature changes, transparency-service
untouched. Each sub-phase gets its own entry in
[ARCHITECT_REVIEW_HISTORY.md](../../ARCHITECT_REVIEW_HISTORY.md).

---

## HO-002: DM-04 RLS End-to-End Smoke Test

- **Spec ID:** HO-002 · **Milestone:** DM-04 smoke gate · **Date:** 2026-07-28 · **Status:** EXECUTED (Review #14)
- **Related Review:** #14 · **Evidence:** `docs/smoke/DM04_RLS_SMOKE_REPORT.md` (Attempt 05) + attempts 01–04

### Objective
Verification gate (no product code): run the app end-to-end with services as the non-owner
`capmint_app` and confirm the live frontend→API→RLS path — login, org registration,
budget→lot→mint (+ capacity), public scan/verify, lab assignment/fail-closed result,
investigation, cross-tenant negatives, ledger — watching for `42501`, empty-where-data-
expected, cross-tenant leak, and fail-open on empty GUC. Codex must stop and report on any
defect, never loosen RLS or bypass `withTenantTx` to pass a step.

### Outcome
Surfaced that provisioning had never run end-to-end (led to HO-003) and, critically, that the
services were loading stale per-service `.env` and running as the RLS-bypassing **owner** —
making early "RLS clean" results false positives. After remediation, Attempt 05 = **YELLOW**:
genuine `capmint_app` RLS run, all reachable flows clean, only tracked non-RLS defects P1a/P1b.

---

## HO-003: Smoke-gate provisioning remediation

- **Spec ID:** HO-003 · **Milestone:** DM-04 smoke gate · **Date:** 2026-07-28 · **Status:** EXECUTED (Review #14)
- **Related Review:** #14 · **Branch:** `fix/smoke-provisioning-blockers` → merged `3c287868`

### Objective
Fix the provisioning blockers HO-002 uncovered, then re-run the smoke test. Delivered as four
atomic fixes: `db:reset --bootstrap` for an empty DB (`b9a80823`); lockfile `@capmint/shared`
workspace (`3ba6ed95`); remove the global `PORT` from `.env.example` (`8b0bc6f5`); `db:reset`
loads `.env` so dev certifier PEMs expand (`8a9f3fab`). Follow-up config-only re-runs aligned
the certifier keypair and pointed each `backend/*/.env` at the root `.env` via symlink, which
finally produced a genuine `capmint_app` run (Attempt 05). The per-service `.env` shadowing it
exposed is carried forward as tracked defect #1 → HO-004.

---

## HO-004: Canonical service env + purge blacklisted key

- **Spec ID:** HO-004 · **Milestone:** post-smoke defect #1 (config-integrity) · **Date:** 2026-07-29 · **Status:** EXECUTED (Review #15, `fa6df817`)
- **Related Review:** #14 (tracked defect 1) → closed by #15

### Objective
Eliminate the latent tenant-isolation bypass: each backend service loads `backend/<svc>/.env`
(CWD-relative `dotenv.config()`), and those stale local files set `DATABASE_URL` to the
**owner** role (RLS bypassed under ENABLE-not-FORCE) and carry the project's own blacklisted
certifier key (`7ee5…`). A deploy following the documented root-`.env` model runs with RLS
**off**. The symlink workaround from the smoke run is not a durable fix.

### Required outcome
- Services load a **single authoritative env** as the non-owner `capmint_app`, with no
  per-service override capable of silently selecting the owner role. Options for the engineer
  to choose and justify: (a) point each service's `dotenv.config()` at the repo-root `.env`
  (e.g. `path` resolved to root / find-up), removing per-service `.env`; or (b) a documented
  per-service env strategy that is generated from one source and asserted non-owner. Prefer the
  smallest change that makes the loaded role deterministic.
- **Purge the blacklisted `7ee5…` key** from all local env material; regenerate dev keys.
- Add a **fail-fast guard**: on startup a service must refuse to run if its effective DB role
  is the owner / `rolbypassrls=true` (defense-in-depth so RLS can never be silently bypassed).
- Update `.env.example` / `CONTRIBUTING.md` to document the canonical model unambiguously.

### Acceptance
`db:reset -- --yes` then `npm run dev`; prove via `pg_stat_activity` that **every** started
service connects as `capmint_app` with no symlink workaround; the owner-role startup guard
rejects an owner `DATABASE_URL`; re-run the HO-002 smoke and confirm the RLS scan stays clean.
Then (F-org, P1a, P1b remain separately gated).

### Constraints
Feature branch off `develop`. No AI attribution; Conventional Commits; explicit path staging;
no `--no-verify`; do not commit `.codex/` or any `.env`. Do not weaken RLS policies or the
migration checksum guard.

---

## HO-005: Tighten organizations public read (F-org)

- **Spec ID:** HO-005 · **Milestone:** post-smoke defect #2 (F-org) · **Date:** 2026-07-29 · **Status:** EXECUTED (Review #16, `4891d54a`)
- **Related Review:** #14 (tracked defect 2) → closed by #16

### Objective
The public/empty-GUC path could read all `organizations` via the blanket
`OR NULLIF(app.current_organization_id,'') IS NULL` clause. That clause was **load-bearing**
for public `register-org` (cross-tenant tax_id/registration_number uniqueness reads +
`INSERT…RETURNING` read-back), so it could not simply be dropped.

### Delivered (migration `0020` + auth)
A `SECURITY DEFINER` function `capmint_register_organization` (owner `capmint_admin`,
`SET search_path=public`, `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO capmint_app`) performs
the uniqueness check + org/user insert + audit append (its inline ledger hash-chain matches
`appendAuditLog`/`/log/verify`), returning the new rows. The blanket clause is then dropped so
`organizations_tenant_select` exposes only sysadmin ∪ own-org ∪ ACTIVATED certifier/lab
directory. Partial `UNIQUE` indexes on tax_id/registration_number add defense-in-depth. Runner:
signature re-pinned with successor-aware `verify0016` + exact `verify0020` (checksum guard
untouched). `auth` `register-org` calls the function and maps `23505`/`REGISTRATION_EXISTS`→409.
Validated on a disposable DB; `capmint_dev` untouched.

---

## HO-006: Close P1a (UUID validators) + P1b (mint /health)

- **Spec ID:** HO-006 · **Milestone:** post-smoke defects P1a/P1b · **Date:** 2026-07-29 · **Status:** EXECUTED (Review #17, `0fee1579`)
- **Related Review:** #14 (tracked defects P1a, P1b)

### Objective
Close the two remaining low-severity smoke-gate defects. No migration, no RLS/auth-logic change.

### Design decision — relax validators, not re-seed
P1a is fixable two ways: (a) relax the over-strict UUID validators, or (b) change the seed's
sentinel IDs (`…0004`, `…0050`, …) to version-4 UUIDs. **Chose (a).** Rationale: (b) has a large
blast radius (the sentinel IDs are referenced by the seed self-check, many tests, and migration
constants that must all agree), whereas (a) touches ~3 lines in one service; and (a) is *more
correct* — the app was stricter than PostgreSQL's `uuid` type, and the version/variant nibble
adds no security (tenancy is enforced by the RLS/ownership joins, not the UUID version).

### P1a — standardize UUID param validation
Replace the RFC version/variant-strict regexes in `backend/verification-service/src/index.ts`
(`:442` public_identifier, `:812` assign-laboratory lot id + `laboratory_organization_id`,
`:1670` lab-results `lot_id`) with the well-formed form
`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (as `cpq:463` and PostgreSQL
`uuid` already accept). Prefer a shared `isWellFormedUuid()` helper. Format guard only — no
authorization/ownership/RLS change.

### P1b — mint `/health`
Add to `backend/mint-service/src/index.ts` (before `server.listen`):
`server.get('/health', async () => ({ status: 'healthy', service: 'mint-service' }));`

### Acceptance
All eight processes return `/health` 200; HO-002 smoke flow 6 completes the previously-blocked
pair (certifier assigns lot to seeded lab org `…0004` → `lab` submits `/verify/lab-results`
success → `lab-isolation` 403); builds + existing tests green; add tests for the assigned-lab
success path and mint `/health`. Feature branch off `develop`; validate on a disposable DB
(`capmint_dev` untouched); no AI attribution; Conventional Commits; no `.env`/`.codex` committed.

---

## HO-007: Confirm-live smoke re-run

- **Spec ID:** HO-007 · **Milestone:** DM-04 smoke gate (live confirmation) · **Date:** 2026-07-29 · **Status:** HANDED-OFF
- **Related Review:** #14–#17

### Objective
Verification gate, **no code changes**. On `develop`: `cp .env.example .env` (one Ed25519 keypair
across all four certifier vars, `PORT` unset) → `npm ci` → `npm run db:reset -- --yes` (applies
baseline + `0010`–`0020`, provisions `capmint_app`, seeds) → `npm run dev`. Run the full HO-002
nine-flow smoke + A–E taxonomy and specifically confirm live: the assigned-lab **success** pair
(assign lot to lab `…0004` → `lab` result success → `lab-isolation` 403); F-org (public/empty-GUC
`organizations` visibility = 3 directory orgs, not 7); registration via the definer path (register
→ pending-login 403 → activate → login 200; duplicate tax_id/registration_number → 409); ledger
`/log/verify` `unbroken=true` after a definer registration; RLS scan A–D = 0. Deliverable:
`docs/smoke/DM04_RLS_SMOKE_REPORT.md` (Attempt 06, expect GREEN), uncommitted; preserve prior
attempts. Stop and report on any failure.

---

## HO-008: Observability O1 — structured logging + redaction + correlation

- **Spec ID:** HO-008 · **Milestone:** Observability (O1, first slice) · **Date:** 2026-07-29 · **Status:** EXECUTED (Review #19, commit `124e4950`, merged `be7d00a9`)
- **Related:** [OBSERVABILITY_PROPOSAL.md](OBSERVABILITY_PROPOSAL.md)

### Objective
Replace ad-hoc `logger: true` with a shared, hardened logging configuration across the seven
Fastify backends: **redact secrets, add cross-service correlation ids, one structured completion
log per request**. Closes the current gap where `logger:true` with no redaction can leak
passwords/JWTs/PEMs into logs.

### Deliverable — `packages/shared/logging.js` (+ `.d.ts`)
Export a Fastify logger-options factory and a request-id propagation helper:
- **pino config:** level from `LOG_LEVEL` (default `info`); `redact` with `censor:'[REDACTED]'` on
  paths `req.headers.authorization`, `req.headers.cookie`, and body secret fields
  (`password`, `admin_password`, `current_password`, `new_password`, `signature_bundle`,
  anything matching `*private_key*`/`certifier_*_key`).
- **correlation:** `requestIdHeader: 'x-request-id'`; `genReqId` uses the inbound `x-request-id`
  when present else generates one (`crypto.randomUUID`). Fastify then stamps `reqId` on every line.
- **completion log:** an `onResponse` hook emitting one structured line
  `{ reqId, method, routerPath, statusCode, responseTimeMs, orgId? }` (orgId from the JWT when
  authenticated; never log tokens/PII).
- **outbound propagation:** a helper `forwardHeaders(request)` returning `{ 'x-request-id': reqId }`
  for service→service calls. Apply it where services call each other — primarily
  verification-service → transparency-service (ledger append); audit any other outbound HTTP.

Wire all seven backends to use the shared config (replace `logger: true`).

### Acceptance
- Logs are JSON carrying `reqId`. A request with an `Authorization` header and a password body
  logs `[REDACTED]`, not the secret. Grep the run's logs for a known JWT / seed password / PEM /
  `signature_bundle` → **0** hits.
- A ledger append (verification → transparency) shows the **same `reqId`** in both services' logs.
- No change to any response body/status; existing builds + tests pass.

### Constraints
Shared module (DRY, no per-service copies); feature branch off `develop`; validate on a disposable
DB; no AI attribution; Conventional Commits (`feat(observability)…`); explicit paths; no
`.env`/`.codex` committed.

---

## HO-009: Observability O2 — dependency readiness probe

- **Spec ID:** HO-009 · **Milestone:** Observability (O2) · **Date:** 2026-07-30 · **Status:** EXECUTED (Review #20, commit `c1eb06f7`, merged `2100be9d`)
- **Related:** [OBSERVABILITY_PROPOSAL.md](OBSERVABILITY_PROPOSAL.md)

### Objective
Add a `/ready` probe that fails fast (503) when a service's Postgres/Redis dependency is
unreachable, while keeping `/health` as pure liveness — so a service can be pulled from rotation
without being killed.

### Deliverable — `packages/shared/readiness.js` (+ `.d.ts`, `./readiness` export)
`registerReadiness(server, { pgPool?, redisClient? })` registers `GET /ready` that probes **only the
deps passed** (db: `SELECT 1`; redis: `ping()`), each under a ~1s `Promise.race` timeout with timer
cleanup. Returns **200** `{ status:'ready', checks }` or **503** `{ status:'unready', checks }`;
failures are logged via `request.log.warn` (redacted), never returned. `/health` left untouched.
Wired across all seven backends — `integration-service` (no Redis) probes db only; the six
Redis-having services probe both.

### Acceptance (met)
`/health` unchanged (200); all seven `/ready` = 200 when deps up; a dead/hung dependency → 503 in
~1s with the failing check named and no secret/connection-string/stack in the body; build clean;
compliance 88/88.

### Outcome
EXECUTED and APPROVED at **Review #20**. Independently verified: build exit 0, `vitest` 12/12
(adversarial 503 + hung-dep timeout measured ~1s), wiring cross-checked against actual Redis usage.
Evidence: `docs/operations/HO009_READINESS_VERIFICATION.md`.

---

## HO-011: Observability O4 — uniform shared error handling

- **Spec ID:** HO-011 · **Milestone:** Observability (O4) · **Date:** 2026-07-30 · **Status:** EXECUTED (Review #21, commit `07d44547`, merged `7ced845a`)
- **Related:** [OBSERVABILITY_PROPOSAL.md](OBSERVABILITY_PROPOSAL.md)

### Objective
Replace the copy-pasted/absent per-service error handlers with one shared `setErrorHandler`: safe
client responses, one structured (redacted) error log per failure, no stack/secret leakage. Precedes
O3 so the metrics error counter can hang off the uniform handler.

### Deliverable — `packages/shared/errors.js` (+ `.d.ts`, `./errors` export)
`createErrorHandler()` returns a Fastify handler preserving the existing contract
(`{ success:false, error:{ statusCode, code, message, details:[] } }`). Explicit-`statusCode` errors
pass through unchanged; errors without one map safe Postgres codes
(`23505`/`23503`→409, `42501`→403, `22P02`/`23514`→400) else a **generic 500** (no raw message/stack
to the client). One `request.log.error({ err, code, statusCode })` line (redacted by O1); an O3
counter insertion point left as a comment (no `prom-client`). Wired across all seven backends — the
five ad-hoc handlers replaced, `mint`/`verification` newly covered.

### Acceptance (met)
Existing error contract byte-compatible; forced unmapped error → generic 500 with no leakage;
`23505` → clean 409; build clean; disposable compliance 88/88.

### Outcome
EXECUTED and APPROVED at **Review #21**. Independently verified via direct injection: explicit
pass-through intact, secret-bearing 500 leak-free, `23505`→409; build exit 0, `vitest` 16/16, no
`prom-client` (scope-clean). Surfaced a pre-existing LAB-04 compliance-harness URL double-append
(HO-007 debt), fixed separately in **Review #22**. Evidence:
`docs/operations/HO011_OBSERVABILITY_O4_VERIFICATION.md`.

---

## Specification template

Copy the block below for each new handoff. Assign the next `HO-NNN` id and add a row to
the index above.

```
## HO-NNN: <Title>

- **Spec ID:** HO-NNN
- **Milestone:** <milestone>
- **Date:** YYYY-MM-DD
- **Status:** DRAFT / HANDED-OFF / IMPLEMENTED / SUPERSEDED (by HO-NNN)
- **Related Decision(s):** AD-NNN
- **Related Review:** Review #N

### Objective
<what and why, in one or two sentences>

### Architectural Intent
<the design principle this preserves; how it fits the existing architecture>

### Scope
<in scope / explicitly out of scope>

### Affected Services
<service list>

### Affected Files
<path list — be specific>

### Database Impact
<tables, columns, constraints, indexes; none if N/A>

### Migration Impact
<new migration file(s), ordering, backfill, reversibility>

### Security Considerations
<authn/authz, tenant isolation, signatures, secrets, input validation>

### Testing Strategy
<unit / integration / compliance-suite cases; what must pass>

### Rollback Strategy
<how to revert safely; data-loss considerations>

### Acceptance Criteria
<objective, checkable conditions for done>

### Commit Boundaries
<the intended commit sequence — one logical change per commit>

### Stopping Point
<where Codex must stop and return for approval>

### Approval Gate
<what the architect will verify before approving the next milestone>
```

---

> **Note:** Handoff specs are produced only when the operator explicitly requests
> implementation planning. Until then this archive stays empty by design.
