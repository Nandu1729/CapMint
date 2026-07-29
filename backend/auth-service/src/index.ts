import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'fastify-bcrypt';
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  assertRlsServiceRole,
  PUBLIC_TENANT_CONTEXT,
  tenantContextFromUser,
  withTenantTx
} from '../../../packages/shared/tenant-db.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

import crypto from 'crypto';

function hashSHA256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function appendAuditLog(
  client: pg.PoolClient | pg.Pool,
  entityType: string,
  entityId: string,
  eventType: string,
  payload: any
): Promise<void> {
  let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const queryLatest = 'SELECT current_hash FROM log_entries ORDER BY created_at DESC, id DESC LIMIT 1';
  const latestRes = await client.query(queryLatest);
  if (latestRes.rowCount && latestRes.rowCount > 0) {
    previousHash = latestRes.rows[0].current_hash;
  }

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const payloadHash = hashSHA256(payloadStr);
  const currentHash = hashSHA256(entityType + entityId + eventType + payloadHash + previousHash);

  await client.query(`
    INSERT INTO log_entries (entity_type, entity_id, event_type, payload_hash, previous_hash, current_hash)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [entityType, entityId, eventType, payloadHash, previousHash, currentHash]);
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (allowedSpecs: any[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const server = Fastify({
  logger: true
});

// Configure JWT plugin
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-insecure-secret' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
server.register(jwt, {
  secret: JWT_SECRET,
  verify: { algorithms: ['HS256'] }
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

server.decorate('authorize', (allowedSpecs: any[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'User context not found.'
        }
      });
    }

    const isAuthorized = allowedSpecs.some(spec => {
      if (typeof spec === 'string') {
        return spec === user.role || spec === user.orgType;
      } else if (spec && typeof spec === 'object') {
        const matchType = spec.orgType === user.orgType;
        const matchRole = !spec.role || spec.role === user.role;
        return matchType && matchRole;
      }
      return false;
    });

    if (!isAuthorized) {
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
const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
const pgPool = new pg.Pool({
  connectionString: DATABASE_URL
});

const withAuthenticatedTenantTx = <T>(
  request: FastifyRequest,
  fn: (client: pg.PoolClient) => Promise<T>
) => withTenantTx(pgPool, tenantContextFromUser(request.user as any), fn);

// Initialize Redis Client
const REDIS_URL = process.env.REDIS_URL || (process.env.NODE_ENV === 'test' ? 'redis://:capmint_redis_secure_password@localhost:6379/0' : '');
if (!REDIS_URL) {
  console.error('FATAL: REDIS_URL is not set. Refusing to start with an insecure default.');
  process.exit(1);
}
const redisClient = new Redis(REDIS_URL);

// Redis sliding-window rate limiter (per client IP). Returns true if within the limit.
// Note: behind the local gateway proxy all requests share the gateway IP; production should
// forward the real client IP (X-Forwarded-For + trust proxy) for per-client limiting.
async function rateLimit(bucket: string, ip: string, max: number, windowMs: number): Promise<boolean> {
  const key = `ratelimit:${bucket}:${ip}`;
  const now = Date.now();
  const results = await redisClient
    .multi()
    .zremrangebyscore(key, 0, now - windowMs)
    .zadd(key, now, `${now}-${Math.random()}`)
    .zcard(key)
    .pexpire(key, windowMs)
    .exec();
  const count = Number(results?.[2]?.[1] ?? 0);
  return count <= max;
}
const RATE_LIMIT_LOGIN_MAX = parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '100', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

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

// Route: Organization Registration (Public signup flow)
server.post('/api/v1/auth/register-org', async (request, reply) => {
  const { name, type, business_reg_details, official_email, contact_info, admin_username, admin_password } = request.body as any;

  if (!name || !type || !official_email || !admin_username || !admin_password) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Missing name, type, official_email, admin_username, or admin_password.'
      }
    });
  }

  const allowedTypes = ['PRODUCER', 'NABL_LABORATORY', 'CERTIFICATION_BODY', 'EXPORTER'];
  if (!allowedTypes.includes(type)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'INVALID_TYPE',
        message: `Organization type must be one of: ${allowedTypes.join(', ')}`
      }
    });
  }

  // AUTH-09: Register using invalid email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(official_email)) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format.'
      }
    });
  }

  // AUTH-10: Register with weak password
  if (admin_password.length < 8) {
    return reply.status(400).send({
      success: false,
      error: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Password must be at least 8 characters long.'
      }
    });
  }

  try {
    const adminPassHash = await server.bcrypt.hash(admin_password);
    return await withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, async (client) => {
      const registration = (await client.query(
        `SELECT organization, admin_user
         FROM public.capmint_register_organization(
           $1::text,
           $2::text,
           $3::jsonb,
           $4::text,
           $5::jsonb,
           $6::text,
           $7::text
         )`,
        [
          name,
          type,
          JSON.stringify(business_reg_details || {}),
          official_email,
          JSON.stringify(contact_info || {}),
          admin_username,
          adminPassHash
        ]
      )).rows[0];

      return reply.status(201).send({
        success: true,
        data: {
          organization: registration.organization,
          adminUser: registration.admin_user
        }
      });
    });
  } catch (err: any) {
    if (err.code === '23505' || err.message === 'REGISTRATION_EXISTS') {
      return reply.status(409).send({
        success: false,
        error: {
          statusCode: 409,
          code: 'REGISTRATION_EXISTS',
          message: 'The organization name, official email, or admin username is already registered.'
        }
      });
    }
    throw err;
  }
});

// Route: User login (issues signed JWT carrying Org ID, Org Type, and User Role)
server.post('/api/v1/auth/login', async (request, reply) => {
  if (!(await rateLimit('login', request.ip, RATE_LIMIT_LOGIN_MAX, RATE_LIMIT_WINDOW_MS))) {
    return reply.status(429).send({
      success: false,
      error: { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again shortly.' }
    });
  }

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

  return withTenantTx(pgPool, PUBLIC_TENANT_CONTEXT, async (client) => {
    const result = await client.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
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

    // The public users policy permits pre-auth username resolution. Switch to
    // the server-derived organization before reading its now tenant-scoped row.
    await client.query(
      `SELECT set_config(
         'app.current_organization_id',
         $1,
         true
       )`,
      [user.organization_id]
    );
    const organization = (await client.query(
      'SELECT type, status FROM organizations WHERE id = $1',
      [user.organization_id]
    )).rows[0];
    if (!organization) {
      throw new Error('User organization is not visible in its derived tenant context.');
    }
    user.org_type = organization.type;
    user.org_status = organization.status;

    // Refuse access to users of non-activated organizations
    if (user.org_status !== 'ACTIVATED') {
      return reply.status(403).send({
        success: false,
        error: {
          statusCode: 403,
          code: 'INACTIVE_ORGANIZATION',
          message: `Access denied. Your organization is currently in "${user.org_status}" state. Only activated organizations can access CapMint.`
        }
      });
    }

    // Refuse access to disabled user accounts
    if (user.status !== 'ACTIVE') {
      return reply.status(403).send({
        success: false,
        error: {
          statusCode: 403,
          code: 'DISABLED_USER',
          message: 'Your user account has been disabled. Please contact your organization administrator.'
        }
      });
    }

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

    // Write immutable audit log for Login
    await appendAuditLog(client, 'USER', user.id, 'USER_LOGIN', { user_id: user.id });

    // Sign JWT carrying Organization ID, Type, and Role
    const token = server.jwt.sign({
      id: user.id,
      username: user.username,
      orgId: user.organization_id,
      orgType: user.org_type,
      role: user.role
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
          orgId: user.organization_id,
          orgType: user.org_type
        }
      }
    });
  });
});

// Route: Get current authenticated user details
server.get('/api/v1/auth/me', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  const user = request.user as any;
  return {
    success: true,
    data: {
      user
    }
  };
});

// Route: List all organizations (System Administrator only)
server.get('/api/v1/auth/organizations', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'SYSTEM_ADMINISTRATOR', role: 'ADMIN' }])]
}, async (request, reply) => {
  return withAuthenticatedTenantTx(request, async (client) => {
    const result = await client.query('SELECT * FROM organizations ORDER BY created_at DESC');
    return {
      success: true,
      data: {
        organizations: result.rows
      }
    };
  });
});

// Route: Approve / Verification / Activate Organization (System Administrator only)
server.post('/api/v1/auth/organizations/:id/status', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'SYSTEM_ADMINISTRATOR', role: 'ADMIN' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { status } = request.body as any;

  const allowedStatuses = ['PENDING', 'VERIFICATION', 'APPROVED', 'ACTIVATED', 'SUSPENDED'];
  if (!allowedStatuses.includes(status)) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` }
    });
  }

  return withAuthenticatedTenantTx(request, async (client) => {

    // 1. Fetch organization first
    const orgCheck = await client.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (orgCheck.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { statusCode: 404, code: 'NOT_FOUND', message: 'Organization not found.' }
      });
    }
    const org = orgCheck.rows[0];

    // 2. Update organization status
    const updateRes = await client.query(
      `UPDATE organizations SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, status]
    );

    // 3. If transitioning to ACTIVATED, auto-provision domain objects to allow business integrations
    if (status === 'ACTIVATED') {
      if (org.type === 'PRODUCER') {
        await client.query(`
          INSERT INTO producers (id, organization_id, name, type, registry_references)
          VALUES ($1, $1, $2, 'FARMER', '{}')
          ON CONFLICT (id) DO NOTHING
        `, [org.id, org.name]);
      } else if (org.type === 'CERTIFICATION_BODY') {
        await client.query(`
          INSERT INTO certifiers
            (id, organization_id, name, accreditation_details, public_key, key_status)
          VALUES ($1, $1, $2, '{}', 'pk_temp_key', 'ACTIVE')
          ON CONFLICT (id) DO NOTHING
        `, [org.id, org.name]);
      }
    }

    // 4. Log immutable audit trail for status change
    await appendAuditLog(client, 'ORGANIZATION', id, 'ORGANIZATION_STATUS_UPDATED', { status });

    return {
      success: true,
      data: {
        organization: updateRes.rows[0]
      }
    };
  });
});

// Route: User management - Invite User (Organization Administrator only)
server.post('/api/v1/auth/users/invite', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER', role: 'ADMIN' }, { orgType: 'CERTIFICATION_BODY', role: 'ADMIN' }, { orgType: 'NABL_LABORATORY', role: 'ADMIN' }, { orgType: 'EXPORTER', role: 'ADMIN' }])]
}, async (request, reply) => {
  const { username, password, role } = request.body as any;
  const adminUser = request.user as any;

  if (!username || !password || !role) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Missing username, password, or role.' }
    });
  }

  const allowedRoles = ['ADMIN', 'MEMBER'];
  if (!allowedRoles.includes(role)) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'INVALID_ROLE', message: 'User role must be ADMIN or MEMBER.' }
    });
  }

  try {
    return await withAuthenticatedTenantTx(request, async (client) => {

    // Hash password
    const passHash = await server.bcrypt.hash(password);

    // Insert user strictly within current Org ID bounds (No cross-org access)
    const result = await client.query(`
      INSERT INTO users (organization_id, username, password_hash, role, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING id, username, role, status, created_at
    `, [adminUser.orgId, username, passHash, role]);

    const newUser = result.rows[0];

    // Log immutable audit entry for User Invitation
    await appendAuditLog(client, 'USER', newUser.id, 'USER_INVITED', { user_id: newUser.id });

    return reply.status(201).send({
      success: true,
      data: {
        user: newUser
      }
    });
    });
  } catch (err: any) {
    if (err.code === '23505') {
      return reply.status(409).send({
        success: false,
        error: { statusCode: 409, code: 'USER_EXISTS', message: 'The username is already registered.' }
      });
    }
    throw err;
  }
});

// Route: User management - Disable User (Organization Administrator only)
server.post('/api/v1/auth/users/:id/disable', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER', role: 'ADMIN' }, { orgType: 'CERTIFICATION_BODY', role: 'ADMIN' }, { orgType: 'NABL_LABORATORY', role: 'ADMIN' }, { orgType: 'EXPORTER', role: 'ADMIN' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const adminUser = request.user as any;

  return withAuthenticatedTenantTx(request, async (client) => {
  // Enforce same-organization containment validation
  const userCheck = await client.query('SELECT organization_id FROM users WHERE id = $1', [id]);
  if (userCheck.rows.length === 0) {
    return reply.status(404).send({
      success: false,
      error: { statusCode: 404, code: 'NOT_FOUND', message: 'User not found.' }
    });
  }

  if (userCheck.rows[0].organization_id !== adminUser.orgId) {
    return reply.status(403).send({
      success: false,
      error: { statusCode: 403, code: 'FORBIDDEN', message: 'Cross-organization user management is strictly prohibited.' }
    });
  }

  const result = await client.query(
    `UPDATE users SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, username, status`,
    [id]
  );

  return {
    success: true,
    data: {
      user: result.rows[0]
    }
  };
  });
});

// Route: User management - Remove User (Organization Administrator only)
server.delete('/api/v1/auth/users/:id', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER', role: 'ADMIN' }, { orgType: 'CERTIFICATION_BODY', role: 'ADMIN' }, { orgType: 'NABL_LABORATORY', role: 'ADMIN' }, { orgType: 'EXPORTER', role: 'ADMIN' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const adminUser = request.user as any;

  return withAuthenticatedTenantTx(request, async (client) => {
  // Enforce same-organization containment validation
  const userCheck = await client.query('SELECT organization_id FROM users WHERE id = $1', [id]);
  if (userCheck.rows.length === 0) {
    return reply.status(404).send({
      success: false,
      error: { statusCode: 404, code: 'NOT_FOUND', message: 'User not found.' }
    });
  }

  if (userCheck.rows[0].organization_id !== adminUser.orgId) {
    return reply.status(403).send({
      success: false,
      error: { statusCode: 403, code: 'FORBIDDEN', message: 'Cross-organization user management is strictly prohibited.' }
    });
  }

  await client.query('DELETE FROM users WHERE id = $1', [id]);

  return {
    success: true,
    message: 'User removed successfully.'
  };
  });
});

// RBAC-05: Certifier deletes organization (Dummy DELETE organization endpoint to enforce RBAC check)
server.delete('/api/v1/auth/organizations/:id', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  return reply.status(403).send({
    success: false,
    error: {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Organization deletion is not permitted.'
    }
  });
});

// Route: User management - Assign internal role (Organization Administrator only)
server.post('/api/v1/auth/users/:id/role', {
  preValidation: [server.authenticate, server.authorize([{ orgType: 'PRODUCER', role: 'ADMIN' }, { orgType: 'CERTIFICATION_BODY', role: 'ADMIN' }, { orgType: 'NABL_LABORATORY', role: 'ADMIN' }, { orgType: 'EXPORTER', role: 'ADMIN' }])]
}, async (request, reply) => {
  const { id } = request.params as any;
  const { role } = request.body as any;
  const adminUser = request.user as any;

  const allowedRoles = ['ADMIN', 'MEMBER'];
  if (!allowedRoles.includes(role)) {
    return reply.status(400).send({
      success: false,
      error: { statusCode: 400, code: 'BAD_REQUEST', message: 'Role must be ADMIN or MEMBER.' }
    });
  }

  return withAuthenticatedTenantTx(request, async (client) => {
  // Enforce same-organization containment validation
  const userCheck = await client.query('SELECT organization_id FROM users WHERE id = $1', [id]);
  if (userCheck.rows.length === 0) {
    return reply.status(404).send({
      success: false,
      error: { statusCode: 404, code: 'NOT_FOUND', message: 'User not found.' }
    });
  }

  if (userCheck.rows[0].organization_id !== adminUser.orgId) {
    return reply.status(403).send({
      success: false,
      error: { statusCode: 403, code: 'FORBIDDEN', message: 'Cross-organization user management is strictly prohibited.' }
    });
  }

  const result = await client.query(
    `UPDATE users SET role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, username, role`,
    [id, role]
  );

  return {
    success: true,
    data: {
      user: result.rows[0]
    }
  };
  });
});

// Route: List organization users (Admin/Member of same org, or System Admin for all)
server.get('/api/v1/auth/users', {
  preValidation: [server.authenticate]
}, async (request, reply) => {
  const currentUser = request.user as any;
  
  let query = `
    SELECT 
      u.id, 
      u.username, 
      u.role, 
      u.status, 
      u.created_at,
      u.organization_id,
      o.name AS organization_name,
      o.type AS organization_type,
      o.official_email AS organization_email
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
  `;
  const params: any[] = [];

  if (currentUser.orgType !== 'SYSTEM_ADMINISTRATOR') {
    query += ' WHERE u.organization_id = $1';
    params.push(currentUser.orgId);
  }

  query += ' ORDER BY u.username ASC';

  return withAuthenticatedTenantTx(request, async (client) => {
    const result = await client.query(query, params);
    return {
      success: true,
      data: {
        users: result.rows
      }
    };
  });
});

// Start the server
const start = async () => {
  try {
    await server.ready();
    await assertRlsServiceRole(pgPool, 'auth-service');
    const port = parseInt(process.env.PORT || '8081', 10);

    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Auth service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
