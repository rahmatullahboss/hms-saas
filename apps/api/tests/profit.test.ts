import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'director') {
  const token = jwt.sign(
    { userId: '2', tenantId: '1', role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    Authorization: `Bearer ${token}`,
  };
}

function adminHeaders() {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role: 'admin', permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    Authorization: `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: unknown, useDirector = true) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: useDirector ? authHeaders() : adminHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function seedIncomeAndExpenses(db: D1Database, tenantId: number) {
  const month = '2026-02';
  await db.prepare(
    `INSERT INTO income (date, source, amount, description, tenant_id) VALUES ('2026-02-15', 'pharmacy', 50000, 'Feb income', ?)`,
  ).bind(tenantId).run();
  await db.prepare(
    `INSERT INTO expenses (date, category, amount, description, status, tenant_id) VALUES ('2026-02-15', 'Supplies', 10000, 'Feb expense', 'approved', ?)`,
  ).bind(tenantId).run();
  return month;
}

describe('Profit API — /api/profit', () => {
  describe('GET /api/profit/calculate', () => {
    it('returns profit calculation for current month', async () => {
      const res = await api('GET', '/api/profit/calculate');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(typeof data.totalIncome).toBe('number');
      expect(typeof data.totalExpense).toBe('number');
      expect(typeof data.totalProfit).toBe('number');
      expect(typeof data.distributableProfit).toBe('number');
      expect(data.month).toBeDefined();
    });

    it('accepts custom month param', async () => {
      await seedIncomeAndExpenses(env.DB as D1Database, 1);
      const res = await api('GET', '/api/profit/calculate?month=2026-02');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.month).toBe('2026-02');
      expect(data.totalIncome).toBeGreaterThanOrEqual(50000);
    });
  });

  describe('POST /api/profit/distribute', () => {
    it('requires director role — returns 403 for admin', async () => {
      const res = await api('POST', '/api/profit/distribute', { month: '2026-01' }, false);
      expect(res.status).toBe(403);
    });

    it('distributes profit for a month (director)', async () => {
      await seedIncomeAndExpenses(env.DB as D1Database, 1);
      const res = await api('POST', '/api/profit/distribute', { month: '2026-02' });
      expect([201, 400]).toContain(res.status); // 201 first time, 400 if already distributed
    });

    it('returns 400 on duplicate distribution', async () => {
      await seedIncomeAndExpenses(env.DB as D1Database, 1);
      await api('POST', '/api/profit/distribute', { month: '2025-12' });
      const res = await api('POST', '/api/profit/distribute', { month: '2025-12' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/profit/history', () => {
    it('returns distribution history', async () => {
      const res = await api('GET', '/api/profit/history');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.distributions)).toBe(true);
    });
  });
});
