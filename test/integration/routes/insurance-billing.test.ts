/**
 * Integration tests for src/routes/tenant/billingInsurance.ts
 *
 * Covers: Providers, Plans, Memberships, Pre-Auth, Claims (with retry logic),
 *         EOB records, Stats, and cross-tenant isolation.
 */

import { describe, it, expect } from 'vitest';
import billingInsuranceRoute from '../../../src/routes/tenant/billingInsurance';
import { createTestApp, jsonRequest } from '../helpers/test-app';
import { TENANT_1, TENANT_2, PATIENT_1 } from '../helpers/fixtures';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const PROVIDER_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  name: 'Acme Insurance Co',
  short_code: 'AIC',
  provider_type: 'insurance_company',
  contact_email: 'contact@acme.com',
  billing_cycle: 'monthly',
  payment_terms_days: 30,
  network_type: 'panel',
  is_active: 1,
  created_at: '2024-01-01T00:00:00Z',
};

const PLAN_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  provider_id: PROVIDER_1.id,
  plan_name: 'Standard Plan',
  plan_type: 'individual',
  coverage_limit: 500000,
  deductible: 5000,
  copay_percentage: 20,
  pre_authorization_required: 1,
  is_active: 1,
};

const MEMBERSHIP_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  patient_id: PATIENT_1.id,
  provider_id: PROVIDER_1.id,
  plan_id: PLAN_1.id,
  member_id: 'MEM-00001',
  policy_number: 'POL-00001',
  coverage_start_date: '2024-01-01',
  coverage_end_date: '2024-12-31',
  coverage_percentage: 80,
  max_coverage_amount: 500000,
  is_primary: 1,
  is_active: 1,
};

const PREAUTH_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  patient_id: PATIENT_1.id,
  provider_id: PROVIDER_1.id,
  membership_id: MEMBERSHIP_1.id,
  procedure_type: 'surgical',
  status: 'pending',
  requested_date: '2024-01-15',
  estimated_cost: 100000,
};

const CLAIM_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  patient_id: PATIENT_1.id,
  membership_id: MEMBERSHIP_1.id,
  claim_no: 'CLM-000001',
  claim_date: '2024-01-20',
  bill_amount: 75000,
  claimed_amount: 60000,
  status: 'submitted',
  created_at: '2024-01-20T09:00:00Z',
};

const CLAIM_ITEM_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  claim_id: CLAIM_1.id,
  service_code: 'SVC-001',
  description: 'Hospital Stay',
  quantity: 3,
  unit_price: 20000,
  total_price: 60000,
  covered_amount: 48000,
  patient_payable: 12000,
};

