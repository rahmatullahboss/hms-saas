import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'admin') {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', 'Authorization': `Bearer ${token}` };
}

async function api(method: string, path: string, body?: unknown, role = 'admin') {
  const req = new Request(`http://localhost${path}`, {
    method, headers: authHeaders(role),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Settings API', () => {
  describe('GET /api/settings — read', () => {
    it('returns settings object', async () => {
      const res = await api('GET', '/api/settings');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.settings).toBe('object');
    });
  });

  describe('PUT /api/settings — bulk update', () => {
    it('updates settings via bulk PUT / endpoint', async () => {
      const res = await api('PUT', '/api/settings', {
        hospital_name: 'Test Hospital',
        share_price: '150000',
      });
      // Settings bulk update returns 200 with message
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('PUT /api/settings/:key — individual update', () => {
    it('updates a single setting by key', async () => {
      const res = await api('PUT', '/api/settings/hospital_name', {
        value: 'Updated Hospital Name',
      });
      // Returns 200 with message
      expect([200, 201]).toContain(res.status);
    });
  });
});

// Note: /api/branches route is NOT registered in this application.
// Branches concept is handled at the tenant level. Skip branches tests.
describe('Tenant Configuration', () => {
  it('GET /api/settings returns tenant config including share settings', async () => {
    const res = await api('GET', '/api/settings');
    expect(res.status).toBe(200);
    const { settings } = await res.json() as any;
    expect(settings.total_shares).toBeDefined();
    expect(settings.profit_percentage).toBeDefined();
  });
});
