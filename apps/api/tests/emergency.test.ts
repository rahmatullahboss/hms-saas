/**
 * 🧪 TEA — Emergency Room API Tests
 * Risk: HIGH — Patient safety, triage accuracy, finalization workflow.
 * Coverage: ER registration, triage, finalization, discharge summaries,
 *   mode of arrival, stats, validation, tenant isolation
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

async function registerERPatient(overrides: Record<string, any> = {}) {
  const res = await api('POST', '/api/emergency', {
    first_name: 'Rafiq',
    last_name: 'Ahmed',
    is_existing_patient: false,
    ...overrides,
  });
  return { res, data: (await res.json()) as any };
}

describe('Emergency Room API', () => {
  // ─── Registration ───────────────────────────────────────────────────────────
  describe('ER Registration', () => {
    it('1. Register a new ER patient (non-existing)', async () => {
      const { res, data } = await registerERPatient();
      expect(res.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.er_patient_number).toBeDefined();
      expect(data.patient_id).toBeDefined();
      expect(data.visit_id).toBeDefined();
    });

    it('2. Register with full details including patient_cases', async () => {
      const { res, data } = await registerERPatient({
        gender: 'male',
        age: '35',
        contact_no: '01711111111',
        case_type: 'accident',
        condition_on_arrival: 'conscious',
        is_police_case: true,
        patient_cases: {
          main_case: 1,
          sub_case: 2,
          biting_animal: 3,
          biting_site: 4,
          first_aid: 1,
        },
      });
      expect(res.status).toBe(201);
      expect(data.id).toBeDefined();
    });

    it('3. Register with existing patient_id', async () => {
      // First create a patient
      const pRes = await api('POST', '/api/patients', {
        name: 'Existing ER Patient', mobile: `0171${Date.now().toString().slice(-7)}`,
        fatherHusband: 'Father Name', address: 'Test Address',
        gender: 'male', age: 40,
      });
      const { patientId } = (await pRes.json()) as any;

      const { res, data } = await registerERPatient({
        patient_id: patientId,
        is_existing_patient: true,
        first_name: 'Existing',
        last_name: 'Patient',
      });
      expect(res.status).toBe(201);
      expect(data.patient_id).toBe(patientId);
    });

    it('4. Missing first_name → 400', async () => {
      const res = await api('POST', '/api/emergency', { last_name: 'Test' });
      expect(res.status).toBe(400);
    });

    it('5. Missing last_name → 400', async () => {
      const res = await api('POST', '/api/emergency', { first_name: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  // ─── Triage ─────────────────────────────────────────────────────────────────
  describe('Triage', () => {
    let erPatientId: number;

    beforeEach(async () => {
      const { data } = await registerERPatient();
      erPatientId = data.id;
    });

    it('6. Assign triage code', async () => {
      const res = await api('PUT', `/api/emergency/${erPatientId}/triage`, {
        triage_code: 'red',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.triage_code).toBe('red');
    });

    it('7. Triage non-existent patient → 404', async () => {
      const res = await api('PUT', '/api/emergency/999999/triage', {
        triage_code: 'yellow',
      });
      expect(res.status).toBe(404);
    });

    it('8. Undo triage — reverts status to new', async () => {
      // First triage
      await api('PUT', `/api/emergency/${erPatientId}/triage`, { triage_code: 'red' });
      // Then undo
      const res = await api('PUT', `/api/emergency/${erPatientId}/undo-triage`);
      expect(res.status).toBe(200);
    });

    it('9. Undo triage on non-triaged patient → 404', async () => {
      const res = await api('PUT', `/api/emergency/${erPatientId}/undo-triage`);
      expect(res.status).toBe(404);
    });
  });

  // ─── Finalization ───────────────────────────────────────────────────────────
  describe('Finalization', () => {
    let erPatientId: number;

    beforeEach(async () => {
      const { data } = await registerERPatient();
      erPatientId = data.id;
    });

    it('10. Finalize as admitted', async () => {
      const res = await api('PUT', `/api/emergency/${erPatientId}/finalize`, {
        finalized_status: 'admitted',
        finalized_remarks: 'Admitted to Ward 3',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.finalized_status).toBe('admitted');
    });

    it('11. Finalize as discharged', async () => {
      const res = await api('PUT', `/api/emergency/${erPatientId}/finalize`, {
        finalized_status: 'discharged',
      });
      expect(res.status).toBe(200);
    });

    it('12. Finalize as LAMA', async () => {
      const res = await api('PUT', `/api/emergency/${erPatientId}/finalize`, {
        finalized_status: 'lama',
        finalized_remarks: 'Left against medical advice',
      });
      expect(res.status).toBe(200);
    });

    it('13. Finalize non-existent patient → 404', async () => {
      const res = await api('PUT', '/api/emergency/999999/finalize', {
        finalized_status: 'discharged',
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Discharge Summary ─────────────────────────────────────────────────────
  describe('Discharge Summary', () => {
    let patientId: number;
    let visitId: number;

    beforeEach(async () => {
      const { data } = await registerERPatient();
      patientId = data.patient_id;
      visitId = data.visit_id;
    });

    it('14. Create ER discharge summary', async () => {
      const res = await api('POST', '/api/emergency/discharge-summary', {
        patient_id: patientId,
        visit_id: visitId,
        discharge_type: 'normal',
        chief_complaints: 'Headache',
        treatment_in_er: 'Paracetamol IV',
        provisional_diagnosis: 'Migraine',
        doctor_name: 'Dr. Karim',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeDefined();
    });
  });

  // ─── Get Single ER Patient ─────────────────────────────────────────────────
  describe('Get ER Patient', () => {
    it('15. GET /:id returns detailed ER patient', async () => {
      const { data: created } = await registerERPatient();
      const res = await api('GET', `/api/emergency/${created.id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.er_patient).toBeDefined();
      expect(data.er_patient.er_patient_number).toBeDefined();
    });

    it('16. GET non-existent patient → 404', async () => {
      const res = await api('GET', '/api/emergency/999999');
      expect(res.status).toBe(404);
    });
  });

  // ─── Update ER Patient ──────────────────────────────────────────────────────
  describe('Update ER Patient', () => {
    it('17. Update ER patient fields', async () => {
      const { data: created } = await registerERPatient();
      const res = await api('PUT', `/api/emergency/${created.id}`, {
        first_name: 'Updated',
        case_type: 'burn',
      });
      expect(res.status).toBe(200);
    });

    it('18. Update with no fields → 400', async () => {
      const { data: created } = await registerERPatient();
      const res = await api('PUT', `/api/emergency/${created.id}`, {});
      expect(res.status).toBe(400);
    });
  });

  // ─── List & Stats ──────────────────────────────────────────────────────────
  describe('List & Stats', () => {
    it('19. GET / returns ER patients list', async () => {
      await registerERPatient();
      const res = await api('GET', '/api/emergency');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.er_patients.length).toBeGreaterThan(0);
    });

    it('20. GET /stats returns statistics', async () => {
      await registerERPatient();
      const res = await api('GET', '/api/emergency/stats');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      // Stats returns flat keys
      expect(data.new_patients).toBeDefined();
      expect(data.total_today).toBeDefined();
    });
  });

  // ─── Mode of Arrival ───────────────────────────────────────────────────────
  describe('Mode of Arrival', () => {
    it('21. GET /modes-of-arrival returns list', async () => {
      const res = await api('GET', '/api/emergency/modes-of-arrival');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.modes)).toBe(true);
    });

    it('22. POST /modes-of-arrival/seed seeds defaults when empty', async () => {
      const res = await api('POST', '/api/emergency/modes-of-arrival/seed');
      expect(res.status).toBe(201);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('23. Cross-tenant ER list is empty or blocked', async () => {
      await registerERPatient();
      const res = await api('GET', '/api/emergency', undefined, 2);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect(data.er_patients.length).toBe(0);
      } else {
        expect([403, 404].includes(res.status)).toBe(true);
      }
    });
  });
});
