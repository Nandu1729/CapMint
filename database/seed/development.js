const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const {
  BOOTSTRAP_LOCK,
  MIGRATION_LOCK,
  BootstrapError,
  appendAuditEvent,
  runMigrationCheck,
  validatePassword
} = require('../../scripts/bootstrap-admin');

const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'integration']);
const FIXTURE_VERSION = 'development-v1';
const COMPROMISED_PUBLIC_KEY_FINGERPRINT =
  '7ee529f8fe8cfc739e7e0c7faef4119c6f7c7f6de78df1dbe7a8dcd686fcde7c';
const BUDGET_ID = '00000000-0000-0000-0000-000000000003';
const APPROVED_QUANTITY = '10000.00';

const ORGANIZATIONS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Organic Trade Council India',
    type: 'CERTIFICATION_BODY',
    email: 'certifier@capmint.example'
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Premium Farms',
    type: 'PRODUCER',
    email: 'producer@capmint.example'
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'NABL Accredited Labs India',
    type: 'NABL_LABORATORY',
    email: 'lab@capmint.example'
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Apex Export Corp',
    type: 'EXPORTER',
    email: 'exporter@capmint.example'
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    name: 'CapMint Development System Admin',
    type: 'SYSTEM_ADMINISTRATOR',
    email: 'admin@capmint.example'
  }
];

const USERS = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    organizationId: ORGANIZATIONS[0].id,
    username: 'certifier'
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    organizationId: ORGANIZATIONS[1].id,
    username: 'producer'
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    organizationId: ORGANIZATIONS[2].id,
    username: 'lab'
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    organizationId: ORGANIZATIONS[3].id,
    username: 'exporter'
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    organizationId: ORGANIZATIONS[4].id,
    username: 'admin'
  }
];

function requiredEnvironment(name, environment) {
  const value = environment[name];
  if (!value || !value.trim()) {
    throw new BootstrapError('INVALID_CONFIGURATION', `${name} is required.`);
  }
  return value.trim();
}

function publicKeyFingerprint(keyObject) {
  const der = keyObject.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex');
}

