# CapMint Transparency-Ledger Append-Identity Proposal

> **Status:** PROPOSED
>
> **Date:** 2026-07-30
>
> **Scope:** Design only; no application, database, key, or infrastructure change is
> authorized by this document.

## Decision summary

CapMint should replace the transparency ledger's acceptance of ordinary user JWTs with
short-lived, body-bound service assertions signed by a distinct asymmetric key for each
service that is allowed to append.

The transparency service becomes the single general runtime append gateway. The
checksum-pinned registration function remains a narrow atomic exception whose event and
entity shape are not caller-selectable. After the gateway verifies an assertion, it writes
through a dedicated non-owner, `NOBYPASSRLS` database role. A transaction-local appender
identity derived only from the verified assertion is checked by a new `log_entries` INSERT
policy. The policy contains an explicit allowlist of:

```text
(appender service, event type, entity type, required public-context shape)
```

There is no wildcard event, user-role bypass, system-administrator bypass, or generic
"authenticated tenant" branch. Ordinary `capmint_app` connections retain global ledger
SELECT but lose direct ledger INSERT.

The existing public-context event requirements remain supported:

- `GENESIS_BLOCK_ANCHOR` by `transparency-service`, with the existing `SYSTEM` entity and
  all-zero entity UUID shape.
- `USER_LOGIN` by `auth-service`, including the pre-auth/public context.
- `ORGANIZATION_REGISTERED` through the public registration flow, with its event and entity
  shape fixed by the narrowly granted registration function.

The recommended assertion protocol is asymmetric compact JWS using one hardware- or
secret-manager-backed private key per appending service. The existing shared `JWT_SECRET`
continues to authenticate users during migration but grants no ledger append authority.

## Why this change is needed

The current append endpoints use the same `@fastify/jwt` verifier and HS256 `JWT_SECRET` as
user-facing routes. The verification service manually creates a token containing:

```json
{
  "svc": "verification-service",
  "role": "ADMIN",
  "orgType": "SYSTEM_ADMINISTRATOR"
}
```

The token is signed with the shared user JWT secret. The transparency service validates the
signature but does not require a trusted service issuer, audience, event entitlement, expiry,
or body binding. Consequently:

- A stolen valid user JWT can reach the append route.
- Any holder of `JWT_SECRET` can mint an arbitrary user or service claim.
- A forged `SYSTEM_ADMINISTRATOR` claim sets the database system-admin GUC and satisfies the
  current broad INSERT policy.
- The endpoint accepts caller-chosen `entity_type`, `entity_id`, `event_type`, and payload.
- The current RLS policy permits every event from a non-empty organization context and every
  event from a claimed system administrator.

The database role guard still correctly ensures services use non-owner `capmint_app`, and the
ledger remains append-only. Those controls do not identify which service is authorized to
append a specific event.

Relevant current controls are:

- [`backend/transparency-service/src/index.ts`](../../backend/transparency-service/src/index.ts)
  — generic JWT-authenticated append routes and chain construction.
- [`backend/verification-service/src/index.ts`](../../backend/verification-service/src/index.ts)
  — shared-secret synthetic service token and current runtime event calls.
- [`backend/auth-service/src/index.ts`](../../backend/auth-service/src/index.ts) — direct
  `USER_LOGIN` append.
- [`0019_enable_users_and_ledger_rls.sql`](../../database/migrations/0019_enable_users_and_ledger_rls.sql)
  — current broad `log_entries_tenant_insert` policy.
- [`0020_tighten_organizations_public_read.sql`](../../database/migrations/0020_tighten_organizations_public_read.sql)
  — fixed-shape, owner-executed registration and `ORGANIZATION_REGISTERED` append.

## Goals and non-goals

### Goals

- Make possession of a user JWT or `JWT_SECRET` insufficient to append a ledger entry.
- Give every permitted runtime appender a distinct, rotatable cryptographic identity.
- Limit compromise of one appender to that service's explicit event catalog.
- Bind each assertion to one request body, event, audience, and short validity window.
- Enforce the event-to-appender matrix again at the database INSERT boundary.
- Keep all runtime database writers non-owner and `NOBYPASSRLS`.
- Preserve public ledger reads and the three current public-context event allowances.
- Deny unknown services, event types, entity shapes, claims, algorithms, and key IDs.
- Support safe retry, replay resistance, key rotation, and attributable audit logs.

