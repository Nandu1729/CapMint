#!/usr/bin/env node
/*
 * scripts/prod-migrate.js — Guarded empty-database production bootstrap.
 *
 * SAFE BY DESIGN:
 *   - Dry run by default; no database connection is opened without --confirm.
 *   - Reads only ADMIN_DATABASE_URL so a runtime capmint_app URL cannot be
 *     mistaken for the owner migration credential.
 *   - Refuses capmint_dev and PostgreSQL maintenance databases.
 *   - Verifies the effective role and database owner before mutation.
 *   - Delegates schema work to the checksum-pinned migration runner.
 *
 * Usage:
 *   ADMIN_DATABASE_URL='<owner URL>' node scripts/prod-migrate.js
 *   ADMIN_DATABASE_URL='<owner URL>' node scripts/prod-migrate.js --confirm
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const migrationRunner = require('../playground/run_migrations.js');

const ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(ROOT, 'playground/run_migrations.js');
const REQUIRED_OWNER = 'capmint_admin';
const REFUSED_DATABASES = new Set(['capmint_dev', 'postgres', 'template0', 'template1']);

class ProductionMigrationError extends Error {}

function refuse(message) {
  throw new ProductionMigrationError(`prod:migrate refused — ${message}`);
}

function parseOptions(argv) {
  const allowed = new Set(['--confirm', '--help']);
  const unknown = argv.filter(argument => !allowed.has(argument));
  if (unknown.length > 0) {
    refuse(`unknown option(s): ${unknown.join(', ')}.`);
  }
  if (argv.filter(argument => argument === '--confirm').length > 1) {
    refuse('--confirm may be specified only once.');
  }
  if (argv.includes('--help') && argv.length > 1) {
    refuse('--help cannot be combined with other options.');
  }
  return {
    confirm: argv.includes('--confirm'),
    help: argv.includes('--help')
  };
}

function parseTarget(environment = process.env) {
  const connectionString = environment.ADMIN_DATABASE_URL;
  if (!connectionString || !connectionString.trim()) {
    refuse('ADMIN_DATABASE_URL is required; no fallback is permitted.');
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    refuse('ADMIN_DATABASE_URL is not a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    refuse('ADMIN_DATABASE_URL must use the postgres or postgresql scheme.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(parsed.username);
  if (!database) {
    refuse('ADMIN_DATABASE_URL must name a target database.');
  }
  if (REFUSED_DATABASES.has(database.toLowerCase())) {
    refuse(`database "${database}" is not an eligible production bootstrap target.`);
  }
  if (username !== REQUIRED_OWNER) {
    refuse(`ADMIN_DATABASE_URL must declare the owner role ${REQUIRED_OWNER}.`);
  }

  return {
    connectionString,
    database,
    host: parsed.hostname,
    port: parsed.port || '5432',
    username
  };
}

function loadSchemaPlan() {
  const baseline = migrationRunner.loadBaseline();
  const loaded = migrationRunner.loadMigrations();
  const errors = [...baseline.errors, ...loaded.errors];
  if (errors.length > 0) {
    refuse(`repository migration inputs are invalid: ${errors.join(' ')}`);
  }

  const pendingAfterBaseline = loaded.migrations.filter(
    migration => migration.version >= baseline.manifest.next_migration
  );
  return { baseline, pendingAfterBaseline };
}

function formatPlan(target, schemaPlan) {
  const lines = [
    `Plan — bootstrap production database "${target.database}" on ${target.host}:${target.port}:`,
    '  Credential source: ADMIN_DATABASE_URL',
    `  Required effective owner: ${REQUIRED_OWNER}`,
    `  1. verify current_user and database owner are ${REQUIRED_OWNER}`,
    '  2. node playground/run_migrations.js --bootstrap',
    `     BASELINE ${schemaPlan.baseline.manifest.filename} ` +
      `(schema cutoff ${String(schemaPlan.baseline.manifest.schema_cutoff).padStart(4, '0')}; ` +
      `next ${String(schemaPlan.baseline.manifest.next_migration).padStart(4, '0')})`
  ];

  for (const migration of schemaPlan.pendingAfterBaseline) {
    lines.push(`     EXECUTE  ${migration.filename}`);
  }

  lines.push(
    '  3. node playground/run_migrations.js --check',
    '     require SAFE / NO PENDING ACTIONS',
    '  Excluded: role/password creation, administrator bootstrap, development fixtures, service startup'
  );
  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(
    'Usage: ADMIN_DATABASE_URL=<capmint_admin URL> node scripts/prod-migrate.js [--confirm]\n' +
    '\n' +
    'Without --confirm, prints the exact bootstrap plan and makes no connection or change.\n' +
    'With --confirm, verifies the effective owner, bootstraps an empty non-capmint_dev\n' +
    'database through migration 0020, and requires a clean post-migration check.\n'
  );
}

async function verifyOwner(target, dependencies = {}) {
  const ClientClass = dependencies.Client || Client;
  const client = new ClientClass({
    connectionString: target.connectionString,
    application_name: 'capmint-prod-migrate/preflight'
  });

  await client.connect();
  try {
    const result = await client.query(`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             pg_get_userbyid(database_record.datdba) AS database_owner
      FROM pg_database AS database_record
      WHERE database_record.datname = current_database()
    `);
    const identity = result.rows[0];
    if (result.rowCount !== 1 || identity.database_name !== target.database) {
      refuse('connected database identity does not match ADMIN_DATABASE_URL.');
    }
    if (identity.role_name !== REQUIRED_OWNER) {
      refuse(`effective database role is "${identity.role_name || 'unknown'}", not ${REQUIRED_OWNER}.`);
    }
    if (identity.database_owner !== REQUIRED_OWNER) {
      refuse(`target database owner is "${identity.database_owner || 'unknown'}", not ${REQUIRED_OWNER}.`);
    }
  } finally {
    await client.end();
  }
}

function runMigrationMode(mode, target, dependencies = {}) {
  const spawn = dependencies.spawnSync || spawnSync;
  const result = spawn(
    process.execPath,
    [RUNNER, mode],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: target.connectionString },
      stdio: 'inherit'
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new ProductionMigrationError(
      `prod:migrate failed at migration runner ${mode} (exit ${result.status ?? 'unknown'}).`
    );
  }
}

async function run(argv = process.argv.slice(2), environment = process.env, dependencies = {}) {
  const options = parseOptions(argv);
  if (options.help) {
    printHelp();
    return { executed: false, help: true };
  }

  const target = parseTarget(environment);
  const schemaPlan = loadSchemaPlan();
  process.stdout.write(`${formatPlan(target, schemaPlan)}\n`);

  if (!options.confirm) {
    process.stdout.write(
      '\nDry run only. No database connection was opened and no changes were made.\n' +
      'Re-run with --confirm to execute this exact plan.\n'
    );
    return { executed: false, target: target.database };
  }

  process.stdout.write('\nConfirmation accepted. Verifying owner identity...\n');
  await verifyOwner(target, dependencies);
  process.stdout.write('Owner identity verified. Applying bootstrap...\n');
  runMigrationMode('--bootstrap', target, dependencies);
  process.stdout.write('Bootstrap complete. Verifying final migration state...\n');
  runMigrationMode('--check', target, dependencies);
  process.stdout.write(`prod:migrate complete for database "${target.database}".\n`);
  return { executed: true, target: target.database };
}

async function main() {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'prod:migrate failed with an unknown error.';
    process.stderr.write(`${message}\n`);
    process.exitCode = error instanceof ProductionMigrationError ? 2 : 1;
  }
}

module.exports = {
  ProductionMigrationError,
  formatPlan,
  loadSchemaPlan,
  parseOptions,
  parseTarget,
  run,
  runMigrationMode,
  verifyOwner
};

if (require.main === module) {
  main();
}
