/**
 * 🧪 TEA — Vitals API Tests
 * Risk: MEDIUM-HIGH — Clinical data, BMI calc, wrong readings can affect care.
 * Coverage: Record vitals, BMI auto-calc, list, latest, delete (soft), validation, tenant isolation
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
    name: 'Vitals Patient',
    fatherHusband: 'Father',
    address: 'Dhaka',
    mobile: `0174${Date.now().toString().slice(-7)}`,
    gender: 'male',
    age: 40,
  });
  return ((await res.json()) as any).patientId as number;
}

describe('Vitals API', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient();
  });

  // ─── Record vitals ───────────────────────────────────────────────────────────
  describe('Record vitals', () => {
    it('1. Basic vitals recorded successfully', async () => {
      const res = await api('POST', '/api/vitals', {
        patient_id: patientId,
        pulse: 72,
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
        temperature: 36.8,
        spo2: 98,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('2. BMI auto-calculated from weight & height', async () => {
      const res = await api('POST', '/api/vitals', {
        patient_id: patientId,
        weight: 70,    // kg
        height: 175,   // cm → BMI = 70/(1.75)^2 = 22.9
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.bmi).toBeCloseTo(22.9, 0);
    });

    it('3. BMI not calculated when only weight provided', async () => {
      const res = await api('POST', '/api/vitals', {
        patient_id: patientId,
        weight: 70,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.bmi).toBeNull();
    });

    it('4. Pain scale out of range (0-10) rejected (400)', async () => {
      const res = await api('POST', '/api/vitals', {
        patient_id: patientId,
        pulse: 72,
        pain_scale: 15, // > 10
      });
      expect(res.status).toBe(400);
    });

    it('5. Missing patient_id rejected (400)', async () => {
      const res = await api('POST', '/api/vitals', { pulse: 72 });
      expect(res.status).toBe(400);
    });

    it('6. Multiple vitals records for same patient allowed', async () => {
      await api('POST', '/api/vitals', { patient_id: patientId, pulse: 70 });
      await api('POST', '/api/vitals', { patient_id: patientId, pulse: 80 });
      const res = await api('GET', `/api/vitals?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      expect(data.vitals.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Latest vitals ───────────────────────────────────────────────────────────
  describe('Latest vitals', () => {
    it('7. Latest endpoint returns most recent record', async () => {
      await api('POST', '/api/vitals', { patient_id: patientId, pulse: 70 });
      // Small pause so taken_at timestamp differs
      await new Promise(r => setTimeout(r, 1100));
      await api('POST', '/api/vitals', { patient_id: patientId, pulse: 90 });
      const res = await api('GET', `/api/vitals/latest/${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      // Latest should have pulse = 90
      expect(data.vitals.pulse).toBe(90);
    });

    it('8. No vitals returns null gracefully', async () => {
      const res = await api('GET', `/api/vitals/latest/${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.vitals).toBeNull();
    });
  });

  // ─── List ────────────────────────────────────────────────────────────────────
  describe('List vitals', () => {
    it('9. GET without patient_id or visit_id returns 400', async () => {
      const res = await api('GET', '/api/vitals');
      expect(res.status).toBe(400);
    });

    it('10. GET with patient_id returns vitals array', async () => {
      await api('POST', '/api/vitals', { patient_id: patientId, pulse: 75, temperature: 37.0 });
      const res = await api('GET', `/api/vitals?patient_id=${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.vitals)).toBe(true);
    });
  });

  // ─── Soft delete ─────────────────────────────────────────────────────────────
  describe('Delete vitals', () => {
    it('11. Soft delete removes from list', async () => {
      const createRes = await api('POST', '/api/vitals', { patient_id: patientId, pulse: 65 });
      const { id } = (await createRes.json()) as any;
      await api('DELETE', `/api/vitals/${id}`);
      const res = await api('GET', `/api/vitals?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      expect((data.vitals as any[]).find(v => v.id === id)).toBeUndefined();
    });

    it('12. Delete non-existent vitals returns 404', async () => {
      const res = await api('DELETE', '/api/vitals/999999');
      expect(res.status).toBe(404);
    });
  });

  // ─── Tenant isolation ────────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('13. Cross-tenant access blocked by middleware (403)', async () => {
      await api('POST', '/api/vitals', { patient_id: patientId, pulse: 72 });
      // Tenant middleware blocks cross-tenant access
      const res = await api('GET', `/api/vitals?patient_id=${patientId}`, undefined, 2);
      expect([200, 403].includes(res.status)).toBe(true);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect((data.vitals as any[]).length).toBe(0);
      }
    });
  });
});
