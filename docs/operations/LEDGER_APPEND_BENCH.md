# CapMint Ledger Append Serialization Benchmark

> **Date:** 2026-07-31
>
> **Branch baseline:** `develop` at `05010351`
>
> **Scope:** Disposable local databases only. No product schema, migration, policy, or service
> code was changed.

## Verdict

**The current implementation is fine up to 3,000 appends/second only when the deployment
enforces one globally in-flight append transaction. It is not correctness-safe at any
positive rate when two writers may overlap.**

The exact current transaction sustained 3,995 appends/second for 20 seconds with one client
and an unbroken chain. At two saturated clients it reported about 5,000–5,100 appends/second,
but both four-second trials created a fork and two chain heads. Those results are not usable
capacity.

The table lock itself did serialize the critical section. The defect is the definition of
the head:

```sql
SELECT current_hash
FROM log_entries
ORDER BY created_at DESC, id DESC
LIMIT 1;
```

`created_at` defaults to PostgreSQL `CURRENT_TIMESTAMP`, which is the transaction start time.
Two transactions waiting for the table lock can therefore insert with the same timestamp.
UUID order is unrelated to lock acquisition order. Once the `(created_at, id)` tie-break
selects the earlier append as the apparent newest row, the following append uses a stale head
and creates a branch.

This is a correctness limit at **one concurrent writer**, not merely a throughput limit.
CapMint currently has more than one append origin, so an average event rate below 3,000/s
does not itself provide the single-flight guarantee.

### Recommendation

Implement a singleton ledger-head row plus a unique monotonic `chain_position` before
increasing append concurrency:

1. Lock the one head row with `SELECT ... FOR UPDATE`.
2. Read `head_hash` and `next_position` from that row.
3. Insert the ledger entry with that position and previous hash.
4. Update the head row in the same transaction.
5. Verify and select ledger entries by `chain_position`, not timestamp/UUID.

A benchmark-only prototype sustained **4,761 appends/second for 20 seconds at two clients**
and verified an unbroken 401,324-row chain. Across the concurrency sweep its median ceiling
was about 4,800 appends/second. Use **3,500 appends/second** as a provisional 25%-headroom
operating threshold for that design on comparable hardware, then repeat this benchmark on
production-like infrastructure before setting an SLO.

Do not introduce partition-keyed advisory locks while retaining one global chain. Parallel
partition locks would allow multiple writers to consume the same global head. Partitioning
requires independent subchains plus a versioned aggregation design, such as periodic Merkle
roots committed to a global checkpoint chain.

## Current implementation under test

The harness reproduces the critical section in
[`backend/transparency-service/src/index.ts`](../../backend/transparency-service/src/index.ts)
and [`backend/auth-service/src/index.ts`](../../backend/auth-service/src/index.ts):

1. Acquire a `pg` connection.
2. `BEGIN`.
3. Set the same transaction-local tenant GUCs as `withTenantTx`.
4. `LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE`.
5. Select the tail by `created_at DESC, id DESC`.
6. Calculate `payload_hash` and `current_hash` with Node SHA-256 using the production formula.
7. Insert one row under the non-owner `capmint_app` RLS policy.
8. `COMMIT`.

Latency includes all six database round trips from `BEGIN` through `COMMIT`. Pool acquisition,
HTTP, JWT verification, JSON parsing, Pino logging, Redis, and network distance are excluded.
The measurements are therefore a database/driver upper bound, not an end-to-end service SLO.

The reproducible harness is
[`scripts/bench/ledger-append.mjs`](../../scripts/bench/ledger-append.mjs). It refuses:

- non-local database hosts;
- `capmint_dev`;
- database names without an explicit `bench` marker;
- database roles other than non-superuser, non-`BYPASSRLS` `capmint_app`;
- malformed modes, concurrency, duration, or trial counts.

Every measured trial recomputes every entry hash and verifies every previous-hash link. A
broken chain exits non-zero.

## Environment

