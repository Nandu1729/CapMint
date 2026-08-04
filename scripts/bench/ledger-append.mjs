#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000022';
const GENESIS_ENTITY_ID = '00000000-0000-0000-0000-000000000000';
const GENESIS_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ADVISORY_NAMESPACE = 1128353357;
const ADVISORY_CHAIN = 1;

function fail(message) {
  throw new Error(`ledger benchmark refused: ${message}`);
}

function parsePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${name} must be a positive number`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    modes: ['table'],
    concurrencies: [1, 2, 4, 8, 16, 32],
    warmupSeconds: 2,
    durationSeconds: 8,
    trials: 3
  };

  for (const argument of argv) {
    const [name, value] = argument.split('=', 2);
    if (!value) fail(`expected --name=value, received "${argument}"`);

    if (name === '--modes') {
      options.modes = value.split(',').filter(Boolean);
    } else if (name === '--concurrency') {
      options.concurrencies = value.split(',').map(item =>
        parsePositiveNumber(item, 'concurrency')
      );
    } else if (name === '--warmup-seconds') {
      options.warmupSeconds = parsePositiveNumber(value, 'warmup-seconds');
    } else if (name === '--duration-seconds') {
      options.durationSeconds = parsePositiveNumber(value, 'duration-seconds');
    } else if (name === '--trials') {
      options.trials = parsePositiveNumber(value, 'trials');
    } else {
      fail(`unknown option "${name}"`);
    }
  }

  if (options.modes.some(mode => !['table', 'advisory', 'head-row'].includes(mode))) {
    fail('modes may contain only table, advisory, and head-row');
  }
  if (options.modes.includes('head-row') && options.modes.length !== 1) {
    fail('head-row uses benchmark-only schema and must run by itself');
  }
  if (options.concurrencies.some(value => !Number.isInteger(value) || value > 64)) {
    fail('concurrency values must be integers no greater than 64');
  }
  if (!Number.isInteger(options.trials) || options.trials > 10) {
    fail('trials must be an integer no greater than 10');
  }
  return options;
}

function parseTarget() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('DATABASE_URL is required');

  let target;
  try {
    target = new URL(connectionString);
  } catch {
    fail('DATABASE_URL is not a valid URL');
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    fail(`target host "${target.hostname}" is not local`);
  }
  if (!/^capmint_[a-z0-9_]*bench[a-z0-9_]*$/.test(database)) {
    fail(`database "${database}" is not an explicitly named disposable benchmark database`);
  }
  if (database === 'capmint_dev') fail('capmint_dev is never a benchmark target');

  return { connectionString, database, host: target.hostname, port: target.port || '5432' };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

async function preflight(pool, target) {
  const result = await pool.query(`
    SELECT current_database() AS database_name,
           current_user AS role_name,
           role.rolsuper,
           role.rolbypassrls,
           current_setting('server_version') AS server_version,
           current_setting('synchronous_commit') AS synchronous_commit,
           current_setting('fsync') AS fsync,
           current_setting('full_page_writes') AS full_page_writes,
           current_setting('shared_buffers') AS shared_buffers,
           current_setting('max_connections') AS max_connections
    FROM pg_roles AS role
    WHERE role.rolname = current_user
  `);
  const identity = result.rows[0];
  if (result.rowCount !== 1 || identity.database_name !== target.database) {
    fail('connected database does not match the requested target');
  }
  if (
    identity.role_name !== 'capmint_app' ||
    identity.rolsuper === true ||
    identity.rolbypassrls === true
  ) {
    fail('benchmark requires non-owner, non-bypass capmint_app');
  }
  return identity;
}

async function ensureGenesis(pool, mode) {
  if (mode === 'head-row') {
    const state = await pool.query(`
      SELECT to_regclass('public.ledger_benchmark_chain_head') AS head_table,
             EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'log_entries'
                 AND column_name = 'benchmark_chain_position'
             ) AS has_position,
             (SELECT count(*)::integer FROM public.log_entries) AS log_count,
             (SELECT count(*)::integer
              FROM public.log_entries
              WHERE benchmark_chain_position IS NULL) AS missing_position,
             (SELECT count(*)::integer
              FROM public.ledger_benchmark_chain_head
              WHERE chain_name = 'global') AS head_count
    `);
    if (
      !state.rows[0].head_table ||
      state.rows[0].has_position !== true ||
      state.rows[0].log_count < 1 ||
      state.rows[0].missing_position !== 0 ||
      state.rows[0].head_count !== 1
    ) {
      fail('head-row mode requires its documented benchmark schema and complete positions');
    }
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.current_organization_id', '', true),
              set_config('app.actor_is_system_admin', 'off', true)`
    );
    await client.query('LOCK TABLE public.log_entries IN SHARE ROW EXCLUSIVE MODE');
    const count = await client.query('SELECT count(*)::integer AS count FROM public.log_entries');
    if (count.rows[0].count === 0) {
      await client.query(
        `INSERT INTO public.log_entries
           (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
         VALUES
           ('SYSTEM', $1, 'GENESIS_BLOCK_ANCHOR', $2, $3, $2)`,
        [GENESIS_ENTITY_ID, GENESIS_HASH, GENESIS_ENTITY_ID]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function appendOne(client, mode, sequence) {
  const startedAt = performance.now();
  const entityId = crypto.randomUUID();
  const payload = JSON.stringify({
    benchmark: 'ledger-append-serialization',
    sequence
  });
  const payloadHash = sha256(payload);

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.current_organization_id', $1, true),
              set_config('app.actor_is_system_admin', 'off', true)`,
      [DEFAULT_ORGANIZATION_ID]
    );

    let previousHash;
    let chainPosition = null;
    if (mode === 'table') {
      await client.query('LOCK TABLE public.log_entries IN SHARE ROW EXCLUSIVE MODE');
    } else if (mode === 'advisory') {
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
        ADVISORY_NAMESPACE,
        ADVISORY_CHAIN
      ]);
    } else {
      const head = await client.query(
        `SELECT head_hash, next_position
         FROM public.ledger_benchmark_chain_head
         WHERE chain_name = 'global'
         FOR UPDATE`
      );
      if (head.rowCount !== 1) throw new Error('benchmark chain head is missing');
      previousHash = head.rows[0].head_hash;
      chainPosition = Number(head.rows[0].next_position);
    }

    if (previousHash === undefined) {
      const latest = await client.query(
        `SELECT current_hash
         FROM public.log_entries
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      );
      previousHash = latest.rows[0]?.current_hash ??
        '0000000000000000000000000000000000000000000000000000000000000000';
    }
    const currentHash = sha256(
      `BENCHMARK${entityId}BENCHMARK_APPEND${payloadHash}${previousHash}`
    );

    if (mode === 'head-row') {
      const inserted = await client.query(
        `INSERT INTO public.log_entries
           (entity_type, entity_id, event_type, payload_hash, previous_hash,
            current_hash, benchmark_chain_position)
         VALUES ('BENCHMARK', $1, 'BENCHMARK_APPEND', $2, $3, $4, $5)
         RETURNING id`,
        [entityId, payloadHash, previousHash, currentHash, chainPosition]
      );
      await client.query(
        `UPDATE public.ledger_benchmark_chain_head
         SET head_hash = $1,
             head_entry_id = $2,
             next_position = $3
         WHERE chain_name = 'global'`,
        [currentHash, inserted.rows[0].id, chainPosition + 1]
      );
    } else {
      await client.query(
        `INSERT INTO public.log_entries
           (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
         VALUES ('BENCHMARK', $1, 'BENCHMARK_APPEND', $2, $3, $4)`,
        [entityId, payloadHash, previousHash, currentHash]
      );
    }
    await client.query('COMMIT');
    return performance.now() - startedAt;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the append error.
    }
    throw error;
  }
}

