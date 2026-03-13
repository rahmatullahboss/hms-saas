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

async function api(method: string, path: string, body?: unknown, role = 'admin') {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(role),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

// Helper: create patient + bed + admission and return admissionId
async function createAdmission(db: D1Database, tenantId: number): Promise<number> {
  const patRes = await db
    .prepare(
      `INSERT INTO patients (name, age, gender, patient_code, tenant_id) VALUES ('Discharge Patient', 40, 'male', 'DIS-001', ?)`,
    )
    .bind(tenantId)
    .run();
  const patientId = patRes.meta.last_row_id as number;

  const bedRes = await db
    .prepare(
      `INSERT INTO beds (ward_name, bed_number, status, tenant_id) VALUES ('General', 'G-10', 'available', ?)`,
    )
    .bind(tenantId)
    .run();
  const bedId = bedRes.meta.last_row_id as number;

  const admRes = await db
    .prepare(
      `INSERT INTO admissions (tenant_id, patient_id, bed_id, admission_no, status, admission_date) VALUES (?, ?, ?, 'ADM-DIS-001', 'admitted', date('now'))`,
    )
    .bind(tenantId, patientId, bedId)
    .run();
  return admRes.meta.last_row_id as number;
}

describe('Discharge API', () => {
  const tenantId = 1;
  let admissionId: number;

  beforeEach(async () => {
    admissionId = await createAdmission(env.DB as D1Database, tenantId);
  });

  describe('GET /api/discharge/:admissionId', () => {
    it('returns admission with null summary when no summary exists', async () => {
      const res = await api('GET', `/api/discharge/${admissionId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.admission).toBeDefined();
      expect(data.summary).toBeNull();
    });

    it('returns 404 for non-existent admission', async () => {
      const res = await api('GET', `/api/discharge/999999`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/discharge/:admissionId', () => {
    it('creates a draft discharge summary', async () => {
      const res = await api('PUT', `/api/discharge/${admissionId}`, {
        admission_diagnosis: 'Fever',
        final_diagnosis: 'Viral fever',
        treatment_summary: 'Antipyretics administered',
        status: 'draft',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
    });

    it('GET returns summary after PUT', async () => {
      await api('PUT', `/api/discharge/${admissionId}`, {
        admission_diagnosis: 'Hypertension',
        final_diagnosis: 'Controlled hypertension',
        doctor_notes: 'Follow up in 1 week',
        status: 'draft',
      });
      const res = await api('GET', `/api/discharge/${admissionId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.summary).not.toBeNull();
      expect(data.summary.admission_diagnosis).toBe('Hypertension');
    });

    it('updates an existing summary on second PUT', async () => {
      await api('PUT', `/api/discharge/${admissionId}`, {
        admission_diagnosis: 'Original',
        status: 'draft',
      });
      const res = await api('PUT', `/api/discharge/${admissionId}`, {
        final_diagnosis: 'Updated final diagnosis',
        status: 'final',
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent admission', async () => {
      const res = await api('PUT', `/api/discharge/999999`, { status: 'draft' });
      expect(res.status).toBe(404);
    });

    it('stores procedures and medicines as JSON arrays', async () => {
      await api('PUT', `/api/discharge/${admissionId}`, {
        procedures_performed: ['Blood test', 'X-ray'],
        medicines_on_discharge: [{ name: 'Paracetamol', dose: '500mg', frequency: 'TDS' }],
        status: 'draft',
      });
      const res = await api('GET', `/api/discharge/${admissionId}`);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.summary.procedures_performed)).toBe(true);
      expect(data.summary.procedures_performed).toContain('Blood test');
    });
  });
});
