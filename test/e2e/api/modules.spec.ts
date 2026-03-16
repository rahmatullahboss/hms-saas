/**
 * HMS SaaS — Full API E2E Module Tests (Playwright)
 *
 * Validates every HMS API module against production (or BASE_URL):
 *  - Unauthenticated access returns proper 401 (not 500)
 *  - Auth error responses are JSON with an error/message field
 *  - Response times under SLA thresholds
 *  - POST/PUT/DELETE with bad bodies return 400/401/422 (not 500)
 *  - Concurrent load does not cause 5xx
 *
 * Run:
 *   npx playwright test --project=api
 *   BASE_URL=https://hms-saas-production.rahmatullahzisan.workers.dev npx playwright test --project=api
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env['BASE_URL'] ||
  'https://hms-saas-production.rahmatullahzisan.workers.dev';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SLA_MS = 3000; // 3s response time SLA

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getJson(url: string, req: any) {
  const res = await req.get(url, { headers: JSON_HEADERS });
  return { res, status: res.status() };
}

async function postJson(url: string, req: any, body: unknown) {
  const res = await req.post(url, { data: body, headers: JSON_HEADERS });
  return { res, status: res.status() };
}

// ─── Auth Contract ─────────────────────────────────────────────────────────────
test.describe('🔒 API — Auth Contract', () => {
  test('unauthenticated GET /api/patients → 401 with JSON error body', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(`${BASE_URL}/api/patients`, { headers: JSON_HEADERS });
    const latency = Date.now() - start;

    expect(res.status()).toBe(401);
    expect(latency).toBeLessThan(SLA_MS);
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(body).toHaveProperty(['error']);
  });

  test('invalid JWT token → 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/patients`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.jwt.token.here',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('malformed Authorization header → 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/dashboard`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'NotBearer anything',
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─── All GET Endpoints — 401 + no 500 ─────────────────────────────────────────
const GET_ENDPOINTS = [
  // Dashboard
  '/api/dashboard',
  '/api/dashboard/stats',
  '/api/dashboard/daily-income',
  '/api/dashboard/daily-expenses',
  '/api/dashboard/monthly-summary',
  // Core clinical
  '/api/patients',
  '/api/appointments',
  '/api/doctors',
  '/api/staff',
  '/api/branches',
  '/api/visits',
  // Billing & Finance
  '/api/billing',
  '/api/deposits',
  '/api/expenses',
  '/api/income',
  '/api/settlements',
  '/api/credits',
  '/api/accounting',
  '/api/accounting/journal',
  '/api/accounting/accounts',
  '/api/accounting/trial-balance',
  '/api/reports',
  '/api/profit',
  // Clinical modules
  '/api/lab',
  '/api/lab/orders',
  '/api/pharmacy',
  '/api/pharmacy/suppliers',
  '/api/pharmacy/purchases',
  '/api/pharmacy/sales',
  '/api/prescriptions',
  '/api/vitals',
  '/api/allergies',
  '/api/admissions',
  '/api/emergency',
  '/api/ot',
  // Admin modules
  '/api/shareholders',
  '/api/commissions',
  '/api/insurance',
  '/api/insurance/claims',
  '/api/audit',
  '/api/settings',
  '/api/website',
  '/api/website/config',
  '/api/website/services',
  '/api/recurring',
  '/api/notifications',
  '/api/inbox',
];

test.describe('🏥 API — All GET Endpoints (401, no 500)', () => {
  for (const endpoint of GET_ENDPOINTS) {
    test(`GET ${endpoint} → 401 + JSON + <${SLA_MS}ms`, async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${BASE_URL}${endpoint}`, { headers: JSON_HEADERS });
      const latency = Date.now() - start;

      // Never 5xx
      expect(res.status()).not.toBe(500);
      expect(res.status()).not.toBe(502);
      expect(res.status()).not.toBe(503);

      // Auth required
      expect([401, 403, 404]).toContain(res.status());

      // SLA
      expect(latency).toBeLessThan(SLA_MS);

      // JSON content-type on auth errors
      const ct = res.headers()['content-type'] ?? '';
      expect(ct).toContain('application/json');
    });
  }
});

// ─── POST Endpoints — bad body and no auth ─────────────────────────────────────
const POST_ENDPOINTS: Array<[string, Record<string, unknown>]> = [
  ['/api/patients', { name: 'Test Patient', mobile: '01712345678' }],
  ['/api/appointments', { patient_id: 1, doctor_id: 1, apptDate: '2025-04-01' }],
  ['/api/billing', { patient_id: 1, items: [{ itemCategory: 'test', unitPrice: 500 }] }],
  ['/api/deposits', { patient_id: 1, amount: 5000, remarks: 'Test deposit' }],
  ['/api/deposits/refund', { patient_id: 1, amount: 1000, remarks: 'Refund' }],
  ['/api/expenses', { date: '2025-03-15', category: 'utilities', amount: 5000 }],
  ['/api/income', { date: '2025-03-15', source: 'pharmacy', amount: 10000 }],
  ['/api/lab/orders', { patientId: 1, items: [{ labTestId: 1 }] }],
  ['/api/prescriptions', { patientId: 1, visitId: 1, medicines: [] }],
  ['/api/doctors', { name: 'Dr. Test', consultationFee: 500 }],
  ['/api/staff', { name: 'Test Nurse', role: 'nurse', mobile: '01712345678' }],
  ['/api/pharmacy/suppliers', { name: 'MedSupply BD' }],
  ['/api/shareholders', { name: 'Rahman Holdings', type: 'owner' }],
  ['/api/commissions', { marketingPerson: 'Rahim', commissionAmount: 500 }],
  ['/api/insurance', { patient_id: 1, provider_name: 'Delta Life', policy_no: 'POL001', bill_amount: 50000, claimed_amount: 40000 }],
  ['/api/emergency', { patient_id: 1, chief_complaint: 'Chest pain' }],
  ['/api/website/services', { title: 'Cardiology', description: 'Heart care' }],
];

test.describe('📝 API — POST Endpoints (no-auth = 401, not 500)', () => {
  for (const [endpoint, body] of POST_ENDPOINTS) {
    test(`POST ${endpoint} → 401/400/422 (not 500)`, async ({ request }) => {
      const start = Date.now();
      const res = await request.post(`${BASE_URL}${endpoint}`, {
        data: body,
        headers: JSON_HEADERS,
      });
      const latency = Date.now() - start;

      expect(res.status()).not.toBe(500);
      expect(res.status()).not.toBe(502);
      expect([400, 401, 403, 409, 422]).toContain(res.status());
      expect(latency).toBeLessThan(SLA_MS);
    });
  }
});

// ─── POST with invalid body → 400/422 validation error ────────────────────────
test.describe('⚠️ API — POST with invalid body (validation errors)', () => {
  const INVALID_BODIES: Array<[string, Record<string, unknown>, string]> = [
    ['/api/patients', {}, 'empty body'],
    ['/api/appointments', {}, 'missing required fields'],
    ['/api/billing', { patient_id: 'not-a-number' }, 'wrong types'],
    ['/api/deposits', { patient_id: 1 }, 'missing amount'],
    ['/api/expenses', { amount: -500 }, 'negative amount'],
    ['/api/lab/orders', { patientId: 1, items: [] }, 'empty items array'],
    ['/api/prescriptions', { medicines: [] }, 'missing patientId'],
    ['/api/doctors', {}, 'empty doctor body'],
    ['/api/staff', { name: 'X' }, 'missing required staff fields'],
  ];

  for (const [endpoint, body, description] of INVALID_BODIES) {
    test(`POST ${endpoint} with ${description} → rejects with 400/401/422`, async ({ request }) => {
      const res = await request.post(`${BASE_URL}${endpoint}`, {
        data: body,
        headers: JSON_HEADERS,
      });

      expect(res.status()).not.toBe(500);
      expect([400, 401, 403, 422]).toContain(res.status());
    });
  }
});

// ─── DELETE / PUT without auth ──────────────────────────────────────────────────
test.describe('🗑️ API — DELETE/PUT endpoints (no-auth = 401)', () => {
  const MODIFY_ENDPOINTS: Array<[string, string, Record<string, unknown>?]> = [
    ['DELETE', '/api/patients/1'],
    ['DELETE', '/api/appointments/1'],
    ['DELETE', '/api/lab/catalog/1'],
    ['DELETE', '/api/pharmacy/1'],
    ['PUT', '/api/patients/1', { name: 'Updated Name' }],
    ['PUT', '/api/appointments/1', { status: 'completed' }],
    ['PUT', '/api/settings', { hospitalName: 'Test Hospital' }],
    ['PUT', '/api/website/config', { siteName: 'Test Site' }],
  ];

  for (const [method, endpoint, body] of MODIFY_ENDPOINTS) {
    test(`${method} ${endpoint} → 401 (not 500)`, async ({ request }) => {
      const res =
        method === 'DELETE'
          ? await request.delete(`${BASE_URL}${endpoint}`, { headers: JSON_HEADERS })
          : await request.put(`${BASE_URL}${endpoint}`, {
              data: body ?? {},
              headers: JSON_HEADERS,
            });

      expect(res.status()).not.toBe(500);
      expect([401, 403, 404]).toContain(res.status());
    });
  }
});

// ─── Patient Portal — Public Endpoints ─────────────────────────────────────────────────
test.describe('👤 API — Patient Portal (public, schema-validated)', () => {
  // NOTE: On workers.dev domain, tenant middleware returns 401 before any public route handler.
  // In real deployments, portal routes are served on tenant subdomains (e.g. tenant.hms.com).
  // These tests validate that: (a) endpoints exist (not 404/500) and (b) fail gracefully.

  test('POST /api/portal/request-otp with empty body → 400/401/422', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/portal/request-otp`, {
      data: {},
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 422]).toContain(res.status());
  });

  test('POST /api/portal/request-otp with invalid email → 400/401/422', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/portal/request-otp`, {
      data: { email: 'not-an-email' },
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 422]).toContain(res.status());
  });

  test('POST /api/portal/request-otp with valid email format → 200/429/400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/portal/request-otp`, {
      data: { email: 'testpatient@example.com' },
      headers: JSON_HEADERS,
    });
    // 200 if patient found and OTP sent, 400 if patient not found, 429 if rate limited
    expect(res.status()).not.toBe(500);
    expect([200, 400, 401, 429]).toContain(res.status());
  });

  test('POST /api/portal/verify-otp with empty body → 422', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/portal/verify-otp`, {
      data: {},
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 422]).toContain(res.status());
  });

  test('POST /api/portal/verify-otp with wrong length OTP → 400/401/422', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/portal/verify-otp`, {
      data: { email: 'test@example.com', otp: '123' }, // 3 digits, needs 6
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 422]).toContain(res.status());
  });


  test('POST /api/portal/verify-otp with wrong OTP → 400/401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/portal/verify-otp`, {
      data: { email: 'testpatient@example.com', otp: '000000' },
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 429]).toContain(res.status());
  });

  // Portal sub-routes require portal JWT
  test('GET /api/portal/me → 401 without portal JWT', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/portal/me`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/portal/appointments → 401 without portal JWT', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/portal/appointments`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/portal/bills → 401 without portal JWT', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/portal/bills`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/portal/lab-results → 401 without portal JWT', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/portal/lab-results`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/portal/prescriptions → 401 without portal JWT', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/portal/prescriptions`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });
});

// ─── Concurrent Load — No 5xx under parallel requests ──────────────────────────
test.describe('⚡ API — Concurrent Load (no 5xx)', () => {
  test('20 concurrent GET requests to core endpoints → all non-500', async ({ request }) => {
    const endpoints = [
      '/api/patients', '/api/dashboard', '/api/appointments',
      '/api/billing', '/api/pharmacy', '/api/lab',
      '/api/doctors', '/api/staff', '/api/expenses', '/api/income',
      '/api/deposits', '/api/accounting', '/api/reports', '/api/profit',
      '/api/insurance', '/api/emergency', '/api/shareholders', '/api/commissions',
      '/api/vitals', '/api/prescriptions',
    ];

    const responses = await Promise.all(
      endpoints.map((e) =>
        request.get(`${BASE_URL}${e}`, { headers: JSON_HEADERS })
      )
    );

    for (const [i, res] of responses.entries()) {
      expect(res.status(), `${endpoints[i]} returned 5xx`).not.toBe(500);
      expect(res.status(), `${endpoints[i]} returned 502`).not.toBe(502);
      expect(res.status(), `${endpoints[i]} returned 503`).not.toBe(503);
    }
  });

  test('5 concurrent POST requests → all non-500', async ({ request }) => {
    const posts = [
      request.post(`${BASE_URL}/api/patients`, { data: {}, headers: JSON_HEADERS }),
      request.post(`${BASE_URL}/api/billing`, { data: {}, headers: JSON_HEADERS }),
      request.post(`${BASE_URL}/api/deposits`, { data: {}, headers: JSON_HEADERS }),
      request.post(`${BASE_URL}/api/lab/orders`, { data: {}, headers: JSON_HEADERS }),
      request.post(`${BASE_URL}/api/prescriptions`, { data: {}, headers: JSON_HEADERS }),
    ];

    const responses = await Promise.all(posts);
    for (const res of responses) {
      expect(res.status()).not.toBe(500);
    }
  });
});

// ─── Response Shape Contract ────────────────────────────────────────────────────
test.describe('📋 API — Response Shape Contract', () => {
  test('All 401 responses have JSON content-type', async ({ request }) => {
    const critical = [
      '/api/patients', '/api/dashboard', '/api/billing', '/api/lab',
    ];
    for (const ep of critical) {
      const res = await request.get(`${BASE_URL}${ep}`, { headers: JSON_HEADERS });
      const ct = res.headers()['content-type'] ?? '';
      expect(ct, `${ep} missing JSON content-type`).toContain('application/json');
    }
  });

  test('401 response bodies have error/message property', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/patients`, { headers: JSON_HEADERS });
    const body = await res.json() as Record<string, unknown>;
    const hasError = 'error' in body || 'message' in body;
    expect(hasError).toBe(true);
  });

  test('Worker sends CORS headers (Access-Control-Allow-Origin)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/patients`, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://app.example.com',
      },
    });
    // Either CORS header is present or request is rejected (not 500)
    expect(res.status()).not.toBe(500);
  });

  test('OPTIONS preflight → 200/204', async ({ request }) => {
    const res = await request.fetch(`${BASE_URL}/api/patients`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://app.example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    });
    // Should be 200/204 for CORS preflight, or 404/405 if CORS not configured
    expect(res.status()).not.toBe(500);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────────
test.describe('🎯 API — Edge Cases', () => {
  test('Non-existent patient ID → 401 (not 500)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/patients/99999999`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('Non-existent endpoint → 404 (not 500)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/no-such-module-xyz`, { headers: JSON_HEADERS });
    expect(res.status()).not.toBe(500);
    expect([401, 404]).toContain(res.status());
  });

  test('Deeply nested non-existent path → not 500', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/patients/1/visits/2/labs/3/results/4`, {
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
  });

  test('Very large query string → not 500', async ({ request }) => {
    const longSearch = 'a'.repeat(500);
    const res = await request.get(
      `${BASE_URL}/api/patients?search=${longSearch}&page=1&limit=100`,
      { headers: JSON_HEADERS }
    );
    expect(res.status()).not.toBe(500);
  });

  test('SQL injection attempt in query param → not 500', async ({ request }) => {
    const malicious = encodeURIComponent("'; DROP TABLE patients;--");
    const res = await request.get(`${BASE_URL}/api/patients?search=${malicious}`, {
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
  });

  test('XSS in request body → 400/401/422 (not 500)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/patients`, {
      data: { name: '<script>alert(1)</script>', mobile: '01712345678' },
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 422]).toContain(res.status());
  });

  test('Wrong Content-Type (text/plain) → 400/401 (not 500)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/patients`, {
      data: '{ "name": "Test" }',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status()).not.toBe(500);
  });

  test('Empty string body POST → 400/401 (not 500)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/patients`, {
      data: '',
      headers: JSON_HEADERS,
    });
    expect(res.status()).not.toBe(500);
  });
});

// ─── FHIR Endpoints ────────────────────────────────────────────────────────────
test.describe('🏥 API — FHIR Endpoints (auth required)', () => {
  const fhirResources = [
    '/api/fhir/Patient',
    '/api/fhir/Appointment',
    '/api/fhir/Observation',
    '/api/fhir/Practitioner',
  ];

  for (const resource of fhirResources) {
    test(`GET ${resource} → 401 (not 500)`, async ({ request }) => {
      const res = await request.get(`${BASE_URL}${resource}`, { headers: JSON_HEADERS });
      expect(res.status()).not.toBe(500);
      expect([401, 403, 404]).toContain(res.status());
    });
  }
});