### Non-goals

- This control cannot stop a compromised service from creating a false event that is within
  that service's approved catalog.
- It does not make the ledger contents truthful, replace route-level business authorization,
  or replace external anchoring.
- It does not make the database owner subject to ENABLE-not-FORCE RLS.
- It does not redesign append serialization or the current table lock.
- It does not grant CPQ, mint, resolver, integration, or other services append authority
  merely because they are internal.
- This proposal does not implement keys, claims, migrations, routes, or tests.

## Current append inventory

The runtime code currently emits the following event set:

| Current origin | Event type | Entity type | Trigger context |
|---|---|---|---|
| transparency-service | `GENESIS_BLOCK_ANCHOR` | `SYSTEM` | Startup, empty/public tenant context |
| auth-service | `USER_LOGIN` | `USER` | Public login flow; the route currently derives the user's organization before insertion |
| registration function called by auth-service | `ORGANIZATION_REGISTERED` | `ORGANIZATION` | Public registration, fixed inside the database function |
| verification-service | `INVESTIGATION_CREATED` | `INVESTIGATION` | Public consumer scan |
| verification-service | `LOT_CREATED` | `LOT` | Authenticated producer operation |
| verification-service | `LOT_CERTIFIED` | `LOT` | Authenticated certifier operation |
| verification-service | `INVESTIGATION_APPROVED` | `INVESTIGATION` | Authenticated certifier operation |
| verification-service | `PRODUCT_REVOKED` | `PRODUCT` | Authenticated certifier operation |
| verification-service | `INVESTIGATION_DISMISSED` | `INVESTIGATION` | Authenticated certifier operation |
| verification-service | `LOT_LAB_TEST_REPLACED` | `LOT` | Authenticated assigned-laboratory operation |
| verification-service | `LOT_LAB_TEST_FAILED_CASCADING_REVOCATION` | `LOT` | Authenticated assigned-laboratory operation |
| verification-service | `LOT_LAB_TEST_PASSED` | `LOT` | Authenticated assigned-laboratory operation |

`DEVELOPMENT_FIXTURES_SEEDED` is an owner-run development seed event, not a production runtime
event. It must not be accepted by the service append endpoint or granted to a runtime
appender.

This table is the initial closed catalog. Adding an event requires a forward migration, an
assertion-entitlement update, service tests, RLS tests, and architecture review. A service
must not obtain a wildcard entitlement to support possible future events.

## Options considered

| Option | Benefit | Weakness | Decision |
|---|---|---|---|
| Add `svc` to the existing shared-secret JWT | Smallest code change | Every holder of `JWT_SECRET` can forge every `svc`; it does not create a security boundary | **Reject** |
| Give each service a distinct symmetric append secret | Compromise is isolated to one service; simple HMAC verification | Transparency must hold every signing secret and can forge every identity; secret distribution and rotation are awkward | Acceptable temporary bridge only |
| Per-service asymmetric signed assertion | Transparency stores only public keys; private-key compromise is isolated; supports issuer, audience, key ID, expiry, and body binding | Requires key lifecycle and service-specific secret injection | **Recommend** |
| Mutual TLS or workload identity | Strong channel-bound workload identity and mature rotation when a service mesh or workload PKI exists | Adds deployment-infrastructure commitment not currently present | Future transport hardening |
| Distinct direct database login per appender | Database can map `current_user` directly | Spreads ledger credentials and chain-append logic across services; weakens the single-writer design | Reject for normal runtime appends |

## Recommended assertion protocol

### Identity and key separation

Initially, only these identities receive signing keys:

- `auth-service`
- `verification-service`
- `transparency-service` for the narrowly defined genesis operation

Each identity has its own private key and `kid`. Transparency receives an allowlisted issuer
to public-key mapping. It never receives another service's private key. The keys must not be
reused for user JWTs, certifier signatures, TLS, external anchoring, or database access.

