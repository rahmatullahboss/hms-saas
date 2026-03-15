/**
 * 🧪 TEA — Billing Handover API Tests
 * Risk: HIGH — Cash accountability, shift handover integrity.
 * Coverage: Create, list, pending, receive, verify, daily report,
 *   self-handover prevention, validation, tenant isolation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-vitest';

function authHeaders(tenantId = 1, userId = 999) {
  const token = jwt.sign(
    { userId: String(userId), tenantId: String(tenantId), role: 'admin', permissions: [] },
    SECRET,
    { expiresIn: '1h' },
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', Authorization: `Bearer ${token}` };
}

async function api(method: string, path: string, body?: any, tenantId = 1, userId = 999) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(tenantId, userId),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function createStaff(name: string) {
  const result = await env.DB.prepare(
    "INSERT INTO staff (name, address, position, salary, bank_account, mobile, tenant_id) VALUES (?, 'Dhaka', 'Cashier', 20000, 'ACC-002', '01700000001', 1)"
  ).bind(name).run();
  return result.meta.last_row_id as number;
}

describe('Billing Handover API', () => {
  let targetStaffId: number;

  beforeEach(async () => {
    targetStaffId = await createStaff('Reception Staff');
  });

  // ─── Create Handover ────────────────────────────────────────────────────────
  describe('Create handover', () => {
    it('1. Create a basic cash handover', async () => {
      const res = await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 5000,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeDefined();
    });

    it('2. Create handover with all fields', async () => {
      const res = await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 10000,
        due_amount: 500,
        handover_type: 'counter',
        remarks: 'Morning shift handover',
      });
      expect(res.status).toBe(201);
    });

    it('3. Self-handover → 400', async () => {
      // Use the same userId for handover_to to trigger self-handover check
      const userId = 42;
      const res = await api('POST', '/api/billing/handover', {
        handover_to: userId,
        handover_amount: 5000,
      }, 1, userId);
      expect(res.status).toBe(400);
    });
  });

  // ─── List Handovers ─────────────────────────────────────────────────────────
  describe('List handovers', () => {
    it('4. GET / returns handovers list', async () => {
      await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 3000,
      });
      const res = await api('GET', '/api/billing/handover');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.handovers.length).toBeGreaterThan(0);
    });

    it('5. Filter by status', async () => {
      await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 3000,
      });
      const res = await api('GET', '/api/billing/handover?status=pending');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.handovers.length).toBeGreaterThan(0);
    });
  });

  // ─── Pending Handovers ──────────────────────────────────────────────────────
  describe('Pending handovers', () => {
    it('6. GET /pending/:staffId returns pending handovers', async () => {
      await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 5000,
      });
      const res = await api('GET', `/api/billing/handover/pending/${targetStaffId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.pending.length).toBeGreaterThan(0);
    });
  });

  // ─── Receive Handover ───────────────────────────────────────────────────────
  describe('Receive handover', () => {
    it('7. Receive a pending handover', async () => {
      const createRes = await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 5000,
      });
      expect(createRes.status).toBe(201);
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/billing/handover/${id}/receive`, {
        remarks: 'Received and counted',
      });
      expect(res.status).toBe(200);
    });

    it('8. Receive non-existent → 404', async () => {
      const res = await api('PUT', '/api/billing/handover/999999/receive', {});
      expect(res.status).toBe(404);
    });
  });

  // ─── Verify Handover ───────────────────────────────────────────────────────
  describe('Verify handover', () => {
    it('9. Admin verify a handover', async () => {
      const createRes = await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 5000,
      });
      expect(createRes.status).toBe(201);
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/billing/handover/${id}/verify`);
      expect(res.status).toBe(200);
    });
  });

  // ─── Daily Report ──────────────────────────────────────────────────────────
  describe('Daily report', () => {
    it('10. GET /report/daily returns collection vs handover', async () => {
      const res = await api('GET', `/api/billing/handover/report/daily?staff_id=999`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.total_collection).toBeDefined();
      expect(data.total_handover).toBeDefined();
      expect(data.difference).toBeDefined();
    });

    it('11. Daily report without staff_id → 400', async () => {
      const res = await api('GET', '/api/billing/handover/report/daily');
      expect(res.status).toBe(400);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('12. Cross-tenant handover list is empty or blocked', async () => {
      await api('POST', '/api/billing/handover', {
        handover_to: targetStaffId,
        handover_amount: 5000,
      });
      const res = await api('GET', '/api/billing/handover', undefined, 2);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect(data.handovers.length).toBe(0);
      } else {
        expect([403, 404].includes(res.status)).toBe(true);
      }
    });
  });
});