| Item | Observed |
|---|---|
| Host | Apple M4, 10 logical CPUs, 16 GiB RAM |
| OS | macOS 26.5.1, build 25F80 |
| Node | 22.22.3 |
| npm | 10.9.8 |
| PostgreSQL server/client | 16.14, Homebrew |
| Database host | `localhost:5432` |
| Current-path database | `capmint_ledger_bench_20260731` |
| Candidate database | `capmint_ledger_bench_head_20260731` |
| Runtime role | `capmint_app`, `rolsuper=false`, `rolbypassrls=false` |
| Provisioning role | `capmint_admin` |
| Schema | Baseline cutoff `0009`, migrations `0010`–`0020`, clean `--check` |
| `synchronous_commit` | `on` |
| `fsync` | `on` |
| `full_page_writes` | `on` |
| `shared_buffers` | 128 MiB |
| `max_connections` | 100 |

Both database names were explicit local disposable targets. The databases were removed after
the measurements.

## Methodology

### Workload

- One genesis row per fresh database.
- Fixed valid organization GUC and `actor_is_system_admin=off`.
- A fresh UUID entity and small JSON payload per append.
- Exact current SHA-256 formula:

```text
SHA256(entity_type || entity_id || event_type || payload_hash || previous_hash)
```

- Dedicated persistent pool connection per concurrent worker.
- Closed-loop load: each worker submits its next append immediately after the prior commit.
- Warm-up before each measured window.
- Three short trials per candidate concurrency plus a 20-second sustained sample at the knee.
- Full chain verification outside the measured time.

The current path was stopped at the first failed invariant. Higher-concurrency current-path
throughput was intentionally not reported as capacity.

### Result interpretation

- **TPS** is successful commits divided by actual measured window time.
- **Latency** covers the complete append transaction.
- Short-trial tables report medians across three trials unless stated otherwise.
- A throughput number is valid capacity only when `chain_unbroken=true`.
- Results apply to this local host and dataset. Storage latency, CPU, PostgreSQL settings,
  connection topology, and service/network overhead can materially change them.

## Results

### Exact current table-lock path

| Concurrency | Window | Throughput | p50 | p95 | p99 | Chain | Interpretation |
|---:|---:|---:|---:|---:|---:|---|---|
| 1 | Median of 3 × 4 s | 3,845/s | 0.25 ms | 0.27 ms | 0.42 ms | Unbroken | Valid |
| 1 | 20 s sustained | 3,995/s | 0.25 ms | 0.27 ms | 0.30 ms | Unbroken, 87,796 rows including warm-up | Valid |
| 2 | 4 s, reproduction 1 | 5,026/s | 0.39 ms | 0.42 ms | 0.46 ms | **Forked** | Invalid capacity |
| 2 | 4 s, reproduction 2 | 5,124/s | 0.39 ms | 0.42 ms | 0.47 ms | **Forked** | Invalid capacity |

The one-second two-client smoke happened not to collide and verified successfully. Both
longer saturated repetitions forked. This confirms that the failure is timing-dependent,
not that two-client operation is safe for a short interval.

### Failure evidence

The first reproduction produced:

```text
rows:                    93,307
fork points:             1
extra branches:          1
heads:                   2
ordered link mismatches: 2
```

The second independent reproduction, after truncating only the disposable benchmark ledger,
produced:

```text
rows:                    113,075
fork points:             1
extra branches:          1
heads:                   2
ordered link mismatches: 2
duplicate created_at:    2026-07-31 00:31:24.316160 IST
```

Two adjacent rows had that identical microsecond timestamp. Their random UUID order differed
from append order. The next tail query selected the wrong member of the tie and appended a
second child to an earlier hash.

This is a true fork, not only a verifier presentation issue: one `current_hash` had two child
rows and the graph had two leaves.

### Global advisory-lock control

Replacing only the table lock with one transaction-scoped global advisory lock yielded
5,153/s at two clients but created the same two-link mismatch and exited non-zero. Advisory
locking serialized the writers, but it did not make `(created_at, id)` a canonical append
order.

Therefore a lock substitution by itself is not a fix.

### Singleton-head prototype

The benchmark-only candidate added:

- `benchmark_chain_position BIGINT` with a unique index;
- one `ledger_benchmark_chain_head` row containing `head_hash`, `head_entry_id`, and
  `next_position`;
- a row lock on that head instead of a table lock;
- verification ordered by the unique position.

