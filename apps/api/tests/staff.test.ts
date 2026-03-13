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

// Staff schema: name, address (required), position, salary (int >= 0), bankAccount (required), mobile (11-15 chars)
const staffPayload = () => ({
  name: `Staff ${Date.now()}`,
  address: 'Dhaka, Bangladesh',
  position: 'Nurse',
  salary: 15000,
  bankAccount: '1234567890',
  mobile: '01711111111',
  joiningDate: '2026-01-01',
});

describe('Staff API — Integration', () => {
  describe('POST /api/staff — create', () => {
    it('creates a staff member → 201', async () => {
      const res = await api('POST', '/api/staff', staffPayload());
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('returns 400 for missing bankAccount', async () => {
      const { bankAccount, ...incomplete } = staffPayload();
      const res = await api('POST', '/api/staff', incomplete);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/staff — list active staff', () => {
    it('returns staff list', async () => {
      await api('POST', '/api/staff', staffPayload());
      const res = await api('GET', '/api/staff');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.staff)).toBe(true);
    });
  });

  describe('GET /api/staff/:id', () => {
    it('returns staff member detail', async () => {
      const createRes = await api('POST', '/api/staff', staffPayload());
      const { id } = await createRes.json() as any;
      const res = await api('GET', `/api/staff/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.staff).toBeDefined();
    });

    it('returns 404 for unknown staff', async () => {
      const res = await api('GET', '/api/staff/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/staff/:id — update', () => {
    it('updates staff salary', async () => {
      const createRes = await api('POST', '/api/staff', staffPayload());
      const { id } = await createRes.json() as any;
      const res = await api('PUT', `/api/staff/${id}`, { salary: 20000 });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/staff/:id — soft deactivate', () => {
    it('deactivates staff member', async () => {
      const createRes = await api('POST', '/api/staff', staffPayload());
      const { id } = await createRes.json() as any;
      const res = await api('DELETE', `/api/staff/${id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Salary Management', () => {
    it('POST /api/staff/:id/salary — pays salary', async () => {
      const createRes = await api('POST', '/api/staff', staffPayload());
      const { id } = await createRes.json() as any;
      const month = `2026-0${Math.floor(Math.random() * 9) + 1}`;
      const res = await api('POST', `/api/staff/${id}/salary`, {
        month,
        bonus: 0,
        deduction: 0,
        paymentMethod: 'cash',
      });
      // 201 on first payment; 409 if already paid for month
      expect([201, 409]).toContain(res.status);
    });
  });

  describe('GET /api/staff/salary-report', () => {
    it('returns monthly salary report', async () => {
      const res = await api('GET', '/api/staff/salary-report?month=2026-03');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.staff)).toBe(true);
    });
  });
});
