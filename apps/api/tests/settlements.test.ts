/**
 * 🧪 TEA — Settlements API Tests
 * Risk: HIGH — Multi-bill payment, deposit deduction, overpayment guard.
 * Coverage: Pending bills, patient info, create settlement, FIFO distribution, deposit deduction, validation
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
    name: 'Settlement Patient',
    fatherHusband: 'Father',
    address: 'Dhaka',
    mobile: `0173${Date.now().toString().slice(-7)}`,
    gender: 'male',
    age: 45,
  });
  return ((await res.json()) as any).patientId as number;
}

async function createBill(patientId: number, amount: number) {
  const res = await api('POST', '/api/billing', {
    patientId,
    items: [{ itemCategory: 'doctor_visit', description: 'Visit', quantity: 1, unitPrice: amount }],
    discount: 0,
  });
  return ((await res.json()) as any).billId as number;
}

describe('Settlements API', () => {
  let patientId: number;
  let billId1: number;
  let billId2: number;

  beforeEach(async () => {
    patientId = await createPatient();
    billId1 = await createBill(patientId, 1000);
    billId2 = await createBill(patientId, 2000);
  });

  // ─── Pending bills ───────────────────────────────────────────────────────────
  describe('Pending bills', () => {
    it('1. GET /settlements/pending returns open bills', async () => {
      const res = await api('GET', `/api/settlements/pending?patient_id=${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.pending_bills.length).toBe(2);
      expect(data.pending_bills[0].due_amount).toBeGreaterThan(0);
    });

    it('2. Pending bills show correct due_amount', async () => {
      const res = await api('GET', `/api/settlements/pending?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      const total = (data.pending_bills as any[]).reduce((s: number, b: any) => s + b.due_amount, 0);
      expect(total).toBe(3000);
    });
  });

  // ─── Patient info ────────────────────────────────────────────────────────────
  describe('Patient info', () => {
    it('3. Patient info endpoint returns total_due and deposit_balance', async () => {
      const res = await api('GET', `/api/settlements/patient/${patientId}/info`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.total_due).toBe(3000);
      expect(data.deposit_balance).toBe(0);
      expect(data.net_payable).toBe(3000);
    });

    it('4. Patient info reflects deposit balance correctly', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 500 });
      const res = await api('GET', `/api/settlements/patient/${patientId}/info`);
      const data = (await res.json()) as any;
      expect(data.deposit_balance).toBe(500);
      expect(data.net_payable).toBe(2500);
    });

    it('5. Non-existent patient returns 404', async () => {
      const res = await api('GET', '/api/settlements/patient/999999/info');
      expect(res.status).toBe(404);
    });
  });

  // ─── Create settlement ───────────────────────────────────────────────────────
  describe('Create settlement', () => {
    it('6. Settle one bill fully with cash', async () => {
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [billId1],
        paid_amount: 1000,
        deposit_deducted: 0,
        discount_amount: 0,
        payment_mode: 'cash',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.receipt_no).toMatch(/^STL/);
    });

    it('7. Settle both bills in one settlement', async () => {
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [billId1, billId2],
        paid_amount: 3000,
        deposit_deducted: 0,
        discount_amount: 0,
        payment_mode: 'card',
      });
      expect(res.status).toBe(201);
      // After settlement, both bills should appear not in pending
      const pendRes = await api('GET', `/api/settlements/pending?patient_id=${patientId}`);
      const pend = (await pendRes.json()) as any;
      expect(pend.pending_bills.length).toBe(0);
    });

    it('8. Overpayment rejected (400)', async () => {
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [billId1],
        paid_amount: 5000, // Way more than bill
        deposit_deducted: 0,
        discount_amount: 0,
      });
      expect(res.status).toBe(400);
    });

    it('9. Settlement with discount — partial cash', async () => {
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [billId1],
        paid_amount: 800,
        deposit_deducted: 0,
        discount_amount: 200,
        payment_mode: 'cash',
      });
      expect(res.status).toBe(201);
    });

    it('10. Deposit deduction without sufficient balance rejected (400)', async () => {
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [billId1],
        paid_amount: 0,
        deposit_deducted: 1000, // No deposits exist
        discount_amount: 0,
      });
      expect(res.status).toBe(400);
    });

    it('11. Settlement with valid deposit deduction succeeds', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 1000 });
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [billId1],
        paid_amount: 0,
        deposit_deducted: 1000,
        discount_amount: 0,
      });
      expect(res.status).toBe(201);
      // Deposit balance should now be 0
      const balRes = await api('GET', `/api/deposits/balance/${patientId}`);
      const bal = (await balRes.json()) as any;
      expect(bal.balance).toBe(0);
    });

    it('12. Empty bill_ids rejected (400)', async () => {
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [],
        paid_amount: 1000,
      });
      expect(res.status).toBe(400);
    });

    it('13. Bill belonging to different patient rejected (400)', async () => {
      const otherPatient = await createPatient();
      const otherBill = await createBill(otherPatient, 500);
      const res = await api('POST', '/api/settlements', {
        patient_id: patientId,
        bill_ids: [otherBill],
        paid_amount: 500,
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── List ────────────────────────────────────────────────────────────────────
  describe('List settlements', () => {
    it('14. List returns settlements array', async () => {
      await api('POST', '/api/settlements', {
        patient_id: patientId, bill_ids: [billId1], paid_amount: 1000,
        deposit_deducted: 0, discount_amount: 0,
      });
      const res = await api('GET', `/api/settlements?patient_id=${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.settlements.length).toBeGreaterThan(0);
    });
  });
});
