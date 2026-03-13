import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient, createLabTestCatalog } from './helpers/fixtures';
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

async function api(method: string, path: string, body?: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method, headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Lab API', () => {
  let patientId: number;
  let labTestId: number;

  beforeEach(async () => {
    patientId = await createPatient(1, { name: 'Lab Patient', patient_code: 'P-L001' });
  });

  // ─── Catalog CRUD ──────────────────────────────────────────────────────
  describe('Lab Test Catalog', () => {
    it('POST /api/lab — creates lab test with unit/normal_range/method → 201', async () => {
      const res = await api('POST', '/api/lab', {
        code: 'CBC', name: 'Complete Blood Count', category: 'Hematology', price: 500,
        unit: '×10³/µL', normalRange: '4.0-11.0', method: 'Impedance',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.message).toBe('Lab test added');
      labTestId = data.id;
    });

    it('POST /api/lab — creates lab test without optional fields → 201', async () => {
      const res = await api('POST', '/api/lab', {
        code: 'LFT', name: 'Liver Function Test', price: 800,
      });
      expect(res.status).toBe(201);
    });

    it('GET /api/lab — lists active tests', async () => {
      await api('POST', '/api/lab', { code: 'LFT', name: 'Liver Function Test', price: 800 });
      const res = await api('GET', '/api/lab');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.tests)).toBe(true);
      expect(data.tests.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/lab?search=... — filters by name/code', async () => {
      await api('POST', '/api/lab', { code: 'BSR', name: 'Blood Sugar Random', price: 300 });
      const res = await api('GET', '/api/lab?search=sugar');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.tests.some((t: any) => t.code === 'BSR')).toBe(true);
    });

    it('PUT /api/lab/:id — updates lab test with new fields', async () => {
      const createRes = await api('POST', '/api/lab', { code: 'RFT', name: 'Renal Function Test', price: 700 });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/lab/${id}`, { price: 750, unit: 'mg/dL', normalRange: '0.7-1.3' });
      expect(res.status).toBe(200);
    });

    it('PUT /api/lab/:id — 404 for unknown test', async () => {
      const res = await api('PUT', '/api/lab/9999', { price: 100 });
      expect(res.status).toBe(404);
    });

    it('DELETE /api/lab/:id — deactivates test', async () => {
      const createRes = await api('POST', '/api/lab', { code: 'TSH', name: 'TSH Test', price: 600 });
      const { id } = await createRes.json() as any;
      const res = await api('DELETE', `/api/lab/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Lab test deactivated');
    });
  });

  // ─── Lab Orders ────────────────────────────────────────────────────────
  describe('Lab Orders', () => {
    beforeEach(async () => {
      labTestId = await createLabTestCatalog(1, { name: 'Blood Sugar', code: 'BS', price: 300 });
    });

    it('POST /api/lab/orders — creates lab order', async () => {
      const res = await api('POST', '/api/lab/orders', {
        patientId,
        items: [{ labTestId, discount: 0 }],
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.message).toBe('Lab order created');
      expect(data.orderNo).toMatch(/^LO-/);
    });

    it('POST /api/lab/orders — rejects unknown test → 400', async () => {
      const res = await api('POST', '/api/lab/orders', {
        patientId,
        items: [{ labTestId: 9999, discount: 0 }],
      });
      expect(res.status).toBe(400);
    });

    it('GET /api/lab/orders — lists orders with pagination', async () => {
      await api('POST', '/api/lab/orders', { patientId, items: [{ labTestId, discount: 0 }] });
      const res = await api('GET', '/api/lab/orders');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.orders)).toBe(true);
      expect(data.meta).toBeDefined();
    });

    it('GET /api/lab/orders/:id — returns order with items', async () => {
      const createRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId, discount: 0 }],
      });
      const { orderId } = await createRes.json() as any;
      const res = await api('GET', `/api/lab/orders/${orderId}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.order).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBe(1);
    });

    it('GET /api/lab/orders/queue/today — returns today queue', async () => {
      await api('POST', '/api/lab/orders', { patientId, items: [{ labTestId, discount: 0 }] });
      const res = await api('GET', '/api/lab/orders/queue/today');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.queue)).toBe(true);
    });

    it('GET /api/lab/dashboard/stats — returns today stats', async () => {
      await api('POST', '/api/lab/orders', { patientId, items: [{ labTestId, discount: 0 }] });
      const res = await api('GET', '/api/lab/dashboard/stats');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.stats).toBeDefined();
      expect(data.stats.totalToday).toBeGreaterThanOrEqual(1);
      expect(data.stats.pending).toBeGreaterThanOrEqual(1);
    });

    it('PUT /api/lab/items/:itemId/result — enters test result with auto-abnormal detection', async () => {
      // Create test with normal range
      const testRes = await api('POST', '/api/lab', {
        code: 'FBS', name: 'Fasting Blood Sugar', price: 250,
        unit: 'mg/dL', normalRange: '70-100',
      });
      const { id: testId } = await testRes.json() as any;

      const orderRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId: testId, discount: 0 }],
      });
      const { orderId } = await orderRes.json() as any;
      const detailRes = await api('GET', `/api/lab/orders/${orderId}`);
      const detailData = await detailRes.json() as any;
      const itemId = detailData.items[0].id;

      // High result (120 > 100)
      const res = await api('PUT', `/api/lab/items/${itemId}/result`, {
        result: '120 mg/dL', resultNumeric: 120,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Result entered');
      expect(data.abnormalFlag).toBe('high');
    });

    it('PUT /api/lab/items/:itemId/result — detects normal result', async () => {
      const testRes = await api('POST', '/api/lab', {
        code: 'HB', name: 'Hemoglobin', price: 200,
        unit: 'g/dL', normalRange: '12-17',
      });
      const { id: testId } = await testRes.json() as any;

      const orderRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId: testId, discount: 0 }],
      });
      const { orderId } = await orderRes.json() as any;
      const detailRes = await api('GET', `/api/lab/orders/${orderId}`);
      const detailData = await detailRes.json() as any;
      const itemId = detailData.items[0].id;

      const res = await api('PUT', `/api/lab/items/${itemId}/result`, {
        result: '14.5 g/dL', resultNumeric: 14.5,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.abnormalFlag).toBe('normal');
    });

    it('PUT /api/lab/items/:itemId/result — detects critical value', async () => {
      const testRes = await api('POST', '/api/lab', {
        code: 'K', name: 'Potassium', price: 250,
        unit: 'mmol/L', normalRange: '3.5-5.0',
      });
      const { id: testId } = await testRes.json() as any;

      const orderRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId: testId, discount: 0 }],
      });
      const { orderId } = await orderRes.json() as any;
      const detailRes = await api('GET', `/api/lab/orders/${orderId}`);
      const detailData = await detailRes.json() as any;
      const itemId = detailData.items[0].id;

      // Critical: 7.0 > 6.5 (5.0 + 1.5 range)
      const res = await api('PUT', `/api/lab/items/${itemId}/result`, {
        result: '7.0 mmol/L', resultNumeric: 7.0,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.abnormalFlag).toBe('critical');
    });

    it('PUT /api/lab/items/:itemId/sample-status — advances ordered → collected', async () => {
      const orderRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId, discount: 0 }],
      });
      const { orderId } = await orderRes.json() as any;
      const detailRes = await api('GET', `/api/lab/orders/${orderId}`);
      const detailData = await detailRes.json() as any;
      const itemId = detailData.items[0].id;

      const res = await api('PUT', `/api/lab/items/${itemId}/sample-status`, { sampleStatus: 'collected' });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toContain('collected');
    });

    it('PUT /api/lab/items/:itemId/sample-status — rejects invalid transition', async () => {
      const orderRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId, discount: 0 }],
      });
      const { orderId } = await orderRes.json() as any;
      const detailRes = await api('GET', `/api/lab/orders/${orderId}`);
      const detailData = await detailRes.json() as any;
      const itemId = detailData.items[0].id;

      // Can't go from ordered → completed directly
      const res = await api('PUT', `/api/lab/items/${itemId}/sample-status`, { sampleStatus: 'completed' });
      expect(res.status).toBe(400);
    });

    it('POST /api/lab/orders/:id/print — increments print count', async () => {
      const orderRes = await api('POST', '/api/lab/orders', {
        patientId, items: [{ labTestId, discount: 0 }],
      });
      const { orderId } = await orderRes.json() as any;
      const res = await api('POST', `/api/lab/orders/${orderId}/print`);
      expect(res.status).toBe(200);
    });
  });
});
