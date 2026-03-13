import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'director') {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', 'Authorization': `Bearer ${token}` };
}

async function api(method: string, path: string, body?: unknown, role = 'director') {
  const req = new Request(`http://localhost${path}`, {
    method, headers: authHeaders(role),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

// accounts route requires 'director' role
describe('Accounts & Chart of Accounts API', () => {
  describe('GET /api/accounts — list chart of accounts', () => {
    it('returns accounts list', async () => {
      const res = await api('GET', '/api/accounts');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.accounts)).toBe(true);
    });
  });

  describe('POST /api/accounts — create account (director only)', () => {
    it('creates a new GL account → 201', async () => {
      const uniqueCode = `TST-${Date.now()}`;
      const res = await api('POST', '/api/accounts', {
        code: uniqueCode,
        name: 'Cash Account',
        type: 'asset',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('returns 403 for non-director role', async () => {
      const res = await api('POST', '/api/accounts', { code: 'X001', name: 'Test', type: 'asset' }, 'admin');
      expect(res.status).toBe(403);
    });

    it('returns 400 for duplicate account code', async () => {
      const code = `DUP-${Date.now()}`;
      await api('POST', '/api/accounts', { code, name: 'Dup Account', type: 'asset' });
      const res = await api('POST', '/api/accounts', { code, name: 'Dup Again', type: 'asset' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('returns account detail', async () => {
      const code = `EQ-${Date.now()}`;
      const createRes = await api('POST', '/api/accounts', { code, name: 'Equity Account', type: 'equity' });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/accounts/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.account.code).toBe(code);
    });
  });
});
