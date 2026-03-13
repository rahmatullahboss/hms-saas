import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'admin') {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role, permissions: [] },
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

async function seedAdmission(db: D1Database): Promise<{ admissionId: number; patientId: number }> {
  const pat = await db
    .prepare(`INSERT INTO patients (name, age, gender, patient_code, tenant_id) VALUES ('IPD Patient', 55, 'male', 'IPD-001', 1)`)
    .run();
  const patientId = pat.meta.last_row_id as number;

  const bed = await db
    .prepare(`INSERT INTO beds (ward_name, bed_number, status, tenant_id) VALUES ('Ward A', 'A-01', 'available', 1)`)
    .run();
  const bedId = bed.meta.last_row_id as number;

  const adm = await db
    .prepare(`INSERT INTO admissions (tenant_id, patient_id, bed_id, admission_no, status, admission_date) VALUES (1, ?, ?, 'ADM-IPD-001', 'admitted', date('now'))`)
    .bind(patientId, bedId)
    .run();
  return { admissionId: adm.meta.last_row_id as number, patientId };
}

describe('IPD Charges API — /api/ipd-charges', () => {
  let admissionId: number;
  let patientId: number;

  beforeEach(async () => {
    const seed = await seedAdmission(env.DB as D1Database);
    admissionId = seed.admissionId;
    patientId = seed.patientId;
  });

  describe('GET /api/ipd-charges', () => {
    it('requires admission_id query param', async () => {
      const res = await api('GET', '/api/ipd-charges');
      expect(res.status).toBe(400);
    });

    it('returns empty list for new admission', async () => {
      const res = await api('GET', `/api/ipd-charges?admission_id=${admissionId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.charges)).toBe(true);
      expect(data.charges.length).toBe(0);
      expect(data.total).toBe(0);
    });
  });

  describe('POST /api/ipd-charges', () => {
    it('adds a room charge', async () => {
      const res = await api('POST', '/api/ipd-charges', {
        admission_id: admissionId,
        patient_id: patientId,
        charge_date: '2026-03-01',
        charge_type: 'room',
        amount: 5000,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
    });

    it('sums charges in GET response', async () => {
      await api('POST', '/api/ipd-charges', {
        admission_id: admissionId,
        patient_id: patientId,
        charge_date: '2026-03-02',
        charge_type: 'room',
        amount: 3000,
      });
      await api('POST', '/api/ipd-charges', {
        admission_id: admissionId,
        patient_id: patientId,
        charge_date: '2026-03-02',
        charge_type: 'nursing',
        amount: 2000,
      });
      const res = await api('GET', `/api/ipd-charges?admission_id=${admissionId}`);
      const data = (await res.json()) as any;
      expect(data.total).toBe(5000);
    });

    it('returns 409 for duplicate charge on same date+type', async () => {
      await api('POST', '/api/ipd-charges', {
        admission_id: admissionId,
        patient_id: patientId,
        charge_date: '2026-03-03',
        charge_type: 'room',
        amount: 5000,
      });
      const res = await api('POST', '/api/ipd-charges', {
        admission_id: admissionId,
        patient_id: patientId,
        charge_date: '2026-03-03',
        charge_type: 'room',
        amount: 5000,
      });
      expect(res.status).toBe(409);
    });

    it('returns 404 for invalid admission_id', async () => {
      const res = await api('POST', '/api/ipd-charges', {
        admission_id: 999999,
        patient_id: patientId,
        charge_date: '2026-03-04',
        charge_type: 'room',
        amount: 1000,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/ipd-charges/:id', () => {
    it('deletes a charge', async () => {
      await api('POST', '/api/ipd-charges', {
        admission_id: admissionId,
        patient_id: patientId,
        charge_date: '2026-03-05',
        charge_type: 'other',
        amount: 1500,
      });
      const listRes = await api('GET', `/api/ipd-charges?admission_id=${admissionId}`);
      const { charges } = (await listRes.json()) as any;
      const chargeId = charges[0].id;

      const res = await api('DELETE', `/api/ipd-charges/${chargeId}`);
      expect(res.status).toBe(200);

      const afterRes = await api('GET', `/api/ipd-charges?admission_id=${admissionId}`);
      const afterData = (await afterRes.json()) as any;
      expect(afterData.charges.find((c: any) => c.id === chargeId)).toBeUndefined();
    });

    it('returns 404 for non-existent charge', async () => {
      const res = await api('DELETE', '/api/ipd-charges/999999');
      expect(res.status).toBe(404);
    });
  });
});
