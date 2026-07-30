import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Redis } from 'ioredis';
import pg from 'pg';

const RUN_INTEGRATION = process.env.RUN_F1_COMPLIANCE === '1';
const RUN_ID = process.env.F1_SUITE_RUN_ID || '';
const ITERATIONS = Number(process.env.F1_SUITE_ITERATIONS || '1');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXPECTED_ACTIVE_ASSERTIONS = 88;
const EXPECTED_PENDING_ASSERTIONS = 0;

dotenv.config({ path: path.join(ROOT, '.env') });

const PORTS = {
  gateway: 29180,
  auth: 29181,
  cpq: 29182,
  mint: 29183,
  resolver: 29184,
  transparency: 29185,
  verification: 29186,
  integration: 29187
};

const suite = RUN_INTEGRATION ? describe : describe.skip;

type RunningChild = {
  name: string;
  process: ChildProcess;
  output: string;
};

function quoteIdentifier(value: string): string {
  if (!/^capmint_suite_[a-z0-9_]+$/.test(value)) {
    throw new Error(`Refusing unsafe compliance database name: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function requireLocalUrl(value: string, name: string): URL {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`${name} must use a local host for the disposable compliance harness.`);
  }
  return url;
}

function databaseUrl(source: URL, databaseName: string): string {
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function portIsOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(child: RunningChild, port: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.process.exitCode !== null) {
      throw new Error(`${child.name} exited before readiness (${child.process.exitCode}): ${child.output.slice(-3000)}`);
    }
    if (await portIsOpen(port)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${child.name} did not listen on ${port}: ${child.output.slice(-3000)}`);
}

async function startChild(
  children: RunningChild[],
  name: string,
  command: string,
  args: string[],
  port: number,
  env: NodeJS.ProcessEnv
): Promise<void> {
  if (await portIsOpen(port)) {
    throw new Error(`Port ${port} is occupied; refusing to reuse or stop an existing process.`);
  }
  const child = spawn(command, args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const running = { name, process: child, output: '' };
  const capture = (chunk: Buffer) => {
    running.output += chunk.toString('utf8');
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  children.push(running);
  await waitForPort(running, port);
}

async function stopChildren(children: RunningChild[]): Promise<void> {
  for (const child of [...children].reverse()) {
    if (child.process.exitCode === null) child.process.kill('SIGTERM');
  }
  await Promise.all(children.map(async child => {
    if (child.process.exitCode !== null) return;
    await Promise.race([
      new Promise<void>(resolve => child.process.once('exit', () => resolve())),
      new Promise<void>(resolve => setTimeout(resolve, 3000))
    ]);
    if (child.process.exitCode === null) child.process.kill('SIGKILL');
  }));
}

async function selectEmptyRedisDatabase(source: URL): Promise<{ url: string; client: Redis }> {
  for (let index = 15; index >= 1; index -= 1) {
    const candidate = new URL(source);
    candidate.pathname = `/${index}`;
    const client = new Redis(candidate.toString(), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true
    });
    try {
      await client.connect();
      if (await client.dbsize() === 0) return { url: candidate.toString(), client };
      client.disconnect();
    } catch {
      client.disconnect();
      throw new Error(`Unable to inspect local Redis logical database ${index}.`);
    }
  }
  throw new Error('No empty Redis logical database is available in slots 1-15.');
}

function generateKeyPair(): { privateKey: string; publicKey: string } {
  return crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
}

function verifyKeyPair(privateKey: string, publicKey: string): void {
  const message = Buffer.from('capmint-f1-certifier-key-preflight');
  const signature = crypto.sign(null, message, privateKey);
  if (!crypto.verify(null, message, publicKey, signature)) {
    throw new Error('Compliance certifier private/public key pair does not match.');
  }
}

async function createRuntimeGateway(tempDirectory: string): Promise<string> {
  let source = await fs.readFile(path.join(ROOT, 'scripts/frontend-server.js'), 'utf8');
  source = source
    .replace('const PORT = 8080;', "const PORT = Number(process.env.PORT || '8080');")
    .replaceAll("path.join(__dirname, '..',", 'path.join(process.env.CAPMINT_ROOT,')
    .replace('return proxyApi(8081, req, res);', "return proxyApi(Number(process.env.AUTH_SERVICE_PORT || '8081'), req, res);")
    .replace('return proxyApi(8082, req, res);', "return proxyApi(Number(process.env.CPQ_SERVICE_PORT || '8082'), req, res);")
    .replace('return proxyApi(8083, req, res);', "return proxyApi(Number(process.env.MINT_SERVICE_PORT || '8083'), req, res);")
    .replace('return proxyApi(8084, req, res);', "return proxyApi(Number(process.env.RESOLVER_SERVICE_PORT || '8084'), req, res);")
    .replace('return proxyApi(8085, req, res);', "return proxyApi(Number(process.env.TRANSPARENCY_SERVICE_PORT || '8085'), req, res);")
    .replace('return proxyApi(8086, req, res);', "return proxyApi(Number(process.env.VERIFICATION_SERVICE_PORT || '8086'), req, res);")
    .replace('return proxyApi(8087, req, res);', "return proxyApi(Number(process.env.INTEGRATION_SERVICE_PORT || '8087'), req, res);");
  const gatewayPath = path.join(tempDirectory, 'frontend-server.cjs');
  await fs.writeFile(gatewayPath, source, 'utf8');
  return gatewayPath;
}

async function runIteration(iteration: number): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(RUN_ID)) {
    throw new Error('F1_SUITE_RUN_ID must contain lowercase letters, digits, or underscores.');
  }
  const sourceDatabase = requireLocalUrl(process.env.DATABASE_URL || '', 'DATABASE_URL');
  const sourceRedis = requireLocalUrl(process.env.REDIS_URL || '', 'REDIS_URL');
  const databaseName = `capmint_suite_${RUN_ID}_${iteration}`;
  quoteIdentifier(databaseName);

  const adminUrl = new URL(sourceDatabase);
  adminUrl.pathname = '/postgres';
  const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
  const testUrl = databaseUrl(sourceDatabase, databaseName);
  const testPool = new pg.Pool({ connectionString: testUrl });
  const children: RunningChild[] = [];
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'capmint-f1-'));
  let databaseCreated = false;
  let appRoleProvisioned = false;
  let redis: Redis | undefined;

  try {
    const existing = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (existing.rowCount !== 0) {
      throw new Error(`Disposable database ${databaseName} already exists; refusing to overwrite it.`);
    }
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`);
    databaseCreated = true;

    const bootstrap = spawnSync(
      process.execPath,
      [path.join(ROOT, 'playground/run_migrations.js'), '--bootstrap', '--json'],
      {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: testUrl },
        encoding: 'utf8',
        timeout: 60_000
      }
    );
    if (bootstrap.status !== 0) {
      throw new Error(`C1 bootstrap failed (${bootstrap.status}): ${bootstrap.stderr || bootstrap.stdout}`);
    }
    const roleState = await adminPool.query(
      `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'capmint_app'`
    );
    if (roleState.rows[0]?.rolcanlogin) {
      throw new Error('capmint_app already has LOGIN; refusing to replace an operator-managed credential.');
    }
    const appPassword = crypto.randomBytes(36).toString('base64url');
    await adminPool.query(`ALTER ROLE capmint_app LOGIN PASSWORD '${appPassword}'`);
    appRoleProvisioned = true;
    const appUrl = new URL(testUrl);
    appUrl.username = 'capmint_app';
    appUrl.password = appPassword;

    const identity = await testPool.query('SELECT current_database() AS name');
    if (identity.rows[0].name !== databaseName || !identity.rows[0].name.startsWith('capmint_suite_')) {
      throw new Error('Disposable database identity guard failed.');
    }

    const redisSelection = await selectEmptyRedisDatabase(sourceRedis);
    redis = redisSelection.client;
    const redisUrl = redisSelection.url;
    await redis.flushdb();

    const { privateKey, publicKey } = generateKeyPair();
    const jwtSecret = crypto.randomBytes(48).toString('base64url');
    const developmentPassword = `Q7!${crypto.randomBytes(18).toString('base64url')}`;
    verifyKeyPair(privateKey, publicKey);

    const commonEnv = {
      ...process.env,
      NODE_ENV: 'integration',
      DATABASE_URL: testUrl,
      REDIS_URL: redisUrl,
      JWT_SECRET: jwtSecret,
      CERTIFIER_PRIVATE_KEY: privateKey,
      CERTIFIER_PUBLIC_KEY: publicKey,
      CAPMINT_DEVELOPMENT_SEED_PASSWORD: developmentPassword,
      TRANSPARENCY_SERVICE_URL: `http://127.0.0.1:${PORTS.transparency}`,
      VERIFY_FRONTEND_URL: `http://127.0.0.1:${PORTS.gateway}`,
      CORS_ORIGIN: `http://127.0.0.1:${PORTS.gateway}`
    };
    const developmentSeed = spawnSync(
      process.execPath,
      [path.join(ROOT, 'database/seed/development.js')],
      {
        cwd: ROOT,
        env: {
          ...commonEnv,
          CAPMINT_ALLOW_DEVELOPMENT_SEED: '1',
          CAPMINT_DEVELOPMENT_CERTIFIER_PRIVATE_KEY: privateKey,
          CAPMINT_DEVELOPMENT_CERTIFIER_PUBLIC_KEY: publicKey
        },
        encoding: 'utf8',
        timeout: 60_000
      }
    );
    if (developmentSeed.status !== 0) {
      throw new Error(
        `Explicit development seed failed (${developmentSeed.status}): `
        + `${developmentSeed.stderr || developmentSeed.stdout}`
      );
    }

    const tsxPath = path.join(ROOT, 'node_modules/.bin/tsx');
    const services: Array<[keyof typeof PORTS, string]> = [
      ['auth', 'backend/auth-service/src/index.ts'],
      ['transparency', 'backend/transparency-service/src/index.ts'],
      ['cpq', 'backend/cpq-service/src/index.ts'],
      ['mint', 'backend/mint-service/src/index.ts'],
      ['resolver', 'backend/resolver-service/src/index.ts'],
      ['verification', 'backend/verification-service/src/index.ts'],
      ['integration', 'backend/integration-service/src/index.ts']
    ];
    for (const [name, sourcePath] of services) {
      await startChild(children, name, tsxPath, [sourcePath], PORTS[name], {
        ...commonEnv,
        DATABASE_URL: appUrl.toString(),
        PORT: String(PORTS[name])
      });
    }

    const gatewayPath = await createRuntimeGateway(tempDirectory);
    await startChild(children, 'gateway', process.execPath, [gatewayPath], PORTS.gateway, {
      ...commonEnv,
      PORT: String(PORTS.gateway),
      CAPMINT_ROOT: ROOT,
      AUTH_SERVICE_PORT: String(PORTS.auth),
      CPQ_SERVICE_PORT: String(PORTS.cpq),
      MINT_SERVICE_PORT: String(PORTS.mint),
      RESOLVER_SERVICE_PORT: String(PORTS.resolver),
      TRANSPARENCY_SERVICE_PORT: String(PORTS.transparency),
      VERIFICATION_SERVICE_PORT: String(PORTS.verification),
      INTEGRATION_SERVICE_PORT: String(PORTS.integration)
    });

    for (const [name, port] of Object.entries(PORTS)) {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status, `${name} health endpoint`).toBe(200);
      if (name === 'mint') {
        expect(await health.json()).toEqual({
          status: 'healthy',
          service: 'mint-service'
        });
      }
    }

    const suitePath = path.join(ROOT, 'playground/test_runner.js');
    const result = spawnSync(process.execPath, [suitePath], {
      cwd: ROOT,
      env: {
        ...commonEnv,
        BASE_URL: `http://127.0.0.1:${PORTS.gateway}`,
        CAPMINT_EXPECTED_DATABASE_PREFIX: 'capmint_suite_'
      },
      encoding: 'utf8',
      timeout: 180_000
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '');
    const serviceOutput = children
      .filter(child => child.output)
      .map(child => `[${child.name}]\n${child.output.slice(-4000)}`)
      .join('\n');
    process.stdout.write(`\n[F1 compliance iteration ${iteration}]\n${output}\n`);
    const totals = output.match(
      /Total Passed:\s*(\d+)\s*\|\s*Total Pending:\s*(\d+)\s*\|\s*Total Failed:\s*(\d+)/
    );
    if (!totals || Number(totals[1]) + Number(totals[2]) + Number(totals[3]) === 0) {
      throw new Error(
        `Compliance runner completed without executing assertions:\n${output}\n${serviceOutput}`
      );
    }
    if (output.includes('An error occurred during test execution:')) {
      throw new Error(`Compliance runner reported a fatal execution error:\n${output}`);
    }
    expect(Number(totals[1]), output).toBe(EXPECTED_ACTIVE_ASSERTIONS);
    expect(Number(totals[2]), output).toBe(EXPECTED_PENDING_ASSERTIONS);
    expect(Number(totals[3]), output).toBe(0);
    expect(result.status, output).toBe(0);

    // Ephemeral throwaway key material generated at runtime — never a PEM literal in source, so the
    // bootstrap-seed credential-scan guard over this file stays green (see F-A11).
    const metricsProbeKey = generateKeyPair().privateKey;
    const metricsProbe = {
      jwt: 'eyJhbGciOiJIUzI1NiJ9.ho010-metrics-probe.signature',
      password: 'Ho010MetricsPasswordMustNotLeak!',
      privateKey: metricsProbeKey,
      organizationId: 'a9c39468-fc8f-40db-9ba9-e9414ca60c22',
      username: 'ho010-metrics-user@example.test',
      rawId: '93791946-5f08-4488-8805-95ccbfac3260'
    };
    const metricsByService: Record<string, string> = {};

    for (const [name] of services) {
      await fetch(`http://127.0.0.1:${PORTS[name]}/metrics-probe/${metricsProbe.rawId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${metricsProbe.jwt}`
        },
        body: JSON.stringify({
          password: metricsProbe.password,
          private_key: metricsProbe.privateKey,
          organization_id: metricsProbe.organizationId,
          username: metricsProbe.username
        })
      });

      const metricsResponse = await fetch(`http://127.0.0.1:${PORTS[name]}/metrics`);
      expect(metricsResponse.status, `${name} metrics endpoint`).toBe(200);
      expect(metricsResponse.headers.get('content-type')).toContain(
        'text/plain; version=0.0.4'
      );
      const metrics = await metricsResponse.text();
      expect(metrics, `${name} default metrics`).toContain(
        'capmint_process_cpu_seconds_total'
      );
      expect(metrics, `${name} request histogram`).toContain(
        'http_request_duration_seconds'
      );
      expect(metrics, `${name} request histogram labels`).toMatch(
        /http_request_duration_seconds_count\{method="[A-Z]+",route="[^"]+",status_code="[1-5][0-9]{2}"\} [1-9][0-9]*/
      );
      expect(metrics, `${name} excludes its scrape route`).not.toContain(
        'route="/metrics"'
      );
      metricsByService[name] = metrics;
    }

    const allMetrics = Object.values(metricsByService).join('\n');
    for (const sensitiveValue of Object.values(metricsProbe)) {
      expect(allMetrics).not.toContain(sensitiveValue);
    }

    const routeLabels = [...allMetrics.matchAll(/route="([^"]+)"/g)]
      .map(match => match[1]);
    expect(routeLabels.length).toBeGreaterThan(0);
    expect(routeLabels).toContain('/api/v1/budgets/:id/drawdown');
    expect(routeLabels).toContain('unmatched');
    expect(routeLabels.some(route => route.includes(':id'))).toBe(true);
    expect(routeLabels.every(route =>
      !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(route)
    )).toBe(true);

    expect(metricsByService.auth).toContain('status_code="401"');
    expect(metricsByService.auth).toContain('status_code="429"');
    expect(metricsByService.cpq).toContain(
      'route="/api/v1/budgets/:id/drawdown",status_code="422"'
    );
    expect(metricsByService.cpq).toMatch(
      /signature_verification_failures_total [1-9][0-9]*/
    );
    expect(metricsByService.verification).toMatch(
      /ledger_append_total\{result="ok"\} [1-9][0-9]*/
    );
  } finally {
    await stopChildren(children);
    if (redis) {
      if (redis.status === 'ready') await redis.flushdb();
      redis.disconnect();
    }
    await testPool.end().catch(() => undefined);
    if (appRoleProvisioned) {
      await adminPool.query('ALTER ROLE capmint_app NOLOGIN PASSWORD NULL');
    }
    if (databaseCreated) {
      await adminPool.query(`DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    }
    await adminPool.end().catch(() => undefined);
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

suite('F1 disposable compliance suite', () => {
  it('runs only against fresh disposable PostgreSQL and isolated Redis state', async () => {
    if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1 || ITERATIONS > 2) {
      throw new Error('F1_SUITE_ITERATIONS must be 1 or 2.');
    }
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      await runIteration(iteration);
    }
  }, 420_000);
});
