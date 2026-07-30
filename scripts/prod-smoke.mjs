#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const WRITE_AUDIT = 'WRITE — successful login appends a USER_LOGIN audit event';
const WRITE_REJECTED =
  'WRITE ATTEMPT — over-capacity mint must return 422 and leave unit codes unchanged';
const WRITE_SCAN = 'WRITE — public verification appends one scan_events row';
const CAPACITY_CODES = new Set(['EXCEEDS_LOT_CAPACITY', 'EXCEEDS_CAPACITY']);
const PUBLIC_STATUSES = new Set(['VERIFIED', 'REVOKED', 'EXPIRED', 'UNKNOWN']);

class SmokeFailure extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`);
    this.name = 'SmokeFailure';
  }
}

function printHelp() {
  process.stdout.write(`CapMint production post-deploy smoke

Usage:
  CAPMINT_SMOKE_BASE_URL=https://capmint.example \\
  CAPMINT_SMOKE_PRIMARY_USERNAME=<activated producer with fixtures> \\
  CAPMINT_SMOKE_PRIMARY_PASSWORD=<secret> \\
  CAPMINT_SMOKE_FOREIGN_USERNAME=<activated empty producer> \\
  CAPMINT_SMOKE_FOREIGN_PASSWORD=<secret> \\
  node scripts/prod-smoke.mjs

Required fixture contract:
  - both credentials belong to distinct ACTIVATED PRODUCER organizations;
  - the primary tenant owns at least one budget, lot, and public unit code;
  - the foreign tenant intentionally owns zero budgets, lots, and unit codes;
  - the base URL routes the canonical /api/v1 endpoints to the seven services.

Writes performed and clearly logged:
  - two successful logins append USER_LOGIN ledger events;
  - one deliberately rejected over-capacity mint attempt (inventory must not change);
  - one public verification appends a scan_events row.

Optional:
  CAPMINT_SMOKE_TIMEOUT_MS=<request timeout, default 10000, maximum 120000>
