import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt'; // provided via npm-workspace hoisting
import dotenv from 'dotenv';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify({
  logger: true
});

// Configure JWT plugin. Fail closed: never fall back to a hardcoded secret in real environments.
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-insecure-secret' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
server.register(jwt, { secret: JWT_SECRET });

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid or missing Authorization token.' }
    });
  }
});

// Global error handler complying with RFC 7807 Problem Details
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);
  const statusCode = error.statusCode || 500;
  const errorCode = error.code || 'INTERNAL_SERVER_ERROR';
  reply.status(statusCode).send({
    success: false,
    error: {
      statusCode,
      code: errorCode,
      message: error.message,
      details: []
    }
  });
});

// Standard health check route
server.get('/health', async () => {
  return { status: 'healthy', service: 'integration-service' };
});

// Route: AgriStack Farmer Details Lookup (M-015)
server.get('/api/v1/integrations/agristack/farmers/:id', { preValidation: [server.authenticate] }, async (request, reply) => {
  const { id } = request.params as any;

  if (!id) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing Farmer ID parameter.' }
    });
  }

  // Simulate government API response payload
  const mockFarmerDb: Record<string, any> = {
    'FARMER-901': {
      farmer_id: 'FARMER-901',
      name: 'Ramesh Kumar',
      state: 'Uttar Pradesh',
      district: 'Bijnor',
      plots: [
        {
          plot_id: 'PLOT-01',
          crop_type: 'Organic Mustard / Honey Hive Cluster',
          area_hectares: 4.2,
          geo_boundary: {
            type: 'Polygon',
            coordinates: [
              [
                [78.1234, 29.1234],
                [78.1254, 29.1234],
                [78.1254, 29.1254],
                [78.1234, 29.1254],
                [78.1234, 29.1234]
              ]
            ]
          }
        }
      ]
    }
  };

  const farmer = mockFarmerDb[id.toUpperCase()];
  if (!farmer) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'AGRISTACK_RECORD_NOT_FOUND',
        message: `Farmer ID ${id} was not found in the AgriStack government registry.`
      }
    });
  }

  return {
    success: true,
    data: {
      registry: 'AgriStack (India Digital Ecosystem for Agriculture)',
      syncTime: new Date().toISOString(),
      farmer
    }
  };
});

// Route: TraceNet NPOP Certification Validation (M-014)
server.get('/api/v1/integrations/tracenet/certificates/:licenseId', { preValidation: [server.authenticate] }, async (request, reply) => {
  const { licenseId } = request.params as any;

  if (!licenseId) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing license ID parameter.' }
    });
  }

  // Simulate APEDA TraceNet Registry lookup
  const mockCertificatesDb: Record<string, any> = {
    'NPOP-IN-90812': {
      license_id: 'NPOP-IN-90812',
      operator_name: 'FPO Organic Honey Co.',
      certification_body: 'Organic Trade Council India',
      status: 'VALID',
      effective_start: '2026-01-01',
      effective_end: '2026-12-31',
      crop_allowances: ['Organic White Honey', 'Organic Wild Honey'],
      max_yield_quota_kg: 10000.00
    }
  };

  const certificate = mockCertificatesDb[licenseId.toUpperCase()];
  if (!certificate) {
    return reply.status(404).send({
      success: false,
      error: {
        statusCode: 404,
        code: 'TRACENET_CERTIFICATE_NOT_FOUND',
        message: `Certificate license number ${licenseId} was not found or is inactive in the TraceNet APEDA database.`
      }
    });
  }

  return {
    success: true,
    data: {
      registry: 'TraceNet APEDA Organic Registry',
      verificationTime: new Date().toISOString(),
      certificate
    }
  };
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8087', 10);
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Integration service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