The production process manager or secret manager injects exactly one append private key into
each authorized service process. The canonical repo-root `.env` must not contain all private
keys: because every backend loads that file, doing so would collapse the identities back into
one shared trust domain. Public verification keys may be distributed together; private keys
must be process-scoped and uncommitted.

Local development should use generated, non-production keys supplied per process by guarded
tooling or process-manager overrides. No known fixture key or weak default is permitted.

### Assertion claims

One compact JWS authorizes exactly one append request. Its protected header and payload
contain at least:

```json
{
  "alg": "EdDSA",
  "kid": "<service-specific key version>",
  "typ": "capmint-ledger-append+jwt"
}
```

```json
{
  "iss": "capmint-service:verification-service",
  "sub": "verification-service",
  "aud": "capmint:transparency:append",
  "event_type": "LOT_CREATED",
  "body_sha256": "<SHA-256 of canonical request bytes>",
  "iat": 1785430000,
  "nbf": 1785430000,
  "exp": 1785430060,
  "jti": "<at least 128 bits of random uniqueness>"
}
```

Ed25519 is recommended because CapMint already operates Ed25519 verification, but the
implementation must use a maintained JOSE library rather than hand-built JWT code. An
approved hardware-backed algorithm such as ES256 is acceptable if the selected KMS does not
support Ed25519. The verifier allowlists the exact algorithm per key and rejects algorithm
substitution.

The request body is canonicalized once by shared append-client code before hashing and
sending. The assertion binds the entire body, including `entity_type`, `entity_id`,
`event_type`, and payload. It cannot be replayed with a different event or entity. Maximum
lifetime should be 60 seconds with at most 30 seconds of configured clock skew.

The service assertion travels as:

```text
Authorization: ServiceAssertion <compact-JWS>
```

Using the `Authorization` header preserves existing log redaction. It is verified by a
dedicated internal authentication hook, never by the user-JWT hook.

### Verification requirements

The transparency gateway fails closed unless all of the following hold:

- The authorization scheme is `ServiceAssertion`, not `Bearer`.
- `typ`, `alg`, `kid`, issuer, subject, and audience are exact allowlisted values.
- The issuer and subject identify the same service.
- Signature, `iat`, `nbf`, `exp`, and maximum lifetime are valid.
- `event_type` is present in both the assertion and body and the values match.
- `body_sha256` matches the exact canonical request body.
- The service's in-process event catalog permits the event and entity type.
- `jti` has not been consumed for different content.

No claim from an incoming user token is promoted to service identity. The original user
request ID and, where appropriate, non-secret actor identifiers may be included in the event
payload for business audit, but they do not authorize the append.

## Append gateway and database trust boundary

### Service route

Create a single internal append route, for example:

```text
POST /internal/v1/ledger/entries
```

The two existing append aliases should either call the same service-assertion-only handler or
be removed after all callers migrate. They must no longer accept ordinary user JWTs. The
public `/api/v1/log/entries` and `/api/v1/log/verify` reads remain unchanged.

The gateway:

1. Reads and canonicalizes the bounded request body.
2. Verifies the service assertion and event entitlement.
3. Creates a database transaction with the appropriate tenant/public context.
4. Sets `app.ledger_appender_id` locally from the verified issuer—not from a body, query
   parameter, forwarded header, or unverified claim.
5. Serializes against the ledger tail, calculates hashes, and inserts one row.
6. Commits the transaction and stores the idempotency result for the assertion `jti`.
7. Logs the appender, event, result, request ID, and `jti` digest; it never logs the assertion
   or private material.

`SET LOCAL`/transaction-local `set_config(..., true)` prevents connection-pool identity
leakage. An unset or empty appender GUC denies every runtime insert.

### Dedicated writer role

A transaction GUC alone is not a strong database identity: any holder of a general database
credential can set a custom GUC. The database design must therefore also narrow who can
insert:

- Keep each service's ordinary pool on non-owner `capmint_app`.
- Create `capmint_ledger_writer` as a non-owner, `NOBYPASSRLS` role with access only to the
  database/schema, ledger SELECT/INSERT, and privileges needed to serialize an append.
- Give its credential only to the transparency service as a second, append-only pool.
- Add a startup assertion for this pool that rejects owner, superuser, `BYPASSRLS`, table
  owner, or an unexpected role name.
