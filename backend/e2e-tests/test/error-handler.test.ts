import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '@capmint/shared/errors';
import { createLoggingOptions } from '../../../packages/shared/logging.js';

const REQUEST_ID = 'ho011-error-request-id';

function buildServer(records: Array<Record<string, any>> = []) {
  const loggingOptions = createLoggingOptions({
    LOG_LEVEL: 'info'
  } as NodeJS.ProcessEnv) as any;

  const server = Fastify({
    ...loggingOptions,
    logger: {
      ...loggingOptions.logger,
      stream: {
        write(line: string) {
          records.push(JSON.parse(line));
        }
      }
    }
  });
  server.setErrorHandler(createErrorHandler());
  return server;
}

describe('shared error handler', () => {
  it('preserves explicit status, code, and message values', async () => {
    const server = buildServer();
    server.get('/explicit', async () => {
      const error = Object.assign(new Error('Existing client message.'), {
        statusCode: 422,
        code: 'EXISTING_ERROR'
      });
      throw error;
    });

    const response = await server.inject({
      method: 'GET',
      url: '/explicit'
    });
    await server.close();

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      success: false,
      error: {
        statusCode: 422,
        code: 'EXISTING_ERROR',
        message: 'Existing client message.',
        details: []
      }
    });
  });

  it('preserves Fastify validation errors', async () => {
    const server = buildServer();
    server.post('/validated', {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' }
          }
        }
      }
    }, async () => ({ success: true }));

    const response = await server.inject({
      method: 'POST',
      url: '/validated',
      payload: {}
    });
    await server.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      success: false,
      error: {
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        message: "body must have required property 'name'",
        details: []
      }
    });
  });

  it.each([
    ['23505', 409, 'CONFLICT', 'Conflict'],
    ['23503', 409, 'CONFLICT', 'Conflict'],
    ['42501', 403, 'FORBIDDEN', 'Forbidden'],
    ['22P02', 400, 'BAD_REQUEST', 'Bad request'],
    ['23514', 400, 'BAD_REQUEST', 'Bad request']
  ])('maps PostgreSQL error %s without exposing database text', async (
    postgresCode,
    statusCode,
    code,
    message
  ) => {
    const server = buildServer();
    server.get('/database', async () => {
      throw Object.assign(new Error('sensitive database diagnostic text'), {
        code: postgresCode,
        detail: 'private row value'
      });
    });

    const response = await server.inject({
      method: 'GET',
      url: '/database'
    });
    await server.close();

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({
      success: false,
      error: {
        statusCode,
        code,
        message,
        details: []
      }
    });
    expect(response.body).not.toContain('sensitive database diagnostic text');
    expect(response.body).not.toContain('private row value');
  });

  it('returns a generic 500 and emits one correlated structured error log', async () => {
    const records: Array<Record<string, any>> = [];
    const server = buildServer(records);
    const secret = 'forced-route-password';
    server.post('/unmapped', async () => {
      throw new Error('unmapped database failure');
    });

    const response = await server.inject({
      method: 'POST',
      url: '/unmapped',
      headers: {
        'x-request-id': REQUEST_ID
      },
      payload: {
        password: secret
      }
    });
    await server.close();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: {
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        details: []
      }
    });
    expect(response.body).not.toContain('unmapped database failure');
    expect(response.body).not.toContain('Error:');
    expect(response.body).not.toContain(secret);

    const errorRecords = records.filter(record => record.msg === 'request failed');
    expect(errorRecords).toHaveLength(1);
    expect(errorRecords[0]).toMatchObject({
      reqId: REQUEST_ID,
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      msg: 'request failed'
    });
    expect(errorRecords[0].err).toMatchObject({
      type: 'Error',
      message: 'unmapped database failure'
    });
    expect(JSON.stringify(errorRecords)).not.toContain(secret);
  });
});
