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

function directorHeaders() {
  const token = jwt.sign(
    { userId: '2', tenantId: '1', role: 'director', permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', 'Authorization': `Bearer ${token}` };
}

async function api(method: string, path: string, body?: unknown, asDirector = false) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: asDirector ? directorHeaders() : authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Expenses API', () => {
  describe('POST /api/expenses — create', () => {
    it('creates small expense (auto-approved) → 201 with status=approved', async () => {
      const res = await api('POST', '/api/expenses', {
        date: '2026-03-13', category: 'utilities', amount: 5000, description: 'Electricity bill',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.status).toBe('approved');
    });

    it('creates large expense (>10000) → status=pending (needs approval)', async () => {
      const res = await api('POST', '/api/expenses', {
        date: '2026-03-13', category: 'equipment', amount: 50000, description: 'X-Ray machine',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.status).toBe('pending');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await api('POST', '/api/expenses', { amount: 1000 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/expenses — list', () => {
    it('returns expenses list', async () => {
      await api('POST', '/api/expenses', { date: '2026-03-13', category: 'rent', amount: 8000 });
      const res = await api('GET', '/api/expenses');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.expenses)).toBe(true);
    });

    it('filters by category', async () => {
      await api('POST', '/api/expenses', { date: '2026-03-13', category: 'rent', amount: 5000 });
      await api('POST', '/api/expenses', { date: '2026-03-13', category: 'salaries', amount: 3000 });
      const res = await api('GET', '/api/expenses?category=rent');
      const data = await res.json() as any;
      expect(data.expenses.every((e: any) => e.category === 'rent')).toBe(true);
    });
  });

  describe('GET /api/expenses/:id', () => {
    it('returns single expense', async () => {
      const createRes = await api('POST', '/api/expenses', { date: '2026-03-13', category: 'supplies', amount: 2000 });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/expenses/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.expense.amount).toBe(2000);
    });

    it('returns 404 for unknown expense', async () => {
      const res = await api('GET', '/api/expenses/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('Approval Workflow', () => {
    it('director can approve pending expense → 200', async () => {
      const createRes = await api('POST', '/api/expenses', {
        date: '2026-03-13', category: 'equipment', amount: 20000,
      });
      const { id } = await createRes.json() as any;
      const res = await api('POST', `/api/expenses/${id}/approve`, undefined, true);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });

    it('non-director cannot approve → 403', async () => {
      const createRes = await api('POST', '/api/expenses', {
        date: '2026-03-13', category: 'equipment', amount: 20000,
      });
      const { id } = await createRes.json() as any;
      const res = await api('POST', `/api/expenses/${id}/approve`, undefined, false);
      expect(res.status).toBe(403);
    });

    it('director can reject pending expense → 200', async () => {
      const createRes = await api('POST', '/api/expenses', {
        date: '2026-03-13', category: 'equipment', amount: 15000,
      });
      const { id } = await createRes.json() as any;
      const res = await api('POST', `/api/expenses/${id}/reject`, undefined, true);
      expect(res.status).toBe(200);
    });

    it('GET /api/expenses/pending — director only', async () => {
      const res = await api('GET', '/api/expenses/pending', undefined, true);
      expect(res.status).toBe(200);
    });

    it('GET /api/expenses/pending — non-director gets 403', async () => {
      const res = await api('GET', '/api/expenses/pending', undefined, false);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/expenses/:id — update approved expense', () => {
    it('updates an approved expense', async () => {
      const createRes = await api('POST', '/api/expenses', { date: '2026-03-13', category: 'supplies', amount: 3000 });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/expenses/${id}`, { amount: 3500 });
      expect(res.status).toBe(200);
    });

    it('cannot update a pending expense → 400', async () => {
      const createRes = await api('POST', '/api/expenses', { date: '2026-03-13', category: 'equipment', amount: 50000 });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/expenses/${id}`, { amount: 60000 });
      expect(res.status).toBe(400);
    });
  });
});
