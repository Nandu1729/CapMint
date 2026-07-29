import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHaversineDistance,
  isWellFormedUuid
} from '../src/index.js';

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

  it('accepts any well-formed PostgreSQL UUID, including seed sentinels', () => {
    expect(isWellFormedUuid('a4692173-ddd7-4c90-a713-4ee7a9e5255f'))
      .toBe(true);
    expect(isWellFormedUuid('00000000-0000-0000-0000-000000000004'))
      .toBe(true);
    expect(isWellFormedUuid('00000000-0000-0000-0000-000000000050'))
      .toBe(true);

    expect(isWellFormedUuid('CM-000001')).toBe(false);
    expect(isWellFormedUuid('invalid-uuid')).toBe(false);
    expect(isWellFormedUuid(null)).toBe(false);
  });
});
