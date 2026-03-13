import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient, createDoctor } from './helpers/fixtures';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'hospital_admin') {
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

describe('Consultations (Telemedicine) API', () => {
  let patientId: number;
  let doctorId: number;

  beforeEach(async () => {
    patientId = await createPatient(1, { name: 'Consult Patient', patient_code: 'P-C001' });
    doctorId = await createDoctor(1, { name: 'Dr. TeleDoc', specialty: 'Cardiology' });
  });

  describe('POST /api/consultations — book', () => {
    it('creates a consultation → 201 with id', async () => {
      const res = await api('POST', '/api/consultations', {
        doctorId,
        patientId,
        scheduledAt: '2026-03-14T10:00:00',
        durationMin: 30,
        chiefComplaint: 'Chest pain',
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.id).toBeGreaterThan(0);
      expect(data.message).toBe('Consultation booked');
    });

    it('returns 404 for non-existent doctor', async () => {
      const res = await api('POST', '/api/consultations', {
        doctorId: 9999, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 30,
      });
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent patient', async () => {
      const res = await api('POST', '/api/consultations', {
        doctorId, patientId: 9999, scheduledAt: '2026-03-14T10:00:00', durationMin: 30,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/consultations — list', () => {
    it('returns consultations list', async () => {
      await api('POST', '/api/consultations', {
        doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 20,
      });
      const res = await api('GET', '/api/consultations');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.consultations)).toBe(true);
      expect(data.consultations.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by doctorId', async () => {
      const d2 = await createDoctor(1, { name: 'Dr. Other', specialty: 'ENT' });
      await api('POST', '/api/consultations', { doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 20 });
      await api('POST', '/api/consultations', { doctorId: d2, patientId, scheduledAt: '2026-03-14T11:00:00', durationMin: 20 });

      const res = await api('GET', `/api/consultations?doctorId=${doctorId}`);
      const data = await res.json() as any;
      expect(data.consultations.every((c: any) => c.doctor_id === doctorId)).toBe(true);
    });

    it('filters by status', async () => {
      await api('POST', '/api/consultations', { doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 20 });
      const res = await api('GET', '/api/consultations?status=scheduled');
      const data = await res.json() as any;
      expect(data.consultations.every((c: any) => c.status === 'scheduled')).toBe(true);
    });
  });

  describe('GET /api/consultations/:id', () => {
    it('returns single consultation detail', async () => {
      const createRes = await api('POST', '/api/consultations', {
        doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 30,
      });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/consultations/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.consultation.id).toBe(id);
    });

    it('returns 404 for unknown consultation', async () => {
      const res = await api('GET', '/api/consultations/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/consultations/:id — update', () => {
    it('updates scheduled time', async () => {
      const createRes = await api('POST', '/api/consultations', {
        doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 30,
      });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/consultations/${id}`, {
        scheduledAt: '2026-03-14T14:00:00',
        durationMin: 45,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Consultation updated');
    });
  });

  describe('PUT /api/consultations/:id/end — complete consultation', () => {
    it('doctor can end consultation → 200', async () => {
      const createRes = await api('POST', '/api/consultations', {
        doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 30,
      });
      const { id } = await createRes.json() as any;

      // Doctor headers
      const doctorToken = jwt.sign({ userId: '1', tenantId: '1', role: 'doctor', permissions: [] }, TEST_JWT_SECRET, { expiresIn: '1h' });
      const req = new Request(`http://localhost/api/consultations/${id}/end`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', 'Authorization': `Bearer ${doctorToken}` },
        body: JSON.stringify({ prescription: 'Take Paracetamol', followupDate: '2026-03-21' }),
      });
      const res = await app.fetch(req, env as any, {} as any);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.message).toBe('Consultation completed');
    });
  });

  describe('DELETE /api/consultations/:id — cancel', () => {
    it('cancels a scheduled consultation', async () => {
      const createRes = await api('POST', '/api/consultations', {
        doctorId, patientId, scheduledAt: '2026-03-14T10:00:00', durationMin: 30,
      });
      const { id } = await createRes.json() as any;
      const res = await api('DELETE', `/api/consultations/${id}`);
      expect(res.status).toBe(200);
    });
  });
});
