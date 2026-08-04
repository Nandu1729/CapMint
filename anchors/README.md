# Ledger Anchors — public tamper-evidence proofs

Every `.tsr` file here is an **RFC 3161 timestamp token**: an independent Time-Stamping
Authority's cryptographic signature proving that a specific CapMint transparency-ledger
head hash **existed at a specific moment in time**. Each token has a `.json` sidecar
recording which ledger entry it covers.

**These files are meant to be committed and published.** That is the whole point — the
proof only works because it lives somewhere outside the database it protects.

## Why this exists

The transparency ledger is a SHA-256 hash chain, which proves nobody tampered with it
*using the application role*. But anyone with database-owner access could recompute the
entire chain and rewrite history undetectably. Anchoring closes that gap: a rewritten
chain produces a different head hash, which **cannot** match a token an outside authority
already signed. Silent tampering becomes provable.

This converts the ledger from *"trust the operator"* to *"verify the operator"*.

## Verify a token yourself

Anyone — auditor, regulator, buyer, journalist — can check these without our cooperation:

```bash
# What hash did the authority actually sign, and when?
openssl ts -reply -in <token>.tsr -token_in -text
```

Compare the printed `Message data` against the `anchoredHeadHash` in the matching
`.json` sidecar, and against the ledger itself. If they differ, the ledger was altered
after it was stamped.

To check every anchor against the live database at once:

```bash
ADMIN_DATABASE_URL='<owner URL>' npm run ledger:verify-anchors
```

## Create a new anchor

```bash
ADMIN_DATABASE_URL='<owner URL>' npm run ledger:anchor              # dry run (default)
ADMIN_DATABASE_URL='<owner URL>' npm run ledger:anchor -- --confirm # request + store
```

Run it on a schedule (for example daily). Each run stamps the current chain head, so the
history up to that point becomes permanently fixed.

## Honest scope

- This proves **when a ledger state existed**, and therefore that history was not silently
  rewritten afterwards. It does **not** prove the recorded events were *truthful* when
  written — that is what certifier signatures and lab evidence are for.
- Only a 32-byte SHA-256 digest is ever sent to the authority. No ledger contents, product
  data, or personal information leaves the machine.
- Coverage is only as good as the cadence: events added after the last anchor are not yet
  protected. Anchor often.
