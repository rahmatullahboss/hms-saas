import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders() {
  // userId=10 — a user linked to a doctor profile we'll create in beforeEach
  const token = jwt.sign(
    { userId: '10', tenantId: '1', role: 'doctor', permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    Authorization: `Bearer ${token}`,
  };
}

async function api(path: string) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'GET',
      headers: authHeaders(),
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

describe('Doctor Dashboard API — /api/doctors/dashboard', () => {
  beforeEach(async () => {
    // Create a doctor record linked to userId=10
    await (env.DB as D1Database)
      .prepare(
        `INSERT INTO doctors (name, specialty, user_id, tenant_id) VALUES ('Dr. Dashboard', 'Internal Medicine', 10, 1)`,
      )
      .run();
  });

  it('returns dashboard data including doctor, kpi, queue, visitTypes, recentRx, followUps', async () => {
    const res = await api('/api/doctors/dashboard');
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.doctor).toBeDefined();
    expect(data.kpi).toBeDefined();
    expect(typeof data.kpi.total).toBe('number');
    expect(typeof data.kpi.completed).toBe('number');
    expect(Array.isArray(data.queue)).toBe(true);
    expect(Array.isArray(data.recentRx)).toBe(true);
    expect(Array.isArray(data.followUps)).toBe(true);
    expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns 404 when no doctor profile is linked to the user', async () => {
    // Create token for userId=99 (no doctor profile)
    const token = jwt.sign(
      { userId: '99', tenantId: '1', role: 'doctor', permissions: [] },
      TEST_JWT_SECRET,
      { expiresIn: '1h' },
    );
    const res = await app.fetch(
      new Request('http://localhost/api/doctors/dashboard', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': 'test',
          Authorization: `Bearer ${token}`,
        },
      }),
      env as any,
      { waitUntil: () => {}, passThroughOnException: () => {} } as any,
    );
    expect(res.status).toBe(404);
  });
});
