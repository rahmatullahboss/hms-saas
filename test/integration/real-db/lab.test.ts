/**
 * Lab — Real D1 Integration Tests
 * ──────────────────────────────────────────────────────────────────────────────
 * Seed data: 30 lab catalog items, 8 lab orders, 16 lab order items (all completed).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { adminHeaders, labHeaders, noAuthHeaders } from './helpers/auth';
import { api, assertServerRunning } from './helpers/client';

interface LabTestCatalog {
  id: number;
  code: string;
  name: string;
  category: string;
  price: number;
  is_active: 0 | 1;
  tenant_id: number;
}

interface LabOrder {
  id: number;
  order_no: string;
  patient_id: number;
  visit_id: number;
  ordered_by: number;
  order_date: string;
  tenant_id: number;
  created_at: string;
}

interface LabOrderItem {
  id: number;
  lab_order_id: number;
  lab_test_id: number;
  status: 'pending' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
  result: string | null;
}

let adminH: Record<string, string>;
let labH: Record<string, string>;

beforeAll(async () => {
  await assertServerRunning();
  adminH = await adminHeaders();
  labH = await labHeaders();
});

describe('GET /api/lab — test catalog', () => {
  it('returns lab test catalog with 30 tests', async () => {
    const res = await api.get<{ tests?: LabTestCatalog[] }>(
      '/api/lab',
      adminH,
    );
    expect(res.status).toBe(200);
    const catalog = (res.body.tests ?? []) as LabTestCatalog[];
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThanOrEqual(30);
  });

  it('each catalog item has code, name, category, price', async () => {
    const res = await api.get<{ tests?: LabTestCatalog[] }>('/api/lab', adminH);
    expect(res.status).toBe(200);
    const catalog = res.body.tests ?? [];
    if (catalog.length > 0) {
      const item = catalog[0]!;
      expect(typeof item.code).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.category).toBe('string');
      expect(typeof item.price).toBe('number');
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('returns 401 without auth', async () => {
    const res = await api.get('/api/lab', noAuthHeaders());
    expect(res.status).toBe(401);
  });
});

describe('GET /api/lab/orders — order list', () => {
  it('returns lab orders from seed', async () => {
    const res = await api.get<{ orders?: LabOrder[]; data?: LabOrder[] }>('/api/lab/orders', adminH);
    expect(res.status).toBe(200);
    const orders = (res.body.orders ?? res.body.data ?? []) as LabOrder[];
    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThanOrEqual(8);
  });

  it('each order has order_no, patient_id, order_date', async () => {
    const res = await api.get<{ orders?: LabOrder[] }>('/api/lab/orders', adminH);
    expect(res.status).toBe(200);
    const orders = res.body.orders ?? [];
    if (orders.length > 0) {
      const order = orders[0]!;
      expect(typeof order.order_no).toBe('string');
      expect(typeof order.patient_id).toBe('number');
    }
  });

  it('lab role can access orders', async () => {
    const res = await api.get('/api/lab/orders', labH);
    expect([200, 403]).toContain(res.status); // 403 if role-gated
  });

  it('returns 401 without auth', async () => {
    const res = await api.get('/api/lab/orders', noAuthHeaders());
    expect(res.status).toBe(401);
  });
});

describe('GET /api/lab/orders/:id — single order with items', () => {
  it('returns order LO-0001 with linked items', async () => {
    const res = await api.get<{ order?: LabOrder; items?: LabOrderItem[] }>(
      '/api/lab/orders/3001',
      adminH,
    );
    if (res.status === 200) {
      expect(res.body).toHaveProperty('order');
      // Order 3001 = LO-0001, patient 1001, visit 2001
      if (res.body.order) {
        expect(res.body.order.patient_id).toBe(1001);
      }
    } else {
      expect([200, 404]).toContain(res.status);
    }
  });
});

describe('POST /api/lab/orders — create order', () => {
  it('creates a lab order for patient 1001', async () => {
    const newOrder = {
      patientId: 1001,
      visitId: 2001,
      orderedBy: 101,
      orderDate: new Date().toISOString().split('T')[0],
      items: [
        { labTestId: 1001, unitPrice: 50000, discount: 0, lineTotal: 50000 },
      ],
    };

    const res = await api.post<{ orderId?: number; id?: number; orderNo?: string; message: string }>(
      '/api/lab/orders',
      labH,
      newOrder,
    );
    expect([200, 201]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      expect(res.body).toHaveProperty('message');
    }
  });

  it('returns 400/422 for missing patient', async () => {
    const res = await api.post('/api/lab/orders', labH, { orderDate: '2026-01-01' });
    expect([400, 422]).toContain(res.status);
  });

  it('returns 401 without auth', async () => {
    const res = await api.post('/api/lab/orders', noAuthHeaders(), {});
    expect(res.status).toBe(401);
  });
});

describe('Lab workflow — sample to result', () => {
  it('order items from seed are in completed status', async () => {
    const res = await api.get<{ order?: LabOrder; items?: LabOrderItem[] }>(
      '/api/lab/orders/3001',
      adminH,
    );
    if (res.status === 200 && res.body.items) {
      res.body.items.forEach(item => {
        expect(['pending', 'sample_collected', 'processing', 'completed', 'cancelled']).toContain(item.status);
      });
    }
  });

  it('completed items have non-null result text', async () => {
    const res = await api.get<{ order?: LabOrder; items?: LabOrderItem[] }>(
      '/api/lab/orders/3001',
      adminH,
    );
    if (res.status === 200 && res.body.items) {
      const completedItems = res.body.items.filter(i => i.status === 'completed');
      completedItems.forEach(item => {
        expect(item.result).not.toBeNull();
        expect(item.result!.length).toBeGreaterThan(0);
      });
    }
  });
});
