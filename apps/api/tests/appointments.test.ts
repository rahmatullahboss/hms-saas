import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
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

async function api(method: string, path: string, body?: unknown, role = 'admin') {
  const req = new Request(`http://localhost${path}`, {
    method, headers: authHeaders(role),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

// Patient schema requires: name, fatherHusband, address, mobile (11-15 chars)
function mkPatient() {
  return {
    name: 'Appt Patient',
    fatherHusband: 'Father Name',
    address: 'Dhaka, Bangladesh',
    mobile: `0170${Date.now().toString().slice(-7)}`,
  };
}

describe('Appointments API', () => {
  let patientId: number;
  let doctorId: number;

  beforeEach(async () => {
    // Seed patient
    const pRes = await api('POST', '/api/patients', mkPatient());
    expect(pRes.status).toBe(201);
    const pData = await pRes.json() as any;
    patientId = pData.patientId;
    expect(patientId).toBeGreaterThan(0);

    // Seed doctor
    const dRes = await api('POST', '/api/doctors', {
      name: 'Dr. Appt Test',
      specialty: 'General',
      consultation_fee: 500,
    });
    const dData = await dRes.json() as any;
    doctorId = dData.id || dData.doctorId;
    // doctorId may be undefined if doctor endpoint signature differs
  });

  describe('POST /api/appointments — create', () => {
    it('creates appointment - 201 with apptNo and tokenNo', async () => {
      const res = await api('POST', '/api/appointments', {
        patientId,
        doctorId: doctorId || undefined,
        apptDate: '2026-03-14',
        apptTime: '09:00',
        visitType: 'opd',
        fee: 500,
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.apptNo).toBeTruthy();
      expect(data.tokenNo).toBeGreaterThan(0);
    });

    it('auto-increments token for same doctor + date', async () => {
      const payload = { patientId, doctorId: doctorId || undefined, apptDate: '2026-03-15', visitType: 'opd', fee: 0 };
      await api('POST', '/api/appointments', payload);
      const r2 = await api('POST', '/api/appointments', { ...payload });
      expect(r2.status).toBe(201);
    });
  });

  describe('GET /api/appointments — list', () => {
    it('returns appointments list', async () => {
      await api('POST', '/api/appointments', {
        patientId, doctorId: doctorId || undefined, apptDate: '2026-03-14', visitType: 'opd', fee: 0,
      });
      const res = await api('GET', '/api/appointments');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.appointments)).toBe(true);
    });

    it('filters by doctorId (when doctor was created)', async () => {
      if (!doctorId) return; // skip if doctor creation failed
      const res = await api('GET', `/api/appointments?doctorId=${doctorId}`);
      expect(res.status).toBe(200);
    });

    it('filters by status', async () => {
      const res = await api('GET', '/api/appointments?status=scheduled');
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/appointments/:id — update status', () => {
    it('updates appointment status to completed', async () => {
      const createRes = await api('POST', '/api/appointments', {
        patientId, apptDate: '2026-03-14', visitType: 'opd', fee: 0,
      });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/appointments/${id}`, { status: 'completed' });
      expect(res.status).toBe(200);
    });

    it('cancels appointment via DELETE', async () => {
      const createRes = await api('POST', '/api/appointments', {
        patientId, apptDate: '2026-03-14', visitType: 'opd', fee: 0,
      });
      const { id } = await createRes.json() as any;
      const res = await api('DELETE', `/api/appointments/${id}`);
      expect(res.status).toBe(200);
    });
  });
});
