import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders() {
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

async function api(method: string, path: string, body?: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function seedCategory(db: D1Database): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO expense_categories (name, code, is_recurring_eligible, tenant_id) VALUES ('Utilities', 'UTIL', 1, 1)`,
    )
    .run();
  return res.meta.last_row_id as number;
}

describe('Recurring Expenses API — /api/recurring', () => {
  let categoryId: number;
  const nextRunDate = '2026-04-01';

  beforeEach(async () => {
    categoryId = await seedCategory(env.DB as D1Database);
  });

  describe('GET /api/recurring', () => {
    it('returns empty list initially', async () => {
      const res = await api('GET', '/api/recurring');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.recurringExpenses)).toBe(true);
    });

    it('filters by isActive', async () => {
      await api('POST', '/api/recurring', {
        category_id: categoryId,
        amount: 5000,
        frequency: 'monthly',
        next_run_date: nextRunDate,
      });
      const res = await api('GET', '/api/recurring?isActive=true');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.recurringExpenses)).toBe(true);
    });
  });

  describe('POST /api/recurring', () => {
    it('creates a recurring expense', async () => {
      const res = await api('POST', '/api/recurring', {
        category_id: categoryId,
        amount: 10000,
        description: 'Monthly electricity',
        frequency: 'monthly',
        next_run_date: nextRunDate,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(typeof data.id).toBe('number');
      expect(data.success).toBe(true);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await api('POST', '/api/recurring', {
        category_id: categoryId,
        frequency: 'monthly',
        // missing amount and next_run_date
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid frequency', async () => {
      const res = await api('POST', '/api/recurring', {
        category_id: categoryId,
        amount: 5000,
        frequency: 'quarterly', // invalid
        next_run_date: nextRunDate,
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent category', async () => {
      const res = await api('POST', '/api/recurring', {
        category_id: 999999,
        amount: 5000,
        frequency: 'weekly',
        next_run_date: nextRunDate,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/recurring/:id', () => {
    it('returns a specific recurring expense', async () => {
      const createRes = await api('POST', '/api/recurring', {
        category_id: categoryId,
        amount: 3000,
        frequency: 'weekly',
        next_run_date: nextRunDate,
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('GET', `/api/recurring/${id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.recurringExpense.id).toBe(id);
    });

    it('returns 404 for non-existent recurring expense', async () => {
      const res = await api('GET', '/api/recurring/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/recurring/:id', () => {
    it('updates a recurring expense', async () => {
      const createRes = await api('POST', '/api/recurring', {
        category_id: categoryId,
        amount: 4000,
        frequency: 'monthly',
        next_run_date: nextRunDate,
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/recurring/${id}`, { amount: 5000 });
      expect([200, 201]).toContain(res.status);
    });
  });
});
