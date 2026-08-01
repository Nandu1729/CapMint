'use strict';

const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const APP_ROLE = 'capmint_app';
const ED25519_PKCS8_SEED_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);
const CHILD_SECRET_NAMES = [
  'ADMIN_DATABASE_URL',
  'CAPMINT_APP_PASSWORD',
  'CAPMINT_CERTIFIER_KEY_SEED',
  'CAPMINT_BOOTSTRAP_ADMIN_USERNAME',
  'CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME',
  'CAPMINT_BOOTSTRAP_ADMIN_EMAIL',
  'CAPMINT_BOOTSTRAP_ADMIN_PASSWORD'
];

class RenderStartError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function log(step, message) {
  process.stdout.write(`[render-start] ${step}: ${message}\n`);
}

function requiredEnvironment(name, environment = process.env) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RenderStartError('INVALID_CONFIGURATION', `${name} is required.`);
  }
  return value.trim();
}

function parsePostgresUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new RenderStartError('INVALID_CONFIGURATION', `${name} must be a valid URL.`);
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      `${name} must use the postgres or postgresql scheme.`
    );
  }
  if (!parsed.hostname || parsed.pathname === '' || parsed.pathname === '/') {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      `${name} must include a database host and name.`
    );
  }
  return parsed;
}

function buildAppDatabaseUrl(adminDatabaseUrl, appPassword) {
  const parsed = parsePostgresUrl(adminDatabaseUrl, 'ADMIN_DATABASE_URL');
  if (typeof appPassword !== 'string' || appPassword.length < 24) {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      'CAPMINT_APP_PASSWORD must contain at least 24 characters.'
    );
  }
  parsed.username = APP_ROLE;
  parsed.password = appPassword;
  return parsed.toString();
}

