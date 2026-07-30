import type {
  FastifyInstance,
  FastifyRequest,
  FastifyServerOptions
} from 'fastify';

export declare function createLoggingOptions(
  env?: NodeJS.ProcessEnv
): FastifyServerOptions;

export declare function registerRequestLogging(server: FastifyInstance): void;

export declare function forwardHeaders(
  request: Pick<FastifyRequest, 'id'>
): { 'x-request-id': string };
