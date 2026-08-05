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

  it('does not invent values in frontend write payloads', async () => {
    const source = await fs.readFile(path.join(ROOT, 'frontend/index.html'), 'utf8');

    expect(source).not.toContain("product_metadata: { name: 'Organic White Honey'");
    expect(source).not.toContain("name: lot.product_metadata?.name ||");
    expect(source).not.toContain("manufacturer: lot.product_metadata?.manufacturer ||");
    expect(source).not.toContain("farm_name: lot.product_metadata?.farm_name ||");
    expect(source).not.toMatch(/country_of_origin:\s*['"]India['"]/);
    expect(source).not.toContain('packaging_date: new Date');
    expect(source).not.toContain('expiry_date: new Date');
    expect(source).not.toContain("scan_count: '0'");
    expect(source).not.toContain('mint_date: new Date');
    expect(source).not.toContain("report_reference: file.name ||");
    expect(source).not.toContain("certifier_notes: 'NABL laboratory compliance verified'");
    expect(source).not.toContain("certifier_id: '00000000-0000-0000-0000-000000000001'");
    expect(source).not.toContain("signature_bundle: 'sig_draft'");
    expect(source).not.toContain('land_area_hectares: 5');
    expect(source).not.toContain("formattedId = '00000000-0000-0000-0000-000000000003'");
    expect(source).not.toContain('lat: 12.9716');
    expect(source).not.toContain('lat: 13.0827');
    expect(source).not.toContain("mock_bypass_token");
    expect(source).not.toContain('function bypassLoginDev()');
  });

  it('does not invent frontend display values when API data is absent', async () => {
    const source = await fs.readFile(path.join(ROOT, 'frontend/index.html'), 'utf8');

    expect(source).not.toContain("|| 'Organic White Honey'");
    expect(source).not.toContain("|| 'Premium Farms'");
    expect(source).not.toContain("|| 'Premium Harvest, Uttarakhand'");
    expect(source).not.toContain("|| 'B-LOT-901'");
    expect(source).not.toContain("|| 'Lot-288'");
    expect(source).not.toContain("return '15 Jul 2026'");
    expect(source).not.toContain('hash_lab_default');
    expect(source).not.toContain('ed25519_pk_9a123f81e');
    expect(source).not.toContain('Block #04 Anchor');
    expect(source).not.toContain('Intertek Labs');
    expect(source).not.toContain('Honey Purity Panel');
    expect(source).not.toContain('switchWorkspaceRole(this.value)');
    expect(source).toContain("function displayValue(value)");
    expect(source).toContain("? '—' : String(value)");
  });
});