function normalizedExternalOrigin(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new RenderStartError('INVALID_CONFIGURATION', `${name} must be a valid URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '' && parsed.pathname !== '/')
    || parsed.search
    || parsed.hash) {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      `${name} must be an HTTP(S) origin without credentials, a path, query, or fragment.`
    );
  }
  return parsed.origin;
}

function configureExternalUrls(environment = process.env) {
  const renderExternalUrl = environment.RENDER_EXTERNAL_URL?.trim();
  if (renderExternalUrl) {
    const origin = normalizedExternalOrigin(renderExternalUrl, 'RENDER_EXTERNAL_URL');
    environment.BASE_URL = origin;
    environment.CORS_ORIGIN = origin;
    environment.VERIFY_FRONTEND_URL = origin;
    return origin;
  }

  const baseUrl = requiredEnvironment('BASE_URL', environment);
  const origin = normalizedExternalOrigin(baseUrl, 'BASE_URL');
  environment.BASE_URL = origin;
  environment.CORS_ORIGIN = normalizedExternalOrigin(
    requiredEnvironment('CORS_ORIGIN', environment),
    'CORS_ORIGIN'
  );
  environment.VERIFY_FRONTEND_URL = normalizedExternalOrigin(
    requiredEnvironment('VERIFY_FRONTEND_URL', environment),
    'VERIFY_FRONTEND_URL'
  );
  return origin;
}

function normalizePem(value) {
  return value.trim().replace(/\\n/g, '\n');
}

function exportPublicDer(key) {
  return crypto.createPublicKey(key).export({ format: 'der', type: 'spki' });
}

function validateProvidedCertifierKeys(privatePem, publicPem) {
  try {
    const privateKey = crypto.createPrivateKey(privatePem);
    const publicKey = crypto.createPublicKey(publicPem);
    if (privateKey.asymmetricKeyType !== 'ed25519'
      || publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('not Ed25519');
    }
    const derived = exportPublicDer(privateKey);
    const supplied = publicKey.export({ format: 'der', type: 'spki' });
    if (derived.length !== supplied.length || !crypto.timingSafeEqual(derived, supplied)) {
      throw new Error('key mismatch');
    }
  } catch {
    throw new RenderStartError(
      'INVALID_CERTIFIER_KEYPAIR',
      'CERTIFIER_PRIVATE_KEY and CERTIFIER_PUBLIC_KEY must be a matching Ed25519 pair.'
    );
  }
}

function deriveCertifierKeyPair(seed) {
  if (typeof seed !== 'string' || Buffer.byteLength(seed, 'utf8') < 32) {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      'CAPMINT_CERTIFIER_KEY_SEED must contain at least 32 bytes.'
    );
  }
  const seedBytes = crypto.createHash('sha256').update(seed, 'utf8').digest();
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, seedBytes]),
    format: 'der',
    type: 'pkcs8'
  });
  const publicKey = crypto.createPublicKey(privateKey);
  return {
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString()
  };
}

function configureCertifierKeys(environment = process.env) {
  const providedPrivate = environment.CERTIFIER_PRIVATE_KEY?.trim();
  const providedPublic = environment.CERTIFIER_PUBLIC_KEY?.trim();
  if (Boolean(providedPrivate) !== Boolean(providedPublic)) {
    throw new RenderStartError(
      'INVALID_CERTIFIER_KEYPAIR',
      'Provide both CERTIFIER_PRIVATE_KEY and CERTIFIER_PUBLIC_KEY, or neither.'
    );
  }

  if (providedPrivate && providedPublic) {
    const privateKey = normalizePem(providedPrivate);
    const publicKey = normalizePem(providedPublic);
    validateProvidedCertifierKeys(privateKey, publicKey);
    environment.CERTIFIER_PRIVATE_KEY = privateKey;
    environment.CERTIFIER_PUBLIC_KEY = publicKey;
    return 'provided';
  }

  const pair = deriveCertifierKeyPair(
    requiredEnvironment('CAPMINT_CERTIFIER_KEY_SEED', environment)
  );
  environment.CERTIFIER_PRIVATE_KEY = pair.privateKey;
  environment.CERTIFIER_PUBLIC_KEY = pair.publicKey;
  return 'derived';
}

function validateRuntimeEnvironment(environment = process.env) {
  const adminDatabaseUrl = requiredEnvironment('ADMIN_DATABASE_URL', environment);
  parsePostgresUrl(adminDatabaseUrl, 'ADMIN_DATABASE_URL');
  const appPassword = requiredEnvironment('CAPMINT_APP_PASSWORD', environment);
  const jwtSecret = requiredEnvironment('JWT_SECRET', environment);
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      'JWT_SECRET must contain at least 32 bytes.'
    );
  }
  requiredEnvironment('WEBHOOK_SECRET', environment);
  const redisUrl = requiredEnvironment('REDIS_URL', environment);
  let parsedRedis;
  try {
    parsedRedis = new URL(redisUrl);
  } catch {
    throw new RenderStartError('INVALID_CONFIGURATION', 'REDIS_URL must be a valid URL.');
  }
  if (!['redis:', 'rediss:'].includes(parsedRedis.protocol)) {
    throw new RenderStartError(
      'INVALID_CONFIGURATION',
      'REDIS_URL must use the redis or rediss scheme.'
    );
  }
  requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_USERNAME', environment);
  requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME', environment);
  requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_EMAIL', environment);
  requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_PASSWORD', environment);
  return { adminDatabaseUrl, appPassword };
}

async function inspectProvisioningDatabase(pool) {
  const client = await pool.connect();
  try {
    const identity = (await client.query(`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             role.rolcreaterole AS can_create_role,
             role.rolsuper AS is_superuser,
             pg_get_userbyid(database_record.datdba) = current_user AS owns_database
      FROM pg_roles AS role
      JOIN pg_database AS database_record
        ON database_record.datname = current_database()
      WHERE role.rolname = current_user
    `)).rows[0];
    if (!identity || !identity.owns_database) {
      throw new RenderStartError(
        'UNSAFE_ADMIN_ROLE',
        'ADMIN_DATABASE_URL must connect as the owner of the target database.'
      );
    }
    if (!identity.can_create_role && !identity.is_superuser) {
      throw new RenderStartError(
        'OWNER_CANNOT_CREATE_ROLE',
        'The database owner lacks CREATEROLE; migration 0015 cannot create capmint_app.'
      );
    }

    const state = (await client.query(`
      SELECT to_regclass('public.migrations_log') IS NOT NULL AS has_migration_log,
             (
               SELECT count(*)::int
               FROM (
                 SELECT relation.oid
                 FROM pg_class AS relation
                 JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
                 WHERE namespace.nspname = 'public'
                   AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
                 UNION ALL
                 SELECT routine.oid
                 FROM pg_proc AS routine
                 JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
                 WHERE namespace.nspname = 'public'
               ) AS public_object
             ) AS public_object_count
    `)).rows[0];
    if (!state.has_migration_log && Number(state.public_object_count) !== 0) {
      throw new RenderStartError(
        'AMBIGUOUS_DATABASE_STATE',
        'The public schema is non-empty without CapMint migration history; bootstrap is refused.'
      );
    }
    return {
      databaseName: identity.database_name,
      roleName: identity.role_name,
      needsBootstrap: !state.has_migration_log
    };
  } finally {
    client.release();
  }
}

function runInherited(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: options.env || process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) return resolve();
      reject(new RenderStartError(
        'CHILD_PROCESS_FAILED',
        `${options.label || command} failed (${signal ? `signal ${signal}` : `exit ${code}`}).`
      ));
    });
  });
}

function runCaptured(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function runMigrations(adminDatabaseUrl, needsBootstrap) {
  const migrationEnvironment = { ...process.env, DATABASE_URL: adminDatabaseUrl };
  const migrationScript = path.join(ROOT, 'playground/run_migrations.js');
  if (needsBootstrap) {
    log('migrate', 'empty schema detected; applying immutable baseline and migrations 0010-0020');
    await runInherited(process.execPath, [migrationScript, '--bootstrap'], {
      env: migrationEnvironment,
      label: 'migration bootstrap'
    });
    log('migrate', 'baseline bootstrap completed');
  } else {
    log('migrate', 'recorded schema detected; baseline bootstrap skipped');
  }

  log('migrate', 'running idempotent migration apply/check');
  await runInherited(process.execPath, [migrationScript, '--apply'], {
    env: migrationEnvironment,
    label: 'migration apply'
  });
  log('migrate', 'migration state is current through 0020');
}

async function provisionAppRole(pool, appPassword) {
  const client = await pool.connect();
  try {
    const role = (await client.query(
      'SELECT rolname FROM pg_roles WHERE rolname = $1',
      [APP_ROLE]
    )).rows[0];
    if (!role) {
      throw new RenderStartError(
        'APP_ROLE_MISSING',
        'Migration 0015 did not create capmint_app; refusing to continue.'
      );
    }

    await client.query(
      "SELECT set_config('capmint.bootstrap_app_password', $1, false)",
      [appPassword]
    );
    try {
      await client.query(`
        DO $capmint_render_role$
        BEGIN
          EXECUTE format(
            'ALTER ROLE capmint_app WITH LOGIN PASSWORD %L',
            current_setting('capmint.bootstrap_app_password')
          );
        END;
        $capmint_render_role$;
      `);
    } finally {
      await client.query('RESET capmint.bootstrap_app_password');
    }

    const identity = (await client.query(`
      SELECT role.rolcanlogin,
             role.rolsuper,
             role.rolinherit,
             role.rolcreaterole,
             role.rolcreatedb,
             role.rolreplication,
             role.rolbypassrls,
             (
               SELECT count(*)::int
               FROM pg_class AS relation
               JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
               WHERE namespace.nspname = 'public'
                 AND pg_get_userbyid(relation.relowner) = $1
             ) AS owned_public_relations
      FROM pg_roles AS role
      WHERE role.rolname = $1
    `, [APP_ROLE])).rows[0];
    const unsafe = !identity
      || !identity.rolcanlogin
      || identity.rolsuper
      || identity.rolinherit
      || identity.rolcreaterole
      || identity.rolcreatedb
      || identity.rolreplication
      || identity.rolbypassrls
      || Number(identity.owned_public_relations) !== 0;
    if (unsafe) {
      throw new RenderStartError(
        'UNSAFE_APP_ROLE',
        'capmint_app is not an isolated LOGIN, non-owner, non-superuser, NOBYPASSRLS role.'
      );
    }
  } finally {
    client.release();
  }
  log('role', 'capmint_app LOGIN configured; elevated attributes and table ownership absent');
}

async function verifyAppRoleConnection(appDatabaseUrl) {
  const pool = new Pool({
    connectionString: appDatabaseUrl,
    application_name: 'capmint-render-role-check/1',
    max: 1
  });
  try {
    const result = await pool.query(`
      SELECT current_user AS role_name,
             role.rolsuper,
             role.rolbypassrls,
             EXISTS (
               SELECT 1
               FROM pg_class AS relation
               WHERE relation.relrowsecurity
                 AND pg_get_userbyid(relation.relowner) = current_user
             ) AS owns_rls_table
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    const identity = result.rows[0];
    if (result.rowCount !== 1
      || identity.role_name !== APP_ROLE
      || identity.rolsuper
      || identity.rolbypassrls
      || identity.owns_rls_table) {
      throw new RenderStartError(
        'UNSAFE_APP_CONNECTION',
        'The derived DATABASE_URL does not connect as safe non-owner capmint_app.'
      );
    }
  } finally {
    await pool.end();
  }
  log('role', 'derived service DATABASE_URL authenticated as non-owner capmint_app');
}