- Revoke `INSERT` on `log_entries` from `capmint_app` and remove its broad INSERT policy.
  Retain the public global SELECT policy.
- Do not grant the writer access to users, budgets, lots, unit codes, or another application
  table.

Other services may know `DATABASE_URL` for `capmint_app`, but setting
`app.ledger_appender_id` on that connection gives no INSERT privilege. Possession of the
shared user JWT secret gives neither a valid service assertion nor a writer credential.

The transparency service is consequently the trusted append gateway. Compromise of its
writer credential or process can still forge an appender GUC; this is an explicit residual
risk. Direct per-service database roles would remove that ambiguity but distribute more
credentials and duplicate the chain writer. Network policy, process-scoped secrets,
least-privilege role grants, and external anchoring reduce the gateway risk.

## Event-to-appender policy

The future INSERT policy should encode exact tuples, not `LIKE` patterns or a table writable
by application roles.

| Appender identity | Allowed event | Required entity type | Context/shape restriction |
|---|---|---|---|
| `transparency-service` | `GENESIS_BLOCK_ANCHOR` | `SYSTEM` | Empty organization context; entity ID is `00000000-0000-0000-0000-000000000000`; genesis values remain fixed; only when the chain has no genesis |
| `auth-service` | `USER_LOGIN` | `USER` | Empty/public context remains allowed; a derived authenticated organization context is also compatible with the current login flow |
| `auth-service` | `ORGANIZATION_REGISTERED` | `ORGANIZATION` | Empty/public context; normal path remains the fixed registration function |
| `verification-service` | `INVESTIGATION_CREATED` | `INVESTIGATION` | Public consumer-scan or authenticated context |
| `verification-service` | `LOT_CREATED` | `LOT` | Service assertion required |
| `verification-service` | `LOT_CERTIFIED` | `LOT` | Service assertion required |
| `verification-service` | `INVESTIGATION_APPROVED` | `INVESTIGATION` | Service assertion required |
| `verification-service` | `PRODUCT_REVOKED` | `PRODUCT` | Service assertion required |
| `verification-service` | `INVESTIGATION_DISMISSED` | `INVESTIGATION` | Service assertion required |
| `verification-service` | `LOT_LAB_TEST_REPLACED` | `LOT` | Service assertion required |
| `verification-service` | `LOT_LAB_TEST_FAILED_CASCADING_REVOCATION` | `LOT` | Service assertion required |
| `verification-service` | `LOT_LAB_TEST_PASSED` | `LOT` | Service assertion required |

Every other combination is denied, including known events from the wrong service. CPQ, mint,
resolver, integration, and ordinary authenticated users have no row in the matrix.

An illustrative policy shape is:

```sql
CREATE POLICY log_entries_append_identity_insert
ON public.log_entries
FOR INSERT
TO capmint_ledger_writer
WITH CHECK (
  (
    current_setting('app.ledger_appender_id', true) = 'transparency-service'
    AND event_type = 'GENESIS_BLOCK_ANCHOR'
    AND entity_type = 'SYSTEM'
    AND entity_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
  )
  OR (
    current_setting('app.ledger_appender_id', true) = 'auth-service'
    AND (
      (event_type = 'USER_LOGIN' AND entity_type = 'USER')
      OR (
        event_type = 'ORGANIZATION_REGISTERED'
        AND entity_type = 'ORGANIZATION'
        AND NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
      )
    )
  )
  OR (
    current_setting('app.ledger_appender_id', true) = 'verification-service'
    AND (event_type, entity_type) IN (
      ('INVESTIGATION_CREATED', 'INVESTIGATION'),
      ('LOT_CREATED', 'LOT'),
      ('LOT_CERTIFIED', 'LOT'),
      ('INVESTIGATION_APPROVED', 'INVESTIGATION'),
      ('PRODUCT_REVOKED', 'PRODUCT'),
      ('INVESTIGATION_DISMISSED', 'INVESTIGATION'),
      ('LOT_LAB_TEST_REPLACED', 'LOT'),
      ('LOT_LAB_TEST_FAILED_CASCADING_REVOCATION', 'LOT'),
      ('LOT_LAB_TEST_PASSED', 'LOT')
    )
  )
);
```

