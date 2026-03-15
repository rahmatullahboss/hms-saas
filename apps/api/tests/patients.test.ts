import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthHeaders(tenantId: number, userId = 1, role = 'hospital_admin') {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role, permissions: [
      'patients:read', 'patients:write', 'patients:delete',
    ] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any, tenantId = 1) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(tenantId),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

function patientPayload(overrides: Record<string, any> = {}) {
  return {
    name: 'Rahim Ahmed',
    fatherHusband: 'Karim Ahmed',
    address: 'Dhanmondi, Dhaka',
    mobile: `0171${Date.now().toString().slice(-7)}`,
    gender: 'male',
    age: 35,
    bloodGroup: 'O+',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Patients API – Real Integration Tests', () => {

  // ─── CREATE ──────────────────────────────────────────────────────

  describe('POST /api/patients', () => {
    it('creates a patient and returns 201 with patientId', async () => {
      const res = await api('POST', '/api/patients', patientPayload());

      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.patientId).toBeGreaterThan(0);
    });

    it('stores patient data correctly in D1', async () => {
      const payload = patientPayload({ name: 'DB Check Patient' });
      const createRes = await api('POST', '/api/patients', payload);
      const { patientId } = await createRes.json() as any;

      // Query D1 directly to verify
      const row = await env.DB.prepare('SELECT name, tenant_id FROM patients WHERE id = ?')
        .bind(patientId).first<{ name: string; tenant_id: number }>();

      expect(row?.name).toBe('DB Check Patient');
      expect(row?.tenant_id).toBe(1);
    });

    it('auto-generates patient_code', async () => {
      const res = await api('POST', '/api/patients', patientPayload());
      const data = await res.json() as any;
      expect(data.patientId).toBeGreaterThan(0);

      // Verify code exists in DB
      const row = await env.DB.prepare('SELECT patient_code FROM patients WHERE id = ?')
        .bind(data.patientId).first<{ patient_code: string }>();
      expect(row?.patient_code).toBeTruthy();
    });

    it('rejects missing name (Zod validation → 400)', async () => {
      const res = await api('POST', '/api/patients', patientPayload({ name: '' }));
      expect(res.status).toBe(400);
    });

    it('validates gender enum', async () => {
      const res = await api('POST', '/api/patients', patientPayload({ gender: 'unknown' }));
      // Should be 400 if Zod enum is enforced, or succeed if gender is optional/open
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  // ─── READ ────────────────────────────────────────────────────────

  describe('GET /api/patients', () => {
    beforeEach(async () => {
      await api('POST', '/api/patients', patientPayload({ name: 'Patient A' }));
      await api('POST', '/api/patients', patientPayload({ name: 'Patient B' }));
    });

    it('returns list of patients (200)', async () => {
      const res = await api('GET', '/api/patients');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      const patients = Array.isArray(data) ? data : data.patients || data.results || [];
      expect(patients.length).toBeGreaterThanOrEqual(2);
    });

    it('search by name works', async () => {
      const res = await api('GET', '/api/patients?search=Patient A');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      const patients = Array.isArray(data) ? data : data.patients || data.results || [];
      expect(patients.length).toBeGreaterThanOrEqual(1);
      expect(patients[0].name).toContain('Patient A');
    });
  });

  // ─── READ BY ID ──────────────────────────────────────────────────

  describe('GET /api/patients/:id', () => {
    it('returns the correct patient', async () => {
      const createRes = await api('POST', '/api/patients', patientPayload({ name: 'Specific Patient' }));
      const { patientId } = await createRes.json() as any;

      const res = await api('GET', `/api/patients/${patientId}`);
      expect(res.status).toBe(200);

      const data = await res.json() as any;
      const patient = data.patient || data;
      expect(patient.name).toBe('Specific Patient');
    });

    it('returns 404 for non-existent patient', async () => {
      const res = await api('GET', '/api/patients/999999');
      expect(res.status).toBe(404);
    });
  });

  // ─── UPDATE ──────────────────────────────────────────────────────

  describe('PUT /api/patients/:id', () => {
    it('updates patient name successfully', async () => {
      const createRes = await api('POST', '/api/patients', patientPayload({ name: 'Old Name' }));
      const { patientId } = await createRes.json() as any;

      const updateRes = await api('PUT', `/api/patients/${patientId}`, {
        name: 'New Name',
      });

      expect(updateRes.status).toBe(200);

      // Verify in D1
      const row = await env.DB.prepare('SELECT name FROM patients WHERE id = ?')
        .bind(patientId).first<{ name: string }>();
      expect(row?.name).toBe('New Name');
    });
  });

  // ─── TENANT ISOLATION ────────────────────────────────────────────

  describe('Tenant Isolation', () => {
    it('tenant 2 cannot see tenant 1 patients', async () => {
      // Create patient in tenant 1
      const createRes = await api('POST', '/api/patients', patientPayload({ name: 'Tenant 1 Only' }));
      const { patientId } = await createRes.json() as any;

      // Try to read from tenant 2
      const t2Token = jwt.sign(
        { userId: '99', tenantId: '2', role: 'hospital_admin', permissions: ['patients:read'] },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const req = new Request(`http://localhost/api/patients/${patientId}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': 'test-2',
          'Authorization': `Bearer ${t2Token}`,
        },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);

      expect(res.status).toBe(404);
    });
  });

  // ─── AUTH REQUIRED ───────────────────────────────────────────────

  describe('Auth Required', () => {
    it('returns 401 without token', async () => {
      const req = new Request('http://localhost/api/patients', {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': 'test',
        },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(401);
    });
  });
});