`);
}

function requiredEnvironment(name, environment) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SmokeFailure('configuration', `${name} is required.`);
  }
  return value.trim();
}

function parseBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SmokeFailure('configuration', 'CAPMINT_SMOKE_BASE_URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SmokeFailure('configuration', 'CAPMINT_SMOKE_BASE_URL must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new SmokeFailure(
      'configuration',
      'CAPMINT_SMOKE_BASE_URL must not contain credentials.'
    );
  }
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/';
  return parsed;
}

function parseTimeout(environment) {
  const raw = environment.CAPMINT_SMOKE_TIMEOUT_MS || '10000';
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new SmokeFailure(
      'configuration',
      'CAPMINT_SMOKE_TIMEOUT_MS must be a positive integer.'
    );
  }
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > 120_000) {
    throw new SmokeFailure(
      'configuration',
      'CAPMINT_SMOKE_TIMEOUT_MS must not exceed 120000.'
    );
  }
  return timeoutMs;
}

function loadConfiguration(environment = process.env) {
  return {
    baseUrl: parseBaseUrl(requiredEnvironment('CAPMINT_SMOKE_BASE_URL', environment)),
    timeoutMs: parseTimeout(environment),
    primary: {
      username: requiredEnvironment('CAPMINT_SMOKE_PRIMARY_USERNAME', environment),
      password: requiredEnvironment('CAPMINT_SMOKE_PRIMARY_PASSWORD', environment)
    },
    foreign: {
      username: requiredEnvironment('CAPMINT_SMOKE_FOREIGN_USERNAME', environment),
      password: requiredEnvironment('CAPMINT_SMOKE_FOREIGN_PASSWORD', environment)
    }
  };
}

function endpointUrl(baseUrl, path) {
  return new URL(path.replace(/^\/+/, ''), baseUrl);
}

function responseErrorCode(payload) {
  return payload
    && typeof payload === 'object'
    && payload.error
    && typeof payload.error === 'object'
    && typeof payload.error.code === 'string'
    ? payload.error.code
    : 'UNKNOWN';
}

async function requestJson(config, step, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers = {
    Accept: 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' })
  };

  try {
    const response = await fetch(endpointUrl(config.baseUrl, path), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new SmokeFailure(
        step,
        `expected JSON but received HTTP ${response.status} with content-type ` +
          `"${contentType || 'missing'}".`
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new SmokeFailure(step, `HTTP ${response.status} returned malformed JSON.`);
    }
    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof SmokeFailure) throw error;
    if (error && error.name === 'AbortError') {
      throw new SmokeFailure(step, `request timed out after ${config.timeoutMs}ms.`);
    }
    throw new SmokeFailure(step, 'request failed before a valid response was received.');
  } finally {
    clearTimeout(timer);
  }
}

function assertInvariant(condition, step, message) {
  if (!condition) throw new SmokeFailure(step, message);
}

function expectSuccess(response, step, expectedStatus = 200) {
  assertInvariant(
    response.status === expectedStatus,
    step,
    `expected HTTP ${expectedStatus}, received ${response.status} ` +
      `(code ${responseErrorCode(response.payload)}).`
  );
  assertInvariant(
    response.payload?.success === true,
    step,
    'response did not contain success=true.'
  );
  return response.payload;
}

function expectArray(payload, path, step) {
  let value = payload;
  for (const key of path) value = value?.[key];
  assertInvariant(Array.isArray(value), step, `response field ${path.join('.')} is not an array.`);
  return value;
}

function printStep(kind, message) {
  process.stdout.write(`[${kind}] ${message}\n`);
}

async function login(config, label, credentials) {
  const step = `${label} login`;
  printStep(WRITE_AUDIT, `authenticate ${label} tenant`);
  const response = await requestJson(config, step, '/api/v1/auth/login', {
    method: 'POST',
    body: credentials
  });
  const payload = expectSuccess(response, step);
  const token = payload.data?.token;
  const user = payload.data?.user;
  assertInvariant(typeof token === 'string' && token !== '', step, 'JWT is missing.');
  assertInvariant(user && typeof user === 'object', step, 'user identity is missing.');
  assertInvariant(user.orgType === 'PRODUCER', step, 'credential must belong to a PRODUCER.');
  assertInvariant(
    typeof user.orgId === 'string' && user.orgId !== '',
    step,
    'organization ID is missing.'
  );
  printStep('PASS', `${label} tenant authenticated as PRODUCER`);
  return { token, user };
}

async function readTenantScope(config, label, token) {
  const requests = [
    {
      name: 'budgets',
      path: '/api/v1/budgets',
      responsePath: ['data', 'budgets']
    },
    {
      name: 'lots',
      path: '/api/v1/verify/lots',
      responsePath: ['data', 'lots']
    },
    {
      name: 'unit codes',
      path: '/api/v1/verify/unit-codes',
      responsePath: ['data', 'unitCodes']
    }
  ];
  const scoped = {};

  for (const request of requests) {
    const step = `${label} ${request.name} read`;
    printStep('READ', `${label}: GET ${request.path}`);
    const response = await requestJson(config, step, request.path, { token });
    const payload = expectSuccess(response, step);
    scoped[request.name] = expectArray(payload, request.responsePath, step);
  }

  return {
    budgets: scoped.budgets,
    lots: scoped.lots,
    unitCodes: scoped['unit codes']
  };
}

function assertPrimaryScope(scope) {
  const step = 'primary tenant scoped reads';
  assertInvariant(scope.budgets.length > 0, step, 'expected at least one budget.');
  assertInvariant(scope.lots.length > 0, step, 'expected at least one lot.');
  assertInvariant(scope.unitCodes.length > 0, step, 'expected at least one unit code.');

  const budgetIds = new Set(scope.budgets.map(budget => budget?.id));
  const lotIds = new Set(scope.lots.map(lot => lot?.id));
  assertInvariant(
    scope.lots.every(lot =>
      typeof lot?.id === 'string'
      && typeof lot?.budgetId === 'string'
      && budgetIds.has(lot.budgetId)
    ),
    step,
    'a returned lot is not linked to a returned tenant budget.'
  );
  assertInvariant(
    scope.unitCodes.every(code =>
      typeof code?.lotId === 'string'
      && typeof code?.gtin === 'string'
      && typeof code?.serial === 'string'
      && typeof code?.public_identifier === 'string'
      && lotIds.has(code.lotId)
    ),
    step,
    'a returned unit code is incomplete or not linked to a returned tenant lot.'
  );
  printStep(
    'PASS',
    `primary scoped reads: ${scope.budgets.length} budget(s), ` +
      `${scope.lots.length} lot(s), ${scope.unitCodes.length} unit code(s)`
  );
}

function assertForeignScope(scope) {
  const step = 'foreign tenant cross-tenant denial';
  assertInvariant(scope.budgets.length === 0, step, 'foreign tenant saw budget rows.');
  assertInvariant(scope.lots.length === 0, step, 'foreign tenant saw lot rows.');
  assertInvariant(scope.unitCodes.length === 0, step, 'foreign tenant saw unit-code rows.');
  printStep('PASS', 'foreign tenant sees 0 budgets, 0 lots, and 0 unit codes');
}

function unitCodeInventory(unitCodes) {
  return unitCodes
    .map(code =>
      [code.lotId, code.gtin, code.serial, code.public_identifier, code.state].join('|')
    )
    .sort();
}

function chooseCapacityFixture(scope) {
  const budgetsById = new Map(scope.budgets.map(budget => [budget.id, budget]));
  const lotsById = new Map(scope.lots.map(lot => [lot.id, lot]));
  const issuedByLot = new Map();
  for (const code of scope.unitCodes) {
    issuedByLot.set(code.lotId, (issuedByLot.get(code.lotId) || 0) + 1);
  }

  const code = scope.unitCodes.find(candidate => {
    const lot = lotsById.get(candidate.lotId);
    const budget = lot && budgetsById.get(lot.budgetId);
    return candidate.clone_flag !== true
      && candidate.state !== 'REVOKED'
      && lot
      && lot.revocation_status === 'ACTIVE'
      && budget
      && ['ACTIVE', 'EXHAUSTED'].includes(budget.status)
      && Number.isFinite(Number(lot.weight))
      && Number(lot.weight) > 0;
  });
  assertInvariant(
    code,
    'capacity fixture',
    'no non-clone public unit code is linked to a positive-capacity lot.'
  );

  const lot = lotsById.get(code.lotId);
  const issued = issuedByLot.get(lot.id) || 0;
  const capacity = Number(lot.weight);
  assertInvariant(
    issued <= capacity,
    'capacity fixture',
    `lot is already overfilled (${issued}/${capacity}).`
  );
  const rejectedQuantity = Math.max(1, Math.floor(capacity - issued) + 1);
  return { code, lot, issued, capacity, rejectedQuantity };
}

async function assertCapacityRejection(config, token, primaryScope) {
  const step = 'capacity over-issuance';
  const fixture = chooseCapacityFixture(primaryScope);
  const before = unitCodeInventory(primaryScope.unitCodes);

  printStep(
    WRITE_REJECTED,
    `POST /api/v1/mint for ${fixture.rejectedQuantity} unit(s) against a ` +
      `${fixture.issued}/${fixture.capacity} lot`
  );
  const response = await requestJson(config, step, '/api/v1/mint', {
    method: 'POST',
    token,
    body: {
      lot_id: fixture.lot.id,
      gtin: fixture.code.gtin,
      quantity: fixture.rejectedQuantity
    }
  });
  assertInvariant(
    response.status === 422,
    step,
    `expected HTTP 422, received ${response.status} ` +
      `(code ${responseErrorCode(response.payload)}).`
  );
  const code = responseErrorCode(response.payload);
  assertInvariant(
    response.payload?.success === false && CAPACITY_CODES.has(code),
    step,
    `expected a capacity error code, received ${code}.`
  );

  printStep('READ', 're-read primary unit codes to prove rejected mint made no change');
  const afterResponse = await requestJson(
    config,
    `${step} inventory re-read`,
    '/api/v1/verify/unit-codes',
    { token }
  );
  const afterPayload = expectSuccess(afterResponse, `${step} inventory re-read`);
  const afterCodes = expectArray(
    afterPayload,
    ['data', 'unitCodes'],
    `${step} inventory re-read`
  );
  assertInvariant(
    JSON.stringify(unitCodeInventory(afterCodes)) === JSON.stringify(before),
    step,
    'unit-code inventory changed after rejected over-capacity mint.'
  );
  printStep('PASS', `over-capacity issuance rejected with 422 ${code}; inventory unchanged`);
  return fixture.code;
}

async function assertPublicVerification(config, code) {
  const step = 'consumer public-code verification';
  printStep(
    WRITE_SCAN,
    'POST /api/v1/verify/v/:public_identifier without authentication'
  );
  const response = await requestJson(
    config,
    step,
    `/api/v1/verify/v/${encodeURIComponent(code.public_identifier)}`,
    {
      method: 'POST',
      body: {
        device_metadata: {
          source: 'capmint-production-smoke'
        }
      }
    }
  );
  const payload = expectSuccess(response, step);
  assertInvariant(
    PUBLIC_STATUSES.has(payload.data?.status),
    step,
    `unexpected verification status "${payload.data?.status || 'missing'}".`
  );
  assertInvariant(payload.data?.gtin === code.gtin, step, 'GTIN does not match the public code.');
  assertInvariant(
    payload.data?.serial === code.serial,
    step,
    'serial does not match the public code.'
  );
  printStep('PASS', `public verification returned ${payload.data.status}`);
}

async function assertLedger(config) {
  const step = 'transparency chain verification';
  printStep('READ', 'GET /api/v1/log/verify');
  const response = await requestJson(config, step, '/api/v1/log/verify');
  const payload = expectSuccess(response, step);
  assertInvariant(payload.data?.unbroken === true, step, 'unbroken is not true.');
  assertInvariant(
    Number.isInteger(payload.data?.logCount) && payload.data.logCount > 0,
    step,
    'logCount must be a positive integer.'
  );
  assertInvariant(
    Array.isArray(payload.data?.errors) && payload.data.errors.length === 0,
    step,
    'ledger verification reported errors.'
  );
  printStep('PASS', `transparency chain unbroken (${payload.data.logCount} entries)`);
}

async function run(environment = process.env) {
  const config = loadConfiguration(environment);
  process.stdout.write('CapMint production post-deploy smoke\n');
  process.stdout.write(`Target: ${config.baseUrl.origin}${config.baseUrl.pathname}\n`);
  process.stdout.write('Secrets and JWTs are never printed.\n\n');

  const primary = await login(config, 'primary', config.primary);
  const foreign = await login(config, 'foreign', config.foreign);
  assertInvariant(
    primary.user.orgId !== foreign.user.orgId,
    'tenant identity',
    'primary and foreign credentials resolve to the same organization.'
  );
  printStep('PASS', 'primary and foreign credentials resolve to distinct producer tenants');

  const primaryScope = await readTenantScope(config, 'primary', primary.token);
  assertPrimaryScope(primaryScope);
  const foreignScope = await readTenantScope(config, 'foreign', foreign.token);
  assertForeignScope(foreignScope);

  const publicCode = await assertCapacityRejection(config, primary.token, primaryScope);
  await assertPublicVerification(config, publicCode);
  await assertLedger(config);

  process.stdout.write('\nGREEN — all production smoke invariants passed.\n');
  process.stdout.write(
    'Persistent writes: 2 login audit events + 1 scan event. ' +
      'The rejected mint changed no unit-code inventory.\n'
  );
}

const isMain =
  typeof process.argv[1] === 'string'
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    printHelp();
  } else if (args.length > 0) {
    process.stderr.write(`prod-smoke: unknown argument(s): ${args.join(', ')}\n`);
    process.exitCode = 2;
  } else {
    run().catch(error => {
      const message = error instanceof Error ? error.message : 'unknown smoke failure';
      process.stderr.write(`RED — ${message}\n`);
      process.exitCode = 1;
    });
  }
}

export {
  SmokeFailure,
  assertCapacityRejection,
  assertForeignScope,
  assertLedger,
  assertPrimaryScope,
  assertPublicVerification,
  loadConfiguration,
  requestJson,
  run
};
