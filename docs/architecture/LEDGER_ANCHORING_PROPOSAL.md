# CapMint Transparency-Ledger External Anchoring Proposal

> **Status:** PROPOSED
>
> **Date:** 2026-07-30
>
> **Scope:** Design only; no application, database, or infrastructure change is authorized by
> this document.

## Decision summary

CapMint should publish a cryptographically signed checkpoint of the transparency-ledger head
every five minutes to a write-once, read-many (WORM) object store in a separate cloud account
or equivalent independent administrative domain. The checkpoint must be signed with a
dedicated hardware-backed anchoring key. After the external object has been written and read
back successfully, its content-addressed locator is recorded in the anchored `log_entries`
row's existing `published_anchor_reference` column.

This combines two useful controls:

- The external WORM store preserves evidence outside the production database and resists
  deletion or replacement.
- The signature makes a checkpoint independently verifiable after export and separates
  authenticity from storage-account access.

A daily public timestamp of the latest checkpoint, or of a Merkle root over that day's
checkpoints, is recommended as a later phase if an independent proof of time is required.
Public timestamping is not necessary for the first deployable control.

The checkpoint interval bounds the normal undetectable rollback window to approximately five
minutes. An operational service-level objective (SLO) should warn when the most recent
verified anchor is older than 15 minutes and alert critically at 30 minutes.

## Current state

`log_entries` is a single global append-only SHA-256 chain. Each ordinary entry's
`current_hash` is calculated from:

```text
entity_type || entity_id || event_type || payload_hash || previous_hash
```

The transparency service's `/api/v1/log/verify` endpoint recomputes this chain from genesis
and reports whether it is unbroken. This detects internal mutation when the surviving chain
is examined, but it cannot independently detect replacement or rollback of the database and
its verifier to an older, internally consistent snapshot.

The schema already contains nullable
`log_entries.published_anchor_reference VARCHAR(255)`, but no process writes or verifies it.
The column is not part of `current_hash`. Under the current RLS model, `capmint_app` may read
and append ledger entries but has no UPDATE policy; that immutability must remain intact.

External anchoring closes the rollback-evidence gap by preserving selected historical head
hashes outside the database's control plane.

## Goals and non-goals

### Goals

- Provide externally retained evidence of the ledger head at regular intervals.
- Detect mutation, deletion, reordering, truncation, or rollback at or before the latest
  successfully published checkpoint.
- Populate `published_anchor_reference` without giving an application service general UPDATE
  access to `log_entries`.
- Keep ledger appends available while the external notary is unavailable.
- Make publishing and recovery idempotent, observable, and safe to retry.
- Keep anchor artifacts free of payload data, credentials, tenant identifiers, and PII.
- Support independent and offline verification of exported checkpoints.

### Non-goals

- Anchoring does not establish that an event or its payload was truthful when recorded.
- It does not prevent malicious entries from being appended by an already authorized actor.
- It does not protect entries created after the latest successful checkpoint.
- It does not provide confidentiality; ledger hashes and minimal timing metadata are treated
  as public verification material.
- It does not survive simultaneous compromise of the database, the external store's
  administrative domain, and the signing key.
- This proposal does not select a production vendor, create a migration, or implement a
  worker or endpoint.

## Options considered

| Option | Integrity and independence | Operational characteristics | Cost profile | Assessment |
|---|---|---|---|---|
| Second append-only store | Strong rollback resistance when WORM retention is in a separately administered account; it does not by itself prove time to an independent third party | Simple object write/read workflow; provider account and retention policy remain trust dependencies | Very low storage and request cost at this volume; optional replication, audit logs, and key operations add cost | **Recommended storage layer** |
| Public timestamping service | Strongest independent evidence that a digest existed no later than a stated time | Adds third-party availability, receipt/certificate validation, rate limits, and renewal or long-term validation concerns; decentralized services may have confirmation delay | Provider dependent; anchoring every five minutes creates about 105,120 requests per year, while daily batching needs only 365 | **Recommended optional Phase 3 layer** |
| Signed periodic checkpoint only | Proves which key signed a checkpoint and enables offline verification | If the checkpoint remains beside the database, an attacker can delete or roll back both; a signer can also withhold or backdate checkpoints | Lowest direct cost | **Insufficient alone; required as part of the recommended external publication** |

