import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'fastify-bcrypt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedRoles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify({
  logger: true
});

// Configure JWT plugin
server.register(jwt, {
  secret: process.env.JWT_SECRET || 'capmint_development_jwt_secret_must_be_minimum_32_bytes_long'
});

// Configure Bcrypt plugin
server.register(bcrypt as any, {
  saltWorkFactor: 10
});

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing Authorization token.'
      }
    });
  }
});

server.decorate('authorize', (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user || !allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.'
        }
      });
    }
  };
});

// Initialize PostgreSQL Client Pool
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://capmint_admin:capmint_secure_password@localhost:5432/capmint_dev'
});

// Initialize Redis Client
const redisClient = new Redis(process.env.REDIS_URL || 'redis://:capmint_redis_secure_password@localhost:6379/0');

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
  return { status: 'healthy', service: 'auth-service' };
});

// Route: User registration
server.post('/api/v1/auth/register', async (request, reply) => {
  const { username, password, role, associated_entity_id } = request.body as any;

  if (!username || !password || !role) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing username, password, or role in request body.'
      }
    });
  }

  // Enforce allowed roles validation
  const allowedRoles = ['ADMIN', 'PRODUCER', 'PACK_HOUSE', 'CERTIFIER', 'LAB'];
  if (!allowedRoles.includes(role)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_ROLE',
        message: `Role must be one of: ${allowedRoles.join(', ')}`
      }
    });
  }

  try {
    // Encrypt password using Fastify Bcrypt
    const passwordHash = await server.bcrypt.hash(password);

    // Insert user into the PostgreSQL DB
    const query = `
      INSERT INTO users (username, password_hash, role, associated_entity_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, role, associated_entity_id, created_at
    `;
    const result = await pgPool.query(query, [username, passwordHash, role, associated_entity_id || null]);
    const newUser = result.rows[0];

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role,
          associatedEntityId: newUser.associated_entity_id,
          createdAt: newUser.created_at
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  } catch (err: any) {
    if (err.code === '23505') {
      return reply.status(409).send({
        success: false,
        error: {
          statusCode: 409,
          code: 'USER_EXISTS',
          message: 'The username is already registered.'
        }
      });
    }
    throw err;
  }
});

// Route: User login (issues signed JWT)
server.post('/api/v1/auth/login', async (request, reply) => {
  const { username, password } = request.body as any;

  if (!username || !password) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing username or password in request body.'
      }
    });
  }

  // Fetch user from PostgreSQL
  const result = await pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];

  if (!user) {
    return reply.status(401).send({
      success: false,
      error: {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'The username or password provided is incorrect.'
      }
    });
  }

  // Verify password hash
  const isValid = await server.bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return reply.status(401).send({
      success: false,
      error: {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'The username or password provided is incorrect.'
      }
    });
  }

  // Sign JWT containing profile context
  const token = server.jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    associatedEntityId: user.associated_entity_id
  }, {
    expiresIn: '8h'
  });

  return reply.status(200).send({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        associatedEntityId: user.associated_entity_id
      }
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: request.id
    }
  });
});

// Route: Get current authenticated user details
server.get('/api/v1/auth/me', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  const userPayload = request.user as any;
  return {
    success: true,
    data: {
      user: {
        id: userPayload.id,
        username: userPayload.username,
        role: userPayload.role,
        associatedEntityId: userPayload.associatedEntityId
      }
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: request.id
    }
  };
});

// Route: Admin only endpoint
server.get('/api/v1/auth/admin-only', {
  preValidation: [server.authenticate, server.authorize(['ADMIN'])]
}, async (request, reply) => {
  return {
    success: true,
    message: 'Welcome, Admin! This is a restricted operational endpoint.'
  };
});

// Route: Producer only endpoint
server.get('/api/v1/auth/producer-only', {
  preValidation: [server.authenticate, server.authorize(['PRODUCER'])]
}, async (request, reply) => {
  return {
    success: true,
    message: 'Welcome, Producer! Access to crop budget details authorized.'
  };
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8081', 10);

    // Seed default users if users table is empty
    const client = await pgPool.connect();
    try {
      const userCheck = await client.query('SELECT COUNT(*) FROM users');
      if (parseInt(userCheck.rows[0].count, 10) === 0) {
        // certifier user
        const certifierPassHash = await server.bcrypt.hash('password');
        await client.query(`
          INSERT INTO users (username, password_hash, role)
          VALUES ('certifier', $1, 'ADMIN')
        `, [certifierPassHash]);

        // producer user
        const producerPassHash = await server.bcrypt.hash('password');
        await client.query(`
          INSERT INTO users (username, password_hash, role)
          VALUES ('producer', $1, 'ADMIN')
        `, [producerPassHash]);

        // packhouse user
        const packhousePassHash = await server.bcrypt.hash('password');
        await client.query(`
          INSERT INTO users (username, password_hash, role)
          VALUES ('packhouse', $1, 'ADMIN')
        `, [packhousePassHash]);
      }
    } catch (seedErr) {
      server.log.error(seedErr as any, 'Seeding default users failed');
    } finally {
      client.release();
    }

    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Auth service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