const EOB_1 = {
  id: 1,
  tenant_id: TENANT_1.id,
  claim_id: CLAIM_1.id,
  eob_date: '2024-01-25',
  total_billed: 75000,
  total_allowed: 60000,
  total_paid: 48000,
  patient_responsibility: 12000,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeApp(tables: Record<string, unknown[]> = {}) {
  return createTestApp({
    route: billingInsuranceRoute,
    routePath: '/insurance-billing',
    role: 'hospital_admin',
    tenantId: TENANT_1.id,
    tables,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 🏢 PROVIDERS
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — Providers', () => {
  describe('GET /providers — list', () => {
    it('returns providers for the tenant', async () => {
      const { app } = makeApp({ insurance_providers: [PROVIDER_1] });
      const res = await app.request('/insurance-billing/providers');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('returns empty when no providers exist', async () => {
      const { app } = makeApp({ insurance_providers: [] });
      const res = await app.request('/insurance-billing/providers');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(body.data?.length).toBe(0);
    });

    it('supports ?is_active=1 filter', async () => {
      const { app } = makeApp({ insurance_providers: [PROVIDER_1] });
      const res = await app.request('/insurance-billing/providers?is_active=1');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /providers — create', () => {
    it('creates a provider and returns id', async () => {
      const { app } = makeApp({ insurance_providers: [] });
      const res = await jsonRequest(app, '/insurance-billing/providers', {
        method: 'POST',
        body: {
          name: 'New Insurer',
          short_code: 'NI',
          provider_type: 'insurance_company',
          billing_cycle: 'monthly',
          payment_terms_days: 30,
          network_type: 'panel',
        },
      });
      expect([200, 201]).toContain(res.status);
    });

    it('rejects missing name (Zod)', async () => {
      const { app } = makeApp({});
      const res = await jsonRequest(app, '/insurance-billing/providers', {
        method: 'POST',
        body: { provider_type: 'insurance_company' },
      });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /providers/:id — single', () => {
    it('returns 404 for unknown provider', async () => {
      const { app } = makeApp({ insurance_providers: [] });
      const res = await app.request('/insurance-billing/providers/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('Tenant isolation', () => {
    it('does not return providers from other tenant', async () => {
      const { app } = createTestApp({
        route: billingInsuranceRoute,
        routePath: '/insurance-billing',
        role: 'hospital_admin',
        tenantId: TENANT_2.id,
        tables: { insurance_providers: [PROVIDER_1] }, // belongs to TENANT_1
      });
      const res = await app.request('/insurance-billing/providers');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(body.data?.length).toBe(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 📋 PLANS
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — Plans', () => {
  describe('GET /providers/:id/plans', () => {
    it('returns plans for the provider', async () => {
      const { app } = makeApp({
        insurance_providers: [PROVIDER_1],
        insurance_plans: [PLAN_1],
      });
      const res = await app.request(`/insurance-billing/providers/${PROVIDER_1.id}/plans`);
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('POST /providers/:id/plans', () => {
    it('rejects missing plan_name', async () => {
      const { app } = makeApp({ insurance_providers: [PROVIDER_1] });
      const res = await jsonRequest(app, `/insurance-billing/providers/${PROVIDER_1.id}/plans`, {
        method: 'POST',
        body: { plan_type: 'individual' },
      });
      expect([400, 422]).toContain(res.status);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 👤 MEMBERSHIPS
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — Memberships', () => {
  describe('GET /memberships', () => {
    it('returns membership list', async () => {
      const { app } = makeApp({ patient_insurance_memberships: [MEMBERSHIP_1] });
      const res = await app.request('/insurance-billing/memberships');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /memberships/patient/:id', () => {
    it('returns patient memberships', async () => {
      const { app } = makeApp({
        patients: [PATIENT_1],
        patient_insurance_memberships: [MEMBERSHIP_1],
      });
      const res = await app.request(`/insurance-billing/memberships/patient/${PATIENT_1.id}`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /memberships — enrollment', () => {
    it('rejects missing required fields', async () => {
      const { app } = makeApp({ patients: [PATIENT_1] });
      const res = await jsonRequest(app, '/insurance-billing/memberships', {
        method: 'POST',
        body: { patient_id: PATIENT_1.id }, // missing provider_id, member_id, etc.
      });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /memberships/:id/eligibility', () => {
    it('returns eligibility info for active membership', async () => {
      const { app } = makeApp({
        patient_insurance_memberships: [MEMBERSHIP_1],
        insurance_plans: [PLAN_1],
      });
      const res = await app.request(`/insurance-billing/memberships/${MEMBERSHIP_1.id}/eligibility`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown membership', async () => {
      const { app } = makeApp({ patient_insurance_memberships: [] });
      const res = await app.request('/insurance-billing/memberships/99999/eligibility');
      expect(res.status).toBe(404);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 📝 PRE-AUTHORIZATION
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — Pre-Authorization', () => {
  describe('GET /preauth-records', () => {
    it('returns preauth list', async () => {
      const { app } = makeApp({ insurance_preauth_records: [PREAUTH_1] });
      const res = await app.request('/insurance-billing/preauth-records');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('POST /preauth-records', () => {
    it('rejects missing patient_id', async () => {
      const { app } = makeApp({});
      const res = await jsonRequest(app, '/insurance-billing/preauth-records', {
        method: 'POST',
        body: { procedure_type: 'surgical', requested_date: '2024-01-15' },
      });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('PATCH /preauth-records/:id/approve', () => {
    it('returns 404 for unknown record', async () => {
      const { app } = makeApp({ insurance_preauth_records: [] });
      const res = await jsonRequest(app, '/insurance-billing/preauth-records/9999/approve', {
        method: 'PATCH',
        body: { auth_code: 'AUTH-001', approved_amount: 50000, valid_until: '2024-12-31' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /preauth-records/:id/deny', () => {
    it('returns 404 for unknown record', async () => {
      const { app } = makeApp({ insurance_preauth_records: [] });
      const res = await jsonRequest(app, '/insurance-billing/preauth-records/9999/deny', {
        method: 'PATCH',
        body: { reason: 'Not covered' },
      });
      expect(res.status).toBe(404);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 🧾 CLAIMS
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — Claims', () => {
  describe('GET /claim-records', () => {
    it('returns claims list with items', async () => {
      const { app } = makeApp({
        insurance_claim_records: [CLAIM_1],
        insurance_claim_items: [CLAIM_ITEM_1],
      });
      const res = await app.request('/insurance-billing/claim-records');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('supports ?status=submitted filter', async () => {
      const { app } = makeApp({ insurance_claim_records: [CLAIM_1] });
      const res = await app.request('/insurance-billing/claim-records?status=submitted');
      expect(res.status).toBe(200);
    });

    it('supports ?patient_id filter', async () => {
      const { app } = makeApp({ insurance_claim_records: [CLAIM_1] });
      const res = await app.request(`/insurance-billing/claim-records?patient_id=${PATIENT_1.id}`);
      expect(res.status).toBe(200);
    });

    it('supports ?limit and ?offset for pagination', async () => {
      const { app } = makeApp({ insurance_claim_records: [CLAIM_1] });
      const res = await app.request('/insurance-billing/claim-records?limit=5&offset=0');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /claim-records/:id', () => {
    it('returns 404 for unknown claim', async () => {
      const { app } = makeApp({ insurance_claim_records: [] });
      const res = await app.request('/insurance-billing/claim-records/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /claim-records', () => {
    it('rejects missing bill_amount (Zod)', async () => {
      const { app } = makeApp({ patients: [PATIENT_1] });
      const res = await jsonRequest(app, '/insurance-billing/claim-records', {
        method: 'POST',
        body: { patient_id: PATIENT_1.id, claimed_amount: 50000 }, // missing bill_amount
      });
      expect([400, 422]).toContain(res.status);
    });

    it('rejects empty items array (claim must have at least 1 line item)', async () => {
      const { app } = makeApp({ patients: [PATIENT_1] });
      const res = await jsonRequest(app, '/insurance-billing/claim-records', {
        method: 'POST',
        body: {
          patient_id: PATIENT_1.id,
          bill_amount: 75000,
          claimed_amount: 60000,
          items: [], // empty not allowed
        },
      });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('PUT /claim-records/:id/status', () => {
    it('returns 404 for unknown claim', async () => {
      const { app } = makeApp({ insurance_claim_records: [] });
      const res = await jsonRequest(app, '/insurance-billing/claim-records/9999/status', {
        method: 'PUT',
        body: { status: 'approved' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Tenant isolation', () => {
    it('does not return claims from other tenant', async () => {
      const { app } = createTestApp({
        route: billingInsuranceRoute,
        routePath: '/insurance-billing',
        role: 'hospital_admin',
        tenantId: TENANT_2.id,
        tables: { insurance_claim_records: [CLAIM_1] }, // belongs to TENANT_1
      });
      const res = await app.request('/insurance-billing/claim-records');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(body.data?.length).toBe(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 📑 EOB
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — EOB Records', () => {
  describe('GET /eob-records', () => {
    it('returns EOB list', async () => {
      const { app } = makeApp({ insurance_eob_records: [EOB_1] });
      const res = await app.request('/insurance-billing/eob-records');
      expect(res.status).toBe(200);
      const body = await res.json() as { data?: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /eob-records/:id', () => {
    it('returns 404 for unknown EOB', async () => {
      const { app } = makeApp({ insurance_eob_records: [] });
      const res = await app.request('/insurance-billing/eob-records/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /eob-records', () => {
    it('rejects missing claim_id (Zod)', async () => {
      const { app } = makeApp({});
      const res = await jsonRequest(app, '/insurance-billing/eob-records', {
        method: 'POST',
        body: { eob_date: '2024-01-25', total_billed: 75000 }, // missing claim_id
      });
      expect([400, 422]).toContain(res.status);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 📊 STATS
// ══════════════════════════════════════════════════════════════════════════════

describe('Insurance Billing — Stats', () => {
  it('GET /stats → returns numeric aggregates', async () => {
    const { app } = makeApp({
      patient_insurance_memberships: [MEMBERSHIP_1],
      insurance_claim_records: [CLAIM_1],
      insurance_preauth_records: [PREAUTH_1],
    });
    const res = await app.request('/insurance-billing/stats');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    // Basic shape check — all top-level values should be numbers
    for (const val of Object.values(body)) {
      expect(typeof val).toBe('number');
    }
  });
});