function parsedBootstrapResult(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.code === 'string') return parsed;
    } catch {
      // Continue to the next line; only the bootstrap JSON status is trusted.
    }
  }
  return null;
}

async function bootstrapAdministrator(adminDatabaseUrl) {
  const result = await runCaptured(
    process.execPath,
    [path.join(ROOT, 'scripts/bootstrap-admin.js')],
    { env: { ...process.env, DATABASE_URL: adminDatabaseUrl } }
  );
  const status = parsedBootstrapResult(`${result.stdout}\n${result.stderr}`);
  if (result.code === 0 && status?.code === 'ADMIN_BOOTSTRAPPED') {
    log('bootstrap', 'first administrator created');
    return 'created';
  }
  if (result.code !== 0 && status?.code === 'ADMIN_ALREADY_EXISTS') {
    log('bootstrap', 'administrator already exists; idempotent bootstrap skipped');
    return 'skipped';
  }
  const code = status?.code || (result.signal ? `signal ${result.signal}` : `exit ${result.code}`);
  throw new RenderStartError(
    'ADMIN_BOOTSTRAP_FAILED',
    `Administrator bootstrap failed (${code}); refusing to start services.`
  );
}

function serviceEnvironment(environment = process.env) {
  const childEnvironment = { ...environment };
  for (const name of CHILD_SECRET_NAMES) delete childEnvironment[name];
  return childEnvironment;
}

