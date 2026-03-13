import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient, createBed } from './helpers/fixtures';
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

describe('Admissions API', () => {
  let patientId: number;
  let bedId: number;

  beforeEach(async () => {
    patientId = await createPatient(1, { name: 'Admitted Patient', patient_code: 'P-ADM001' });
    bedId = await createBed(1, { ward_name: 'General Ward', bed_number: 'G-01' });
  });

  // ─── Beds ─────────────────────────────────────────────────────────────
  describe('Bed Management', () => {
    it('GET /api/admissions/beds — lists all beds', async () => {
      const res = await api('GET', '/api/admissions/beds');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.beds)).toBe(true);
      expect(data.beds.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/admissions/beds?status=available — filters available beds', async () => {
      const res = await api('GET', '/api/admissions/beds?status=available');
      const data = await res.json() as any;
      expect(data.beds.every((b: any) => b.status === 'available')).toBe(true);
    });

    it('POST /api/admissions/beds — creates a bed', async () => {
      const res = await api('POST', '/api/admissions/beds', { ward_name: 'ICU', bed_number: 'ICU-01' });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(typeof data.id).toBe('number');
    });

    it('POST /api/admissions/beds — 400 for missing fields', async () => {
      const res = await api('POST', '/api/admissions/beds', { ward_name: 'ICU' });
      expect(res.status).toBe(400);
    });

    it('PUT /api/admissions/beds/:id — updates bed status', async () => {
      const res = await api('PUT', `/api/admissions/beds/${bedId}`, { status: 'maintenance' });
      expect(res.status).toBe(200);
    });
  });

  // ─── Admissions Stats ─────────────────────────────────────────────────
  describe('GET /api/admissions/stats', () => {
    it('returns stats object', async () => {
      const res = await api('GET', '/api/admissions/stats');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.currentAdmissions).toBe('number');
      expect(typeof data.totalBeds).toBe('number');
      expect(typeof data.availableBeds).toBe('number');
    });
  });

  // ─── Admissions CRUD ──────────────────────────────────────────────────
  describe('POST /api/admissions — admit patient', () => {
    it('creates admission → 201 with admNo', async () => {
      const res = await api('POST', '/api/admissions', {
        patient_id: patientId,
        bed_id: bedId,
        provisional_diagnosis: 'Pneumonia',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.admission_no).toMatch(/^ADM-/);
    });

    it('allocating a bed marks it as occupied', async () => {
      await api('POST', '/api/admissions', { patient_id: patientId, bed_id: bedId });
      const bedRes = await api('GET', `/api/admissions/beds?status=occupied`);
      const bedData = await bedRes.json() as any;
      const found = bedData.beds.find((b: any) => b.id === bedId);
      expect(found).toBeDefined();
    });

    it('returns 400 for missing patient_id', async () => {
      const res = await api('POST', '/api/admissions', { bed_id: bedId });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admissions — list', () => {
    it('returns admissions list', async () => {
      await api('POST', '/api/admissions', { patient_id: patientId });
      const res = await api('GET', '/api/admissions');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.admissions)).toBe(true);
      expect(data.admissions.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by status', async () => {
      await api('POST', '/api/admissions', { patient_id: patientId });
      const res = await api('GET', '/api/admissions?status=admitted');
      const data = await res.json() as any;
      expect(data.admissions.every((a: any) => a.status === 'admitted')).toBe(true);
    });
  });

  describe('PUT /api/admissions/:id — discharge releases bed', () => {
    it('discharging frees the bed', async () => {
      const admRes = await api('POST', '/api/admissions', { patient_id: patientId, bed_id: bedId });
      const { admission_no } = await admRes.json() as any;

      // Get admission ID from DB
      const row = await env.DB.prepare('SELECT id FROM admissions WHERE admission_no = ?')
        .bind(admission_no).first<{ id: number }>();
      expect(row).toBeDefined();

      const res = await api('PUT', `/api/admissions/${row!.id}`, { status: 'discharged' });
      expect(res.status).toBe(200);

      // Bed should be available again
      const bedRes = await api('GET', `/api/admissions/beds?status=available`);
      const bedData = await bedRes.json() as any;
      const freed = bedData.beds.find((b: any) => b.id === bedId);
      expect(freed).toBeDefined();
    });
  });
});