function validateDevelopmentConfiguration(environment = process.env) {
  if (!ALLOWED_ENVIRONMENTS.has(environment.NODE_ENV || '')) {
    throw new BootstrapError(
      'DEVELOPMENT_SEED_FORBIDDEN',
      'NODE_ENV must be development, test, or integration.'
    );
  }
  if (environment.CAPMINT_ALLOW_DEVELOPMENT_SEED !== '1') {
    throw new BootstrapError(
      'DEVELOPMENT_SEED_FORBIDDEN',
      'CAPMINT_ALLOW_DEVELOPMENT_SEED=1 is required.'
    );
  }

  const databaseUrl = requiredEnvironment('DATABASE_URL', environment);
  const password = requiredEnvironment('CAPMINT_DEVELOPMENT_SEED_PASSWORD', environment);
  const privateKeyPem = requiredEnvironment('CAPMINT_DEVELOPMENT_CERTIFIER_PRIVATE_KEY', environment);
  const publicKeyPem = requiredEnvironment('CAPMINT_DEVELOPMENT_CERTIFIER_PUBLIC_KEY', environment);
  validatePassword(password, 'development-fixture', 'development-fixture@capmint.example');

  let privateKey;
  let publicKey;
  try {
    privateKey = crypto.createPrivateKey(privateKeyPem);
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch {
    throw new BootstrapError('INVALID_DEVELOPMENT_KEYPAIR', 'Development Ed25519 key material is malformed.');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') {
    throw new BootstrapError('INVALID_DEVELOPMENT_KEYPAIR', 'Development keys must use Ed25519.');
  }

  const derivedPublicKey = crypto.createPublicKey(privateKey);
  const suppliedFingerprint = publicKeyFingerprint(publicKey);
  if (suppliedFingerprint === COMPROMISED_PUBLIC_KEY_FINGERPRINT) {
    throw new BootstrapError(
      'COMPROMISED_DEVELOPMENT_KEY',
      'The known compromised development certifier key is forbidden.'
    );
  }
  if (suppliedFingerprint !== publicKeyFingerprint(derivedPublicKey)) {
    throw new BootstrapError('INVALID_DEVELOPMENT_KEYPAIR', 'Development public/private keys do not match.');
  }

  return {
    databaseUrl,
    password,
    privateKey,
    publicKey,
    canonicalPublicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

async function acquireLock(client, lock, code, message) {
  const result = await client.query(
    'SELECT pg_try_advisory_lock($1, $2) AS acquired',
    lock
  );
  if (!result.rows[0].acquired) throw new BootstrapError(code, message);
}

async function releaseLock(client, lock) {
  await client.query('SELECT pg_advisory_unlock($1, $2)', lock);
}

async function databaseCounts(client) {
  return (await client.query(`
    SELECT
      (SELECT count(*)::int FROM organizations) AS organizations,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM certifiers) AS certifiers,
      (SELECT count(*)::int FROM producers) AS producers,
      (SELECT count(*)::int FROM budgets) AS budgets,
      (SELECT count(*)::int FROM lots) AS lots,
      (SELECT count(*)::int FROM unit_codes) AS unit_codes,
      (SELECT count(*)::int FROM lab_results) AS lab_results,
      (SELECT count(*)::int FROM scan_events) AS scan_events,
      (SELECT count(*)::int FROM investigations) AS investigations,
      (SELECT count(*)::int FROM producer_brandings) AS producer_brandings
  `)).rows[0];
}

async function exactFixtureState(client, configuration) {
  const organizations = (await client.query(
    `SELECT id, name, type, official_email, status
     FROM organizations
     WHERE id = ANY($1::uuid[])
     ORDER BY id`,
    [ORGANIZATIONS.map(row => row.id)]
  )).rows;
  const users = (await client.query(
    `SELECT id, organization_id, username, password_hash, role, status
     FROM users
     WHERE id = ANY($1::uuid[])
     ORDER BY id`,
    [USERS.map(row => row.id)]
  )).rows;
  const certifier = (await client.query(
    `SELECT id, organization_id, name, public_key, key_status
     FROM certifiers WHERE id = $1`,
    [ORGANIZATIONS[0].id]
  )).rows[0];
  const producer = (await client.query(
    `SELECT id, organization_id, name, type, registry_references
     FROM producers WHERE id = $1`,
    [ORGANIZATIONS[1].id]
  )).rows[0];
  const budget = (await client.query(
    `SELECT id, producer_id, certifier_id, source_unit_type, approved_quantity,
            consumed_quantity, signature_bundle, effective_start_date,
            effective_end_date, status, yield_assumptions
     FROM budgets WHERE id = $1`,
    [BUDGET_ID]
  )).rows[0];
  const auditCount = Number((await client.query(
    `SELECT count(*)::int AS count
     FROM log_entries
     WHERE event_type = 'DEVELOPMENT_FIXTURES_SEEDED'`
  )).rows[0].count);

  if (organizations.length !== ORGANIZATIONS.length
    || users.length !== USERS.length
    || !certifier
    || !producer
    || !budget
    || auditCount !== 1) {
    return false;
  }

  const expectedOrganizations = [...ORGANIZATIONS].sort((left, right) => left.id.localeCompare(right.id));
  for (let index = 0; index < expectedOrganizations.length; index += 1) {
    const actual = organizations[index];
    const expected = expectedOrganizations[index];
    if (actual.id !== expected.id
      || actual.name !== expected.name
      || actual.type !== expected.type
      || actual.official_email !== expected.email
      || actual.status !== 'ACTIVATED') {
      return false;
    }
  }

  const expectedUsers = [...USERS].sort((left, right) => left.id.localeCompare(right.id));
  for (let index = 0; index < expectedUsers.length; index += 1) {
    const actual = users[index];
    const expected = expectedUsers[index];
    if (actual.id !== expected.id
      || actual.organization_id !== expected.organizationId
      || actual.username !== expected.username
      || actual.role !== 'ADMIN'
      || actual.status !== 'ACTIVE'
      || !bcrypt.compareSync(configuration.password, actual.password_hash)) {
      return false;
    }
  }

  const storedPublicKey = crypto.createPublicKey(certifier.public_key);
  const message = `budget_id:${BUDGET_ID};approved_quantity:${APPROVED_QUANTITY}`;
  return certifier.id === ORGANIZATIONS[0].id
    && certifier.organization_id === ORGANIZATIONS[0].id
    && certifier.name === ORGANIZATIONS[0].name
    && certifier.key_status === 'ACTIVE'
    && publicKeyFingerprint(storedPublicKey) === publicKeyFingerprint(configuration.publicKey)
    && producer.id === ORGANIZATIONS[1].id
    && producer.organization_id === ORGANIZATIONS[1].id
    && producer.name === ORGANIZATIONS[1].name
    && producer.type === 'FARMER'
    && JSON.stringify(producer.registry_references) === '{}'
    && budget.id === BUDGET_ID
    && budget.producer_id === ORGANIZATIONS[1].id
    && budget.certifier_id === ORGANIZATIONS[0].id
    && budget.source_unit_type === 'UNIT_COUNT'
    && budget.approved_quantity === APPROVED_QUANTITY
    && budget.consumed_quantity === '0.00'
    && budget.status === 'PENDING_APPROVAL'
    && budget.effective_start_date.toISOString() === '2026-07-11T00:00:00.000Z'
    && budget.effective_end_date.toISOString() === '2099-12-31T00:00:00.000Z'
    && JSON.stringify(budget.yield_assumptions)
      === JSON.stringify({ crop: 'Organic White Honey', fixture_version: FIXTURE_VERSION })
    && crypto.verify(
      null,
      Buffer.from(message),
      configuration.publicKey,
      Buffer.from(budget.signature_bundle, 'hex')
    );
}

async function seedDevelopment(environment = process.env, dependencies = {}) {
  const configuration = validateDevelopmentConfiguration(environment);
  const migrationReport = (dependencies.runMigrationCheck || runMigrationCheck)(configuration.databaseUrl);
  const PoolClass = dependencies.Pool || Pool;
  const pool = dependencies.pool || new PoolClass({
    connectionString: configuration.databaseUrl,
    application_name: `capmint-development-seed/${FIXTURE_VERSION}`
  });
  const client = await pool.connect();
  let migrationLockHeld = false;
  let bootstrapLockHeld = false;

  try {
    const identity = await client.query('SELECT current_database() AS name');
    if (identity.rows[0].name !== migrationReport.database) {
      throw new BootstrapError('DATABASE_IDENTITY_MISMATCH', 'Migration check and seed target differ.');
    }
    await acquireLock(client, MIGRATION_LOCK, 'MIGRATION_LOCKED', 'Migration activity is in progress.');
    migrationLockHeld = true;
    await acquireLock(client, BOOTSTRAP_LOCK, 'BOOTSTRAP_LOCKED', 'Another bootstrap or seed is in progress.');
    bootstrapLockHeld = true;

    await client.query('BEGIN');
    try {
      const counts = await databaseCounts(client);
      const applicationRows = Object.values(counts).reduce((total, value) => total + Number(value), 0);
      if (applicationRows > 0) {
        if (await exactFixtureState(client, configuration)) {
          await client.query('COMMIT');
          return { code: 'DEVELOPMENT_FIXTURES_ALREADY_PRESENT', fixtureVersion: FIXTURE_VERSION };
        }
        throw new BootstrapError(
          'DEVELOPMENT_SEED_STATE_MISMATCH',
          'Database is non-empty and does not exactly match the development fixture set.'
        );
      }

      const passwordHash = await bcrypt.hash(configuration.password, 10);
      for (const organization of ORGANIZATIONS) {
        await client.query(
          `INSERT INTO organizations
             (id, name, type, status, official_email, business_reg_details, contact_info)
           VALUES ($1, $2, $3, 'ACTIVATED', $4, '{}'::jsonb, '{}'::jsonb)`,
          [organization.id, organization.name, organization.type, organization.email]
        );
      }
      await client.query(
        `INSERT INTO certifiers
           (id, organization_id, name, accreditation_details, public_key, key_status)
         VALUES ($1, $1, $2, '{}'::jsonb, $3, 'ACTIVE')`,
        [ORGANIZATIONS[0].id, ORGANIZATIONS[0].name, configuration.canonicalPublicKey]
      );
      await client.query(
        `INSERT INTO producers (id, organization_id, name, type, registry_references)
         VALUES ($1, $1, $2, 'FARMER', '{}'::jsonb)`,
        [ORGANIZATIONS[1].id, ORGANIZATIONS[1].name]
      );
      for (const user of USERS) {
        await client.query(
          `INSERT INTO users
             (id, organization_id, username, password_hash, role, status)
           VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE')`,
          [user.id, user.organizationId, user.username, passwordHash]
        );
      }

      const message = `budget_id:${BUDGET_ID};approved_quantity:${APPROVED_QUANTITY}`;
      const signature = crypto.sign(
        null,
        Buffer.from(message),
        configuration.privateKey
      ).toString('hex');
      await client.query(
        `INSERT INTO budgets
           (id, producer_id, certifier_id, source_unit_type, approved_quantity,
            consumed_quantity, signature_bundle, effective_start_date,
            effective_end_date, status, yield_assumptions)
         VALUES ($1, $2, $3, 'UNIT_COUNT', $4, 0, $5, $6, $7,
                 'PENDING_APPROVAL', $8::jsonb)`,
        [
          BUDGET_ID,
          ORGANIZATIONS[1].id,
          ORGANIZATIONS[0].id,
          APPROVED_QUANTITY,
          signature,
          '2026-07-11T00:00:00.000Z',
          '2099-12-31T00:00:00.000Z',
          JSON.stringify({ crop: 'Organic White Honey', fixture_version: FIXTURE_VERSION })
        ]
      );
      await appendAuditEvent(
        client,
        'ORGANIZATION',
        ORGANIZATIONS[4].id,
        'DEVELOPMENT_FIXTURES_SEEDED',
        {
          fixture_version: FIXTURE_VERSION,
          organizations: ORGANIZATIONS.length,
          users: USERS.length,
          certifiers: 1,
          producers: 1,
          budgets: 1
        }
      );

      await client.query('COMMIT');
      return { code: 'DEVELOPMENT_FIXTURES_SEEDED', fixtureVersion: FIXTURE_VERSION };
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
    const result = await seedDevelopment();
    process.stdout.write(`${JSON.stringify({ success: true, ...result })}\n`);
  } catch (error) {
    const code = error instanceof BootstrapError ? error.code : 'DEVELOPMENT_SEED_FAILED';
    process.stderr.write(`${JSON.stringify({ success: false, code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  COMPROMISED_PUBLIC_KEY_FINGERPRINT,
  FIXTURE_VERSION,
  seedDevelopment,
  validateDevelopmentConfiguration
};

if (require.main === module) {
  main();
}
