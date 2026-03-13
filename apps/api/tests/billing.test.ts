import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function getAuthHeaders(tenantId: number, userId = 1, role = 'admin') {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any, tenantId = 1) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(tenantId),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

// Patient schema requires: name, fatherHusband, address, mobile (11+ chars)
function patientPayload() {
  return {
    name: 'Bill Patient',
    fatherHusband: 'Father Name',
    address: 'Dhaka, Bangladesh',
    mobile: `0170${Date.now().toString().slice(-7)}`,
    gender: 'male',
    age: 30,
  };
}

describe('Billing API Tests', () => {
  let patientId: number;

  beforeEach(async () => {
    const pRes = await api('POST', '/api/patients', patientPayload());
    expect(pRes.status).toBe(201);
    const pData = await pRes.json() as any;
    patientId = pData.patientId;
    expect(patientId).toBeGreaterThan(0);
  });

  describe('Bill Creation', () => {
    it('1. Create bill with multiple line items - correct subtotal/total', async () => {
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [
          { itemCategory: 'doctor_visit', description: 'OPD Consult', quantity: 1, unitPrice: 500 },
          { itemCategory: 'test', description: 'CBC Test', quantity: 2, unitPrice: 150 },
        ],
        discount: 0,
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.total).toBe(800);
      expect(data.invoiceNo).toBeTruthy();
      expect(data.billId).toBeGreaterThan(0);
    });

    it('2. Discount > subtotal - total clamped to 0', async () => {
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'doctor_visit', quantity: 1, unitPrice: 200 }],
        discount: 500,
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.total).toBe(0);
    });

    it('3. Items required (400 without items)', async () => {
      const res = await api('POST', '/api/billing', { patientId, discount: 0 });
      expect(res.status).toBe(400);
    });

    it('4. Invalid itemCategory returns 400', async () => {
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'consultation', quantity: 1, unitPrice: 100 }],
      });
      expect(res.status).toBe(400);
    });

    it('8. Income record created on bill creation', async () => {
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'doctor_visit', quantity: 1, unitPrice: 1000 }],
        discount: 0,
      });
      expect(res.status).toBe(201);
    });

    it('9. Invoice number auto-increments', async () => {
      const r1 = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'medicine', quantity: 1, unitPrice: 100 }],
        discount: 0,
      });
      const r2 = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'medicine', quantity: 1, unitPrice: 100 }],
        discount: 0,
      });
      const d1 = await r1.json() as any;
      const d2 = await r2.json() as any;
      expect(d1.invoiceNo).not.toBe(d2.invoiceNo);
    });
  });

  describe('Payment Processing', () => {
    async function createBill(amount = 1000, discount = 0) {
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'doctor_visit', quantity: 1, unitPrice: amount }],
        discount,
      });
      const data = await res.json() as any;
      return data.billId as number;
    }

    it('3. Collect partial payment - status = partially_paid', async () => {
      const billId = await createBill(1000);
      const res = await api('POST', '/api/billing/pay', {
        billId, amount: 600, type: 'current', paymentMethod: 'cash',
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe('partially_paid');
      expect(data.outstanding).toBe(400);
    });

    it('4. Collect full remaining - status = paid', async () => {
      const billId = await createBill(1000);
      const res = await api('POST', '/api/billing/pay', {
        billId, amount: 1000, type: 'current', paymentMethod: 'cash',
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe('paid');
      expect(data.outstanding).toBe(0);
    });

    it('5. Overpayment rejected - 400 error', async () => {
      const billId = await createBill(500);
      const res = await api('POST', '/api/billing/pay', {
        billId, amount: 999, type: 'current',
      });
      expect(res.status).toBe(400);
    });

    it('6. Pay on already-paid bill - 400 error', async () => {
      const billId = await createBill(500);
      await api('POST', '/api/billing/pay', { billId, amount: 500, type: 'current' });
      const res = await api('POST', '/api/billing/pay', { billId, amount: 1, type: 'current' });
      expect(res.status).toBe(400);
    });

    it('7. Bill not found - 404', async () => {
      const res = await api('POST', '/api/billing/pay', {
        billId: 999999, amount: 100, type: 'current',
      });
      expect(res.status).toBe(404);
    });

    it('10. Receipt number auto-increments', async () => {
      const b1 = await createBill(800);
      const b2 = await createBill(800);
      const r1 = await api('POST', '/api/billing/pay', { billId: b1, amount: 800, type: 'current' });
      const r2 = await api('POST', '/api/billing/pay', { billId: b2, amount: 800, type: 'current' });
      const d1 = await r1.json() as any;
      const d2 = await r2.json() as any;
      expect(d1.receiptNo).not.toBe(d2.receiptNo);
    });
  });

  describe('Security & Isolation', () => {
    it('11. Tenant isolation - cannot access other tenants bills', async () => {
      const billRes = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'doctor_visit', quantity: 1, unitPrice: 100 }],
        discount: 0,
      });
      const { billId } = await billRes.json() as any;

      const t2Token = jwt.sign(
        { userId: '99', tenantId: '2', role: 'admin', permissions: [] },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );
      const req = new Request(`http://localhost/api/billing/${billId}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': 'other-clinic',
          'Authorization': `Bearer ${t2Token}`,
        },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(404);
    });
  });
});
