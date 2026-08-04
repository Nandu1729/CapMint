# Placeholder Services Disposition

> **Status:** DECIDED
>
> **Date:** 2026-07-31
>
> **Baseline:** `develop` at `05010351`

## Decision matrix

None of the seven directories was an npm workspace or a running process: each contained only
a placeholder README and `.gitkeep`. The seven implemented services remain auth, CPQ, mint,
resolver, transparency, verification, and integration.

| Placeholder | Decision | Current owner/evidence | Repository action |
|---|---|---|---|
| `analytics-service` | **DROP** | Prometheus provides operational metrics; no business-analytics API, data ownership, or approved roadmap exists | Directory removed |
| `audit-service` | **DROP** | Transparency owns the immutable ledger and public verification/query surface; structured logs cover operational audit | Directory removed |
| `clone-detection-service` | **DROP** | Verification already performs geovelocity/duplicate-scan checks and owns investigation lifecycle | Directory removed |
| `gateway-service` | **DROP** | `scripts/frontend-server.js` is the local static proxy; production ingress is a deployment concern, not an unimplemented application service | Directory removed |
| `identity-service` | **BUILD — deferred** | Current service-boundary and entity-catalog documents assign it producer, certifier, plot, and organization-profile ownership | Placeholder retained; implementation requires a separate gate |
| `notification-service` | **DROP** | No event bus, outbox, delivery contract, provider selection, or approved notification roadmap exists; Prometheus alert delivery is operational infrastructure | Directory removed |
| `scan-service` | **DROP** | Verification already ingests public scans, writes `scan_events`, calculates verdicts, and triggers clone investigations | Directory removed |

## Deferred build scope: identity-service

The future identity service should own tenant-scoped organization profiles, producer and
certifier records, plot/hive-cluster origins, accreditation state, and profile synchronization
with the integration service. Auth must remain responsible for credentials, users, JWTs, and
login/RBAC; CPQ, mint, and verification should consume identity data without becoming profile
writers. Delivery requires a separately approved API and data-ownership plan that migrates
the current profile writes from auth without a dual-writer interval, preserves
`capmint_app`/RLS enforcement, and includes the shared logging, readiness, metrics, error,
build, and compliance controls used by the seven real services. This task does not authorize
that implementation.

## Removal rationale and future re-entry

The six dropped names are not reserved architecture commitments. Their capabilities remain
owned by the implemented services or deployment tooling shown in the matrix. If scale or a
new product contract later justifies extracting one, it should return through an architecture
decision defining its data ownership, API/events, failure model, deployment cost, and
migration away from the existing owner—not by recreating an empty directory.

Historical promotion records, AD-006, and v1.1.0 release notes intentionally retain their
statement that seven placeholders existed at promotion time. This decision supersedes that
state for current development.

## Impact

- No implemented service source, manifest, port, route, workspace, or lockfile entry changed.
- Root `start`/`dev` still launches exactly the same seven backend services.
- The retained identity directory still has no package manifest or runtime entrypoint and is
  not presented as shipped.

## Validation

- `npm ci` — passed; lockfile unchanged.
- `npm run build` — all seven implemented services compiled.
- `npm test --workspaces --if-present` — 61 tests passed; 59 database/integration tests
  skipped by their existing environment gates; no failures.
- `npm query .workspace` — no removed placeholder appeared before or after the cleanup.
