import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics
} from 'prom-client';

const register = new Registry();
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

collectDefaultMetrics({
  register,
  prefix: 'capmint_'
});

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const errors = new Counter({
  name: 'errors_total',
  help: 'Handled request errors by normalized error code.',
  labelNames: ['code'],
  registers: [register]
});

const signatureVerificationFailures = new Counter({
  name: 'signature_verification_failures_total',
  help: 'Cryptographic signature verification failures.',
  registers: [register]
});

const ledgerAppends = new Counter({
  name: 'ledger_append_total',
  help: 'Transparency ledger append attempts by result.',
  labelNames: ['result'],
  registers: [register]
});

function safeErrorCode(code) {
  return typeof code === 'string' && SAFE_ERROR_CODE.test(code)
    ? code
    : 'UNKNOWN';
}

export function registerMetrics(server) {
  server.get('/metrics', async (_request, reply) => {
    return reply
      .header('Content-Type', register.contentType)
      .send(await register.metrics());
  });

  server.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url || 'unmatched';
    if (route === '/metrics') return;

    const elapsedTimeMs = Number.isFinite(reply.elapsedTime)
      ? reply.elapsedTime
      : 0;
    requestDuration.observe({
      method: request.method,
      route,
      status_code: String(reply.statusCode)
    }, Math.max(elapsedTimeMs, 0) / 1000);
  });
}

export function recordError(code) {
  errors.inc({ code: safeErrorCode(code) });
}

export function recordSignatureFailure() {
  signatureVerificationFailures.inc();
}

export function recordLedgerAppend(result) {
  if (result !== 'ok' && result !== 'error') {
    throw new TypeError('Ledger append result must be "ok" or "error".');
  }
  ledgerAppends.inc({ result });
}
