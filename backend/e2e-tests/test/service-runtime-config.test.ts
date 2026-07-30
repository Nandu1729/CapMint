import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SERVICES = [
  'auth',
  'cpq',
  'mint',
  'resolver',
  'transparency',
  'verification',
  'integration'
];

describe('backend runtime configuration', () => {
  it.each(SERVICES)('%s service loads only the repo-root env and asserts its DB role', service => {
    const source = fs.readFileSync(
      path.join(ROOT, 'backend', `${service}-service`, 'src', 'index.ts'),
      'utf8'
    );

    expect(source).toContain(
      "dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });"
    );
    expect(source).not.toMatch(/dotenv\.config\(\s*\)/);
    expect(source).toContain(`assertRlsServiceRole(pgPool, '${service}-service')`);
    expect(source).toContain('Fastify(createLoggingOptions())');
    expect(source).toContain('registerRequestLogging(server)');
    expect(source).not.toMatch(/logger:\s*true/);
  });

  it('forwards the request id on every current backend outbound HTTP call', () => {
    const backendSource = SERVICES.map(service => fs.readFileSync(
      path.join(ROOT, 'backend', `${service}-service`, 'src', 'index.ts'),
      'utf8'
    )).join('\n');

    const outboundCallCount = backendSource.match(/\bfetch\s*\(/g)?.length || 0;
    const forwardedRequestIdCount =
      backendSource.match(/\.\.\.forwardHeaders\(request\)/g)?.length || 0;

    expect(outboundCallCount).toBeGreaterThan(0);
    expect(forwardedRequestIdCount).toBe(outboundCallCount);
  });
});
