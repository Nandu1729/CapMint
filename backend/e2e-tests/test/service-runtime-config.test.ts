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
  });
});
