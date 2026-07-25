const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_LOCK = [1128353869, 1229410872];
const BOOTSTRAP_LOCK = [1128353869, 1111576148];
const ZERO_HASH = '0'.repeat(64);
const GENESIS_ENTITY_ID = '00000000-0000-0000-0000-000000000000';
const GENESIS_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const KNOWN_DEFAULTS = new Set([
  'admin',
  'admin123',
  'capmint',
  'changeme',
  'password',
  'password123',
  'qwerty123'
]);

class BootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function requiredEnvironment(name, environment = process.env) {
  const value = environment[name];
  if (!value || !value.trim()) {
    throw new BootstrapError('INVALID_CONFIGURATION', `${name} is required.`);
  }
  return value.trim();
}

function validateBootstrapInput(environment = process.env) {
  const databaseUrl = requiredEnvironment('DATABASE_URL', environment);
  const username = requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_USERNAME', environment);
  const organizationName = requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME', environment);
  const email = requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_EMAIL', environment).toLowerCase();
  const password = requiredEnvironment('CAPMINT_BOOTSTRAP_ADMIN_PASSWORD', environment);

  if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username)) {
    throw new BootstrapError(
      'INVALID_USERNAME',
      'Administrator username must be 3-100 characters using letters, digits, dot, underscore, or hyphen.'
    );
  }
  if (organizationName.length < 3 || organizationName.length > 255) {
    throw new BootstrapError('INVALID_ORGANIZATION_NAME', 'Organization name must be 3-255 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new BootstrapError('INVALID_EMAIL', 'Administrator email is invalid.');
  }

  validatePassword(password, username, email);
  return { databaseUrl, username, organizationName, email, password };
}

function validatePassword(password, username, email) {
  if (password.length < 16 || password.length > 128) {
    throw new BootstrapError('WEAK_PASSWORD', 'Password must be 16-128 characters.');
  }
  if (!/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password)) {
    throw new BootstrapError(
      'WEAK_PASSWORD',
      'Password must include lowercase, uppercase, numeric, and symbol characters.'
    );
  }

  const normalized = password.toLowerCase();
  const emailLocalPart = email.split('@')[0].toLowerCase();
  if (KNOWN_DEFAULTS.has(normalized)
    || normalized.includes(username.toLowerCase())
    || normalized.includes(emailLocalPart)) {
    throw new BootstrapError(
      'WEAK_PASSWORD',
      'Password must not be a known default or contain the username or email local part.'
    );
  }
}

function runMigrationCheck(databaseUrl) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'playground/run_migrations.js'), '--check', '--json'],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      timeout: 60_000
    }
  );

  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    throw new BootstrapError(
      'MIGRATION_CHECK_FAILED',
      `Migration check did not return valid JSON (exit ${result.status ?? 'unknown'}).`
    );
  }
  if (result.status !== 0 || output.exitCode !== 0 || output.report?.safe !== true) {
    throw new BootstrapError('MIGRATION_STATE_UNSAFE', 'Migration check is not clean; bootstrap refused.');
  }

  const requiredTables = ['organizations', 'users', 'log_entries'];
  for (const table of requiredTables) {
    if (!output.report.core_objects?.includes(table)) {
      throw new BootstrapError('MIGRATION_STATE_UNSAFE', `Required table ${table} is absent.`);
    }
  }
  return output.report;
}

async function acquireLock(client, [key1, key2], code, message) {
  const result = await client.query(
    'SELECT pg_try_advisory_lock($1, $2) AS acquired',
    [key1, key2]
  );
  if (!result.rows[0].acquired) throw new BootstrapError(code, message);
}

