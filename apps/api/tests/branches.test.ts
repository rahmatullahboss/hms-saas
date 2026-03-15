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

describe('Branches API - Real Integration Tests', () => {

  describe('GET /api/branches/analytics', () => {
    it('returns branches list (may be empty)', async () => {
      const res = await api('GET', '/api/branches/analytics');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.branches)).toBe(true);
    });

    it('returns valid stats shape even with no branches', async () => {
      const res = await api('GET', '/api/branches/analytics');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      // The response should always have branches array
      expect(data.branches).toBeDefined();
    });
  });

  describe('Auth Enforcement', () => {
    it('returns 401 without token', async () => {
      const req = new Request('http://localhost/api/branches/analytics', {
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test' },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(401);
    });
  });
});
