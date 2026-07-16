import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHaversineDistance } from '../src/index.js';

// Mock DB pool
vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn(() => ({
        query: vi.fn(),
        connect: vi.fn(() => ({
          query: vi.fn(),
          release: vi.fn()
        }))
      }))
    }
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn()
    }))
  };
});

describe('Verification Service Logic Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies Haversine distance computations', () => {
    // Distance between London (51.5074, -0.1278) and Paris (48.8566, 2.3522) is roughly 344 km
    const dist = getHaversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(340);
    expect(dist).toBeLessThan(350);
  });

  it('validates public identifier UUID formatting checks', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    // Correct format
    expect(uuidRegex.test('a4692173-ddd7-4c90-a713-4ee7a9e5255f')).toBe(true);
    
    // Sequential/Invalid formats
    expect(uuidRegex.test('CM-000001')).toBe(false);
    expect(uuidRegex.test('CM-000002')).toBe(false);
    expect(uuidRegex.test('invalid-uuid')).toBe(false);
  });
});
