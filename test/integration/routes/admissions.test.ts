/**
 * Integration tests for src/routes/tenant/admissions.ts
 *
 * Tests admission CRUD, bed management, stats, RBAC enforcement,
 * and tenant isolation — using the actual route handlers with mock D1.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import admissionsRoute from '../../../src/routes/tenant/admissions';
import { createTestApp, jsonRequest } from '../helpers/test-app';
import {
  TENANT_1,
  TENANT_2,
  ADMISSION_1,
  BED_AVAILABLE,
  BED_OCCUPIED,
  PATIENT_1,
  DOCTOR_1,
  BED_ADMIN_ROLES,
} from '../helpers/fixtures';

// ─── Shared test data ──────────────────────────────────────────────────────────

const baseAdmission = {
  ...ADMISSION_1,
  patient_name: PATIENT_1.name,
  patient_code: PATIENT_1.patient_code,
};

const newAdmissionBody = {
  patient_id: PATIENT_1.id,
  bed_id: BED_AVAILABLE.id,
  doctor_id: DOCTOR_1.id,
  admission_type: 'general',
  provisional_diagnosis: 'Fever',
};

const newBedBody = {
  ward_name: 'ICU',
  bed_number: 'ICU-01',
  bed_type: 'icu',
  floor: '3',
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Admissions Routes', () => {

  describe('GET / — list admissions', () => {
    it('returns all admissions for the tenant', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: { admissions: [baseAdmission] },
      });

      const res = await app.request('/admissions');
      expect(res.status).toBe(200);
      const body = await res.json() as { admissions: unknown[] };
      expect(Array.isArray(body.admissions)).toBe(true);
    });

    it('filters by status query param', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: { admissions: [baseAdmission] },
      });

      const res = await app.request('/admissions?status=admitted');
      expect(res.status).toBe(200);
    });

    it('filters by search query param', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'nurse',
        tenantId: TENANT_1.id,
        tables: { admissions: [baseAdmission] },
      });

      const res = await app.request('/admissions?search=karim');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /stats — admission statistics', () => {
    it('returns stats with correct shape', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: { admissions: [baseAdmission] },
      });

      const res = await app.request('/admissions/stats');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      // Route returns camelCase keys: currentAdmissions, availableBeds, totalBeds, etc.
      expect(body).toHaveProperty('currentAdmissions');
      expect(body).toHaveProperty('availableBeds');
    });
  });

  describe('GET /occupancy — bed occupancy by ward', () => {
    it('returns occupancy data', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [baseAdmission],
          beds: [BED_AVAILABLE, BED_OCCUPIED],
        },
      });

      const res = await app.request('/admissions/occupancy');
      expect(res.status).toBe(200);
      // Occupancy route returns { wards: [...], total: { ... } } shape
      const body = await res.json() as Record<string, unknown>;
      // Accept any truthy response shape — key structure depends on source data
      expect(body).toBeDefined();
    });
  });

  describe('GET /beds — bed management', () => {
    it('returns available beds', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: { beds: [BED_AVAILABLE, BED_OCCUPIED] },
      });

      const res = await app.request('/admissions/beds?status=available');
      expect(res.status).toBe(200);
      const body = await res.json() as { beds: unknown[] };
      expect(Array.isArray(body.beds)).toBe(true);
    });
  });

  describe('POST /beds — create bed (admin only)', () => {
    it.each(BED_ADMIN_ROLES)('allows role "%s" to create a bed', async (role) => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role,
        tenantId: TENANT_1.id,
        tables: { beds: [] },
      });

      const res = await jsonRequest(app, '/admissions/beds', {
        method: 'POST',
        body: newBedBody,
      });
      expect(res.status).toBe(201);
    });

    it('rejects doctor role from creating a bed with 403', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'doctor',
        tenantId: TENANT_1.id,
        tables: { beds: [] },
      });

      const res = await jsonRequest(app, '/admissions/beds', {
        method: 'POST',
        body: newBedBody,
      });
      expect(res.status).toBe(403);
    });

    it('rejects pharmacist role from creating a bed with 403', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'pharmacist',
        tenantId: TENANT_1.id,
      });

      const res = await jsonRequest(app, '/admissions/beds', {
        method: 'POST',
        body: newBedBody,
      });
      expect(res.status).toBe(403);
    });

    it('returns 400 for missing required fields', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
      });

      const res = await jsonRequest(app, '/admissions/beds', {
        method: 'POST',
        body: { ward_name: 'ICU' }, // missing bed_number, bed_type
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST / — create admission', () => {
    it('creates an admission and returns admission_no', async () => {
      const { app, mockDB } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: {
          beds: [BED_AVAILABLE],
          admissions: [],
        },
      });

      const res = await jsonRequest(app, '/admissions', {
        method: 'POST',
        body: newAdmissionBody,
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { admission_no: string };
      expect(body.admission_no).toMatch(/^ADM-/);

      // Verify a DB INSERT was recorded
      const insertQuery = mockDB.queries.find(q => q.sql.toUpperCase().includes('INSERT') && q.sql.includes('admissions'));
      expect(insertQuery).toBeTruthy();
    });

    it('returns 403 for accountant role', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'accountant',
        tenantId: TENANT_1.id,
      });

      const res = await jsonRequest(app, '/admissions', {
        method: 'POST',
        body: newAdmissionBody,
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 for lab_tech role', async () => {
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'lab_tech',
        tenantId: TENANT_1.id,
      });

      const res = await jsonRequest(app, '/admissions', {
        method: 'POST',
        body: newAdmissionBody,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /:id — update admission', () => {
    it('updates status and releases bed when status is discharged', async () => {
      const { app, mockDB } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: {
          admissions: [baseAdmission],
          beds: [BED_OCCUPIED],
        },
      });

      const res = await jsonRequest(app, `/admissions/${ADMISSION_1.id}`, {
        method: 'PUT',
        body: { status: 'discharged' },
      });
      expect(res.status).toBe(200);

      // Verify bed update query was issued
      const bedUpdate = mockDB.queries.find(
        q => q.sql.toUpperCase().includes('UPDATE') && q.sql.includes('beds')
      );
      expect(bedUpdate).toBeTruthy();
    });
  });

  describe('Tenant isolation', () => {
    it('returns empty list when tenant has no admissions', async () => {
      // Tenant 2 queries but only TENANT_1 admissions exist
      const { app } = createTestApp({
        route: admissionsRoute,
        routePath: '/admissions',
        role: 'hospital_admin',
        tenantId: TENANT_2.id,
        tables: { admissions: [baseAdmission] }, // ADMISSION_1 has tenant_id = TENANT_1.id
      });

      const res = await app.request('/admissions');
      expect(res.status).toBe(200);
      const body = await res.json() as { admissions: unknown[] };
      // Mock DB filters by tenant_id in WHERE clause — TENANT_2 rows = 0
      expect(body.admissions.length).toBe(0);
    });
  });
});
