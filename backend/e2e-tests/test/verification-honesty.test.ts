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
    expect(source).toContain('certifier_id: certifierId');
    expect(source).toContain('effective_start_date: effectiveStartDate');
    expect(source).toContain('effective_end_date: effectiveEndDate');
    expect(source).toContain("fetch(`${API_BASE_URL}/api/v1/certifiers`");
  });

  it('keeps certifier authority out of the producer budget contract', async () => {
    const requestSchema = await fs.readFile(
      path.join(ROOT, 'api/schemas/requests/ProposeBudgetRequest.yaml'),
      'utf8'
    );
    const cpqSource = await fs.readFile(
      path.join(ROOT, 'backend/cpq-service/src/index.ts'),
      'utf8'
    );
    const gatewaySource = await fs.readFile(
      path.join(ROOT, 'scripts/frontend-server.js'),
      'utf8'
    );

    expect(requestSchema).not.toContain('signature_bundle');
    expect(cpqSource).toContain("NULL, $6, $7, 'DRAFT'");
    expect(cpqSource).toContain("server.get('/api/v1/certifiers'");
    expect(gatewaySource).toContain("urlPath.startsWith('/api/v1/certifiers')");
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

  it('never assumes a verdict in the operator console', async () => {
    const console = await fs.readFile(path.join(ROOT, 'frontend/app.html'), 'utf8');

    // The service is the only authority on whether a unit is genuine. An absent or
    // unrecognised status must never resolve to VERIFIED.
    expect(console).not.toContain('d.status||"VERIFIED"');
    expect(console).not.toContain("d.status||'VERIFIED'");
    expect(console).toContain('String(d.verdict||d.status||"")');
    expect(console).toContain('verdict==="NOT_CERTIFIED"');

    // The console must not invent product provenance when creating a lot.
    expect(console).not.toContain('name:"Organic White Honey"');
    expect(console).not.toContain('farm_name:"Registered apiaries"');
    expect(console).toContain('product_metadata:{name:product}');
  });

  it('does not substitute invented values in backend responses', async () => {
    const services = await Promise.all(
      ['verification-service', 'cpq-service'].map(name =>
        fs.readFile(path.join(ROOT, `backend/${name}/src/index.ts`), 'utf8')
      )
    );

    for (const service of services) {
      expect(service).not.toContain("|| 'Organic White Honey'");
      expect(service).not.toContain("|| 'Premium Farms'");
      // Compliance actions must not have a justification authored on the actor's behalf.
      expect(service).not.toContain("|| 'Organic certification withdrawn'");
      expect(service).not.toContain("|| 'Certifier started administrative review'");
    }
  });
});
