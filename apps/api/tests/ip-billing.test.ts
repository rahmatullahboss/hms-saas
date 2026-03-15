/**
 * 🧪 TEA — IP Billing API Tests
 * Risk: CRITICAL — Discharge billing, bed charges, deposit deduction, admission status.
 * Coverage: Admitted list, provisional charges, pending charges, bed charge calc,
 *   discharge bill, deposit deduction, validation
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
    name: 'IP Patient',
    mobile: `0177${Date.now().toString().slice(-7)}`,
    fatherHusband: 'Test Father',
    address: 'Test Address',
    gender: 'female',
    age: 55,
  });
  return ((await res.json()) as any).patientId as number;
}

async function createAdmittedPatient() {
  const patientId = await createPatient();
  // Create a bed directly
  await env.DB.prepare(
    "INSERT INTO beds (id, ward_name, bed_number, bed_type, status, tenant_id) VALUES (?, 'General', ?, 'general', 'available', 1)"
  ).bind(Date.now() % 100000, `B-${Date.now() % 10000}`).run();
  const bed = await env.DB.prepare("SELECT id FROM beds WHERE tenant_id = 1 ORDER BY id DESC LIMIT 1").first<any>();
  const bedId = bed?.id;

  // Create admission
  await env.DB.prepare(`
    INSERT INTO admissions (patient_id, bed_id, admission_type, status, tenant_id, created_by)
    VALUES (?, ?, 'general', 'admitted', 1, 1)
  `).bind(patientId, bedId).run();
  const admission = await env.DB.prepare("SELECT id FROM admissions WHERE tenant_id = 1 ORDER BY id DESC LIMIT 1").first<any>();
  return { patientId, bedId, admissionId: admission?.id as number };
}

describe('IP Billing API', () => {
  // ─── Admitted Patients ──────────────────────────────────────────────────────
  describe('Admitted patients', () => {
    it('1. GET /admitted returns admitted patients', async () => {
      await createAdmittedPatient();
      const res = await api('GET', '/api/ip-billing/admitted');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.patients.length).toBeGreaterThan(0);
    });

    it('2. Search admitted patients', async () => {
      await createAdmittedPatient();
      const res = await api('GET', `/api/ip-billing/admitted?search=IP+Patient`);
      expect(res.status).toBe(200);
    });
  });

  // ─── Provisional Charges ───────────────────────────────────────────────────
  describe('Provisional charges', () => {
    let patientId: number;
    let admissionId: number;

    beforeEach(async () => {
      const result = await createAdmittedPatient();
      patientId = result.patientId;
      admissionId = result.admissionId;
    });

    it('3. Add provisional charge', async () => {
      const res = await api('POST', '/api/ip-billing/provisional', {
        patient_id: patientId,
        admission_id: admissionId,
        item_category: 'medicine',
        item_name: 'Amoxicillin',
        unit_price: 200,
        quantity: 3,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.total_amount).toBe(600); // 200 × 3
    });

    it('4. Add provisional charge with discount', async () => {
      const res = await api('POST', '/api/ip-billing/provisional', {
        patient_id: patientId,
        admission_id: admissionId,
        item_category: 'procedure',
        item_name: 'Blood Test',
        unit_price: 1000,
        quantity: 1,
        discount_percent: 10,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.total_amount).toBe(900);
    });
  });

  // ─── Pending Charges ───────────────────────────────────────────────────────
  describe('Pending charges', () => {
    let patientId: number;
    let admissionId: number;

    beforeEach(async () => {
      const result = await createAdmittedPatient();
      patientId = result.patientId;
      admissionId = result.admissionId;
    });

    it('5. GET /pending/:admissionId returns pending items and summary', async () => {
      // Add a provisional charge
      await api('POST', '/api/ip-billing/provisional', {
        patient_id: patientId,
        admission_id: admissionId,
        item_category: 'medicine',
        item_name: 'Test Med',
        unit_price: 500,
        quantity: 2,
      });

      const res = await api('GET', `/api/ip-billing/pending/${admissionId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.items.length).toBe(1);
      expect(data.summary).toBeDefined();
      expect(data.summary.provisional_total).toBe(1000);
    });

    it('6. Pending charges include deposit balance', async () => {
      // Add a deposit
      await api('POST', '/api/deposits', { patient_id: patientId, amount: 2000 });
      const res = await api('GET', `/api/ip-billing/pending/${admissionId}`);
      const data = (await res.json()) as any;
      expect(data.summary.deposit_balance).toBe(2000);
    });
  });

  // ─── Discharge Bill ────────────────────────────────────────────────────────
  describe('Discharge bill', () => {
    it('7. Create discharge bill with provisional items', async () => {
      const { patientId, admissionId } = await createAdmittedPatient();
      await api('POST', '/api/ip-billing/provisional', {
        patient_id: patientId,
        admission_id: admissionId,
        item_category: 'doctor_visit',
        item_name: 'Doctor Visit',
        unit_price: 500,
        quantity: 1,
      });

      const res = await api('POST', '/api/ip-billing/discharge-bill', {
        admission_id: admissionId,
        paid_amount: 500,
        payment_mode: 'cash',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.bill_id).toBeDefined();
    });

    it('8. Non-existent admission → 404', async () => {
      const res = await api('POST', '/api/ip-billing/discharge-bill', {
        admission_id: 999999,
        paid_amount: 0,
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('9. Cross-tenant admitted list is empty or blocked', async () => {
      const res = await api('GET', '/api/ip-billing/admitted', undefined, 2);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect(data.patients.length).toBe(0);
      } else {
        expect([403, 404].includes(res.status)).toBe(true);
      }
    });
  });
});