async function runWindow(pool, mode, concurrency, durationSeconds, collectLatency) {
  const clients = await Promise.all(
    Array.from({ length: concurrency }, () => pool.connect())
  );
  const latencies = [];
  let sequence = 0;
  const startedAt = performance.now();
  const deadline = startedAt + durationSeconds * 1000;

  try {
    await Promise.all(clients.map(async client => {
      while (performance.now() < deadline) {
        const latency = await appendOne(client, mode, sequence++);
        if (collectLatency) latencies.push(latency);
      }
    }));
  } finally {
    for (const client of clients) client.release();
  }

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  return {
    appends: sequence,
    elapsedSeconds,
    tps: sequence / elapsedSeconds,
    latencyMs: collectLatency ? {
      mean: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: Math.max(...latencies)
    } : null
  };
}

async function verifyChain(pool, mode) {
  const order = mode === 'head-row'
    ? 'benchmark_chain_position ASC'
    : 'created_at ASC, id ASC';
  const result = await pool.query(
    `SELECT id, entity_type, entity_id, event_type, payload_hash,
            previous_hash, current_hash, created_at
     FROM public.log_entries
     ORDER BY ${order}`
  );
  let previousHash = null;
  const errors = [];

  for (let index = 0; index < result.rows.length; index += 1) {
    const entry = result.rows[index];
    if (entry.event_type === 'GENESIS_BLOCK_ANCHOR') {
      if (previousHash !== null) errors.push(`genesis appears at index ${index}`);
      previousHash = entry.current_hash;
      continue;
    }

    if (entry.previous_hash !== previousHash) {
      errors.push(`link mismatch at index ${index} (${entry.id})`);
    }
    const calculated = sha256(
      entry.entity_type +
      entry.entity_id +
      entry.event_type +
      entry.payload_hash +
      entry.previous_hash
    );
    if (entry.current_hash !== calculated) {
      errors.push(`hash mismatch at index ${index} (${entry.id})`);
    }
    previousHash = entry.current_hash;
    if (errors.length >= 10) break;
  }

  return {
    rows: result.rowCount,
    unbroken: errors.length === 0,
    errors
  };
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = parseTarget();
  const pool = new pg.Pool({
    connectionString: target.connectionString,
    application_name: 'capmint-ledger-append-benchmark',
    max: Math.max(...options.concurrencies)
  });

  try {
    const environment = await preflight(pool, target);
    await ensureGenesis(pool, options.modes[0]);
    console.log(JSON.stringify({
      type: 'environment',
      target: { database: target.database, host: target.host, port: target.port },
      role: environment.role_name,
      postgres: environment.server_version,
      synchronous_commit: environment.synchronous_commit,
      fsync: environment.fsync,
      full_page_writes: environment.full_page_writes,
      shared_buffers: environment.shared_buffers,
      max_connections: environment.max_connections,
      options
    }));

    for (const mode of options.modes) {
      for (const concurrency of options.concurrencies) {
        for (let trial = 1; trial <= options.trials; trial += 1) {
          await runWindow(
            pool,
            mode,
            concurrency,
            options.warmupSeconds,
            false
          );
          const result = await runWindow(
            pool,
            mode,
            concurrency,
            options.durationSeconds,
            true
          );
          const chain = await verifyChain(pool, mode);
          const output = {
            type: 'trial',
            mode,
            concurrency,
            trial,
            appends: result.appends,
            elapsed_seconds: round(result.elapsedSeconds, 3),
            tps: round(result.tps),
            latency_ms: Object.fromEntries(
              Object.entries(result.latencyMs).map(([key, value]) => [key, round(value)])
            ),
            chain_rows: chain.rows,
            chain_unbroken: chain.unbroken,
            chain_errors: chain.errors
          };
          console.log(JSON.stringify(output));
          if (!chain.unbroken) {
            throw new Error('ledger chain verification failed');
          }
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