async function startStack(environment) {
  log('boot', 'starting gateway and seven services; provisioning secrets removed from child environment');
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['start'], {
      cwd: ROOT,
      env: environment,
      stdio: 'inherit'
    });
    const forwardTerm = () => {
      if (!child.killed) child.kill('SIGTERM');
    };
    const forwardInterrupt = () => {
      if (!child.killed) child.kill('SIGINT');
    };
    process.once('SIGTERM', forwardTerm);
    process.once('SIGINT', forwardInterrupt);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      process.removeListener('SIGTERM', forwardTerm);
      process.removeListener('SIGINT', forwardInterrupt);
      if (code === 0) return resolve();
      reject(new RenderStartError(
        'STACK_EXITED',
        `npm start exited unexpectedly (${signal ? `signal ${signal}` : `exit ${code}`}).`
      ));
    });
  });
}

async function prepare(environment = process.env) {
  const { adminDatabaseUrl, appPassword } = validateRuntimeEnvironment(environment);
  const publicOrigin = configureExternalUrls(environment);
  const keySource = configureCertifierKeys(environment);
  const appDatabaseUrl = buildAppDatabaseUrl(adminDatabaseUrl, appPassword);
  environment.DATABASE_URL = appDatabaseUrl;
  log('config', `public origin configured from ${environment.RENDER_EXTERNAL_URL ? 'RENDER_EXTERNAL_URL' : 'explicit local values'}`);
  log('config', `certifier Ed25519 keypair ${keySource === 'derived' ? 'derived from the stable generated seed' : 'validated from supplied PEMs'}`);

  const ownerPool = new Pool({
    connectionString: adminDatabaseUrl,
    application_name: 'capmint-render-start/1',
    max: 2
  });
  try {
    const database = await inspectProvisioningDatabase(ownerPool);
    log('database', 'owner identity and CREATEROLE capability verified');
    await runMigrations(adminDatabaseUrl, database.needsBootstrap);
    await provisionAppRole(ownerPool, appPassword);
    await verifyAppRoleConnection(appDatabaseUrl);
    await bootstrapAdministrator(adminDatabaseUrl);
  } finally {
    await ownerPool.end();
  }

  return {
    publicOrigin,
    serviceEnvironment: serviceEnvironment(environment)
  };
}

async function main() {
  try {
    const prepared = await prepare(process.env);
    await startStack(prepared.serviceEnvironment);
  } catch (error) {
    const code = error instanceof RenderStartError ? error.code : 'RENDER_START_FAILED';
    process.stderr.write(`[render-start] fatal: ${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  RenderStartError,
  buildAppDatabaseUrl,
  configureCertifierKeys,
  configureExternalUrls,
  deriveCertifierKeyPair,
  inspectProvisioningDatabase,
  parsedBootstrapResult,
  prepare,
  provisionAppRole,
  serviceEnvironment,
  validateRuntimeEnvironment,
  verifyAppRoleConnection
};

if (require.main === module) {
  main();
}
