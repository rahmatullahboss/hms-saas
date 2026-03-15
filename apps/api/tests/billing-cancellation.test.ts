/**
 * 🧪 TEA — Billing Cancellation API Tests
 * Risk: HIGH — Revenue reversal, bill integrity, cascading item updates.
 * Coverage: Bill cancel, item cancel, batch cancel, provisional cancel,
 *   double-cancel guard, total recalculation, validation, tenant isolation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-vitest';

function authHeaders(tenantId = 1) {
  const token = jwt.sign(
    { userId: '1', tenantId: String(tenantId), role: 'admin', permissions: [] },
    SECRET,
    { expiresIn: '1h' },
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', Authorization: `Bearer ${token}` };
}

async function api(method: string, path: string, body?: any, tenantId = 1) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(tenantId),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function createPatient() {
  const res = await api('POST', '/api/patients', {
    name: 'Cancel Patient',
    mobile: `0175${Date.now().toString().slice(-7)}`,
    fatherHusband: 'Test Father',
    address: 'Test Address',
    gender: 'male',
    age: 30,
  });
  return ((await res.json()) as any).patientId as number;
}

async function createBillWithItems(patientId: number) {
  const res = await api('POST', '/api/billing', {
    patientId,
    items: [
      { itemCategory: 'doctor_visit', description: 'OPD Consult', quantity: 1, unitPrice: 500 },
      { itemCategory: 'medicine', description: 'Paracetamol', quantity: 2, unitPrice: 100 },
    ],
    discount: 0,
  });
  const data = (await res.json()) as any;
  return data.billId as number;
}

async function getInvoiceItems(billId: number) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM invoice_items WHERE bill_id = ? AND tenant_id = 1'
  ).bind(billId).all<any>();
  return results;
}

describe('Billing Cancellation API', () => {
  let patientId: number;
  let billId: number;

  beforeEach(async () => {
    patientId = await createPatient();
    billId = await createBillWithItems(patientId);
  });

  // ─── Cancel Entire Bill ─────────────────────────────────────────────────────
  describe('Cancel entire bill', () => {
    it('1. PUT /bill/:id cancels bill and all items', async () => {
      const res = await api('PUT', `/api/billing/cancellation/bill/${billId}`, {
        reason: 'Patient left without payment',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.bill_id).toBe(billId);
    });

    it('2. Double-cancel → 400', async () => {
      await api('PUT', `/api/billing/cancellation/bill/${billId}`, { reason: 'First' });
      const res = await api('PUT', `/api/billing/cancellation/bill/${billId}`, { reason: 'Second' });
      expect(res.status).toBe(400);
    });

    it('3. Cancel non-existent bill → 404', async () => {
      const res = await api('PUT', '/api/billing/cancellation/bill/999999', { reason: 'Test' });
      expect(res.status).toBe(404);
    });

    it('4. Cancel without reason → 400', async () => {
      const res = await api('PUT', `/api/billing/cancellation/bill/${billId}`, { reason: '' });
      expect(res.status).toBe(400);
    });
  });

  // ─── Cancel Single Item ────────────────────────────────────────────────────
  describe('Cancel single item', () => {
    it('5. Cancel one invoice item — recalculates bill total', async () => {
      const items = await getInvoiceItems(billId);
      const consultItem = items.find(i => i.description === 'OPD Consult');
      const res = await api('PUT', '/api/billing/cancellation/item', {
        invoice_item_id: consultItem.id,
        reason: 'Service not performed',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      // Should recalculate: only Paracetamol 2×100 = 200 remains
      expect(data.new_bill_total).toBe(200);
    });

    it('6. Cancel already-cancelled item → 400', async () => {
      const items = await getInvoiceItems(billId);
      await api('PUT', '/api/billing/cancellation/item', {
        invoice_item_id: items[0].id,
        reason: 'First',
      });
      const res = await api('PUT', '/api/billing/cancellation/item', {
        invoice_item_id: items[0].id,
        reason: 'Second',
      });
      expect(res.status).toBe(400);
    });

    it('7. Cancel non-existent item → 404', async () => {
      const res = await api('PUT', '/api/billing/cancellation/item', {
        invoice_item_id: 999999,
        reason: 'Test',
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Batch Cancel Items ────────────────────────────────────────────────────
  describe('Batch cancel items', () => {
    it('8. Cancel multiple items in batch', async () => {
      const items = await getInvoiceItems(billId);
      const ids = items.map(i => i.id);
      const res = await api('PUT', '/api/billing/cancellation/items/batch', {
        invoice_item_ids: ids,
        reason: 'Batch cancellation',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.message).toContain('2 items cancelled');
    });

    it('9. Empty ids array → 400', async () => {
      const res = await api('PUT', '/api/billing/cancellation/items/batch', {
        invoice_item_ids: [],
        reason: 'Empty',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Cancel Provisional Item ───────────────────────────────────────────────
  describe('Cancel provisional item', () => {
    it('10. Cancel provisional IPD item', async () => {
      // Insert a provisional item directly
      const result = await env.DB.prepare(`
        INSERT INTO billing_provisional_items (tenant_id, patient_id, item_category, item_name, unit_price, quantity, total_amount, created_by)
        VALUES (1, ?, 'medicine', 'Test Med', 100, 1, 100, 1)
      `).bind(patientId).run();
      const provId = result.meta.last_row_id;

      const res = await api('PUT', `/api/billing/cancellation/provisional/${provId}`, {
        reason: 'Not needed',
      });
      expect(res.status).toBe(200);
    });

    it('11. Cancel non-existent or already processed provisional → 404', async () => {
      const res = await api('PUT', '/api/billing/cancellation/provisional/999999', {
        reason: 'Test',
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('12. Cancel bill from different tenant → 404', async () => {
      const res = await api('PUT', `/api/billing/cancellation/bill/${billId}`, {
        reason: 'Cross-tenant',
      }, 2);
      expect([403, 404].includes(res.status)).toBe(true);
    });
  });
});
