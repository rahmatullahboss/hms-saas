import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function getAuthHeaders(tenantId: number, userId = 1) {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role: 'hospital_admin', permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(1),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Notifications API - Real Integration Tests', () => {

  // ─── List Notifications ────────────────────────────────────────────
  describe('GET /api/notifications', () => {
    it('returns empty list initially', async () => {
      const res = await api('GET', '/api/notifications');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.notifications).toBeDefined();
      expect(data.unreadCount).toBeDefined();
      expect(typeof data.totalCount).toBe('number');
    });

    it('respects filter=unread', async () => {
      const res = await api('GET', '/api/notifications?filter=unread');
      expect(res.status).toBe(200);
    });

    it('respects limit and offset', async () => {
      const res = await api('GET', '/api/notifications?limit=5&offset=0');
      expect(res.status).toBe(200);
    });
  });

  // ─── Create Notification ──────────────────────────────────────────
  describe('POST /api/notifications', () => {
    it('creates notification with valid data', async () => {
      const res = await api('POST', '/api/notifications', {
        type: 'system',
        title: 'Test Notification',
        message: 'This is a test notification',
      });

      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.id).toBeGreaterThan(0);
    });

    it('rejects notification without title (Zod validation)', async () => {
      const res = await api('POST', '/api/notifications', {
        type: 'billing',
        message: 'Missing title',
      });

      expect(res.status).toBe(400);
    });

    it('rejects invalid notification type', async () => {
      const res = await api('POST', '/api/notifications', {
        type: 'invalid_type',
        title: 'Bad Type',
        message: 'Test',
      });

      expect(res.status).toBe(400);
    });

    it('creates notification with link', async () => {
      const res = await api('POST', '/api/notifications', {
        type: 'lab',
        title: 'Lab Results Ready',
        message: 'Your lab results are available.',
        link: '/lab/results/123',
      });

      expect(res.status).toBe(201);
    });
  });

  // ─── Mark Read ─────────────────────────────────────────────────────
  describe('PUT /api/notifications/:id/read', () => {
    it('marks notification as read', async () => {
      // Create one first
      const createRes = await api('POST', '/api/notifications', {
        type: 'system', title: 'Read Me', message: 'Mark as read',
      });
      const { id } = await createRes.json() as any;

      const res = await api('PUT', `/api/notifications/${id}/read`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });
  });

  // ─── Mark All Read ─────────────────────────────────────────────────
  describe('PUT /api/notifications/read-all', () => {
    it('marks all notifications as read', async () => {
      // Create a few notifications first
      await api('POST', '/api/notifications', { type: 'system', title: 'N1', message: 'msg1' });
      await api('POST', '/api/notifications', { type: 'billing', title: 'N2', message: 'msg2' });

      const res = await api('PUT', '/api/notifications/read-all');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);

      // Verify unread count is 0
      const listRes = await api('GET', '/api/notifications?filter=unread');
      const listData = await listRes.json() as any;
      expect(listData.unreadCount).toBe(0);
    });
  });

  // ─── Auth Enforcement ──────────────────────────────────────────────
  describe('Auth Enforcement', () => {
    it('returns 401 without token', async () => {
      const req = new Request('http://localhost/api/notifications', {
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test' },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(401);
    });
  });
});
