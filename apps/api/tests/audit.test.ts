import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function getAuthHeaders(tenantId: number, userId = 1) {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role: 'hospital_admin', permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(1),
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Audit API - Real Integration Tests', () => {

  describe('GET /api/audit/logs', () => {
    it('returns audit logs (empty or populated)', async () => {
      const res = await api('GET', '/api/audit/logs');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.logs).toBeDefined();
      expect(Array.isArray(data.logs)).toBe(true);
    });

    it('respects action filter', async () => {
      const res = await api('GET', '/api/audit/logs?action=create');
      expect(res.status).toBe(200);
    });

    it('respects entity filter', async () => {
      const res = await api('GET', '/api/audit/logs?entity=patients');
      expect(res.status).toBe(200);
    });

    it('respects limit parameter', async () => {
      const res = await api('GET', '/api/audit/logs?limit=5');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.logs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/audit', () => {
    it('returns audit logs list', async () => {
      const res = await api('GET', '/api/audit');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.auditLogs).toBeDefined();
      expect(Array.isArray(data.auditLogs)).toBe(true);
    });

    it('respects date range filters', async () => {
      const res = await api('GET', '/api/audit?startDate=2024-01-01&endDate=2024-12-31');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/audit/:id', () => {
    it('returns 404 for non-existent log', async () => {
      const res = await api('GET', '/api/audit/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('Auth Enforcement', () => {
    it('returns 401 without token', async () => {
      const req = new Request('http://localhost/api/audit/logs', {
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test' },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(401);
    });
  });
});
