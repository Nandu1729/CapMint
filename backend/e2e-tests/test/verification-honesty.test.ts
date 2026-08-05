import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('consumer verification honesty', () => {
  it('does not ship fabricated certification or laboratory evidence', async () => {
    const source = await fs.readFile(path.join(ROOT, 'frontend/index.html'), 'utf8');
    const serviceSource = await fs.readFile(
      path.join(ROOT, 'backend/verification-service/src/index.ts'),
      'utf8'
    );

    expect(source).not.toContain("metadata.organic_certificate_status || 'ACTIVE'");
    expect(source).not.toContain("labResult.status || 'PASSED'");
    expect(source).not.toContain('NPOP-OTC-2026-8802');
    expect(source).not.toContain('NABL-INTK-2026-10492');
    expect(source).not.toContain('Cryptographic Chain Intact');
    expect(source).not.toContain('Supply Chain Traceable');
    expect(source).toContain("status === 'NOT_CERTIFIED'");
    expect(source).toContain("data.labStatus === 'PASSED'");
    expect(source).toContain("data.certificationStatus === 'CERTIFIED'");
    expect(source).toContain("const certificationStage = data.certificationStatus === 'CERTIFIED'");
    expect(source).toContain("const laboratoryStage = data.labStatus === 'PASSED'");
    expect(source).toContain("const laboratorySummary = data.labStatus === 'PASSED'");
    expect(serviceSource).not.toContain('NABL-INTK-2026-10492');
    expect(serviceSource).not.toContain('hash_lab_default');
    expect(serviceSource).not.toContain("'Purity Certification Test', 'PASS'");
  });
});
