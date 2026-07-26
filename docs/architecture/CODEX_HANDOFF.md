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