This is a design sketch, not executable migration text. The implementation must use a
forward-only migration, add an exact-state verifier, validate PostgreSQL tuple-expression
behavior, and preserve the existing chain constraints.

The current branches based on `actor_is_system_admin = 'on'` and "organization GUC is
non-empty" must not survive in the new INSERT policy. Those facts describe the initiating
user/tenant; they do not identify an appending service.

### Public-context compatibility

The tighter design changes who may exercise the public event allowances, not which required
public flows exist:

- **Genesis:** transparency starts with its own service identity and an empty tenant context.
  The event/entity/all-zero UUID tuple remains identical. The implementation must additionally
  enforce one genesis, either through a constrained helper or existing uniqueness plus an
  explicit precondition.
- **Login:** auth can issue a `USER_LOGIN` assertion before a user JWT exists. Empty context
  remains policy-valid. The current derived organization may still be carried for audit, but
  it is not required to establish service identity.
- **Registration:** `capmint_register_organization` remains public only through auth and
  continues to hardcode `ORGANIZATION_REGISTERED` and `ORGANIZATION`. Because the
  `SECURITY DEFINER` owner bypasses ENABLE-not-FORCE RLS, its fixed body and restricted
  `EXECUTE` grant remain the enforcement boundary. A successor migration must keep that
  function checksum-pinned and must not turn it into a generic append primitive.

If registration is later moved through the gateway, the organization/user write and audit
event require a transactional outbox or an equivalent atomic design. It must not silently
lose the event between database commit and network publication.

## Replay, retry, and failure behavior

Service assertions are short-lived and single-purpose. The gateway should keep a bounded
`jti → body digest → ledger result` record for at least the assertion lifetime plus clock
skew:

- First valid use appends once and records the result.
- A retry with the same `jti` and body digest returns the original result without appending.
- Reuse of the same `jti` with different content is a security event and fails closed.
- An unavailable replay store must not downgrade to replayable mode. The append fails with a
  safe 503 and the caller retries with the same idempotency identity.

Ledger append failure behavior should remain explicit per business flow. A caller must
inspect the response; a non-2xx response cannot be counted as successful merely because the
network call completed. Critical state changes should use an outbox where atomic delivery is
required. Login should not issue a token if its mandatory audit append has failed unless an
approved availability decision changes that behavior.

Clock failures, unknown keys, stale assertions, wrong audiences, body mismatches, disallowed
events, missing appender GUCs, and RLS denials all fail closed with safe client errors. Raw
database text, assertion bodies, keys, and stack traces remain out of responses and logs.

## Key lifecycle

- Generate keys in a managed secret store or HSM where possible.
- Identify every public key by issuer and `kid`; never select a key from `kid` alone.
- Add the new public key before a service starts signing with it.
- Keep old and new public keys valid for an overlap longer than maximum assertion lifetime,
  retry duration, and clock skew.
- Remove the old public key only after no valid assertion can remain.
- Refuse duplicate key fingerprints across service identities.
- Alert on unknown/retired key use and repeated signature failures.
- On private-key compromise, revoke only that service's key, stop its append calls, preserve
  evidence, rotate it, and review all events in its allowed catalog during the exposure
  window.

Changing `JWT_SECRET` is not part of service-assertion key rotation. The two trust domains are
deliberately independent.

## Observability and audit

Structured append logs and metrics should include only low-cardinality or non-secret fields:

- verified appender service
- event type
- outcome (`ok`, `authentication_error`, `authorization_error`, `replay`, `db_error`)
- HTTP status
- request ID
- a one-way digest or safely truncated representation of `jti`
- key ID, if key IDs are classified as non-secret

Metrics should count assertion verification failures, wrong-service event attempts, replay
attempts, RLS denials, and successful appends by the small fixed appender/event catalog.
Never label with assertion bytes, entity IDs, organization IDs, user IDs, usernames, tokens,
or payload data.

Alerts should distinguish a caller bug from suspected attack: repeated wrong-audience or
expired assertions are operational warnings; body mismatch, cross-service event attempts,
replay with different content, and database-policy disagreement are security alerts.