async function releaseLock(client, [key1, key2]) {
  await client.query('SELECT pg_advisory_unlock($1, $2)', [key1, key2]);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function appendAuditEvent(client, entityType, entityId, eventType, payload) {
  await client.query('LOCK TABLE log_entries IN SHARE ROW EXCLUSIVE MODE');
  const latest = await client.query(
    'SELECT current_hash FROM log_entries ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE'
  );

  let previousHash = ZERO_HASH;
  let createdAtExpression = 'clock_timestamp()';
  if (latest.rowCount === 0) {
    const genesisTime = (await client.query('SELECT clock_timestamp() AS timestamp')).rows[0].timestamp;
    await client.query(
      `INSERT INTO log_entries
         (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash, created_at)
       VALUES ('SYSTEM', $1, 'GENESIS_BLOCK_ANCHOR', $2, $3, $2, $4)`,
      [GENESIS_ENTITY_ID, GENESIS_HASH, ZERO_HASH, genesisTime]
    );
    previousHash = GENESIS_HASH;
    createdAtExpression = `$7::timestamptz + interval '1 microsecond'`;
    const payloadString = JSON.stringify(payload);
    const payloadHash = sha256(payloadString);
    const currentHash = sha256(entityType + entityId + eventType + payloadHash + previousHash);
    await client.query(
      `INSERT INTO log_entries
         (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${createdAtExpression})`,
      [entityType, entityId, eventType, payloadHash, previousHash, currentHash, genesisTime]
    );
    return;
  }

  previousHash = latest.rows[0].current_hash;
  const payloadString = JSON.stringify(payload);
  const payloadHash = sha256(payloadString);
  const currentHash = sha256(entityType + entityId + eventType + payloadHash + previousHash);
  await client.query(
    `INSERT INTO log_entries
       (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, ${createdAtExpression})`,
    [entityType, entityId, eventType, payloadHash, previousHash, currentHash]
  );
}

async function inspectAdministratorState(client, input) {
  const administratorOrganizations = await client.query(
    `SELECT o.id,
            count(u.id) FILTER (WHERE u.role = 'ADMIN')::int AS admin_count
     FROM organizations o
     LEFT JOIN users u ON u.organization_id = o.id
     WHERE o.type = 'SYSTEM_ADMINISTRATOR'
     GROUP BY o.id`
  );
  if (administratorOrganizations.rowCount > 0) {
    const hasAdmin = administratorOrganizations.rows.some(row => row.admin_count > 0);
    if (hasAdmin) {
      throw new BootstrapError(
        'ADMIN_ALREADY_EXISTS',
        'A system-administrator organization with an admin user already exists.'
      );
    }
    throw new BootstrapError(
      'AMBIGUOUS_BOOTSTRAP_STATE',
      'A system-administrator organization exists without an admin user; manual review is required.'
    );
  }

  const conflicts = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM organizations WHERE name = $1 OR official_email = $2) AS organization_conflict,
       EXISTS (SELECT 1 FROM users WHERE username = $3) AS username_conflict`,
    [input.organizationName, input.email, input.username]
  );
  if (conflicts.rows[0].organization_conflict || conflicts.rows[0].username_conflict) {
    throw new BootstrapError(
      'AMBIGUOUS_BOOTSTRAP_STATE',
      'Bootstrap organization, email, or username conflicts with existing data.'
    );
  }
}

async function bootstrapAdmin(environment = process.env, dependencies = {}) {
  const input = validateBootstrapInput(environment);
  const migrationReport = (dependencies.runMigrationCheck || runMigrationCheck)(input.databaseUrl);
  const PoolClass = dependencies.Pool || Pool;
  const pool = dependencies.pool || new PoolClass({
    connectionString: input.databaseUrl,
    application_name: 'capmint-bootstrap-admin/1'
  });
  const client = await pool.connect();
  let migrationLockHeld = false;
  let bootstrapLockHeld = false;

  try {
    const identity = await client.query('SELECT current_database() AS name');
    if (identity.rows[0].name !== migrationReport.database) {
      throw new BootstrapError('DATABASE_IDENTITY_MISMATCH', 'Migration check and bootstrap target differ.');
    }

    await acquireLock(
      client,
      MIGRATION_LOCK,
      'MIGRATION_LOCKED',
      'Migration activity is in progress; bootstrap refused.'
    );
    migrationLockHeld = true;
    await acquireLock(
      client,
      BOOTSTRAP_LOCK,
      'BOOTSTRAP_LOCKED',
      'Another administrator bootstrap is in progress.'
    );
    bootstrapLockHeld = true;

    await client.query('BEGIN');
    try {
      await inspectAdministratorState(client, input);
      const organizationId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(input.password, 10);

      await client.query(
        `INSERT INTO organizations
           (id, name, type, official_email, status, business_reg_details, contact_info)
         VALUES ($1, $2, 'SYSTEM_ADMINISTRATOR', $3, 'ACTIVATED', '{}'::jsonb, '{}'::jsonb)`,
        [organizationId, input.organizationName, input.email]
      );
      await client.query(
        `INSERT INTO users
           (id, organization_id, username, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE')`,
        [userId, organizationId, input.username, passwordHash]
      );
      await appendAuditEvent(
        client,
        'USER',
        userId,
        'SYSTEM_ADMIN_BOOTSTRAPPED',
        { organization_id: organizationId, user_id: userId, tool_version: '1' }
      );
      await client.query('COMMIT');
      return { code: 'ADMIN_BOOTSTRAPPED', organizationId, userId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    if (bootstrapLockHeld) await releaseLock(client, BOOTSTRAP_LOCK);
    if (migrationLockHeld) await releaseLock(client, MIGRATION_LOCK);
    client.release();
    if (!dependencies.pool) await pool.end();
  }
}

async function main() {
  try {
    const result = await bootstrapAdmin();
    process.stdout.write(`${JSON.stringify({ success: true, ...result })}\n`);
  } catch (error) {
    const code = error instanceof BootstrapError ? error.code : 'BOOTSTRAP_FAILED';
    process.stderr.write(`${JSON.stringify({ success: false, code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  BOOTSTRAP_LOCK,
  MIGRATION_LOCK,
  BootstrapError,
  appendAuditEvent,
  bootstrapAdmin,
  runMigrationCheck,
  validatePassword
};

if (require.main === module) {
  main();
}
