/**
 * 🧪 TEA — Credit Notes API Tests
 * Risk: HIGH — Reverses revenue; over-return = financial loss.
 * Coverage: Create, quantity guard, invoice lookup, return limit, tenant isolation
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
    name: 'CN Patient',
    fatherHusband: 'Father',
    address: 'Dhaka',
    mobile: `0172${Date.now().toString().slice(-7)}`,
    gender: 'female',
    age: 28,
  });
  return ((await res.json()) as any).patientId as number;
}

async function createBillAndGetItems(patientId: number) {
  const billRes = await api('POST', '/api/billing', {
    patientId,
    items: [
      { itemCategory: 'medicine', description: 'Paracetamol', quantity: 3, unitPrice: 100 },
      { itemCategory: 'doctor_visit', description: 'OPD Consult', quantity: 1, unitPrice: 500 },
    ],
    discount: 0,
  });
  const bill = (await billRes.json()) as any;
  const invoiceRes = await api('GET', `/api/credit-notes/invoice/${bill.billId}`);
  const inv = (await invoiceRes.json()) as any;
  return { billId: bill.billId as number, items: inv.items as any[] };
}

describe('Credit Notes API', () => {
  let patientId: number;
  let billId: number;
  let items: any[];

  beforeEach(async () => {
    patientId = await createPatient();
    ({ billId, items } = await createBillAndGetItems(patientId));
  });

  // ─── Invoice lookup ──────────────────────────────────────────────────────────
  describe('Invoice lookup', () => {
    it('1. GET /invoice/:billId returns bill + items with available_qty', async () => {
      const res = await api('GET', `/api/credit-notes/invoice/${billId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.bill).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBe(2);
      // First item (qty=3) should have available_qty=3
      const medicine = data.items.find((i: any) => i.description === 'Paracetamol');
      expect(medicine.available_qty).toBe(3);
    });

    it('2. Invoice for non-existent bill returns 404', async () => {
      const res = await api('GET', '/api/credit-notes/invoice/999999');
      expect(res.status).toBe(404);
    });
  });

  // ─── Create credit note ──────────────────────────────────────────────────────
  describe('Create credit note', () => {
    it('3. Return 1-of-3 items — correct refund amount calculated', async () => {
      const medicine = items.find(i => i.description === 'Paracetamol');
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId,
        patient_id: patientId,
        reason: 'Medication not needed',
        items: [{ invoice_item_id: medicine.id, return_quantity: 1 }],
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.credit_note_no).toMatch(/^CN/);
      expect(data.refund_amount).toBe(100); // 1 × ৳100
    });

    it('4. Return all 3 medicine items — full medicine refund', async () => {
      const medicine = items.find(i => i.description === 'Paracetamol');
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId,
        patient_id: patientId,
        reason: 'All returned',
        items: [{ invoice_item_id: medicine.id, return_quantity: 3 }],
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.refund_amount).toBe(300);
    });

    it('5. Returning more than available quantity rejected (400)', async () => {
      const medicine = items.find(i => i.description === 'Paracetamol');
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId,
        patient_id: patientId,
        reason: 'Over-return',
        items: [{ invoice_item_id: medicine.id, return_quantity: 10 }],
      });
      expect(res.status).toBe(400);
    });

    it('6. Second return reduces available_qty correctly', async () => {
      const medicine = items.find(i => i.description === 'Paracetamol');
      // Return 1
      await api('POST', '/api/credit-notes', {
        bill_id: billId, patient_id: patientId, reason: 'Return 1',
        items: [{ invoice_item_id: medicine.id, return_quantity: 1 }],
      });
      // Check available = 2
      const invRes = await api('GET', `/api/credit-notes/invoice/${billId}`);
      const inv = (await invRes.json()) as any;
      const med2 = inv.items.find((i: any) => i.description === 'Paracetamol');
      expect(med2.available_qty).toBe(2);
      // Return 3 now should fail
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId, patient_id: patientId, reason: 'Over after partial',
        items: [{ invoice_item_id: medicine.id, return_quantity: 3 }],
      });
      expect(res.status).toBe(400);
    });

    it('7. Credit note for wrong patient rejected (404)', async () => {
      const wrongPatientId = await createPatient();
      const medicine = items.find(i => i.description === 'Paracetamol');
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId,
        patient_id: wrongPatientId,
        reason: 'Wrong patient',
        items: [{ invoice_item_id: medicine.id, return_quantity: 1 }],
      });
      expect(res.status).toBe(404);
    });

    it('8. Empty items array rejected (400)', async () => {
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId, patient_id: patientId, reason: 'Empty', items: [],
      });
      expect(res.status).toBe(400);
    });

    it('9. Missing reason rejected (400)', async () => {
      const medicine = items.find(i => i.description === 'Paracetamol');
      const res = await api('POST', '/api/credit-notes', {
        bill_id: billId, patient_id: patientId, reason: '',
        items: [{ invoice_item_id: medicine.id, return_quantity: 1 }],
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── List ────────────────────────────────────────────────────────────────────
  describe('List credit notes', () => {
    it('10. List returns credit_notes array', async () => {
      const medicine = items.find(i => i.description === 'Paracetamol');
      await api('POST', '/api/credit-notes', {
        bill_id: billId, patient_id: patientId, reason: 'Listed return',
        items: [{ invoice_item_id: medicine.id, return_quantity: 1 }],
      });
      const res = await api('GET', `/api/credit-notes?patient_id=${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.credit_notes)).toBe(true);
      expect(data.credit_notes.length).toBeGreaterThan(0);
    });
  });

  // ─── Tenant isolation ────────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('11. Cross-tenant access blocked (403 or 404)', async () => {
      // Tenant middleware blocks cross-tenant requests with 403
      const res = await api('GET', `/api/credit-notes/invoice/${billId}`, undefined, 2);
      expect([403, 404].includes(res.status)).toBe(true);
    });
  });
});
