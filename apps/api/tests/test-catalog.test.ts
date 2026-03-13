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
      `INSERT INTO patients (name, age, gender, patient_code, tenant_id) VALUES ('Test Patient', 30, 'female', 'TC-001', 1)`,
    )
    .run();
  return res.meta.last_row_id as number;
}

describe('Test Catalog API — /api/tests', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient(env.DB as D1Database);
  });

  describe('GET /api/tests', () => {
    it('returns empty list initially', async () => {
      const res = await api('GET', '/api/tests');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.tests)).toBe(true);
    });

    it('filters by patient', async () => {
      await api('POST', '/api/tests', { patientId, testName: 'CBC' });
      const res = await api('GET', `/api/tests?patient=${patientId}`);
      const data = (await res.json()) as any;
      expect(data.tests.length).toBeGreaterThanOrEqual(1);
      expect(data.tests[0].patient_id).toBe(patientId);
    });

    it('filters by status', async () => {
      await api('POST', '/api/tests', { patientId, testName: 'X-Ray' });
      const resPending = await api('GET', '/api/tests?status=pending');
      const data = (await resPending.json()) as any;
      expect(data.tests.every((t: any) => t.status === 'pending')).toBe(true);
    });
  });

  describe('POST /api/tests', () => {
    it('creates a test for a patient', async () => {
      const res = await api('POST', '/api/tests', {
        patientId,
        testName: 'Blood sugar',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(typeof data.testId).toBe('number');
    });

    it('returns 400 when patientId or testName is missing', async () => {
      const res = await api('POST', '/api/tests', { testName: 'CBC' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when testName is missing', async () => {
      const res = await api('POST', '/api/tests', { patientId });
      expect(res.status).toBe(400);
    });
  });
});