A public RFC 3161 Time-Stamp Authority (TSA) is appropriate when a contractual, independently
signed proof of time is required. OpenTimestamps is another viable later-stage option for
anchoring hash proofs to a public blockchain. Neither replaces the need for a reliably
queryable, independently retained checkpoint archive.

## Recommended architecture

### Components and trust boundaries

1. **Ledger database** — remains the system of record. Normal services continue to connect as
   non-owner `capmint_app`; their RLS and ledger permissions do not change.
2. **Anchor worker** — a separately deployed scheduled process. It reads the ledger and
   publishes checkpoints; it is not part of an HTTP request path.
3. **Dedicated database role** — future role `capmint_anchor`, with `LOGIN`, `NOBYPASSRLS`,
   no table ownership, no UPDATE privilege, and access only to a ledger SELECT policy plus the
   controlled function required by the anchoring workflow.
4. **Dedicated signing key** — an asymmetric key held by an HSM or managed KMS. It must not be
   the certifier key, JWT key, database credential, or a file-exportable application secret.
   The checkpoint includes a stable `key_id`; public verification material and its validity
   periods are retained for the life of the anchors.
5. **External WORM store** — a bucket or equivalent append-only service in a separate security
   account. The writer may create objects but cannot delete them, shorten retention, or
   change compliance settings. Auditors receive read-only access through a separate role.
6. **Verifier** — code or an operational tool that verifies the database chain, external
   artifact, signature, and freshness. It should be runnable without anchor-writer
   credentials.

For an S3 implementation, Object Lock Compliance mode is the target production control:
protected object versions cannot be overwritten or deleted during their retention period.
Governance mode is suitable for a time-boxed pre-production exercise, but is not equivalent
because privileged users can bypass it. Version-aware or content-addressed retrieval is
mandatory; a delete marker or newer version must never cause the verifier to silently select
different content.

### Checkpoint document

The worker produces a small versioned document. The signed payload should contain at least:

```json
{
  "schema": "capmint-ledger-anchor/v1",
  "chain_id": "capmint:<environment>:transparency-v1",
  "entry_id": "<ledger entry UUID>",
  "head_hash": "<64-character lowercase SHA-256 hex>",
  "entry_created_at": "<UTC RFC 3339 timestamp>",
  "observed_at": "<UTC RFC 3339 timestamp>",
  "entry_count": 12345,
  "previous_checkpoint_digest": "<SHA-256 hex or null>",
  "hash_algorithm": "sha256",
  "signing_algorithm": "<approved algorithm>",
  "key_id": "<non-secret key version identifier>"
}
```

The payload is serialized with a specified canonical representation, such as RFC 8785 JSON
Canonicalization Scheme. The envelope adds the base64url signature and checkpoint digest.
The signature covers the entire canonical payload. A managed P-256 signing key is a portable
baseline; Ed25519 is acceptable where the selected hardware-backed key service and verifier
toolchain support it.

`chain_id` prevents a checkpoint from staging, a test database, or another CapMint deployment
being replayed as production evidence. `previous_checkpoint_digest` creates a second,
lower-frequency chain across checkpoints. `entry_count` is a consistency aid, not a security
substitute for the head hash.

No event payload, organization ID, entity ID, username, token, database address, or secret is
published. `entry_id` identifies only the ledger row being anchored.

### External identity and `published_anchor_reference`

The existing column stores a locator, not the proof itself. The recommended form is a short,
versioned, content-addressed reference:

```text
capmint-anchor:v1:<store-alias>:<entry-id>:<checkpoint-sha256>
```