| Concurrency | Median TPS | p50 | p95 | p99 | Chain |
|---:|---:|---:|---:|---:|---|
| 1 | 3,667/s | 0.27 ms | 0.29 ms | 0.31 ms | Unbroken |
| 2 | **4,873/s** | 0.40 ms | 0.44 ms | 0.49 ms | Unbroken |
| 4 | 4,834/s | 0.82 ms | 0.88 ms | 1.14 ms | Unbroken |
| 8 | 4,815/s | 1.63 ms | 1.86 ms | 2.13 ms | Unbroken |
| 16 | 4,622/s | 3.38 ms | 4.48 ms | 5.84 ms | Unbroken |
| 32 | 4,100/s | 6.17 ms | 19.36 ms | 30.04 ms | Unbroken |

The 20-second two-client confirmation completed 95,214 measured appends at 4,761/s, with
p95 0.50 ms and p99 0.73 ms. The complete 401,324-row candidate chain verified.

Throughput plateaued at two to eight clients. More workers did not create parallelism because
one global chain has one mutable head; they only increased queue latency. This is the
irreducible serialization point for the current ledger semantics.

## Recommendation details

### P0 — establish a canonical head and position

Use a forward-only migration; do not edit the existing baseline or migrations.

Proposed logical schema:

```sql
ALTER TABLE log_entries
  ADD COLUMN chain_position bigint;

CREATE UNIQUE INDEX log_entries_chain_position_unique
  ON log_entries(chain_position);

CREATE TABLE ledger_chain_heads (
  chain_id text PRIMARY KEY,
  head_entry_id uuid NOT NULL REFERENCES log_entries(id),
  head_hash varchar(64) NOT NULL,
  next_position bigint NOT NULL CHECK (next_position > 0)
);
```

The production migration needs more safeguards than this illustrative DDL:

- Derive historical positions by traversing `previous_hash → current_hash` from genesis.
- Abort on zero/multiple genesis rows, missing parents, cycles, forks, multiple heads, hash
  mismatches, or a row count different from the traversal count.
- Never resolve a fork by timestamp or UUID order.
- Populate and validate positions before making them `NOT NULL`.
- Seed the singleton head from the verified leaf.
- Restrict head-table privileges to the ledger writer and keep the role non-owner,
  `NOBYPASSRLS`.
- Add exact migration-state verification and concurrency tests.

Proposed append transaction:

```text
BEGIN
set tenant/appender GUCs
SELECT head_hash, next_position
  FROM ledger_chain_heads
  WHERE chain_id = 'global'
  FOR UPDATE
calculate current_hash
INSERT log_entries (..., previous_hash=head_hash, chain_position=next_position)
UPDATE ledger_chain_heads
  SET head_hash=current_hash,
      head_entry_id=new_entry_id,
      next_position=next_position+1
COMMIT
```

The existing hash formula can remain for backward compatibility because the previous hash
already binds topological order. For stronger protection against owner-side position
rewrites, introduce a versioned hash formula for new entries that also covers
`chain_position`; do not recompute or rewrite historical hashes.

The verifier should:

- order by `chain_position`;
- require one genesis at position zero;
- require positions to be unique and contiguous except for explicitly documented aborted
  reservations;
- recompute every hash and previous-hash link;
- cross-check the final row against `ledger_chain_heads`;
- separately detect graph forks and unreachable rows.

### Do not partition yet

A fixed global advisory lock would narrow lock scope but retains the same single global
serialization and relies on every writer using the same key. The head row is explicit,
inspectable, recoverable, and provides the canonical position the current implementation
lacks.

Keying advisory locks by organization, entity, or hash partition is unsafe for the present
schema: concurrent partitions would race on one `previous_hash`. Safe parallel partitioning
would require:

1. one independent chain and head per partition;
2. a partition identifier covered by each hash;
3. an aggregation protocol such as a periodic Merkle root;
4. a versioned verifier and public API;
5. an external-anchor strategy for both partition and aggregate heads.

Consider that redesign only when production-like measurements show sustained demand above
3,500 appends/s, p95 append latency above the agreed SLO, or unacceptable interference from
the ledger table lock. The current benchmark provides no throughput reason to partition.

## Reproduction

### 1. Provision an empty local benchmark database

Use unique local names containing `bench`; never use `capmint_dev`:

