import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthHeaders(tenantId: number, userId = 1, role = 'hospital_admin') {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: headers ?? {
      'Content-Type': 'application/json',
      'X-Tenant-Subdomain': 'test',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

async function seedUser(email: string, password: string, role = 'hospital_admin', tenantId = 1) {
  const hash = await bcrypt.hash(password, 10);
  await env.DB.prepare(
    'INSERT INTO users (email, password_hash, name, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(email, hash, 'Test User', role, tenantId).run();
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Auth API – Real Integration Tests', () => {

  // ─── Login ───────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    const LOGIN_PATH = '/api/auth/login';

    beforeEach(async () => {
      // Use unique email to avoid conflict with setup.ts seeded admin@test.com
      await seedUser('login-test@test.com', 'SecurePass123', 'hospital_admin');
    });

    it('returns 200 + JWT for valid credentials', async () => {
      const res = await api('POST', LOGIN_PATH, {
        email: 'login-test@test.com',
        password: 'SecurePass123',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.token).toBeTruthy();
      expect(data.user.email).toBe('login-test@test.com');
      expect(data.user.role).toBe('hospital_admin');
      expect(data.user.id).toBeDefined();
    });

    it('returns 401 for wrong password', async () => {
      const res = await api('POST', LOGIN_PATH, {
        email: 'login-test@test.com',
        password: 'WrongPassword',
      });

      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.error).toBeTruthy();
    });

    it('returns 401 for non-existent user', async () => {
      const res = await api('POST', LOGIN_PATH, {
        email: 'nobody@test.com',
        password: 'anything',
      });

      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid email format (Zod validation)', async () => {
      const res = await api('POST', LOGIN_PATH, {
        email: 'not-an-email',
        password: 'pass',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing password (Zod validation)', async () => {
      const res = await api('POST', LOGIN_PATH, {
        email: 'login-test@test.com',
      });

      expect(res.status).toBe(400);
    });

    it('returns JWT that decodes correctly', async () => {
      const res = await api('POST', LOGIN_PATH, {
        email: 'login-test@test.com',
        password: 'SecurePass123',
      });

      const data = await res.json() as any;
      const decoded = jwt.verify(data.token, TEST_JWT_SECRET) as any;
      expect(String(decoded.tenantId)).toBe('1');
      expect(decoded.role).toBe('hospital_admin');
      expect(decoded.userId).toBeDefined();
    });

    it('respects tenant isolation – cannot login to wrong tenant', async () => {
      // Seed user in tenant 2
      await seedUser('tenant2@test.com', 'Pass123456', 'hospital_admin', 2);

      // Try to login with tenant 1 subdomain — user doesn't exist in tenant 1
      const res = await api('POST', LOGIN_PATH, {
        email: 'tenant2@test.com',
        password: 'Pass123456',
      });

      expect(res.status).toBe(401);
    });
  });

  // ─── Register ────────────────────────────────────────────────────
  //
  // ⚠️ KNOWN BUG: authMiddleware line 20 skips ALL /api/auth/* paths,
  //    which means /api/auth/register's auth enforcement is bypassed.
  //    The route handler's `c.get('role')` becomes undefined → always 403.
  //    These tests document the ACTUAL behavior.
  //

  describe('POST /api/auth/register', () => {
    const REGISTER_PATH = '/api/auth/register';

    it('creates user with valid data (requires hospital_admin JWT)', async () => {
      const res = await api('POST', REGISTER_PATH, {
        email: 'newuser@test.com',
        password: 'NewP@ss1234',
        name: 'New User',
        role: 'reception',
      }, getAuthHeaders(1, 1, 'hospital_admin'));

      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.userId).toBeGreaterThan(0);
    });

    it('rejects registration by non-admin role (403)', async () => {
      const res = await api('POST', REGISTER_PATH, {
        email: 'sneaky@test.com',
        password: 'SneakyPass123',
        name: 'Sneaky User',
        role: 'reception',
      }, getAuthHeaders(1, 1, 'reception'));

      expect(res.status).toBe(403);
    });

    it('rejects duplicate email within same tenant (409)', async () => {
      await seedUser('existing@test.com', 'Pass1234', 'reception');

      const res = await api('POST', REGISTER_PATH, {
        email: 'existing@test.com',
        password: 'NewP@ss1234',
        name: 'Dup User',
        role: 'laboratory',
      }, getAuthHeaders(1, 1, 'hospital_admin'));

      expect(res.status).toBe(409);
    });
  });

  // ─── Protected routes ────────────────────────────────────────────

  describe('Protected Route Access', () => {
    it('returns 401 for requests without token', async () => {
      const res = await api('GET', '/api/patients');
      expect(res.status).toBe(401);
    });

    it('returns 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: '1', tenantId: '1', role: 'hospital_admin', permissions: [] },
        TEST_JWT_SECRET,
        { expiresIn: '-10s' }
      );

      const res = await api('GET', '/api/patients', undefined, {
        'Content-Type': 'application/json',
        'X-Tenant-Subdomain': 'test',
        'Authorization': `Bearer ${expiredToken}`,
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 for malformed token', async () => {
      const res = await api('GET', '/api/patients', undefined, {
        'Content-Type': 'application/json',
        'X-Tenant-Subdomain': 'test',
        'Authorization': 'Bearer totally.invalid.garbage',
      });

      expect(res.status).toBe(401);
    });

    it('returns success for valid token on protected route', async () => {
      const res = await api('GET', '/api/patients', undefined, getAuthHeaders(1));
      // Should NOT be 401 — could be 200 or other, but never unauthorized
      expect(res.status).not.toBe(401);
    });
  });

  // ─── Logout ──────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('returns 200 even without auth header', async () => {
      const res = await api('POST', '/api/auth/logout');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toContain('Logged out');
    });
  });
});
