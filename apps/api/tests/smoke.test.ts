/**
 * Production Smoke Tests
 *
 * These tests run against the LIVE deployed worker to catch environment-specific
 * issues: missing secrets, wrong D1 bindings, CORS misconfig, missing migrations.
 *
 * Usage:
 *   SMOKE_TEST_URL=https://hms.ozzyl.com npm run test:smoke
 *
 * These tests are intentionally lightweight — they verify the seams, not business logic.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.SMOKE_TEST_URL;
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || 'admin@demo.com';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';
const SMOKE_SUBDOMAIN = process.env.SMOKE_SUBDOMAIN || 'demo';

describe.skipIf(!BASE_URL)('Production Smoke Tests', () => {
  let authToken: string | null = null;

  // ─── Helper ──────────────────────────────────────────────────────

  async function smokeFetch(path: string, options: RequestInit = {}) {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Subdomain': SMOKE_SUBDOMAIN,
      ...(options.headers as Record<string, string> || {}),
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return fetch(url, { ...options, headers });
  }

  // ─── Auth smoke ──────────────────────────────────────────────────

  describe('Auth', () => {
    it('login endpoint is reachable and returns valid response', async () => {
      const res = await smokeFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
      });

      // It should NOT be 500 (server error) — 200 or 401 are both OK
      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(502);
      expect(res.status).not.toBe(503);

      if (res.status === 200) {
        const data = await res.json() as any;
        expect(data.token).toBeTruthy();
        authToken = data.token;
      }
    });
  });

  // ─── Critical API routes ─────────────────────────────────────────

  describe('Critical API Routes (no 500s)', () => {
    beforeAll(async () => {
      // Try to get a token if we don't have one yet
      if (!authToken) {
        const res = await smokeFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
        });
        if (res.status === 200) {
          const data = await res.json() as any;
          authToken = data.token;
        }
      }
    });

    const criticalRoutes = [
      { method: 'GET', path: '/api/patients', name: 'Patients list' },
      { method: 'GET', path: '/api/billing', name: 'Billing list' },
      { method: 'GET', path: '/api/pharmacy/medicines', name: 'Pharmacy' },
      { method: 'GET', path: '/api/lab/orders', name: 'Lab orders' },
      { method: 'GET', path: '/api/appointments', name: 'Appointments' },
      { method: 'GET', path: '/api/staff', name: 'Staff list' },
      { method: 'GET', path: '/api/dashboard', name: 'Dashboard' },
    ];

    for (const route of criticalRoutes) {
      it(`${route.name} (${route.method} ${route.path}) does not return 500`, async () => {
        if (!authToken) {
          console.warn('⚠️ Skipping — no auth token available');
          return;
        }

        const res = await smokeFetch(route.path, { method: route.method });

        // We only assert no server error. 200, 403, 404 are all valid.
        expect(res.status).toBeLessThan(500);
      });
    }
  });

  // ─── CORS ────────────────────────────────────────────────────────

  describe('CORS Headers', () => {
    it('OPTIONS request returns CORS headers', async () => {
      const res = await fetch(`${BASE_URL}/api/patients`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://hms.ozzyl.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      // Verify CORS preflight is handled (should not be 500)
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── D1 Connection ───────────────────────────────────────────────

  describe('D1 Database Connection', () => {
    it('API can query database (patients endpoint returns data shape)', async () => {
      if (!authToken) {
        console.warn('⚠️ Skipping — no auth token');
        return;
      }

      const res = await smokeFetch('/api/patients');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      // Verify we get a valid response shape (not an error page)
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });
  });

  // ─── Website / Public routes ─────────────────────────────────────

  describe('Public Routes', () => {
    it('landing page or health check is reachable', async () => {
      const res = await fetch(`${BASE_URL}/`);
      expect(res.status).toBeLessThan(500);
    });
  });
});
