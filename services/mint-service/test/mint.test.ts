import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGTIN } from '../src/index.js';

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
    default: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn()
    }))
  };
});

vi.mock('qrcode', () => {
  return {
    default: {
      toDataURL: vi.fn(async () => 'data:image/png;base64,mockqrcode')
    }
  };
});

describe('Mint Service Logic Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies GTIN-14 check digit validation logic', () => {
    // Valid GTIN-14 (check digit matches formula sum weight checks)
    const validGTIN = '07612345678900'; 
    expect(validateGTIN(validGTIN)).toBe(true);

    // Invalid GTIN-14 format / invalid check digit
    expect(validateGTIN('00000000000000')).toBe(true); // Sum is 0, check digit is 0
    expect(validateGTIN('12345')).toBe(false);
  });
});
