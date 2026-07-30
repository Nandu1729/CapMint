import { recordError } from './metrics.js';

const POSTGRES_ERROR_RESPONSES = new Map([
  ['23505', { statusCode: 409, code: 'CONFLICT', message: 'Conflict' }],
  ['23503', { statusCode: 409, code: 'CONFLICT', message: 'Conflict' }],
  ['42501', { statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' }],
  ['22P02', { statusCode: 400, code: 'BAD_REQUEST', message: 'Bad request' }],
  ['23514', { statusCode: 400, code: 'BAD_REQUEST', message: 'Bad request' }]
]);

const INTERNAL_ERROR_RESPONSE = {
  statusCode: 500,
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Internal server error'
};

function normalizeError(error) {
  if (error.statusCode !== undefined && error.statusCode !== null) {
    return {
      statusCode: error.statusCode,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message
    };
  }

  return POSTGRES_ERROR_RESPONSES.get(error.code) || INTERNAL_ERROR_RESPONSE;
}

export function createErrorHandler() {
  return function errorHandler(error, request, reply) {
    const { statusCode, code, message } = normalizeError(error);

    recordError(code);
    request.log.error({ err: error, code, statusCode }, 'request failed');

    return reply.status(statusCode).send({
      success: false,
      error: {
        statusCode,
        code,
        message,
        details: []
      }
    });
  };
}
