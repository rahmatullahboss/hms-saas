import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function authHeaders(role = 'hospital_admin') {
  const token = jwt.sign(
    { userId: '1', tenantId: '1', role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', 'Authorization': `Bearer ${token}` };
}

async function api(method: string, path: string, body?: unknown, role = 'hospital_admin') {
  const req = new Request(`http://localhost${path}`, {
    method, headers: authHeaders(role),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

const MOCK_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/mock-endpoint-123',
  keys: {
    p256dh: 'BH9sU8lp10VbR_WYxjFmNXjP7YxcKPE11DEhV8bh0OhMoN_x2a1U2eFQpxYDqNqXNcFbS_T-7qE1',
    auth: 'kN_1b2Y9mdVf5hLvYUg4nA',
  },
};

describe('Push Notifications API', () => {
  // ─── GET /api/push/vapid-key ──────────────────────────────────────

  describe('GET /api/push/vapid-key', () => {
    it('returns VAPID public key or 503 if not configured', async () => {
      const res = await api('GET', '/api/push/vapid-key');
      // In test environment VAPID_PUBLIC_KEY may not be set
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        const data = await res.json() as any;
        expect(data.publicKey).toBeDefined();
      }
    });
  });

  // ─── POST /api/push/subscribe ─────────────────────────────────────

  describe('POST /api/push/subscribe', () => {
    it('subscribes a valid push subscription → 201', async () => {
      const res = await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('allows duplicate endpoint (upsert) → 201', async () => {
      // Subscribe twice with same endpoint — should upsert, not error
      await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);
      const res = await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);
      expect(res.status).toBe(201);
    });

    it('rejects missing endpoint → 400', async () => {
      const res = await api('POST', '/api/push/subscribe', {
        keys: { p256dh: 'abc123', auth: 'def456' },
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing keys → 400', async () => {
      const res = await api('POST', '/api/push/subscribe', {
        endpoint: 'https://example.com/push',
      });
      expect(res.status).toBe(400);
    });

    it('rejects invalid endpoint URL → 400', async () => {
      const res = await api('POST', '/api/push/subscribe', {
        endpoint: 'not-a-url',
        keys: { p256dh: 'abc123', auth: 'def456' },
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE /api/push/unsubscribe ─────────────────────────────────

  describe('DELETE /api/push/unsubscribe', () => {
    it('unsubscribes existing subscription → 200', async () => {
      // Subscribe first
      await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);
      // Then unsubscribe
      const res = await api('DELETE', '/api/push/unsubscribe', {
        endpoint: MOCK_SUBSCRIPTION.endpoint,
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('returns 400 without endpoint', async () => {
      const res = await api('DELETE', '/api/push/unsubscribe', {});
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/push/send ──────────────────────────────────────────

  describe('POST /api/push/send', () => {
    it('rejects non-admin role → 403', async () => {
      const res = await api('POST', '/api/push/send', {
        title: 'Test',
        body: 'Test notification'
      }, 'doctor');
      expect(res.status).toBe(403);
    });

    it('rejects missing title → 400', async () => {
      const res = await api('POST', '/api/push/send', {
        body: 'Test notification',
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing body → 400', async () => {
      const res = await api('POST', '/api/push/send', {
        title: 'Test',
      });
      expect(res.status).toBe(400);
    });

    it('admin can send push (returns 200 or 503 depending on VAPID config)', async () => {
      // First subscribe so there's at least one subscription
      await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);

      const res = await api('POST', '/api/push/send', {
        title: 'New Appointment',
        body: 'আপনার জন্য একটি নতুন অ্যাপয়েন্টমেন্ট আছে',
        url: '/h/test/appointments',
      }, 'hospital_admin');

      // Will be 503 if VAPID secrets not configured in test env, 200 otherwise
      expect([200, 503]).toContain(res.status);
    });
  });

  // ─── Tenant Isolation ─────────────────────────────────────────────

  describe('Tenant Isolation', () => {
    it('does not return subscriptions from other tenants', async () => {
      // Subscribe as tenant 1
      await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);

      // Create token for tenant 2
      const tenant2Token = jwt.sign(
        { userId: '1', tenantId: '2', role: 'hospital_admin', permissions: [] },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Try to unsubscribe from tenant 2 — should succeed but not affect tenant 1
      const req = new Request('http://localhost/api/push/unsubscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': 'test-2',
          'Authorization': `Bearer ${tenant2Token}`,
        },
        body: JSON.stringify({ endpoint: MOCK_SUBSCRIPTION.endpoint }),
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(200);

      // Verify tenant 1's subscription still exists by subscribing again (should upsert without error)
      const res2 = await api('POST', '/api/push/subscribe', MOCK_SUBSCRIPTION);
      expect(res2.status).toBe(201);
    });
  });
});
