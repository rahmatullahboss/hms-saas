/**
 * 🧪 TEA — Allergies API Tests
 * Risk: HIGH — Missed allergy data can lead to patient harm (anaphylaxis risk).
 * Coverage: CRUD, duplicate prevention, severity ordering, drug check, verify, soft delete, tenant isolation
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
    name: 'Allergy Patient',
    fatherHusband: 'Father',
    address: 'Dhaka',
    mobile: `0175${Date.now().toString().slice(-7)}`,
    gender: 'female',
    age: 30,
  });
  return ((await res.json()) as any).patientId as number;
}

describe('Allergies API', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient();
  });

  // ─── Create ──────────────────────────────────────────────────────────────────
  describe('Create allergy', () => {
    it('1. Record drug allergy successfully', async () => {
      const res = await api('POST', '/api/allergies', {
        patient_id: patientId,
        allergy_type: 'drug',
        allergen: 'Penicillin',
        severity: 'severe',
        reaction: 'Anaphylaxis',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('2. Record food allergy with mild severity', async () => {
      const res = await api('POST', '/api/allergies', {
        patient_id: patientId,
        allergy_type: 'food',
        allergen: 'Peanuts',
        severity: 'mild',
      });
      expect(res.status).toBe(201);
    });

    it('3. Duplicate allergen + type rejected (400)', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Aspirin', severity: 'mild',
      });
      const res = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Aspirin', severity: 'severe',
      });
      expect(res.status).toBe(400);
      // HTTPException may return plain text — just validate status code
    });

    it('4. Empty allergen rejected (400)', async () => {
      const res = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: '', severity: 'mild',
      });
      expect(res.status).toBe(400);
    });

    it('5. Invalid allergy_type rejected (400)', async () => {
      const res = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'chemical', allergen: 'Mercury', severity: 'severe',
      });
      expect(res.status).toBe(400);
    });

    it('6. Invalid severity rejected (400)', async () => {
      const res = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'food', allergen: 'Eggs', severity: 'critical',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── List (sorted by severity) ───────────────────────────────────────────────
  describe('List allergies', () => {
    it('7. patient_id required for list (400)', async () => {
      const res = await api('GET', '/api/allergies');
      expect(res.status).toBe(400);
    });

    it('8. Life-threatening allergy appears first in list', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'food', allergen: 'Peanuts', severity: 'mild',
      });
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Penicillin', severity: 'life_threatening',
      });
      const res = await api('GET', `/api/allergies?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      expect(data.allergies[0].severity).toBe('life_threatening');
    });

    it('9. has_drug_allergies flag set correctly', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Ibuprofen', severity: 'moderate',
      });
      const res = await api('GET', `/api/allergies?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      expect(data.has_drug_allergies).toBe(true);
    });

    it('10. has_severe_allergies flag set for life_threatening', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Sulfa', severity: 'life_threatening',
      });
      const res = await api('GET', `/api/allergies?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      expect(data.has_severe_allergies).toBe(true);
    });
  });

  // ─── Drug allergy check ──────────────────────────────────────────────────────
  describe('Drug check endpoint', () => {
    it('11. Drug check returns alert=true for drug allergies', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Codeine', severity: 'severe',
      });
      const res = await api('GET', `/api/allergies/check/${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.alert).toBe(true);
      expect(data.count).toBeGreaterThan(0);
    });

    it('12. Drug check returns alert=false for no drug allergies', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'food', allergen: 'Wheat', severity: 'mild',
      });
      const res = await api('GET', `/api/allergies/check/${patientId}`);
      const data = (await res.json()) as any;
      expect(data.alert).toBe(false);
    });
  });

  // ─── Update ──────────────────────────────────────────────────────────────────
  describe('Update allergy', () => {
    it('13. Update severity of existing allergy', async () => {
      const createRes = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Diclofenac', severity: 'mild',
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/allergies/${id}`, { severity: 'severe' });
      expect(res.status).toBe(200);
    });

    it('14. Update non-existent allergy returns 404', async () => {
      const res = await api('PUT', '/api/allergies/999999', { severity: 'mild' });
      expect(res.status).toBe(404);
    });

    it('15. Update with no fields returns 400', async () => {
      const createRes = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'food', allergen: 'Milk', severity: 'mild',
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/allergies/${id}`, {});
      expect(res.status).toBe(400);
    });
  });

  // ─── Verify ─────────────────────────────────────────────────────────────────
  describe('Verify allergy', () => {
    it('16. Verify allergy succeeds', async () => {
      const createRes = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'Morphine', severity: 'severe',
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/allergies/${id}/verify`);
      expect(res.status).toBe(200);
    });

    it('17. Verify non-existent allergy returns 404', async () => {
      const res = await api('PUT', '/api/allergies/999999/verify');
      expect(res.status).toBe(404);
    });
  });

  // ─── Soft delete ─────────────────────────────────────────────────────────────
  describe('Delete allergy', () => {
    it('18. Soft delete removes from list', async () => {
      const createRes = await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'environmental', allergen: 'Pollen', severity: 'mild',
      });
      const { id } = (await createRes.json()) as any;
      await api('DELETE', `/api/allergies/${id}`);
      const res = await api('GET', `/api/allergies?patient_id=${patientId}`);
      const data = (await res.json()) as any;
      expect((data.allergies as any[]).find(a => a.id === id)).toBeUndefined();
    });

    it('19. Delete non-existent allergy returns 404', async () => {
      const res = await api('DELETE', '/api/allergies/999999');
      expect(res.status).toBe(404);
    });
  });

  // ─── Tenant isolation ────────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('20. Cross-tenant access blocked by middleware (403)', async () => {
      await api('POST', '/api/allergies', {
        patient_id: patientId, allergy_type: 'drug', allergen: 'TestDrug', severity: 'mild',
      });
      const res = await api('GET', `/api/allergies?patient_id=${patientId}`, undefined, 2);
      expect([200, 403].includes(res.status)).toBe(true);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect((data.allergies as any[]).length).toBe(0);
      }
    });
  });
});
