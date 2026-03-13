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

describe('Commissions API', () => {
  describe('GET /api/commissions — list', () => {
    it('returns commissions list', async () => {
      const res = await api('GET', '/api/commissions');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.commissions)).toBe(true);
    });
  });

  describe('GET /api/commissions/summary', () => {
    it('returns commission summary grouped by status', async () => {
      const res = await api('GET', '/api/commissions/summary');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.summary)).toBe(true);
    });
  });
});

describe('Reports API', () => {
  describe('GET /api/reports/pl — P&L report', () => {
    it('requires startDate and endDate → 400 without them', async () => {
      const res = await api('GET', '/api/reports/pl');
      expect(res.status).toBe(400);
    });

    it('returns P&L data for valid date range', async () => {
      // Seed income and expense
      await api('POST', '/api/income', { date: '2026-03-13', source: 'pharmacy', amount: 10000 });

      const res = await api('GET', '/api/reports/pl?startDate=2026-03-01&endDate=2026-03-31');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.netProfit).toBe('number');
      expect(typeof data.income.total).toBe('number');
      expect(typeof data.expenses.total).toBe('number');
    });
  });

  describe('GET /api/reports/income-by-source', () => {
    it('returns income breakdown by source', async () => {
      await api('POST', '/api/income', { date: '2026-03-13', source: 'laboratory', amount: 2000 });
      const res = await api('GET', '/api/reports/income-by-source?startDate=2026-03-01&endDate=2026-03-31');
      expect(res.status).toBe(200);
    });
  });
});
