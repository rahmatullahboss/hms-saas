/**
 * Integration tests for src/routes/tenant/discharge.ts
 *
 * Tests discharge summary GET (init), PUT (create/update),
 * finalization, and audit log creation.
 */

import { describe, it, expect } from 'vitest';
import dischargeRoute from '../../../src/routes/tenant/discharge';
import { createTestApp, jsonRequest } from '../helpers/test-app';
import { TENANT_1, TENANT_2, ADMISSION_1, PATIENT_1 } from '../helpers/fixtures';

// ─── Shared test data ──────────────────────────────────────────────────────────

const admissionRow = {
  ...ADMISSION_1,
  patient_name: PATIENT_1.name,
  patient_code: PATIENT_1.patient_code,
  ward_name: 'General Ward',
  bed_number: 'G-01',
  date_of_birth: PATIENT_1.date_of_birth,
  gender: PATIENT_1.gender,
  doctor_name: 'Dr. Fatima Akhter',
  staff_id: 5,
};

const existingSummary = {
  id: 1,
  tenant_id: TENANT_1.id,
  admission_id: ADMISSION_1.id,
  patient_id: PATIENT_1.id,
  status: 'draft',
  admission_diagnosis: 'Fever',
  final_diagnosis: null,
  treatment_summary: null,
};

const draftBody = {
  admission_diagnosis: 'Acute febrile illness',
  final_diagnosis: 'Typhoid fever',
  treatment_summary: 'IV antibiotics for 5 days',
  status: 'draft',
};

const finalBody = {
  ...draftBody,
  status: 'final',
  follow_up_date: '2024-02-01',
  follow_up_instructions: 'Return for CBC in 2 weeks',
  procedures_performed: ['IV cannulation', 'Blood culture'],
  medicines_on_discharge: [{ name: 'Ciprofloxacin', dose: '500mg', frequency: 'BD', duration: '5 days' }],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Discharge Routes', () => {

  describe('GET /:admissionId — get discharge summary', () => {
    it('returns 404 when admission not found', async () => {
      const { app } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: { admissions: [] },
      });

      const res = await app.request('/discharge/9999');
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Nn]ot found/);
    });

    it('returns admission details with null summary when no summary exists yet', async () => {
      const { app } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [admissionRow],
          discharge_summaries: [], // no summary yet
        },
      });

      const res = await app.request(`/discharge/${ADMISSION_1.id}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { admission: unknown; summary: unknown };
      expect(body.admission).toBeDefined();
      expect(body.summary).toBeNull();
    });

    it('returns admission with existing discharge summary', async () => {
      const { app } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [admissionRow],
          discharge_summaries: [existingSummary],
        },
      });

      const res = await app.request(`/discharge/${ADMISSION_1.id}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { summary: Record<string, unknown> | null };
      expect(body.summary).not.toBeNull();
    });
  });

  describe('PUT /:admissionId — create or update discharge summary', () => {
    it('returns 404 when admission not found', async () => {
      const { app } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: { admissions: [] },
      });

      const res = await jsonRequest(app, '/discharge/9999', {
        method: 'PUT',
        body: draftBody,
      });
      expect(res.status).toBe(404);
    });

    it('creates a new draft discharge summary', async () => {
      const { app, mockDB } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [admissionRow],
          discharge_summaries: [],
        },
      });

      const res = await jsonRequest(app, `/discharge/${ADMISSION_1.id}`, {
        method: 'PUT',
        body: draftBody,
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(true);

      // Verify INSERT was issued
      const insertQ = mockDB.queries.find(q =>
        q.sql.toUpperCase().includes('INSERT') && q.sql.includes('discharge_summaries')
      );
      expect(insertQ).toBeTruthy();

      // Verify audit log INSERT
      const auditQ = mockDB.queries.find(q =>
        q.sql.includes('audit_log')
      );
      expect(auditQ).toBeTruthy();
    });

    it('updates existing draft summary', async () => {
      const { app, mockDB } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [admissionRow],
          discharge_summaries: [existingSummary],
        },
      });

      const res = await jsonRequest(app, `/discharge/${ADMISSION_1.id}`, {
        method: 'PUT',
        body: { final_diagnosis: 'Updated diagnosis', status: 'draft' },
      });
      expect(res.status).toBe(200);

      // Verify UPDATE was issued
      const updateQ = mockDB.queries.find(q =>
        q.sql.toUpperCase().startsWith('UPDATE') && q.sql.includes('discharge_summaries')
      );
      expect(updateQ).toBeTruthy();
    });

    it('finalizes summary — sets finalized_at and finalized_by', async () => {
      const { app, mockDB } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [admissionRow],
          discharge_summaries: [existingSummary],
        },
      });

      const res = await jsonRequest(app, `/discharge/${ADMISSION_1.id}`, {
        method: 'PUT',
        body: finalBody,
      });
      expect(res.status).toBe(200);

      // Verify finalized_at was set in the UPDATE
      const updateQ = mockDB.queries.find(q =>
        q.sql.toUpperCase().startsWith('UPDATE') && q.sql.includes('finalized_at')
      );
      expect(updateQ).toBeTruthy();
    });

    it('serializes procedures_performed as JSON array', async () => {
      const { app, mockDB } = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [admissionRow],
          discharge_summaries: [],
        },
      });

      await jsonRequest(app, `/discharge/${ADMISSION_1.id}`, {
        method: 'PUT',
        body: finalBody,
      });

      // Verify procedures_performed was JSON-serialized in the params
      const insertQ = mockDB.queries.find(q =>
        q.sql.includes('discharge_summaries') && q.sql.toUpperCase().includes('INSERT')
      );
      // The JSON.stringify'd array should appear as a bound param
      const proceduresParam = insertQ?.params.find(p =>
        typeof p === 'string' && p.startsWith('[')
      );
      expect(proceduresParam).toBeTruthy();
    });
  });

  describe('Tenant isolation', () => {
    it('returns 404 for admission belonging to different tenant', async () => {
      const tenant2App = createTestApp({
        route: dischargeRoute,
        routePath: '/discharge',
        role: 'doctor',
        tenantId: TENANT_2.id,
        tables: {
          admissions: [admissionRow], // has TENANT_1.id
        },
      });

      const res = await tenant2App.app.request(`/discharge/${ADMISSION_1.id}`);
      expect(res.status).toBe(404);
    });
  });
});
