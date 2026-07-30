import type { FastifyInstance } from 'fastify';

export interface ReadinessPostgresClient {
  query(sql: string): Promise<unknown>;
}

export interface ReadinessRedisClient {
  ping(): Promise<unknown>;
}

export interface ReadinessDependencies {
  pgPool?: ReadinessPostgresClient;
  redisClient?: ReadinessRedisClient;
}

export declare function registerReadiness(
  server: FastifyInstance,
  deps?: ReadinessDependencies
): void;
