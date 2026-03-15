import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

// ─── Helpers ─────────────────────────────────────────────────────────

function getSuperAdminHeaders(userId = 1) {
  const token = jwt.sign(
    { userId: userId.toString(), role: 'super_admin', permissions: ['*'] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: headers ?? { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Admin Auth API - Real Integration Tests', () => {

  // ─── Super Admin Login ─────────────────────────────────────────────

  describe('POST /api/admin/login', () => {
    beforeEach(async () => {
      const hash = await bcrypt.hash('SuperAdmin@123', 10);
      await env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
      ).bind('superadmin@hms.com', hash, 'Super Admin', 'super_admin').run();
    });

    it('returns 200 + JWT for valid super admin credentials', async () => {
      const res = await api('POST', '/api/admin/login', {
        email: 'superadmin@hms.com',
        password: 'SuperAdmin@123',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.token).toBeTruthy();
      expect(data.user.role).toBe('super_admin');
      expect(data.user.email).toBe('superadmin@hms.com');
    });

    it('returns 401 for wrong password', async () => {
      const res = await api('POST', '/api/admin/login', {
        email: 'superadmin@hms.com',
        password: 'WrongPass123',
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 for non-existent email', async () => {
      const res = await api('POST', '/api/admin/login', {
        email: 'nobody@hms.com',
        password: 'anything',
      });

      expect(res.status).toBe(401);
    });

    it('returns 400 for missing fields', async () => {
      const res = await api('POST', '/api/admin/login', {
        email: 'superadmin@hms.com',
      });

      expect(res.status).toBe(400);
    });

    it('does not allow non-super_admin users to login', async () => {
      // Seed a hospital_admin user (not super_admin)
      const hash = await bcrypt.hash('TenantPass@123', 10);
      await env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
      ).bind('tenant-user@clinic.com', hash, 'Tenant Admin', 'hospital_admin', 1).run();

      const res = await api('POST', '/api/admin/login', {
        email: 'tenant-user@clinic.com',
        password: 'TenantPass@123',
      });

      // Admin login checks role = 'super_admin'
      expect(res.status).toBe(401);
    });
  });

  // ─── Protected Admin Routes ────────────────────────────────────────

  describe('Protected Admin Routes', () => {
    it('returns 401 for admin routes without token', async () => {
      const res = await api('GET', '/api/admin/hospitals');
      expect(res.status).toBe(401);
    });

    it('allows access with valid super admin token', async () => {
      const res = await api('GET', '/api/admin/hospitals', undefined, getSuperAdminHeaders());
      // Should return 200 or valid response, not 401
      expect(res.status).not.toBe(401);
    });

    it('returns hospitals list', async () => {
      const res = await api('GET', '/api/admin/hospitals', undefined, getSuperAdminHeaders());
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.hospitals).toBeDefined();
      expect(Array.isArray(data.hospitals)).toBe(true);
    });

    it('returns usage stats', async () => {
      const res = await api('GET', '/api/admin/usage', undefined, getSuperAdminHeaders());
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.hospitals).toBe('number');
      expect(typeof data.users).toBe('number');
    });
  });

  // ─── Hospital CRUD ─────────────────────────────────────────────────

  describe('Hospital CRUD', () => {
    it('creates hospital with valid data', async () => {
      const res = await api('POST', '/api/admin/hospitals', {
        name: 'Test Hospital',
        subdomain: 'test-hospital',
        adminEmail: 'admin@test.com',
        adminName: 'Test Admin',
        adminPassword: 'AdminPass@123',
      }, getSuperAdminHeaders());

      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.hospital.subdomain).toBe('test-hospital');
    });

    it('rejects invalid subdomain format', async () => {
      const res = await api('POST', '/api/admin/hospitals', {
        name: 'Bad Sub',
        subdomain: 'A',  // too short / invalid
      }, getSuperAdminHeaders());

      expect(res.status).toBe(400);
    });

    it('rejects reserved subdomains', async () => {
      const res = await api('POST', '/api/admin/hospitals', {
        name: 'Admin Hospital',
        subdomain: 'admin',
      }, getSuperAdminHeaders());

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toContain('reserved');
    });
  });
});
