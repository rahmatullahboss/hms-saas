import { describe, it, expect, beforeEach } from 'vitest';
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

describe('Income API', () => {
  describe('POST /api/income — create', () => {
    it('creates income entry with valid source → 201', async () => {
      const res = await api('POST', '/api/income', {
        date: '2026-03-13',
        source: 'pharmacy',     // valid CHECK constraint value
        amount: 5000,
        description: 'Pharmacy sales',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('creates income with doctor_visit source → 201', async () => {
      const res = await api('POST', '/api/income', {
        date: '2026-03-13',
        source: 'doctor_visit',
        amount: 2000,
      });
      expect(res.status).toBe(201);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await api('POST', '/api/income', { amount: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/income — list', () => {
    it('returns income list', async () => {
      await api('POST', '/api/income', { date: '2026-03-13', source: 'laboratory', amount: 1000 });
      const res = await api('GET', '/api/income');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.income)).toBe(true);
      expect(data.income.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by date range', async () => {
      await api('POST', '/api/income', { date: '2026-03-01', source: 'ambulance', amount: 800 });
      const res = await api('GET', '/api/income?startDate=2026-03-01&endDate=2026-03-31');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.income.every((i: any) => i.date >= '2026-03-01')).toBe(true);
    });
  });

  describe('GET /api/income/:id', () => {
    it('returns single income entry', async () => {
      const createRes = await api('POST', '/api/income', { date: '2026-03-13', source: 'admission', amount: 3000 });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/income/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.income.amount).toBe(3000);
    });

    it('returns 404 for unknown income', async () => {
      const res = await api('GET', '/api/income/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/income/:id — update', () => {
    it('updates income amount', async () => {
      const createRes = await api('POST', '/api/income', { date: '2026-03-13', source: 'other', amount: 500 });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/income/${id}`, { amount: 600, source: 'other', date: '2026-03-13' });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/income/:id', () => {
    it('deletes income entry', async () => {
      const createRes = await api('POST', '/api/income', { date: '2026-03-13', source: 'operation', amount: 10000 });
      const { id } = await createRes.json() as any;
      const res = await api('DELETE', `/api/income/${id}`);
      expect(res.status).toBe(200);
    });
  });
});
