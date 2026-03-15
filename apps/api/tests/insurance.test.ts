/**
 * 🧪 TEA — Insurance API Tests
 * Risk: HIGH — Insurance billing, claim processing, policy management.
 * Coverage: Schemes CRUD, patient insurance records, claims lifecycle,
 *   status updates, reports, validation, tenant isolation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-vitest';

function authHeaders(tenantId = 1) {
  const token = jwt.sign(
    { userId: '1', tenantId: String(tenantId), role: 'admin', permissions: [] },
    SECRET,
    { expiresIn: '1h' },
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', Authorization: `Bearer ${token}` };
}

async function api(method: string, path: string, body?: any, tenantId = 1) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(tenantId),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function createPatient() {
  const res = await api('POST', '/api/patients', {
    name: 'Insurance Patient',
    mobile: `0178${Date.now().toString().slice(-7)}`,
    fatherHusband: 'Test Father',
    address: 'Test Address',
    gender: 'female',
    age: 35,
  });
  return ((await res.json()) as any).patientId as number;
}

async function createScheme(name = 'Test Insurance') {
  const res = await api('POST', '/api/insurance/schemes', {
    scheme_name: name,
    scheme_type: 'insurance',
    contact: '01912345678',
  });
  return ((await res.json()) as any).id as number;
}

describe('Insurance API', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient();
  });

  // ─── Insurance Schemes ──────────────────────────────────────────────────────
  describe('Insurance Schemes', () => {
    it('1. Create insurance scheme', async () => {
      const res = await api('POST', '/api/insurance/schemes', {
        scheme_name: 'National Health Insurance',
        scheme_code: 'NHI-001',
        scheme_type: 'government',
        contact: '01911111111',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeDefined();
    });

    it('2. List schemes', async () => {
      await createScheme('Scheme A');
      await createScheme('Scheme B');
      const res = await api('GET', '/api/insurance/schemes');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.schemes.length).toBe(2);
    });

    it('3. Missing scheme_name → 400', async () => {
      const res = await api('POST', '/api/insurance/schemes', {
        scheme_type: 'insurance',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Patient Insurance ──────────────────────────────────────────────────────
  describe('Patient Insurance', () => {
    let schemeId: number;

    beforeEach(async () => {
      schemeId = await createScheme();
    });

    it('4. Create patient insurance record', async () => {
      const res = await api('POST', '/api/insurance/patients', {
        patient_id: patientId,
        scheme_id: schemeId,
        policy_no: 'PLY-12345',
        member_id: 'MEM-001',
        credit_limit: 50000,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeDefined();
    });

    it('5. List patient insurance — filter by patient_id', async () => {
      await api('POST', '/api/insurance/patients', {
        patient_id: patientId,
        scheme_id: schemeId,
        credit_limit: 10000,
      });
      const res = await api('GET', `/api/insurance/patients?patient_id=${patientId}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.insurance_records.length).toBe(1);
    });
  });

  // ─── Insurance Claims ──────────────────────────────────────────────────────
  describe('Insurance Claims', () => {
    it('6. Submit a claim', async () => {
      const res = await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        diagnosis: 'Acute Bronchitis',
        icd10_code: 'J20',
        bill_amount: 15000,
        claimed_amount: 12000,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.claim_no).toBeDefined();
    });

    it('7. Submit claim with custom claim_no', async () => {
      const res = await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        claim_no: 'CLM-CUSTOM-001',
        bill_amount: 5000,
        claimed_amount: 4000,
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.claim_no).toBe('CLM-CUSTOM-001');
    });

    it('8. List claims', async () => {
      await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        bill_amount: 10000,
        claimed_amount: 8000,
      });
      const res = await api('GET', '/api/insurance/claims');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.claims.length).toBeGreaterThan(0);
    });

    it('9. Filter claims by status', async () => {
      await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        bill_amount: 10000,
        claimed_amount: 8000,
      });
      const res = await api('GET', '/api/insurance/claims?status=submitted');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.claims.length).toBeGreaterThan(0);
    });
  });

  // ─── Claim Status Updates ──────────────────────────────────────────────────
  describe('Claim status updates', () => {
    let claimId: number;

    beforeEach(async () => {
      const res = await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        bill_amount: 20000,
        claimed_amount: 18000,
      });
      claimId = ((await res.json()) as any).id;
    });

    it('10. Approve claim', async () => {
      const res = await api('PUT', `/api/insurance/claims/${claimId}/status`, {
        status: 'approved',
        approved_amount: 15000,
        reviewer_notes: 'Partially approved',
      });
      expect(res.status).toBe(200);
    });

    it('11. Reject claim', async () => {
      const res = await api('PUT', `/api/insurance/claims/${claimId}/status`, {
        status: 'rejected',
        rejection_reason: 'Pre-existing condition',
      });
      expect(res.status).toBe(200);
    });

    it('12. Settle claim', async () => {
      await api('PUT', `/api/insurance/claims/${claimId}/status`, {
        status: 'approved',
        approved_amount: 18000,
      });
      const res = await api('PUT', `/api/insurance/claims/${claimId}/status`, {
        status: 'settled',
      });
      expect(res.status).toBe(200);
    });

    it('13. Move to under_review', async () => {
      const res = await api('PUT', `/api/insurance/claims/${claimId}/status`, {
        status: 'under_review',
        reviewer_notes: 'Needs additional documents',
      });
      expect(res.status).toBe(200);
    });
  });

  // ─── Reports ───────────────────────────────────────────────────────────────
  describe('Reports', () => {
    it('14. Claims summary report', async () => {
      await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        bill_amount: 10000,
        claimed_amount: 8000,
      });
      const res = await api('GET', '/api/insurance/reports/summary');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.report)).toBe(true);
      expect(data.report.length).toBeGreaterThan(0);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('15. Cross-tenant schemes list is empty or blocked', async () => {
      await createScheme('Tenant 1 Scheme');
      const res = await api('GET', '/api/insurance/schemes', undefined, 2);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect(data.schemes.length).toBe(0);
      } else {
        expect([403, 404].includes(res.status)).toBe(true);
      }
    });

    it('16. Cross-tenant claims list is empty or blocked', async () => {
      await api('POST', '/api/insurance/claims', {
        patient_id: patientId,
        bill_amount: 5000,
        claimed_amount: 4000,
      });
      const res = await api('GET', '/api/insurance/claims', undefined, 2);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect(data.claims.length).toBe(0);
      } else {
        expect([403, 404].includes(res.status)).toBe(true);
      }
    });
  });
});
