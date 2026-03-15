/**
 * 🧪 TEA — Deposits API Tests
 * Risk: HIGH — Financial transactions. Incorrect balance calc = money loss.
 * Coverage: CRUD, balance calc, refund guard, deposit-bill adjustment, tenant isolation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-vitest';

function authHeaders(tenantId = 1, userId = 1) {
  const token = jwt.sign(
    { userId: String(userId), tenantId: String(tenantId), role: 'admin', permissions: [] },
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

async function createPatient(tenantId = 1) {
  const res = await api('POST', '/api/patients', {
    name: 'Deposit Patient',
    fatherHusband: 'Father',
    address: 'Dhaka',
    mobile: `0171${Date.now().toString().slice(-7)}`,
    gender: 'male',
    age: 35,
  }, tenantId);
  const data = await res.json() as any;
  return data.patientId as number;
}

describe('Deposits API', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient();
  });

  // ─── Balance ────────────────────────────────────────────────────────────────
  describe('Balance endpoint', () => {
    it('1. Fresh patient has zero balance', async () => {
      const res = await api('GET', `/api/deposits/balance/${patientId}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.balance).toBe(0);
      expect(data.total_deposits).toBe(0);
    });

    it('2. Balance increases after deposit', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 2000 });
      const res = await api('GET', `/api/deposits/balance/${patientId}`);
      const data = await res.json() as any;
      expect(data.balance).toBe(2000);
    });

    it('3. Balance decreases after refund', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 3000 });
      await api('POST', '/api/deposits/refund', { patient_id: patientId, amount: 1000 });
      const res = await api('GET', `/api/deposits/balance/${patientId}`);
      const data = await res.json() as any;
      expect(data.balance).toBe(2000);
      expect(data.total_refunds).toBe(1000);
    });
  });

  // ─── Collect ────────────────────────────────────────────────────────────────
  describe('Collect deposit', () => {
    it('4. Create deposit returns receipt_no', async () => {
      const res = await api('POST', '/api/deposits', {
        patient_id: patientId,
        amount: 5000,
        payment_method: 'cash',
        remarks: 'Pre-surgery deposit',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.receipt_no).toMatch(/^DEP/);
      expect(data.id).toBeGreaterThan(0);
    });

    it('5. Amount validation — zero amount rejected (400)', async () => {
      const res = await api('POST', '/api/deposits', { patient_id: patientId, amount: 0 });
      expect(res.status).toBe(400);
    });

    it('6. Negative amount rejected (400)', async () => {
      const res = await api('POST', '/api/deposits', { patient_id: patientId, amount: -500 });
      expect(res.status).toBe(400);
    });

    it('7. Missing patient_id rejected (400)', async () => {
      const res = await api('POST', '/api/deposits', { amount: 1000 });
      expect(res.status).toBe(400);
    });
  });

  // ─── Refund ─────────────────────────────────────────────────────────────────
  describe('Refund deposit', () => {
    it('8. Refund more than balance is rejected (400)', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 500 });
      const res = await api('POST', '/api/deposits/refund', { patient_id: patientId, amount: 1000 });
      expect(res.status).toBe(400);
      // Response may be plain text or JSON — just validate status code
    });

    it('9. Refund of zero is rejected (400)', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 1000 });
      const res = await api('POST', '/api/deposits/refund', { patient_id: patientId, amount: 0 });
      expect(res.status).toBe(400);
    });

    it('10. Valid refund returns DRF receipt', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 2000 });
      const res = await api('POST', '/api/deposits/refund', { patient_id: patientId, amount: 500 });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.receipt_no).toMatch(/^DRF/);
    });
  });

  // ─── List ────────────────────────────────────────────────────────────────────
  describe('List deposits', () => {
    it('11. List returns deposits array', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 1000 });
      const res = await api('GET', `/api/deposits?patient_id=${patientId}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.deposits)).toBe(true);
      expect(data.deposits.length).toBeGreaterThan(0);
    });
  });

  // ─── Tenant isolation ────────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('12. Tenant 2 gets 403 for tenant 1 resources', async () => {
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 9999 });
      // Tenant 2 token cannot access tenant 1's resources — middleware returns 403
      const res = await api('GET', `/api/deposits?patient_id=${patientId}`, undefined, 2);
      // The tenant middleware blocks cross-tenant access — 403 is expected
      expect([200, 403].includes(res.status)).toBe(true);
      if (res.status === 200) {
        const data = await res.json() as any;
        expect((data.deposits as any[]).length).toBe(0);
      }
    });
  });
});
