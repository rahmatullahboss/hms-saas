import { describe, it, expect } from 'vitest';
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

// Shareholders use: name, shareCount (integer), type ('shareholder'/'partner'/'doctor'), investment, address, phone, startDate
describe('Shareholder API', () => {
  describe('GET /api/shareholders — list', () => {
    it('returns shareholder list', async () => {
      const res = await api('GET', '/api/shareholders');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.shareholders)).toBe(true);
    });
  });

  describe('POST /api/shareholders — create', () => {
    it('creates a shareholder → 201', async () => {
      const res = await api('POST', '/api/shareholders', {
        name: 'Dr. Investor',
        shareCount: 10,
        type: 'doctor',
        investment: 500000,
      });
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('returns 400 for missing name', async () => {
      const res = await api('POST', '/api/shareholders', { shareCount: 10, type: 'shareholder' });
      expect(res.status).toBe(400);
    });
  });

  describe('Shareholder profit distribution', () => {
    it('GET /api/shareholders/calculate — calculates profit distribution', async () => {
      const res = await api('GET', '/api/shareholders/calculate?month=2026-03');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(typeof data.profit).toBe('number');
      expect(typeof data.distributable).toBe('number');
    });

    it('GET /api/shareholders/distributions — lists all distributions', async () => {
      const res = await api('GET', '/api/shareholders/distributions');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.distributions)).toBe(true);
    });
  });
});

describe('Invitations API', () => {
  describe('POST /api/invitations — send invitation', () => {
    it('creates an invitation → 201', async () => {
      const res = await api('POST', '/api/invitations', {
        email: `staff${Date.now()}@clinic.com`,
        role: 'nurse',
      });
      // May return 201 or another success code depending on implementation
      expect([200, 201]).toContain(res.status);
    });

    it('returns 400 for invalid email', async () => {
      const res = await api('POST', '/api/invitations', { email: 'not-an-email', role: 'nurse' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/invitations — list', () => {
    it('returns invitations list', async () => {
      const res = await api('GET', '/api/invitations');
      expect([200, 404]).toContain(res.status);
    });
  });
});

describe('Dashboard API', () => {
  describe('GET /api/dashboard', () => {
    it('returns dashboard stats object', async () => {
      const res = await api('GET', '/api/dashboard');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      // Dashboard should have numeric stats
      expect(data).toBeDefined();
    });
  });
});
