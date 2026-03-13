import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient } from './helpers/fixtures';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(tenantId = 1, role = 'admin') {
  const token = jwt.sign(
    { userId: '1', tenantId: String(tenantId), role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: unknown, role = 'admin') {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: authHeaders(1, role),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Doctors API', () => {
  describe('POST /api/doctors — create', () => {
    it('creates a doctor with valid data → 201', async () => {
      const res = await api('POST', '/api/doctors', {
        name: 'Dr. Rahman',
        specialty: 'Cardiology',
        consultationFee: 800,
        mobileNumber: '01711000001',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.message).toBe('Doctor added');
      expect(data.id).toBeGreaterThan(0);
    });

    it('rejects missing name → 400', async () => {
      const res = await api('POST', '/api/doctors', {
        specialty: 'Cardiology',
        consultationFee: 800,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/doctors — list', () => {
    it('returns empty list initially', async () => {
      const res = await api('GET', '/api/doctors');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.doctors)).toBe(true);
    });

    it('lists created doctors', async () => {
      await api('POST', '/api/doctors', { name: 'Dr. Karim', specialty: 'Neurology', consultationFee: 1000 });
      const res = await api('GET', '/api/doctors');
      const data = await res.json() as any;
      expect(data.doctors.length).toBeGreaterThanOrEqual(1);
      expect(data.doctors[0].name).toBe('Dr. Karim');
    });

    it('filters by search query', async () => {
      await api('POST', '/api/doctors', { name: 'Dr. Alam', specialty: 'Dermatology', consultationFee: 600 });
      await api('POST', '/api/doctors', { name: 'Dr. Haque', specialty: 'Orthopedics', consultationFee: 700 });
      const res = await api('GET', '/api/doctors?search=Alam');
      const data = await res.json() as any;
      expect(data.doctors.length).toBe(1);
      expect(data.doctors[0].name).toBe('Dr. Alam');
    });
  });

  describe('GET /api/doctors/:id', () => {
    it('returns doctor by ID', async () => {
      const createRes = await api('POST', '/api/doctors', { name: 'Dr. Noor', specialty: 'Pediatrics', consultationFee: 500 });
      const createData = await createRes.json() as any;
      const res = await api('GET', `/api/doctors/${createData.id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.doctor.name).toBe('Dr. Noor');
    });

    it('returns 404 for non-existent doctor', async () => {
      const res = await api('GET', '/api/doctors/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/doctors/:id — update', () => {
    it('updates doctor specialty and fee', async () => {
      const createRes = await api('POST', '/api/doctors', { name: 'Dr. Salam', specialty: 'General', consultationFee: 400 });
      const { id } = await createRes.json() as any;

      const res = await api('PUT', `/api/doctors/${id}`, { specialty: 'Surgery', consultationFee: 1200 });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Doctor updated');

      const getRes = await api('GET', `/api/doctors/${id}`);
      const getD = await getRes.json() as any;
      expect(getD.doctor.specialty).toBe('Surgery');
      expect(getD.doctor.consultation_fee).toBe(1200);
    });

    it('returns 404 for non-existent doctor update', async () => {
      const res = await api('PUT', '/api/doctors/9999', { specialty: 'Surgery' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/doctors/:id — soft delete', () => {
    it('deactivates doctor (soft delete)', async () => {
      const createRes = await api('POST', '/api/doctors', { name: 'Dr. Temp', specialty: 'General', consultationFee: 300 });
      const { id } = await createRes.json() as any;

      const res = await api('DELETE', `/api/doctors/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Doctor deactivated');

      // Should not appear in active list
      const listRes = await api('GET', '/api/doctors');
      const listData = await listRes.json() as any;
      const found = listData.doctors.find((d: any) => d.id === id);
      expect(found).toBeUndefined();
    });

    it('returns 404 for non-existent doctor delete', async () => {
      const res = await api('DELETE', '/api/doctors/9999');
      expect(res.status).toBe(404);
    });
  });
});
