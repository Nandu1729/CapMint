#!/usr/bin/env node
/*
 * scripts/db-reset.js — Reprovision a LOCAL development database from scratch.
 *
 * SAFE BY DESIGN:
 *   - Dry run unless `--yes` is passed (prints the plan and exits).
 *   - Refuses any target that is not a LOCAL, dev-prefixed database name.
 *   - Runs migrations/seed as the OWNER (capmint_admin); services run as
 *     capmint_app (see .env.example — DM-04 role split).
 *
 * Usage:
 *   node scripts/db-reset.js            # dry run — print the plan
 *   node scripts/db-reset.js --yes      # drop + recreate + migrate (+ optional seed)
 *
 * Environment:
 *   ADMIN_DATABASE_URL   owner (capmint_admin) connection string  [required]
 *                        (falls back to DATABASE_URL if unset)
 *   CAPMINT_EXPECTED_DATABASE_PREFIX   dev-name guard prefix       [default: capmint_]
 *   CAPMINT_APP_PASSWORD               if set, provisions capmint_app LOGIN
 *   CAPMINT_DEVELOPMENT_SEED_PASSWORD  if set (+ certifier keys), runs the dev seed
 */

'use strict';

require('dotenv').config();

const { spawnSync } = require('child_process');
const { Client } = require('pg');

const YES = process.argv.includes('--yes');
const EXPECTED_PREFIX = process.env.CAPMINT_EXPECTED_DATABASE_PREFIX || 'capmint_';
const adminUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;

function refuse(message) {
  console.error(`db:reset refused — ${message}`);
  process.exit(2);
}

if (!adminUrl) {
  refuse('set ADMIN_DATABASE_URL to the owner (capmint_admin) connection string.');
}

let parsed;
try {
  parsed = new URL(adminUrl);
} catch {
  refuse('ADMIN_DATABASE_URL is not a valid connection URL.');
}

const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const host = parsed.hostname;

// ---- Safety guards (fail closed) ----
if (!/^[a-z0-9_]+$/.test(dbName)) {
  refuse(`database name "${dbName}" is not a safe identifier.`);
}
if (!dbName.startsWith(EXPECTED_PREFIX)) {
  refuse(`database "${dbName}" does not start with the dev prefix "${EXPECTED_PREFIX}".`);
}
if (/prod|production|live|staging/i.test(dbName)) {
  refuse(`database "${dbName}" looks non-development.`);
}
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  refuse(`host "${host}" is not local; refusing to reset a remote database.`);
}

console.log(`Plan — reset LOCAL dev database "${dbName}" on ${host}:`);
console.log('  1. terminate connections, DROP DATABASE, CREATE DATABASE');
console.log('  2. node playground/run_migrations.js --bootstrap    (owner URL)');
console.log(`  3. provision capmint_app LOGIN                       (${process.env.CAPMINT_APP_PASSWORD ? 'yes' : 'skipped — CAPMINT_APP_PASSWORD unset'})`);
console.log(`  4. npm run seed:development                          (${process.env.CAPMINT_DEVELOPMENT_SEED_PASSWORD ? 'yes' : 'skipped — seed env unset'})`);

if (!YES) {
  console.log('\nDry run. Re-run with --yes to execute.');
  process.exit(0);
}

function runStep(command, args, extraEnv) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) {
    console.error(`db:reset failed at: ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

async function main() {
  const maintenanceUrl = new URL(adminUrl);
  maintenanceUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  console.log(`\nDropping + recreating "${dbName}"...`);
  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [dbName]
  );
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  console.log('Applying migrations (owner)...');
  runStep('node', ['playground/run_migrations.js', '--bootstrap'], { DATABASE_URL: adminUrl });

  if (process.env.CAPMINT_APP_PASSWORD) {
    console.log('Provisioning capmint_app LOGIN...');
    const owner = new Client({ connectionString: adminUrl });
    await owner.connect();
    const escaped = process.env.CAPMINT_APP_PASSWORD.replace(/'/g, "''");
    await owner.query(`ALTER ROLE capmint_app LOGIN PASSWORD '${escaped}'`);
    await owner.end();
  }

  if (process.env.CAPMINT_DEVELOPMENT_SEED_PASSWORD) {
    console.log('Seeding development fixtures (owner)...');
    runStep('npm', ['run', 'seed:development'], {
      DATABASE_URL: adminUrl,
      CAPMINT_ALLOW_DEVELOPMENT_SEED: '1',
      NODE_ENV: process.env.NODE_ENV || 'development'
    });
  }

  console.log('\ndb:reset complete.');
}

main().catch((error) => {
  console.error('db:reset failed:', error.message);
  process.exit(1);
});
