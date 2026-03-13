import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient, createDoctor } from './helpers/fixtures';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'admin') {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', 'Authorization': `Bearer ${token}` };
}

async function api(method: string, path: string, body?: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method, headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Visits API', () => {
  let patientId: number;
  let doctorId: number;

  beforeEach(async () => {
    patientId = await createPatient(1, { name: 'Test Patient', patient_code: 'P-T001' });
    doctorId = await createDoctor(1, { name: 'Dr. Visit', specialty: 'General' });
  });

  describe('POST /api/visits — create', () => {
    it('creates OPD visit → 201 with visitNo', async () => {
      const res = await api('POST', '/api/visits', {
        patientId, doctorId, visitType: 'opd',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.message).toBe('Visit created');
      expect(data.visitNo).toMatch(/^V-/);
      expect(data.id).toBeGreaterThan(0);
    });

    it('creates IPD visit → 201 with admissionNo', async () => {
      const res = await api('POST', '/api/visits', {
        patientId, visitType: 'ipd',
        admissionFlag: true,
        admissionDate: '2026-03-13',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.message).toBe('Visit created');
    });

    it('rejects missing patientId → 400', async () => {
      const res = await api('POST', '/api/visits', { visitType: 'opd' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/visits — list', () => {
    it('returns visits list', async () => {
      await api('POST', '/api/visits', { patientId, visitType: 'opd' });
      const res = await api('GET', '/api/visits');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.visits)).toBe(true);
      expect(data.visits.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by patientId', async () => {
      const p2 = await createPatient(1, { name: 'Other Patient', patient_code: 'P-T002' });
      await api('POST', '/api/visits', { patientId, visitType: 'opd' });
      await api('POST', '/api/visits', { patientId: p2, visitType: 'opd' });

      const res = await api('GET', `/api/visits?patientId=${patientId}`);
      const data = await res.json() as any;
      expect(data.visits.every((v: any) => v.patient_id === patientId)).toBe(true);
    });

    it('filters by visit type', async () => {
      await api('POST', '/api/visits', { patientId, visitType: 'opd' });
      await api('POST', '/api/visits', { patientId, visitType: 'ipd', admissionFlag: true });

      const res = await api('GET', '/api/visits?type=opd');
      const data = await res.json() as any;
      expect(data.visits.every((v: any) => v.visit_type === 'opd')).toBe(true);
    });
  });

  describe('GET /api/visits/:id', () => {
    it('returns single visit by ID', async () => {
      const createRes = await api('POST', '/api/visits', { patientId, visitType: 'opd' });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/visits/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.visit.id).toBe(id);
    });

    it('returns 404 for unknown visit', async () => {
      const res = await api('GET', '/api/visits/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/visits/:id — update', () => {
    it('updates notes on a visit', async () => {
      const createRes = await api('POST', '/api/visits', { patientId, visitType: 'opd' });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/visits/${id}`, { notes: 'Patient doing well' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown visit update', async () => {
      const res = await api('PUT', '/api/visits/9999', { notes: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/visits/:id/discharge — IPD discharge', () => {
    it('discharges an IPD visit', async () => {
      const createRes = await api('POST', '/api/visits', {
        patientId, visitType: 'ipd', admissionFlag: true, admissionDate: '2026-03-10',
      });
      const { id } = await createRes.json() as any;
      const res = await api('POST', `/api/visits/${id}/discharge`, { dischargeDate: '2026-03-13' });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Patient discharged');
    });

    it('returns 404 when discharging an OPD visit as IPD', async () => {
      const createRes = await api('POST', '/api/visits', { patientId, visitType: 'opd' });
      const { id } = await createRes.json() as any;
      const res = await api('POST', `/api/visits/${id}/discharge`, { dischargeDate: '2026-03-13' });
      expect(res.status).toBe(404);
    });
  });
});
