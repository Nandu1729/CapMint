declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        authorize: (allowedSpecs: any[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
export declare function validateGTIN(gtin: string): boolean;