This stays below 255 characters, does not expose credentials or a mutable URL, and identifies
the expected bytes even if the provider creates multiple object versions. `store-alias` is
resolved through trusted deployment configuration to a bucket, region, account, and
deterministic object-key convention. The verifier accepts only configured schemes and aliases.

The object key should include `chain_id`, `entry_id`, and the checkpoint digest. Writes use
create-only semantics. The provider object-version ID, retention-until time, and write receipt
may be preserved in operational audit records or a future dedicated publication table; they
need not fit in `published_anchor_reference`.

### Publication sequence

1. On a five-minute schedule, open a short read-only, repeatable-read database transaction.
2. In one snapshot, select the current head ordered by `created_at DESC, id DESC` and obtain
   the entry count. Do not hold the ledger append lock while making a network call.
3. If this exact head already has a valid anchor reference, finish successfully without
   publishing another object.
4. Construct the canonical checkpoint and link it to the preceding checkpoint digest.
5. Ask the dedicated hardware-backed key to sign the checkpoint.
6. Create the deterministic external object under WORM retention. Treat an already-existing
   object as success only when its digest and signature exactly match.
7. Read the object back, validate its bytes, signature, object identity, and effective
   retention.
8. Only after successful external verification, invoke the controlled database operation to
   set the anchor reference on the exact `(entry_id, current_hash)` pair.
9. Emit success/failure metrics and a structured audit log without logging secrets.

The ledger may advance during steps 4–8. That is expected: the checkpoint proves the complete
prefix ending at the selected entry, while later entries form the next unanchored suffix.

### Controlled database update

A future additive migration should provide a narrow security boundary rather than adding an
UPDATE policy for `capmint_app`:

- Create `capmint_anchor` as a non-owner role with `NOBYPASSRLS`.
- Grant it SELECT on `log_entries` through a dedicated `USING (true)` RLS policy. This matches
  the ledger's existing public-read design without inheriting `capmint_app` or granting access
  to another application table.
- Create a `SECURITY DEFINER` function owned by `capmint_admin`, with a fixed safe
  `search_path`, and revoke its default `PUBLIC` execution privilege.
- Grant `EXECUTE` only to `capmint_anchor`.
- Accept `entry_id`, expected `current_hash`, and the anchor reference.
- Require an exact existing row/hash match and a recognized reference format no longer than
  255 characters.
- Permit only `NULL → reference`. Repeating the same reference is an idempotent success;
  finding a different non-null reference is a hard conflict and security incident.
- Update only `published_anchor_reference`; never expose a general-purpose SQL expression or
  permit changes to hashes, events, identities, or timestamps.
- Add a partial unique index for non-null references and, if appropriate, a format constraint.

This is a controlled metadata exception to append-only ledger content. The reference is
intentionally outside the historical `current_hash`: including it would require changing the
already published chain after its hash was computed.

A later `ledger_anchor_publications` append-only table may retain receipts, signing key IDs,
external version IDs, attempts, and checkpoint digests. It should supplement—not replace—the
existing column as the direct row-to-anchor locator.

## Verification flow

Verification must distinguish internal chain integrity, external authenticity, and anchor
freshness:

1. Identify the newest externally published checkpoint for the configured `chain_id`. In
   normal operation this begins with the latest non-null `published_anchor_reference`; during
   disaster recovery it must also be discoverable by listing or indexing the external store
   independently of the database.
2. Resolve the allowlisted reference and retrieve the bytes whose digest appears in the
   reference. Do not follow arbitrary URLs supplied from the database.
3. Recompute the checkpoint digest and verify its signature using the trusted key identified
   by `key_id`, including key validity and revocation state.
4. Verify `chain_id`, schema version, algorithms, timestamps, and the link to the previous
   checkpoint.
5. Require the checkpoint's `entry_id` and `head_hash` to match the referenced database row.
6. Recompute the ledger chain from genesis through that row and require the computed head to
   equal the checkpoint head.
