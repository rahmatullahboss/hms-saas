import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient } from './helpers/fixtures';
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

describe('Prescriptions API', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient(1, { name: 'Rx Patient', patient_code: 'P-RX001' });
  });

  describe('POST /api/prescriptions — create', () => {
    it('creates a prescription → 201 with rxNo', async () => {
      const res = await api('POST', '/api/prescriptions', {
        patientId,
        chiefComplaint: 'Fever and cough',
        diagnosis: 'URI',
        items: [
          { medicine_name: 'Paracetamol 500mg', dosage: '1+1+1', frequency: 'TDS', duration: '5 days' },
        ],
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.rxNo).toMatch(/^RX-/);
      expect(data.id).toBeGreaterThan(0);
    });

    it('auto-increments rxNo for second prescription', async () => {
      await api('POST', '/api/prescriptions', { patientId, chiefComplaint: 'Headache' });
      const res2 = await api('POST', '/api/prescriptions', { patientId, chiefComplaint: 'Chest pain' });
      const d2 = await res2.json() as any;
      // RX-00001 was first, this should be RX-00002
      expect(d2.rxNo).toBe('RX-00002');
    });

    it('returns 400 for missing patientId', async () => {
      const res = await api('POST', '/api/prescriptions', { chiefComplaint: 'Fever' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/prescriptions — list', () => {
    it('returns prescriptions list', async () => {
      await api('POST', '/api/prescriptions', { patientId, chiefComplaint: 'Cough' });
      const res = await api('GET', '/api/prescriptions');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.prescriptions)).toBe(true);
      expect(data.prescriptions.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by patientId', async () => {
      const p2 = await createPatient(1, { name: 'Other Rx', patient_code: 'P-RX002' });
      await api('POST', '/api/prescriptions', { patientId, chiefComplaint: 'Fever' });
      await api('POST', '/api/prescriptions', { patientId: p2, chiefComplaint: 'Cold' });
      const res = await api('GET', `/api/prescriptions?patient=${patientId}`);
      const data = await res.json() as any;
      expect(data.prescriptions.every((rx: any) => rx.patient_id === patientId)).toBe(true);
    });
  });

  describe('GET /api/prescriptions/:id', () => {
    it('returns prescription with items', async () => {
      const createRes = await api('POST', '/api/prescriptions', {
        patientId,
        chiefComplaint: 'Knee pain',
        items: [{ medicine_name: 'Ibuprofen', dosage: '1+0+1', duration: '3 days' }],
      });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/prescriptions/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.id).toBe(id);
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBe(1);
    });

    it('returns 404 for unknown prescription', async () => {
      const res = await api('GET', '/api/prescriptions/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/prescriptions/:id — update', () => {
    it('updates prescription diagnosis and adds items', async () => {
      const createRes = await api('POST', '/api/prescriptions', { patientId, chiefComplaint: 'Fever' });
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/prescriptions/${id}`, {
        diagnosis: 'Malaria',
        items: [{ medicine_name: 'Chloroquine', dosage: '2+0+2', duration: '3 days' }],
      });
      expect(res.status).toBe(200);
      const detail = await api('GET', `/api/prescriptions/${id}`);
      const d = await detail.json() as any;
      expect(d.diagnosis).toBe('Malaria');
      expect(d.items.length).toBe(1);
    });
  });

  describe('GET /api/prescriptions/:id/print', () => {
    it('returns rich print data', async () => {
      const createRes = await api('POST', '/api/prescriptions', { patientId, chiefComplaint: 'Fever' });
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/prescriptions/${id}/print`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.prescription).toBeDefined();
      expect(data.prescription.patient_name).toBe('Rx Patient');
    });
  });
});
