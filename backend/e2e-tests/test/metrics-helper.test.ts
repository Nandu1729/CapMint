import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '@capmint/shared/errors';
import {
  recordError,
  recordLedgerAppend,
  recordSignatureFailure,
  registerMetrics
} from '@capmint/shared/metrics';

const RAW_ID = '7d5ecb5a-31f0-4f28-95a2-48fac0b45c44';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.metrics-secret.signature';
const PASSWORD = 'MetricsPasswordMustNotLeak!';
const PEM = '-----BEGIN PRIVATE KEY-----metrics-secret-----END PRIVATE KEY-----';
const ORG_ID = '3c9e1968-357c-4b08-a79c-d7d82cabcf22';
const USERNAME = 'metrics-user@example.test';

describe('shared Prometheus metrics', () => {
  it('records bounded labels and exposes no request secrets or concrete ids', async () => {
    const server = Fastify();
    registerMetrics(server);
    server.setErrorHandler(createErrorHandler());

    server.post('/api/v1/lots/:id', async (_request, reply) => {
      return reply.status(422).send({ success: false });
    });
    server.get('/auth-required', async (_request, reply) => {
      return reply.status(401).send({ success: false });
    });
    server.get('/rate-limited', async (_request, reply) => {
      return reply.status(429).send({ success: false });
    });
    server.get('/rls-denied', async () => {
      throw Object.assign(new Error('database permission diagnostic'), {
        code: '42501'
      });
    });

    await server.inject({
      method: 'POST',
      url: `/api/v1/lots/${RAW_ID}`,
      headers: {
        authorization: `Bearer ${JWT}`
      },
      payload: {
        password: PASSWORD,
        private_key: PEM,
        organization_id: ORG_ID,
        username: USERNAME
      }
    });
    await server.inject({ method: 'GET', url: '/auth-required' });
    await server.inject({ method: 'GET', url: '/rate-limited' });
    await server.inject({ method: 'GET', url: '/rls-denied' });
    await server.inject({ method: 'GET', url: `/not-a-route/${RAW_ID}` });

    recordSignatureFailure();
    recordLedgerAppend('ok');
    recordLedgerAppend('error');
    recordError(`unsafe:${USERNAME}`);

    const response = await server.inject({
      method: 'GET',
      url: '/metrics'
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain; version=0.0.4');
    expect(response.body).toContain('capmint_process_cpu_seconds_total');
    expect(response.body).toContain(
      'http_request_duration_seconds_count{method="POST",route="/api/v1/lots/:id",status_code="422"} 1'
    );
    expect(response.body).toContain(
      'http_request_duration_seconds_count{method="GET",route="/auth-required",status_code="401"} 1'
    );
    expect(response.body).toContain(
      'http_request_duration_seconds_count{method="GET",route="/rate-limited",status_code="429"} 1'
    );
    expect(response.body).toContain(
      'http_request_duration_seconds_count{method="GET",route="unmatched",status_code="404"} 1'
    );
    expect(response.body).toContain('errors_total{code="FORBIDDEN"} 1');
    expect(response.body).toContain('errors_total{code="UNKNOWN"} 1');
    expect(response.body).toContain('signature_verification_failures_total 1');
    expect(response.body).toContain('ledger_append_total{result="ok"} 1');
    expect(response.body).toContain('ledger_append_total{result="error"} 1');
    expect(response.body).not.toContain('route="/metrics"');

    for (const sensitiveValue of [RAW_ID, JWT, PASSWORD, PEM, ORG_ID, USERNAME]) {
      expect(response.body).not.toContain(sensitiveValue);
    }

    const routeLabels = [...response.body.matchAll(/route="([^"]+)"/g)]
      .map(match => match[1]);
    expect(routeLabels.length).toBeGreaterThan(0);
    expect(routeLabels.every(route =>
      route === 'unmatched'
      || route === '/api/v1/lots/:id'
      || route === '/auth-required'
      || route === '/rate-limited'
      || route === '/rls-denied'
    )).toBe(true);
  });

  it('rejects unbounded ledger result labels', () => {
    expect(() => recordLedgerAppend('secret-result' as any)).toThrow(TypeError);
  });
});
