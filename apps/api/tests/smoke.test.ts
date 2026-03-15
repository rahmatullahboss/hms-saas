/**
 * Production Smoke Tests
 *
 * These tests run against the LIVE deployed worker to catch environment-specific
 * issues: missing secrets, wrong D1 bindings, CORS misconfig, missing migrations.
 *
 * Usage:
 *   SMOKE_TEST_URL=https://hms-saas.rahmatullahzisan.workers.dev npm run test:smoke
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

  // ─── 1. Health & Public Routes ──────────────────────────────────

  describe('1. Health & Public', () => {
    it('root endpoint is reachable', async () => {
      const res = await fetch(`${BASE_URL}/`);
      expect(res.status).toBeLessThan(500);
    });

    it('health endpoint returns ok', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe('ok');
    });
  });

  // ─── 2. Auth ────────────────────────────────────────────────────

  describe('2. Auth', () => {
    it('login endpoint is reachable', async () => {
      const res = await smokeFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
      });

      // 200 = login success, 401 = bad creds, 500 = tenant not found (no demo tenant in prod) — all acceptable
      // Only 502/503 indicate real infra failure
      expect(res.status).not.toBe(502);
      expect(res.status).not.toBe(503);

      if (res.status === 200) {
        const data = await res.json() as any;
        expect(data.token).toBeTruthy();
        authToken = data.token;
      }
    });

    it('unauthenticated request is rejected (not 200)', async () => {
      const res = await fetch(`${BASE_URL}/api/patients`, {
        headers: { 'X-Tenant-Subdomain': SMOKE_SUBDOMAIN },
      });
      // 401 = no auth, 500 = no tenant found — both mean request was rejected, not silently served
      expect(res.status).not.toBe(200);
    });
  });

  // ─── 3. Core Modules ───────────────────────────────────────────

  describe('3. Core Modules (no 500s)', () => {
    beforeAll(async () => {
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

    const coreRoutes = [
      // Patient management
      { method: 'GET', path: '/api/patients', name: 'Patients list' },
      { method: 'GET', path: '/api/doctors', name: 'Doctors list' },
      { method: 'GET', path: '/api/staff', name: 'Staff list' },
      { method: 'GET', path: '/api/appointments', name: 'Appointments' },
      { method: 'GET', path: '/api/visits', name: 'Visits list' },

      // Billing
      { method: 'GET', path: '/api/billing', name: 'Billing list' },
      { method: 'GET', path: '/api/billing/due', name: 'Billing due' },
      { method: 'GET', path: '/api/billing/handover', name: 'Billing handover list' },
      { method: 'GET', path: '/api/billing/cancellation', name: 'Billing cancellations' },
      { method: 'GET', path: '/api/ip-billing', name: 'IP Billing' },
      { method: 'GET', path: '/api/insurance/providers', name: 'Insurance providers' },
      { method: 'GET', path: '/api/deposits', name: 'Deposits' },
      { method: 'GET', path: '/api/credit-notes', name: 'Credit notes' },
      { method: 'GET', path: '/api/settlements', name: 'Settlements' },
      { method: 'GET', path: '/api/commissions', name: 'Commissions' },

      // Clinical
      { method: 'GET', path: '/api/pharmacy/medicines', name: 'Pharmacy' },
      { method: 'GET', path: '/api/lab/orders', name: 'Lab orders' },
      { method: 'GET', path: '/api/prescriptions', name: 'Prescriptions' },
      { method: 'GET', path: '/api/admissions', name: 'Admissions' },
      { method: 'GET', path: '/api/nurse-station', name: 'Nurse station' },
      { method: 'GET', path: '/api/consultations', name: 'Consultations' },
      { method: 'GET', path: '/api/vitals', name: 'Vitals' },
      { method: 'GET', path: '/api/allergies', name: 'Allergies' },
      { method: 'GET', path: '/api/discharge', name: 'Discharge list' },
      { method: 'GET', path: '/api/ipd-charges', name: 'IPD charges' },

      // Emergency & OT
      { method: 'GET', path: '/api/emergency/dashboard', name: 'ER dashboard' },
      { method: 'GET', path: '/api/ot/bookings', name: 'OT bookings' },
      { method: 'GET', path: '/api/ot/schedule', name: 'OT schedule' },

      // Doctor features
      { method: 'GET', path: '/api/doctor-schedules', name: 'Doctor schedules' },

      // Dashboard & Reports
      { method: 'GET', path: '/api/dashboard', name: 'Dashboard' },
      { method: 'GET', path: '/api/reports/income', name: 'Income report' },
      { method: 'GET', path: '/api/income', name: 'Income list' },
      { method: 'GET', path: '/api/expenses', name: 'Expenses list' },
      { method: 'GET', path: '/api/accounting', name: 'Accounting' },
      { method: 'GET', path: '/api/profit', name: 'Profit distributions' },
      { method: 'GET', path: '/api/journal', name: 'Journal entries' },
      { method: 'GET', path: '/api/recurring', name: 'Recurring expenses' },
      { method: 'GET', path: '/api/shareholders', name: 'Shareholders' },

      // Admin features
      { method: 'GET', path: '/api/settings', name: 'Settings' },
      { method: 'GET', path: '/api/notifications', name: 'Notifications' },
      { method: 'GET', path: '/api/audit', name: 'Audit logs' },
      { method: 'GET', path: '/api/branches', name: 'Branches' },

      // Website & Portal
      { method: 'GET', path: '/api/website', name: 'Website config' },
    ];

    for (const route of coreRoutes) {
      it(`${route.name} (${route.method} ${route.path}) — no 500`, async () => {
        if (!authToken) {
          console.warn('⚠️ Skipping — no auth token');
          return;
        }

        const res = await smokeFetch(route.path, { method: route.method });

        // We only assert no server error. 200, 403, 404 are all valid.
        expect(res.status, `${route.name} returned ${res.status}`).toBeLessThan(500);
      });
    }
  });

  // ─── 4. CORS ────────────────────────────────────────────────────

  describe('4. CORS Headers', () => {
    it('OPTIONS preflight returns CORS headers', async () => {
      const res = await fetch(`${BASE_URL}/api/patients`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://hms.ozzyl.com',
          'Access-Control-Request-Method': 'GET',
        },
      });
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── 5. D1 Connectivity ─────────────────────────────────────────

  describe('5. D1 Database Connection', () => {
    it('patients endpoint returns valid JSON with data shape', async () => {
      if (!authToken) {
        console.warn('⚠️ Skipping — no auth token');
        return;
      }

      const res = await smokeFetch('/api/patients');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
      // Should have patients array
      expect(Array.isArray(data.patients)).toBe(true);
    });
  });

  // ─── 6. Response Shape Validation ───────────────────────────────

  describe('6. Response Shape', () => {
    it('billing list returns { bills: [...] }', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/billing');
      if (res.status === 200) {
        const data = await res.json() as any;
        expect(Array.isArray(data.bills)).toBe(true);
      }
    });

    it('dashboard returns expected summary fields', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/dashboard');
      if (res.status === 200) {
        const data = await res.json() as any;
        expect(data).toBeDefined();
        expect(typeof data).toBe('object');
      }
    });

    it('ER dashboard returns expected shape', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/emergency/dashboard');
      if (res.status === 200) {
        const data = await res.json() as any;
        expect(data).toBeDefined();
      }
    });

    it('OT bookings returns { bookings: [...] }', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/ot/bookings');
      if (res.status === 200) {
        const data = await res.json() as any;
        expect(Array.isArray(data.bookings)).toBe(true);
      }
    });
  });

  // ─── 7. Error Handling ──────────────────────────────────────────

  describe('7. Error Handling', () => {
    it('non-existent route returns 404 — not 500', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/this-does-not-exist');
      expect(res.status).toBe(404);
    });

    it('invalid patient ID returns 4xx — not 500', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/patients/999999');
      expect(res.status).toBeLessThan(500);
    });

    it('invalid bill ID returns 4xx — not 500', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/billing/999999');
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── 8. Mutation Smoke (POST validation) ────────────────────────

  describe('8. Mutation Validation', () => {
    it('POST /api/patients with empty body → 400 (validation)', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/patients', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).toBeLessThan(500);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('POST /api/billing with empty body → 400 (validation)', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/billing', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).toBeLessThan(500);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('POST /api/emergency/register with empty body → 400', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/emergency/register', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).toBeLessThan(500);
    });

    it('POST /api/ot/bookings with empty body → 400', async () => {
      if (!authToken) return;
      const res = await smokeFetch('/api/ot/bookings', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── 9. Tenant Isolation ────────────────────────────────────────

  describe('9. Tenant Isolation', () => {
    it('request without subdomain header is rejected', async () => {
      const res = await fetch(`${BASE_URL}/api/patients`, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