7. Verify the remaining database suffix from the anchored row through the current head.
8. Report the anchor age, unanchored entry count, external retention status, and distinct
   results for `chain_unbroken`, `anchor_valid`, and `anchor_fresh`.

The existing `/api/v1/log/verify` behavior should remain compatible. A future implementation
may add an `anchor` result object or a separate `/api/v1/log/anchors/latest` endpoint, but an
internal chain success must never be presented as an external-anchor success.

During recovery, if the latest external checkpoint refers to a head missing from the restored
database, verification has detected rollback or data loss. Production must not resume as
healthy until the discrepancy is investigated and any accepted loss is explicitly recorded.

An independent verifier should periodically perform the same procedure from a separate
runtime and read identity. This avoids relying solely on the component that created the
evidence.

## Failure handling

External anchoring is asynchronous. A notary, network, KMS, or anchor-worker outage must not
block normal ledger appends. It reduces assurance and therefore must be visible:

- Retry transient publication failures with bounded exponential backoff and jitter.
- Do not write `published_anchor_reference` until external create and read-back verification
  have succeeded.
- If external publication succeeds but the database update fails, reconciliation locates the
  deterministic object by head and digest, verifies it, and safely repeats the database step.
- Never overwrite or ignore a conflicting object, digest, signature, or non-null database
  reference. Quarantine the attempt and raise a security incident.
- Warn when the latest verified checkpoint is older than 15 minutes; alert critically after
  30 minutes, on repeated signature failures, on a retention-policy mismatch, or when the
  independently observed store head diverges.
- A missed interval does not require fabricating a historical observation. The next
  successful checkpoint anchors the current prefix and records its real observation time.
- Pending retry state should be durable and bounded. Reconstructing it must not depend only
  on the possibly compromised production database.

For signing-key rotation, publish a transition checkpoint that identifies the new key and is
verifiable by the old key, then begin signing with the new key. Retain old public keys and
validity metadata indefinitely. On suspected key compromise, stop publication, revoke the
key, preserve all evidence, and resume only through an approved recovery ceremony; do not
rewrite existing anchors.

Before enabling irreversible Compliance-mode retention, validate retention duration, legal
hold, privacy, and deletion obligations. The proposed default is to retain anchors for at
least the ledger's required retention period; a seven-year value is a planning assumption
pending legal approval, not a decision in this document.

## Security properties and residual risk

Assuming the external administrative domain and signing key have not both been compromised,
an attacker cannot silently rewrite or truncate the ledger at or before the newest published
head without producing a mismatch against retained evidence. The maximum normal exposure is
the interval between the newest ledger entry and a successfully verified anchor.

Residual risks include:

- Simultaneous compromise of the database, external store control plane, and signing key.
- Withholding during an outage or deliberate suppression until freshness monitoring reacts.
- False but internally valid events appended before a checkpoint.
- Leakage of coarse activity through checkpoint time and entry-count metadata.
- Misconfigured retention, key policy, verifier trust roots, or environment identity.
- Dependence on the long-term availability of the selected provider and cryptographic
  algorithms.

Separation of duties, WORM retention, hardware-backed signing, independent verification,
checkpoint-link continuity, and public timestamping in a later phase reduce these risks.

## Capacity and cost

A five-minute interval creates:

- 288 checkpoints per day
- approximately 8,640 per 30-day month
- 105,120 per 365-day year

At one to two KiB per signed artifact, annual object data is roughly 100–210 MiB before
provider metadata and replication. The planning formula is:

```text
monthly cost =
  8,640 × (object-create request + signing operation)
  + retained storage
  + read/verification requests
  + audit logging and monitoring
  + optional replication
  + optional public timestamp fees
```

Exact pricing is provider- and region-dependent. At this data volume, raw object storage and
request charges are ordinarily small; KMS signing, audit logging, replication, monitoring,
and operational ownership are more likely to dominate the direct infrastructure bill. A
public TSA request every five minutes may be materially more expensive and operationally
noisier. Daily batching reduces that layer to 365 submissions per year without weakening the
five-minute WORM checkpoints.

