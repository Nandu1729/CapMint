import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashSHA256 } from '../src/index.js';

// Mock DB pool
vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn(() => ({
        query: vi.fn()
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

describe('Transparency Service Logic Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies SHA256 hashes calculations', () => {
    const value = 'test-data';
    const expectedHash = 'a186000422feab857329c684e9fe91412b1a5db084100b37a98cfc95b62aa867'; // Precomputed SHA-256
    expect(hashSHA256(value)).toBe(expectedHash);
  });
});
