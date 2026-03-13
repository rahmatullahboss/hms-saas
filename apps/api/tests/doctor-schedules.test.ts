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

async function createDoctor(db: D1Database): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO doctors (name, specialty, tenant_id) VALUES ('Dr. Schedule', 'General', 1)`,
    )
    .run();
  return res.meta.last_row_id as number;
}

describe('Doctor Schedule API — /api/doctor-schedules', () => {
  let doctorId: number;

  beforeEach(async () => {
    doctorId = await createDoctor(env.DB as D1Database);
  });

  describe('GET /api/doctor-schedules', () => {
    it('returns empty schedules initially', async () => {
      const res = await api('GET', '/api/doctor-schedules');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.schedules)).toBe(true);
    });

    it('filters by doctor_id', async () => {
      await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'mon',
        start_time: '09:00',
        end_time: '13:00',
      });
      const res = await api('GET', `/api/doctor-schedules?doctor_id=${doctorId}`);
      const data = (await res.json()) as any;
      expect(data.schedules.length).toBeGreaterThanOrEqual(1);
      expect(data.schedules[0].doctor_id).toBe(doctorId);
    });
  });

  describe('GET /api/doctor-schedules/doctors', () => {
    it('returns list of doctors with schedule counts', async () => {
      const res = await api('GET', '/api/doctor-schedules/doctors');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.doctors)).toBe(true);
    });
  });

  describe('POST /api/doctor-schedules', () => {
    it('creates a schedule slot', async () => {
      const res = await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'tue',
        start_time: '10:00',
        end_time: '14:00',
        session_type: 'morning',
        max_patients: 30,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(typeof data.id).toBe('number');
    });

    it('returns 404 for unknown doctor', async () => {
      const res = await api('POST', '/api/doctor-schedules', {
        doctor_id: 999999,
        day_of_week: 'wed',
        start_time: '09:00',
        end_time: '12:00',
      });
      expect(res.status).toBe(404);
    });

    it('returns 409 when schedule overlaps', async () => {
      await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'thu',
        start_time: '09:00',
        end_time: '13:00',
      });
      const res = await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'thu',
        start_time: '10:00',
        end_time: '12:00',
      });
      expect(res.status).toBe(409);
    });

    it('returns 400 for invalid day_of_week', async () => {
      const res = await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'monday',
        start_time: '09:00',
        end_time: '13:00',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/doctor-schedules/:id', () => {
    it('updates schedule fields', async () => {
      const create = await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'fri',
        start_time: '08:00',
        end_time: '12:00',
      });
      const { id } = (await create.json()) as any;
      const res = await api('PUT', `/api/doctor-schedules/${id}`, {
        max_patients: 50,
        chamber: 'Room 3',
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await api('PUT', `/api/doctor-schedules/999999`, { chamber: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/doctor-schedules/:id', () => {
    it('soft-deletes a schedule', async () => {
      const create = await api('POST', '/api/doctor-schedules', {
        doctor_id: doctorId,
        day_of_week: 'sat',
        start_time: '09:00',
        end_time: '11:00',
      });
      const { id } = (await create.json()) as any;
      const res = await api('DELETE', `/api/doctor-schedules/${id}`);
      expect(res.status).toBe(200);

      // Should no longer appear in GET
      const list = await api('GET', `/api/doctor-schedules?doctor_id=${doctorId}`);
      const data = (await list.json()) as any;
      expect(data.schedules.find((s: any) => s.id === id)).toBeUndefined();
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await api('DELETE', `/api/doctor-schedules/999999`);
      expect(res.status).toBe(404);
    });
  });
});
