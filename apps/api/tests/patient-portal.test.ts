import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

// ─── Helpers ─────────────────────────────────────────────────────────

function getPatientPortalHeaders(tenantId: number, patientId: number) {
  const token = jwt.sign(
    { userId: String(patientId), tenantId: String(tenantId), role: 'patient', permissions: ['portal:read'], patientId: String(patientId) },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

function getAdminHeaders(tenantId: number, userId = 1) {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role: 'hospital_admin', permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: headers ?? {
      'Content-Type': 'application/json',
      'X-Tenant-Subdomain': 'test',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

async function seedPatientAndGetId(tenantId = 1): Promise<number> {
  const mobile = `0171${Date.now().toString().slice(-7)}`;
  const res = await api('POST', '/api/patients', {
    name: 'Portal Test Patient',
    fatherHusband: 'Father',
    address: 'Dhaka',
    mobile,
    gender: 'male',
    age: 30,
  }, getAdminHeaders(tenantId));
  const data = await res.json() as any;
  return data.patientId as number;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Patient Portal API - Real Integration Tests', () => {

  // ─── OTP Auth (Public) ─────────────────────────────────────────────

  describe('POST /api/patient-portal/request-otp', () => {
    it('returns error for missing email (400)', async () => {
      const res = await api('POST', '/api/patient-portal/request-otp', {});
      expect(res.status).toBe(400);
    });

    it('accepts valid email without crashing', async () => {
      const res = await api('POST', '/api/patient-portal/request-otp', { email: 'test@example.com' });
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('POST /api/patient-portal/verify-otp', () => {
    it('rejects invalid OTP with 401', async () => {
      const res = await api('POST', '/api/patient-portal/verify-otp', { email: 'test@example.com', otp: '000000' });
      expect(res.status).toBe(401);
    });
  });

  // ─── Auth Enforcement on ALL Protected Endpoints ───────────────────
  // After the index.ts fix, ALL data routes now have authMiddleware

  describe('Auth Enforcement', () => {
    const protectedPaths = [
      '/api/patient-portal/me',
      '/api/patient-portal/dashboard',
      '/api/patient-portal/appointments',
      '/api/patient-portal/prescriptions',
      '/api/patient-portal/lab-results',
      '/api/patient-portal/bills',
      '/api/patient-portal/vitals',
      '/api/patient-portal/visits',
      '/api/patient-portal/available-doctors',
      '/api/patient-portal/messages',
      '/api/patient-portal/timeline',
      '/api/patient-portal/family',
    ];

    for (const path of protectedPaths) {
      it(`returns 401 for ${path} without token`, async () => {
        const res = await api('GET', path);
        expect(res.status).toBe(401);
      });
    }

    it('returns 403 for non-patient role on /me', async () => {
      const res = await api('GET', '/api/patient-portal/me', undefined, getAdminHeaders(1));
      expect(res.status).toBe(403);
    });
  });

  // ─── Profile ──────────────────────────────────────────────────────

  describe('GET /api/patient-portal/me', () => {
    it('returns patient profile for seeded patient', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/me', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.name).toBe('Portal Test Patient');
    });

    it('returns 404 for non-existent patient', async () => {
      const res = await api('GET', '/api/patient-portal/me', undefined, getPatientPortalHeaders(1, 999999));
      expect(res.status).toBe(404);
    });
  });

  // ─── Data Endpoints (seeded patient — should return 200 now) ──────

  describe('GET /api/patient-portal/dashboard', () => {
    it('returns dashboard data', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/dashboard', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.activePrescriptions).toBeDefined();
      expect(data.billing).toBeDefined();
      expect(data.totalVisits).toBeDefined();
    });
  });

  describe('GET /api/patient-portal/appointments', () => {
    it('returns paginated appointments', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/appointments', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.data).toBeDefined();
      expect(data.pagination).toBeDefined();
    });
  });

  describe('GET /api/patient-portal/prescriptions', () => {
    it('returns paginated prescriptions', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/prescriptions', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/patient-portal/lab-results', () => {
    it('returns paginated lab results', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/lab-results', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/patient-portal/bills', () => {
    it('returns paginated bills', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/bills', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/patient-portal/vitals', () => {
    it('returns paginated vitals', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/vitals', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/patient-portal/visits', () => {
    it('returns paginated visits', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/visits', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/patient-portal/available-doctors', () => {
    it('returns doctors list', async () => {
      const patientId = await seedPatientAndGetId();
      const res = await api('GET', '/api/patient-portal/available-doctors', undefined, getPatientPortalHeaders(1, patientId));
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.doctors).toBeDefined();
      expect(Array.isArray(data.doctors)).toBe(true);
    });
  });
});