```bash
createdb \
  --host=localhost \
  --username=capmint_admin \
  --owner=capmint_admin \
  capmint_ledger_bench_YYYYMMDD

ADMIN_DATABASE_URL='postgresql://capmint_admin:<admin-password>@localhost:5432/capmint_ledger_bench_YYYYMMDD' \
  node scripts/prod-migrate.js --confirm
```

The cluster's `capmint_app` must already have LOGIN and the password used below. Confirm the
URL resolves only to the disposable local database.

### 2. Measure the valid single-writer current path

```bash
DATABASE_URL='postgresql://capmint_app:<app-password>@localhost:5432/capmint_ledger_bench_YYYYMMDD' \
  node scripts/bench/ledger-append.mjs \
    --modes=table \
    --concurrency=1 \
    --warmup-seconds=2 \
    --duration-seconds=20 \
    --trials=1
```

Expected: exit zero and `chain_unbroken:true`.

### 3. Exercise the concurrent current path

Run against a fresh disposable ledger:

```bash
DATABASE_URL='postgresql://capmint_app:<app-password>@localhost:5432/capmint_ledger_bench_YYYYMMDD' \
  node scripts/bench/ledger-append.mjs \
    --modes=table \
    --concurrency=2 \
    --warmup-seconds=1 \
    --duration-seconds=4 \
    --trials=1
```

This is timing-dependent. On both recorded four-second runs it printed
`chain_unbroken:false` and exited non-zero. Repeat only on disposable data.

### 4. Prepare the benchmark-only head-row candidate

Bootstrap a second fresh local database and apply the following as `capmint_admin`.
This SQL is benchmark scaffolding, not a product migration:

```sql
ALTER TABLE public.log_entries
  ADD COLUMN benchmark_chain_position bigint;

CREATE UNIQUE INDEX log_entries_benchmark_chain_position_unique
  ON public.log_entries(benchmark_chain_position);

CREATE TABLE public.ledger_benchmark_chain_head (
  chain_name text PRIMARY KEY,
  head_entry_id uuid NOT NULL,
  head_hash varchar(64) NOT NULL,
  next_position bigint NOT NULL CHECK (next_position > 0)
);

GRANT SELECT, UPDATE
  ON public.ledger_benchmark_chain_head
  TO capmint_app;

WITH genesis AS (
  INSERT INTO public.log_entries (
    entity_type,
    entity_id,
    event_type,
    payload_hash,
    previous_hash,
    current_hash,
    benchmark_chain_position
  )
  VALUES (
    'SYSTEM',
    '00000000-0000-0000-0000-000000000000',
    'GENESIS_BLOCK_ANCHOR',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '00000000-0000-0000-0000-000000000000',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    0
  )
  RETURNING id, current_hash
)
INSERT INTO public.ledger_benchmark_chain_head (
  chain_name,
  head_entry_id,
  head_hash,
  next_position
)
SELECT 'global', id, current_hash, 1
FROM genesis;
```

Run the candidate sweep:

```bash
DATABASE_URL='postgresql://capmint_app:<app-password>@localhost:5432/capmint_ledger_bench_head_YYYYMMDD' \
  node scripts/bench/ledger-append.mjs \
    --modes=head-row \
    --concurrency=1,2,4,8,16,32 \
    --warmup-seconds=0.5 \
    --duration-seconds=3 \
    --trials=3
```

Expected: every trial exits with `chain_unbroken:true`.

## Limitations

- Local Apple Silicon and local PostgreSQL are not production hardware.
- The benchmark is closed-loop and intentionally saturating; it does not model bursty or
  Poisson arrivals.
- HTTP, authentication, logging, Redis, and cross-host latency are excluded.
- The candidate schema is a measurement prototype, not reviewed migration code.
- The benchmark does not measure concurrent non-ledger queries or DDL interference.
- Short trials show the saturation curve; the 20-second samples reduce but do not eliminate
  checkpoint, cache, autovacuum, and storage variance.
- No production traffic rate was assumed. The operator must compare observed production
  rates and latency with the stated thresholds.

## Cleanup

The two local disposable databases used for this report were dropped after evidence capture.
They contained benchmark-only ledger rows and are not recoverable. Reproduction must always
create new explicitly named disposable databases.
