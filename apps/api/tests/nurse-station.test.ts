import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'admin') {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    Authorization: `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function createPatient(db: D1Database): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO patients (name, age, gender, patient_code, tenant_id) VALUES ('Vitals Patient', 45, 'male', 'VP-001', 1)`,
    )
    .run();
  return res.meta.last_row_id as number;
}

describe('Nurse Station API — /api/nurse-station', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient(env.DB as D1Database);
  });

  describe('GET /api/nurse-station/dashboard', () => {
    it('returns dashboard with patients and stats', async () => {
      const res = await api('GET', '/api/nurse-station/dashboard');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.patients)).toBe(true);
      expect(data.stats).toBeDefined();
      expect(typeof data.stats.activePatients).toBe('number');
      expect(typeof data.stats.pendingVitals).toBe('number');
    });
  });

  describe('GET /api/nurse-station/vitals', () => {
    it('returns empty vitals list initially', async () => {
      const res = await api('GET', '/api/nurse-station/vitals');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.vitals)).toBe(true);
    });

    it('respects limit param', async () => {
      const res = await api('GET', '/api/nurse-station/vitals?limit=5');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/nurse-station/vitals', () => {
    it('records vitals for a patient', async () => {
      const res = await api('POST', '/api/nurse-station/vitals', {
        patient_id: patientId,
        systolic: 120,
        diastolic: 80,
        temperature: 98.6,
        heart_rate: 75,
        spo2: 98,
        respiratory_rate: 16,
        weight: 70,
        notes: 'Stable',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(typeof data.id).toBe('number');
    });

    it('allows partial vitals entry', async () => {
      const res = await api('POST', '/api/nurse-station/vitals', {
        patient_id: patientId,
        spo2: 96,
        notes: 'Quick check',
      });
      expect(res.status).toBe(201);
    });

    it('returns 400 when patient_id is missing', async () => {
      const res = await api('POST', '/api/nurse-station/vitals', {
        systolic: 120,
        diastolic: 80,
      });
      expect(res.status).toBe(400);
    });

    it('appears in GET vitals list after recording', async () => {
      await api('POST', '/api/nurse-station/vitals', {
        patient_id: patientId,
        heart_rate: 80,
      });
      const res = await api('GET', '/api/nurse-station/vitals');
      const data = (await res.json()) as any;
      expect(data.vitals.length).toBeGreaterThan(0);
      expect(data.vitals[0].patient_id).toBe(patientId);
    });
  });
});
