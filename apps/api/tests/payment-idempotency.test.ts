import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function getAuthHeaders(tenantId: number, userId = 1, role = 'admin', subdomain = 'test') {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': subdomain,
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: unknown, tenantId = 1, subdomain = 'test') {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(tenantId, 1, 'admin', subdomain),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

/** Create patient + bill, return billId for payment tests */
async function createBillFixture(tenantId = 1, subdomain = 'test'): Promise<number> {
  // Create patient
  const pRes = await api('POST', '/api/patients', {
    name: 'Idempotency Test Patient',
    fatherHusband: 'Test Father',
    address: 'Dhaka',
    mobile: `0171${Date.now().toString().slice(-7)}`,
    gender: 'male',
    age: 25,
  }, tenantId, subdomain);
  const { patientId } = await pRes.json() as any;

  // Create bill
  const bRes = await api('POST', '/api/billing', {
    patientId,
    items: [{ itemCategory: 'doctor_visit', description: 'OPD', quantity: 1, unitPrice: 1000 }],
    discount: 0,
  }, tenantId, subdomain);
  const { billId } = await bRes.json() as any;
  return billId;
}

describe('Payment Idempotency Tests', () => {
  let billId: number;

  beforeEach(async () => {
    billId = await createBillFixture();
  });

  it('1. Normal payment without idempotency key — works as before', async () => {
    const res = await api('POST', '/api/billing/pay', {
      billId,
      amount: 500,
      type: 'current',
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.receiptNo).toBeTruthy();
    expect(data.paidAmount).toBe(500);
    expect(data.idempotent).toBeUndefined();
  });

  it('2. Payment with idempotency key — first submission creates payment', async () => {
    const idempotencyKey = crypto.randomUUID();
    const res = await api('POST', '/api/billing/pay', {
      billId,
      amount: 500,
      type: 'current',
      idempotencyKey,
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.receiptNo).toBeTruthy();
    expect(data.paidAmount).toBe(500);
    expect(data.idempotent).toBeUndefined(); // Not a duplicate
  });

  it('3. Duplicate submission with same idempotency key — returns existing payment (idempotent)', async () => {
    const idempotencyKey = crypto.randomUUID();
    const body = { billId, amount: 500, type: 'current', idempotencyKey };

    // First submission
    const res1 = await api('POST', '/api/billing/pay', body);
    expect(res1.status).toBe(200);
    const data1 = await res1.json() as any;
    const firstReceiptNo = data1.receiptNo;

    // Second submission — should be idempotent
    const res2 = await api('POST', '/api/billing/pay', body);
    expect(res2.status).toBe(200);
    const data2 = await res2.json() as any;

    // Must return the SAME receipt number (no new payment created)
    expect(data2.receiptNo).toBe(firstReceiptNo);
    expect(data2.idempotent).toBe(true);
    expect(data2.message).toContain('already recorded');
  });

  it('4. Same idempotency key sent sequentially — still only 1 payment in DB', async () => {
    const billId2 = await createBillFixture();
    const idempotencyKey = crypto.randomUUID();
    const body = { billId: billId2, amount: 200, type: 'current', idempotencyKey };

    // Send 5 times sequentially (SQLite in D1 is not safe for concurrent idempotency without unique index)
    let firstReceiptNo: string | undefined;
    for (let i = 0; i < 5; i++) {
      const r = await api('POST', '/api/billing/pay', body);
      expect(r.status).toBe(200);
      const d = await r.json() as any;
      if (i === 0) {
        firstReceiptNo = d.receiptNo;
        expect(d.idempotent).toBeUndefined();
      } else {
        // Subsequent requests return the existing payment
        expect(d.receiptNo).toBe(firstReceiptNo);
        expect(d.idempotent).toBe(true);
      }
    }

    // Verify only 1 payment exists in the DB
    const listRes = await api('GET', `/api/billing/${billId2}`);
    const { payments } = await listRes.json() as any;
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(200);
  });

  it('5. Different idempotency key on same bill — creates separate payment', async () => {
    const billId2 = await createBillFixture();

    // First payment: 300
    const res1 = await api('POST', '/api/billing/pay', {
      billId: billId2, amount: 300, type: 'current',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(res1.status).toBe(200);

    // Second payment: 200 with different key
    const res2 = await api('POST', '/api/billing/pay', {
      billId: billId2, amount: 200, type: 'due',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(res2.status).toBe(200);

    // Both payments should exist
    const listRes = await api('GET', `/api/billing/${billId2}`);
    const { payments } = await listRes.json() as any;
    expect(payments).toHaveLength(2);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    expect(totalPaid).toBe(500);
  });

  it('6. Tenant isolation — idempotency key from tenant A cannot affect tenant B', async () => {
    const billId1 = await createBillFixture(1, 'test');
    const billId2 = await createBillFixture(2, 'test-2');
    const idempotencyKey = crypto.randomUUID();

    // Tenant 1 pays with key
    const res1 = await api('POST', '/api/billing/pay', {
      billId: billId1, amount: 500, type: 'current', idempotencyKey,
    }, 1, 'test');
    expect(res1.status).toBe(200);
    const data1 = await res1.json() as any;
    expect(data1.idempotent).toBeUndefined(); // First time for tenant 1

    // Tenant 2 sends same idempotency key — per DB design key is scoped per
    // tenant_id, so this should create a NEW payment for tenant 2
    const res2 = await api('POST', '/api/billing/pay', {
      billId: billId2, amount: 300, type: 'current', idempotencyKey,
    }, 2, 'test-2');
    expect(res2.status).toBe(200);
    const data2 = await res2.json() as any;
    expect(data2.idempotent).toBeUndefined(); // Not treated as duplicate in tenant 2

    // They are separate payments (different amounts prove it)
    expect(data1.paidAmount).toBe(500);
    expect(data2.paidAmount).toBe(300);
  });
});
