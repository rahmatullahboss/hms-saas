import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function getAuthHeaders(tenantId: number, userId = 1, role = 'hospital_admin') {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role, permissions: ['reports:read'] },
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

describe('Reports API - Real Integration Tests', () => {

  // ─── P&L Report ────────────────────────────────────────────────────
  describe('GET /api/reports/pl', () => {
    it('returns 400 when startDate/endDate missing', async () => {
      const res = await api('GET', '/api/reports/pl');
      expect(res.status).toBe(400);
    });

    it('returns P&L data with valid date range', async () => {
      const res = await api('GET', '/api/reports/pl?startDate=2024-01-01&endDate=2024-12-31');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.period).toBeDefined();
      expect(data.income).toBeDefined();
      expect(data.expenses).toBeDefined();
      expect(typeof data.netProfit).toBe('number');
    });
  });

  // ─── Income by Source ──────────────────────────────────────────────
  describe('GET /api/reports/income-by-source', () => {
    it('returns income breakdown', async () => {
      const res = await api('GET', '/api/reports/income-by-source');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.breakdown).toBeDefined();
      expect(typeof data.total).toBe('number');
    });

    it('respects date filters', async () => {
      const res = await api('GET', '/api/reports/income-by-source?startDate=2024-01-01&endDate=2024-06-30');
      expect(res.status).toBe(200);
    });
  });

  // ─── Expense by Category ──────────────────────────────────────────
  describe('GET /api/reports/expense-by-category', () => {
    it('returns expense breakdown', async () => {
      const res = await api('GET', '/api/reports/expense-by-category');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.breakdown).toBeDefined();
      expect(typeof data.total).toBe('number');
    });
  });

  // ─── Monthly Report ────────────────────────────────────────────────
  describe('GET /api/reports/monthly', () => {
    it('returns 12-month breakdown', async () => {
      const res = await api('GET', '/api/reports/monthly?year=2024');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.monthly).toHaveLength(12);
      expect(data.summary.totalIncome).toBeDefined();
      expect(data.summary.netProfit).toBeDefined();
    });

    it('defaults to current year when no year param', async () => {
      const res = await api('GET', '/api/reports/monthly');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.year).toBe(new Date().getFullYear().toString());
    });
  });

  // ─── Bed Occupancy ─────────────────────────────────────────────────
  describe('GET /api/reports/bed-occupancy', () => {
    it('returns bed occupancy data without error', async () => {
      const res = await api('GET', '/api/reports/bed-occupancy');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.totalBeds).toBe('number');
      expect(typeof data.occupancyRate).toBe('number');
      expect(Array.isArray(data.byWard)).toBe(true);
    });
  });

  // ─── Department Revenue ────────────────────────────────────────────
  describe('GET /api/reports/department-revenue', () => {
    it('returns 400 when dates missing', async () => {
      const res = await api('GET', '/api/reports/department-revenue');
      expect(res.status).toBe(400);
    });

    it('returns department revenue data', async () => {
      const res = await api('GET', '/api/reports/department-revenue?startDate=2024-01-01&endDate=2024-12-31');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.totalRevenue).toBe('number');
      expect(Array.isArray(data.byDepartment)).toBe(true);
    });
  });

  // ─── Doctor Performance ────────────────────────────────────────────
  describe('GET /api/reports/doctor-performance', () => {
    it('returns 400 when dates missing', async () => {
      const res = await api('GET', '/api/reports/doctor-performance');
      expect(res.status).toBe(400);
    });

    it('returns doctor performance data', async () => {
      const res = await api('GET', '/api/reports/doctor-performance?startDate=2024-01-01&endDate=2024-12-31');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.doctors)).toBe(true);
    });
  });

  // ─── Auth Enforcement ──────────────────────────────────────────────
  describe('Auth Enforcement', () => {
    it('returns 401 without token', async () => {
      const req = new Request('http://localhost/api/reports/pl?startDate=2024-01-01&endDate=2024-12-31', {
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test' },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(401);
    });
  });
});
