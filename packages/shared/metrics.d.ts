import type { FastifyInstance } from 'fastify';

export type LedgerAppendResult = 'ok' | 'error';

export declare function registerMetrics(server: FastifyInstance): void;
export declare function recordError(code: string): void;
export declare function recordSignatureFailure(): void;
export declare function recordLedgerAppend(result: LedgerAppendResult): void;
