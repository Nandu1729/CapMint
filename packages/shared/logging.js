import { randomUUID } from 'node:crypto';

const REDACTION_CENSOR = '[REDACTED]';
const REQUEST_ID_HEADER = 'x-request-id';

const SENSITIVE_FIELD_NAMES = new Set([
  'authorization',
  'cookie',
  'password',
  'admin_password',
  'current_password',
  'new_password',
  'signature_bundle',
  'token',
  'access_token',
  'refresh_token',
  'jwt'
]);

const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.admin_password',
  'req.body.current_password',
  'req.body.new_password',
  'req.body.signature_bundle'
];

function trustProxyFromEnvironment(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'false') return false;
  if (normalized === 'true') return true;

  if (/^(0|[1-9][0-9]*)$/.test(normalized)) {
    const hops = Number(normalized);
    if (Number.isSafeInteger(hops) && hops <= 255) {
      return hops;
    }
  }

  throw new TypeError(
    'TRUST_PROXY must be "true", "false", or an integer hop count from 0 to 255.'
  );
}

function isSensitiveFieldName(fieldName) {
  const normalized = fieldName.toLowerCase();
  if (SENSITIVE_FIELD_NAMES.has(normalized)) {
    return true;
  }

  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return compact.includes('privatekey')
    || (compact.startsWith('certifier') && compact.endsWith('key'));
}

function sanitizeLogValue(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const sanitized = [];
    seen.set(value, sanitized);
    for (const entry of value) {
      sanitized.push(sanitizeLogValue(entry, seen));
    }
    return sanitized;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  if (seen.has(value)) return seen.get(value);
  const sanitized = {};
  seen.set(value, sanitized);

  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = isSensitiveFieldName(key)
      ? REDACTION_CENSOR
      : sanitizeLogValue(entry, seen);
  }
  return sanitized;
}

function requestIdFromHeader(rawRequest) {
  const value = rawRequest?.headers?.[REQUEST_ID_HEADER];
  if (Array.isArray(value)) {
    const first = value.find(entry => typeof entry === 'string' && entry.trim() !== '');
    return first || null;
  }
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function createLoggingOptions(env = process.env) {
  return {
    trustProxy: trustProxyFromEnvironment(env.TRUST_PROXY),
    logger: {
      level: env.LOG_LEVEL || 'info',
      redact: {
        paths: PINO_REDACT_PATHS,
        censor: REDACTION_CENSOR
      },
      hooks: {
        logMethod(inputArgs, method) {
          const sanitizedArgs = inputArgs.map(argument => sanitizeLogValue(argument));
          return method.apply(this, sanitizedArgs);
        }
      }
    },
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId(rawRequest) {
      return requestIdFromHeader(rawRequest) || randomUUID();
    },
    disableRequestLogging: true
  };
}

export function registerRequestLogging(server) {
  server.addHook('onResponse', async (request, reply) => {
    const user = request.user;
    const orgId = user
      && typeof user === 'object'
      && typeof user.orgId === 'string'
      && user.orgId.trim() !== ''
      ? user.orgId
      : undefined;

    const responseTimeMs = Number.isFinite(reply.elapsedTime)
      ? Number(reply.elapsedTime.toFixed(3))
      : 0;

    request.log.info({
      method: request.method,
      routerPath: request.routeOptions?.url || request.routerPath || '(unmatched)',
      statusCode: reply.statusCode,
      responseTimeMs,
      ...(orgId ? { orgId } : {})
    }, 'request completed');
  });
}

export function forwardHeaders(request) {
  if (!request || typeof request.id !== 'string' || request.id.trim() === '') {
    throw new TypeError('forwardHeaders requires a request with a non-empty id.');
  }

  return { [REQUEST_ID_HEADER]: request.id };
}
