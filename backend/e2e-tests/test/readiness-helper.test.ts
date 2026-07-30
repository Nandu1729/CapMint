import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerReadiness } from '../../../packages/shared/readiness.js';

function addHealth(server: ReturnType<typeof Fastify>) {
  server.get('/health', async () => {
    return { status: 'healthy', service: 'readiness-test' };
  });
}

describe('shared readiness probe', () => {
  it('reports every configured dependency as ready', async () => {
    const pgPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    };
    const redisClient = {
      ping: vi.fn().mockResolvedValue('PONG')
    };
    const server = Fastify();
    registerReadiness(server, { pgPool, redisClient });

    const response = await server.inject({ method: 'GET', url: '/ready' });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      checks: { db: 'ok', redis: 'ok' }
    });
    expect(pgPool.query).toHaveBeenCalledOnce();
    expect(pgPool.query).toHaveBeenCalledWith('SELECT 1');
    expect(redisClient.ping).toHaveBeenCalledOnce();
  });

  it('runs only checks for clients that were passed', async () => {
    const pgPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    };
    const server = Fastify();
    registerReadiness(server, { pgPool });

    const response = await server.inject({ method: 'GET', url: '/ready' });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      checks: { db: 'ok' }
    });
  });

  it('returns a secret-free 503 and leaves the process available for recovery', async () => {
    const secretError = new Error(
      'connect ECONNREFUSED redis://operator:known-secret@127.0.0.1:6399/0'
    );
    const pgPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    };
    const redisClient = {
      ping: vi.fn()
        .mockRejectedValueOnce(secretError)
        .mockResolvedValue('PONG')
    };
    const server = Fastify();
    addHealth(server);
    registerReadiness(server, { pgPool, redisClient });

    const failed = await server.inject({ method: 'GET', url: '/ready' });
    const health = await server.inject({ method: 'GET', url: '/health' });
    const recovered = await server.inject({ method: 'GET', url: '/ready' });
    await server.close();

    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({
      status: 'unready',
      checks: { db: 'ok', redis: 'fail' }
    });
    expect(failed.body).not.toContain('known-secret');
    expect(failed.body).not.toContain('ECONNREFUSED');
    expect(failed.body).not.toContain('redis://');
    expect(failed.body).not.toContain('stack');

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      status: 'healthy',
      service: 'readiness-test'
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual({
      status: 'ready',
      checks: { db: 'ok', redis: 'ok' }
    });
  });

  it('times out a hung dependency in about one second without stopping liveness', async () => {
    const redisClient = {
      ping: vi.fn(() => new Promise(() => {}))
    };
    const server = Fastify();
    addHealth(server);
    registerReadiness(server, { redisClient });

    const startedAt = performance.now();
    const failed = await server.inject({ method: 'GET', url: '/ready' });
    const elapsedMs = performance.now() - startedAt;
    const health = await server.inject({ method: 'GET', url: '/health' });
    await server.close();

    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({
      status: 'unready',
      checks: { redis: 'fail' }
    });
    expect(elapsedMs).toBeGreaterThanOrEqual(900);
    expect(elapsedMs).toBeLessThan(1800);
    expect(health.statusCode).toBe(200);
  });
});