Engineering, incident response, key ceremonies, recovery testing, and independent audit time
should be budgeted explicitly; they will likely exceed storage cost.

## Phased delivery plan

### Phase 0 — ratify the design

- Record an architecture decision selecting provider class, administrative boundary,
  retention period, signing algorithm, key custodian, and five-minute/15-minute/30-minute
  schedule and SLO.
- Complete threat modeling, legal retention review, data classification, and account-policy
  review.
- Define canonical bytes, reference grammar, verifier test vectors, and key-rotation ceremony.

**Exit:** signed-off ADR, cost estimate, operational owner, and test vectors reviewed by
security and operations.

### Phase 1 — signed WORM checkpoints

- Add the forward-only database migration for `capmint_anchor`, the controlled update
  function, constraints/index, and optional publication receipt table.
- Build the scheduled anchor worker and independent verification CLI.
- Provision a separate-account store, dedicated hardware-backed key, audit logging, and
  least-privilege identities.
- Run in shadow mode with Governance retention, then enable Compliance retention only after
  recovery and retention tests pass.
- Add freshness, error, divergence, and retention alerts plus a recovery runbook.

**Exit:** checkpoints publish and populate the exact ledger row idempotently; mutation and
rollback tests are detected; store/KMS outages do not block appends; stale anchors alert;
recovery from an external-only index succeeds.

### Phase 2 — operational enforcement

- Surface separate internal-chain and external-anchor status to operators.
- Run independent scheduled verification from a separate runtime/account.
- Make a fresh valid anchor a production readiness and database-restore gate.
- Exercise key rotation, account compromise, provider outage, and disaster recovery.
- Measure actual cost and adjust the interval only through an approved risk decision.

**Exit:** readiness, restoration, on-call, and audit procedures depend on independently
verified evidence rather than the publisher alone.

### Phase 3 — independent public time

- Publish one daily TSA token for the latest checkpoint, or timestamp a Merkle root over that
  day's checkpoint digests.
- Evaluate RFC 3161 and OpenTimestamps for longevity, independent verifiability, latency,
  service diversity, and legal requirements.
- Retain receipts beside the WORM checkpoints and verify them in the independent verifier.

**Exit:** the external evidence includes an independently verifiable proof of time, with
documented renewal and long-term verification procedures.

## Future implementation acceptance criteria

- The writer cannot update ledger content or a second anchor reference.
- The service roles remain `NOBYPASSRLS`; `capmint_app` still cannot UPDATE `log_entries`.
- Replaying the same publication is idempotent; a conflicting publication fails closed.
- The external artifact, signature, reference digest, WORM retention, and checkpoint chain
  verify independently.
- Tests detect ledger-row mutation, deletion, truncation, snapshot rollback, object
  replacement, environment replay, and stale anchors.
- Store, KMS, and network failures never block ledger appends and always become visible.
- Recovery detects a database ending before the newest external checkpoint.
- Key rotation preserves verification of every historical checkpoint.
- Public artifacts and logs contain no payload, PII, credential, or secret.
- Measured costs and anchor-age SLOs are included in the operational review.

## References

- [Amazon S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
  — WORM behavior and the distinction between governance and compliance retention.
- [Amazon S3 Object Lock considerations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html)
  — versioning, delete markers, and retention management considerations.
- [RFC 3161: Internet X.509 Public Key Infrastructure Time-Stamp Protocol](https://datatracker.ietf.org/doc/rfc3161/)
  — standardized third-party timestamp requests and tokens.
- [OpenTimestamps](https://opentimestamps.org/) — independently verifiable hash timestamp
  proofs and public calendar model.
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) —
  deterministic JSON representation suitable for signing.
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) — provider-specific storage,
  request, transfer, and replication cost components.
