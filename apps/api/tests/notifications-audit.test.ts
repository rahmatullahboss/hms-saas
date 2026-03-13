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

describe('Notifications API', () => {
  // Seed a notification via POST first
  async function seedNotification() {
    const res = await api('POST', '/api/notifications', {
      type: 'system',
      title: 'Test Notification',
      message: 'This is a test notification',
    });
    const data = await res.json() as any;
    return data.id as number;
  }

  describe('GET /api/notifications — list', () => {
    it('returns notifications list', async () => {
      await seedNotification();
      const res = await api('GET', '/api/notifications');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.notifications)).toBe(true);
      expect(data.unreadCount).toBeGreaterThanOrEqual(0);
    });

    it('filters by unread (filter=unread)', async () => {
      await seedNotification();
      const res = await api('GET', '/api/notifications?filter=unread');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.notifications)).toBe(true);
    });
  });

  describe('PUT /api/notifications/:id/read — mark as read', () => {
    it('marks a single notification as read → 200', async () => {
      const id = await seedNotification();
      const res = await api('PUT', `/api/notifications/${id}/read`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });
  });

  describe('PUT /api/notifications/read-all — mark all read', () => {
    it('marks all notifications as read → 200', async () => {
      await seedNotification();
      const res = await api('PUT', '/api/notifications/read-all');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });
  });
});

describe('Audit Log API', () => {
  describe('GET /api/audit — admin access', () => {
    it('returns audit log entries', async () => {
      const res = await api('GET', '/api/audit');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data.auditLogs)).toBe(true);
    });
  });
});
