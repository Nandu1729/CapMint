declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        authorize: (allowedRoles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
export declare function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
