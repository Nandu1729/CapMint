import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  createLoggingOptions,
  forwardHeaders,
  registerRequestLogging
} from '../../../packages/shared/logging.js';

const REQUEST_ID = 'ho008-correlation-id';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const KNOWN_JWT = 'known.jwt.value';
const KNOWN_PASSWORD = 'KnownSeedPassword!';
const KNOWN_PEM = '-----BEGIN PRIVATE KEY-----known-private-material-----END PRIVATE KEY-----';
const KNOWN_SIGNATURE_BUNDLE = 'known-signature-bundle';

describe('shared structured logging', () => {
  it('redacts secrets and emits one correlated completion log without changing the response', async () => {
    const records: Array<Record<string, any>> = [];
    const loggingOptions = createLoggingOptions({
      LOG_LEVEL: 'debug'
    } as NodeJS.ProcessEnv) as any;

    const server = Fastify({
      ...loggingOptions,
      logger: {
        ...loggingOptions.logger,
        serializers: {
          req: (value: unknown) => value
        },
        stream: {
          write(line: string) {
            records.push(JSON.parse(line));
          }
        }
      }
    });
    registerRequestLogging(server);

    server.post('/probe', async (request, reply) => {
      request.user = { orgId: ORG_ID } as any;
      request.log.info({
        req: {
          headers: {
            authorization: `Bearer ${KNOWN_JWT}`,
            cookie: 'session=known-cookie'
          },
          body: {
            password: KNOWN_PASSWORD,
            admin_password: KNOWN_PASSWORD,
            current_password: KNOWN_PASSWORD,
            new_password: KNOWN_PASSWORD,
            signature_bundle: KNOWN_SIGNATURE_BUNDLE,
            nested: {
              signing_private_key_material: KNOWN_PEM,
              certifier_primary_key: KNOWN_PEM
            },
            product_name: 'non-secret'
          }
        }
      }, 'redaction probe');

      return reply.status(201).send({ success: true });
    });

    const response = await server.inject({
      method: 'POST',
      url: '/probe',
      headers: {
        'x-request-id': REQUEST_ID,
        authorization: `Bearer ${KNOWN_JWT}`
      },
      payload: {
        password: KNOWN_PASSWORD
      }
    });
    await server.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ success: true });

    const serialized = records.map(record => JSON.stringify(record)).join('\n');
    expect(records).not.toHaveLength(0);
    expect(records.every(record => record.reqId === REQUEST_ID)).toBe(true);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain(KNOWN_JWT);
    expect(serialized).not.toContain(KNOWN_PASSWORD);
    expect(serialized).not.toContain(KNOWN_PEM);
    expect(serialized).not.toContain(KNOWN_SIGNATURE_BUNDLE);

    const redactionRecord = records.find(record => record.msg === 'redaction probe');
    expect(redactionRecord?.req.body.product_name).toBe('non-secret');
    expect(redactionRecord?.req.body.password).toBe('[REDACTED]');
    expect(redactionRecord?.req.body.nested.signing_private_key_material).toBe('[REDACTED]');
    expect(redactionRecord?.req.body.nested.certifier_primary_key).toBe('[REDACTED]');

    const completionRecords = records.filter(record => record.msg === 'request completed');
    expect(completionRecords).toHaveLength(1);
    expect(completionRecords[0]).toMatchObject({
      reqId: REQUEST_ID,
      method: 'POST',
      routerPath: '/probe',
      statusCode: 201,
      orgId: ORG_ID
    });
    expect(completionRecords[0].responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('uses the configured level, generates UUID request ids, and forwards the current id', () => {
    const options = createLoggingOptions({
      LOG_LEVEL: 'warn'
    } as NodeJS.ProcessEnv) as any;

    expect(options.logger.level).toBe('warn');
    expect((createLoggingOptions({} as NodeJS.ProcessEnv) as any).logger.level).toBe('info');
    expect(options.genReqId({ headers: {} })).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(options.genReqId({
      headers: { 'x-request-id': REQUEST_ID }
    })).toBe(REQUEST_ID);
    expect(forwardHeaders({ id: REQUEST_ID } as any)).toEqual({
      'x-request-id': REQUEST_ID
    });
  });

  it('trusts forwarded client IPs only when explicitly enabled', async () => {
    async function injectedIp(env: NodeJS.ProcessEnv) {
      const server = Fastify({
        ...createLoggingOptions(env),
        logger: false
      });
      server.get('/ip', async request => ({
        ip: request.ip,
        loginKey: `ratelimit:login:${request.ip}`,
        verifyKey: `ratelimit:verify:${request.ip}`
      }));

      const response = await server.inject({
        method: 'GET',
        url: '/ip',
        headers: {
          'x-forwarded-for': '1.2.3.4'
        }
      });
      await server.close();
      return response.json();
    }

    await expect(injectedIp({} as NodeJS.ProcessEnv)).resolves.toEqual({
      ip: '127.0.0.1',
      loginKey: 'ratelimit:login:127.0.0.1',
      verifyKey: 'ratelimit:verify:127.0.0.1'
    });
    await expect(injectedIp({ TRUST_PROXY: 'true' } as NodeJS.ProcessEnv)).resolves.toEqual({
      ip: '1.2.3.4',
      loginKey: 'ratelimit:login:1.2.3.4',
      verifyKey: 'ratelimit:verify:1.2.3.4'
    });
  });

  it('accepts a bounded proxy hop count and rejects unsafe configuration', () => {
    expect((createLoggingOptions({
      TRUST_PROXY: '1'
    } as NodeJS.ProcessEnv) as any).trustProxy).toBe(1);
    expect((createLoggingOptions({
      TRUST_PROXY: 'false'
    } as NodeJS.ProcessEnv) as any).trustProxy).toBe(false);
    expect((createLoggingOptions({} as NodeJS.ProcessEnv) as any).trustProxy).toBe(false);

    expect(() => createLoggingOptions({
      TRUST_PROXY: 'all'
    } as NodeJS.ProcessEnv)).toThrow(
      'TRUST_PROXY must be "true", "false", or an integer hop count from 0 to 255.'
    );
    expect(() => createLoggingOptions({
      TRUST_PROXY: '256'
    } as NodeJS.ProcessEnv)).toThrow(TypeError);
  });
});