## Phased implementation plan

### Phase 0 — ratify catalog and protocol

- Approve the initial event matrix and name an owner for every event.
- Approve assertion format, canonical body encoding, algorithm, TTL, skew, replay behavior,
  and key custody.
- Decide which events require synchronous failure and which require a transactional outbox.
- Define test vectors for valid, invalid, rotated, replayed, and body-mismatched assertions.

**Exit:** architecture/security approval, complete event catalog, and interoperable test
vectors.

### Phase 1 — introduce service assertions

- Add one shared assertion signer/verifier module; do not copy JOSE code into services.
- Provision process-scoped keys for auth, verification, and transparency.
- Add the internal service-assertion route and in-process event matrix.
- Migrate verification events and the login event to signed calls.
- Keep registration's fixed database function and genesis shape intact.
- Record and alert on any use of the legacy user-JWT append route.

**Exit:** all known runtime callers use assertions, shared-secret claims cannot pass the new
route, and legacy append traffic is zero for an agreed observation window.

### Phase 2 — enforce the database boundary

- Add `capmint_ledger_writer`, its startup guard, exact privileges, and the appender/event RLS
  policy in a forward-only migration.
- Revoke `capmint_app` ledger INSERT and remove the old broad policy branches.
- Set the appender GUC only inside the verified append transaction.
- Disable or remove the legacy append handler in the same cutover.
- Add migration reconciliation and compliance tests for role grants and exact policy text.

**Exit:** direct `capmint_app` INSERT fails, every allowed tuple succeeds through its own
service assertion, every wrong/unknown tuple is denied, and the full chain remains unbroken.

### Phase 3 — operational hardening

- Exercise key rotation, key revocation, replay-store outage, clock skew, gateway outage, and
  database failover.
- Add transactional outboxes for flows whose business mutation and ledger append must be
  atomic.
- Restrict the internal endpoint at the network layer.
- Evaluate mTLS or workload identity as an additional channel-bound control.
- Correlate append identities with externally anchored checkpoints.

**Exit:** incident and recovery drills pass without a shared-secret or fail-open fallback.

## Future implementation acceptance criteria

- A valid user JWT cannot call a ledger append route.
- A token forged with `JWT_SECRET`, including a forged `svc` or system-admin claim, cannot
  append.
- Every authorized service has a distinct private key; no process receives another service's
  append private key.
- Wrong issuer, audience, algorithm, key, expiry, event, entity type, body digest, or replay
  fails closed.
- `auth-service` cannot append verification events, and `verification-service` cannot append
  auth or genesis events.
- Unknown events and services are denied without a wildcard fallback.
- Direct `capmint_app` ledger INSERT is denied; ledger SELECT remains public.
- The writer role is non-owner, `NOBYPASSRLS`, and has no access to another application table.
- Empty-context `GENESIS_BLOCK_ANCHOR`, `USER_LOGIN`, and `ORGANIZATION_REGISTERED` flows
  continue to work only through their approved identities and fixed entity shapes.
- The registration function remains narrowly executable and cannot append caller-selected
  events.
- All nine current verification events append under `verification-service`.
- Assertion retry is idempotent and conflicting replay is rejected.
- Key rotation succeeds with no shared-key fallback.
- Logs and metrics contain no token, private key, payload, PII, or high-cardinality identifier.
- Existing response contracts, public ledger reads, RLS smoke tests, chain verification,
  workspace tests, and the compliance suite remain green.

## Residual risks and follow-up decisions

- The transparency process and its append-only database credential remain a central trust
  point. A compromised gateway can select an appender GUC despite the assertion protocol.
- ENABLE-not-FORCE RLS does not constrain `capmint_admin`; owner access remains an operational
  trust boundary.
- A compromised appender can forge events within its own approved catalog.
- Synchronous append calls can couple business availability to the transparency service;
  outbox decisions must be explicit.
- Service-specific private-key injection requires deployment configuration beyond the
  shared root `.env`.
- Event ownership can drift unless new event types are migration- and review-gated.

These risks do not justify retaining the shared JWT append path. The proposed controls
materially reduce its blast radius while preserving the current public registration, login,
genesis, and public ledger-read behavior.
