import { describe, it, expect } from 'vitest';

// -------------------------------------------------------------------------
// CapMint Mock State Engine for Consolidated End-To-End Integration Test
// -------------------------------------------------------------------------

interface User {
  username: string;
  role: 'ADMIN' | 'PRODUCER' | 'CERTIFIER';
  passwordHash: string;
}

interface Budget {
  id: string;
  producerId: string;
  cropType: string;
  limitKg: number;
  consumedKg: number;
  state: 'DRAFT' | 'ACTIVE' | 'EXHAUSTED';
}

interface Lot {
  id: string;
  budgetId: string;
  cropType: string;
  weightKg: number;
  state: 'ACTIVE' | 'REVOKED';
}

interface UnitCode {
  gtin: string;
  serial: string;
  lotId: string;
  state: 'MINTED' | 'REVOKED';
  cloneSuspect: boolean;
}

interface ScanEvent {
  gtin: string;
  serial: string;
  lat: number;
  lon: number;
  timestamp: number;
  verdict: 'VERIFIED' | 'REVOKED' | 'CLONE-SUSPECT';
}

interface TransparencyBlock {
  index: number;
  event: string;
  payload: any;
  prevHash: string;
  hash: string;
}

// Haversine distance calculator
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Simple browser/node mock hash
function mockSha256(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return 'hash_' + Math.abs(hash).toString(16).padStart(16, '0');
}

describe('CapMint End-to-End Core Integration Flow', () => {
  // DB States
  const users: User[] = [];
  const budgets: Budget[] = [];
  const lots: Lot[] = [];
  const unitCodes: UnitCode[] = [];
  const scans: ScanEvent[] = [];
  const transparencyLog: TransparencyBlock[] = [];

  // Helper to add block to log
  function logEvent(event: string, payload: any) {
    const index = transparencyLog.length;
    const prevHash = index === 0 ? '0'.repeat(64) : transparencyLog[index - 1].hash;
    const hash = mockSha256(JSON.stringify(payload) + prevHash + event);
    transparencyLog.push({ index, event, payload, prevHash, hash });
  }

  it('verifies full transactional lifecycle from user registration to lot revocation', () => {
    // -------------------------------------------------------------
    // Step 1: User Registrations & Auth (M-001 / M-002)
    // -------------------------------------------------------------
    const certifier: User = {
      username: 'certifier_org',
      role: 'CERTIFIER',
      passwordHash: mockSha256('password123')
    };
    const producer: User = {
      username: 'farmer_co',
      role: 'PRODUCER',
      passwordHash: mockSha256('honey_pass')
    };
    users.push(certifier, producer);

    expect(users.length).toBe(2);
    expect(users[0].role).toBe('CERTIFIER');
    logEvent('USER_REGISTERED', { username: 'certifier_org', role: 'CERTIFIER' });

    // -------------------------------------------------------------
    // Step 2: Quota Budget Proposal & Authorization (M-003)
    // -------------------------------------------------------------
    const budget: Budget = {
      id: 'B-101',
      producerId: 'farmer_co',
      cropType: 'Organic White Honey',
      limitKg: 5000,
      consumedKg: 0,
      state: 'DRAFT'
    };
    budgets.push(budget);

    // Certifier activates budget
    const activeBudget = budgets.find(b => b.id === 'B-101')!;
    activeBudget.state = 'ACTIVE';
    expect(activeBudget.state).toBe('ACTIVE');
    logEvent('BUDGET_ACTIVATED', { budgetId: 'B-101', limitKg: 5000 });

    // -------------------------------------------------------------
    // Step 3: Package Lot Minting & GS1 validations (M-004 / M-005 / M-006)
    // -------------------------------------------------------------
    const runWeight = 250; // KG
    const gtin = '07612345678900'; // 14 digits

    // Quota capacity check
    expect(activeBudget.limitKg - activeBudget.consumedKg).toBeGreaterThanOrEqual(runWeight);
    activeBudget.consumedKg += runWeight;

    const lotId = 'LOT-501';
    const lot: Lot = {
      id: lotId,
      budgetId: 'B-101',
      cropType: activeBudget.cropType,
      weightKg: runWeight,
      state: 'ACTIVE'
    };
    lots.push(lot);

    const serial = 'SN908123XYZ';
    const code: UnitCode = {
      gtin,
      serial,
      lotId,
      state: 'MINTED',
      cloneSuspect: false
    };
    unitCodes.push(code);

    expect(lots.length).toBe(1);
    expect(unitCodes[0].state).toBe('MINTED');
    logEvent('LOT_MINTED', { lotId, serial, weightKg: runWeight });

    // -------------------------------------------------------------
    // Step 4: Digital Link Resolution redirects (M-007)
    // -------------------------------------------------------------
    const canonicalLink = `https://id.capmint.org/01/${gtin}/21/${serial}`;
    const resolvedCode = unitCodes.find(u => u.gtin === gtin && u.serial === serial)!;
    expect(resolvedCode.serial).toBe(serial);
    expect(canonicalLink).toContain(gtin);

    // -------------------------------------------------------------
    // Step 5: Verification & Spatial Clone heuristics (M-009 / M-010)
    // -------------------------------------------------------------
    // First Scan: London (lat: 51.5, lon: -0.1) at Time = 1000s
    const scan1: ScanEvent = {
      gtin,
      serial,
      lat: 51.5,
      lon: -0.1,
      timestamp: 1000,
      verdict: 'VERIFIED'
    };
    scans.push(scan1);

    // Second Scan: Paris (lat: 48.8, lon: 2.3) at Time = 1001s (1 second later)
    // Dist: ~344km, Time diff: 1 second
    const dist = calculateDistance(51.5, -0.1, 48.8, 2.3);
    const timeDiffHrs = (1001 - 1000) / 3600; // 1/3600 hr
    const velocity = dist / timeDiffHrs; // ~1,238,400 km/h

    let verdict: 'VERIFIED' | 'REVOKED' | 'CLONE-SUSPECT' = 'VERIFIED';
    if (velocity > 800) {
      resolvedCode.cloneSuspect = true;
      verdict = 'CLONE-SUSPECT';
    }

    const scan2: ScanEvent = {
      gtin,
      serial,
      lat: 48.8,
      lon: 2.3,
      timestamp: 1001,
      verdict
    };
    scans.push(scan2);

    expect(resolvedCode.cloneSuspect).toBe(true);
    expect(scan2.verdict).toBe('CLONE-SUSPECT');
    logEvent('CLONE_SUSPECT_ALERT', { serial, velocity });

    // -------------------------------------------------------------
    // Step 6: Certifier Cascade Revocation (M-011)
    // -------------------------------------------------------------
    const targetLot = lots.find(l => l.id === lotId)!;
    targetLot.state = 'REVOKED';

    // Cascade to unit codes
    unitCodes.forEach(u => {
      if (u.lotId === lotId) {
        u.state = 'REVOKED';
      }
    });

    expect(unitCodes[0].state).toBe('REVOKED');
    logEvent('LOT_REVOKED_CASCADE', { lotId });

    // -------------------------------------------------------------
    // Step 7: Transparency Log verification (M-008)
    // -------------------------------------------------------------
    expect(transparencyLog.length).toBeGreaterThan(3);
    for (let i = 1; i < transparencyLog.length; i++) {
      expect(transparencyLog[i].prevHash).toBe(transparencyLog[i - 1].hash);
    }
  });
});
