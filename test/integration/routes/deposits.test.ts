/**
 * Integration tests for src/routes/tenant/deposits.ts
 *
 * Tests deposit collection, balance query, refund processing,
 * and deposit adjustment against a bill.
 */

import { describe, it, expect } from 'vitest';
import depositsRoute from '../../../src/routes/tenant/deposits';
import { createTestApp, jsonRequest } from '../helpers/test-app';
import { TENANT_1, TENANT_2, PATIENT_1, PATIENT_TENANT_2, BILL_1 } from '../helpers/fixtures';

// ─── Shared test data ──────────────────────────────────────────────────────────

const depositRow = {
  id: 40,
  tenant_id: TENANT_1.id,
  patient_id: PATIENT_1.id,
  deposit_receipt_no: 'DEP-000001',
  amount: 5000,
  transaction_type: 'deposit',
  payment_method: 'cash',
  is_active: 1,
  created_at: '2024-01-19T09:00:00Z',
};

const refundRow = {
  id: 41,
  tenant_id: TENANT_1.id,
  patient_id: PATIENT_1.id,
  deposit_receipt_no: 'DRF-000001',
  amount: 1000,
  transaction_type: 'refund',
  is_active: 1,
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Deposits Routes', () => {

  describe('GET / — list deposits', () => {
    it('returns deposits for the tenant', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { billing_deposits: [depositRow] },
      });

      const res = await app.request('/deposits');
      expect(res.status).toBe(200);
      const body = await res.json() as { deposits: unknown[]; page: number };
      expect(Array.isArray(body.deposits)).toBe(true);
      expect(body.page).toBe(1);
    });

    it('filters deposits by patient_id', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: { billing_deposits: [depositRow] },
      });

      const res = await app.request(`/deposits?patient_id=${PATIENT_1.id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /balance/:patientId — deposit balance', () => {
    it('returns correct balance shape', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { billing_deposits: [depositRow, refundRow] },
      });

      const res = await app.request(`/deposits/balance/${PATIENT_1.id}`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        patient_id: number;
        total_deposits: number;
        total_refunds: number;
        balance: number;
      };
      expect(body.patient_id).toBe(PATIENT_1.id);
      expect(typeof body.total_deposits).toBe('number');
      expect(typeof body.balance).toBe('number');
    });
  });

  describe('POST / — collect deposit', () => {
    it('creates a deposit and returns receipt_no', async () => {
      const { app, mockDB } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: {
          patients: [PATIENT_1],
          billing_deposits: [],
          sequences: [],
        },
      });

      const res = await jsonRequest(app, '/deposits', {
        method: 'POST',
        body: {
          patient_id: PATIENT_1.id,
          amount: 3000,
          payment_method: 'cash',
          remarks: 'Pre-surgery deposit',
        },
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { receipt_no: string; message: string };
      expect(body.receipt_no).toMatch(/^DEP-/);
      expect(body.message).toMatch(/[Dd]eposit/);

      // Verify INSERT was run
      const insertQ = mockDB.queries.find(q =>
        q.sql.toUpperCase().includes('INSERT') && q.sql.includes('billing_deposits')
      );
      expect(insertQ).toBeTruthy();
    });

    it('returns 404 when patient not found in tenant', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: { patients: [] },
      });

      const res = await jsonRequest(app, '/deposits', {
        method: 'POST',
        body: { patient_id: 9999, amount: 1000 },
      });
      expect(res.status).toBe(404);
    });

    it('rejects missing amount (Zod validation)', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'receptionist',
        tenantId: TENANT_1.id,
        tables: { patients: [PATIENT_1] },
      });

      const res = await jsonRequest(app, '/deposits', {
        method: 'POST',
        body: { patient_id: PATIENT_1.id },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /refund — refund deposit', () => {
    it('returns 400 when refund exceeds balance', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          patients: [PATIENT_1],
          billing_deposits: [], // no deposits → balance = 0
        },
      });

      const res = await jsonRequest(app, '/deposits/refund', {
        method: 'POST',
        body: { patient_id: PATIENT_1.id, amount: 5000 },
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Ii]nsufficient/);
    });
  });

  describe('POST /adjust — adjust deposit against bill', () => {
    it('returns 400 when adjustment exceeds deposit balance', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          patients: [PATIENT_1],
          bills: [BILL_1],
          billing_deposits: [], // no balance
        },
      });

      const res = await jsonRequest(app, '/deposits/adjust', {
        method: 'POST',
        body: { patient_id: PATIENT_1.id, amount: 2000, bill_id: BILL_1.id },
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 when bill not found', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          patients: [PATIENT_1],
          bills: [],
          billing_deposits: [depositRow],
        },
      });

      const res = await jsonRequest(app, '/deposits/adjust', {
        method: 'POST',
        body: { patient_id: PATIENT_1.id, amount: 500, bill_id: 9999 },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Tenant isolation', () => {
    it('deposit listing returns empty for different tenant', async () => {
      const { app } = createTestApp({
        route: depositsRoute,
        routePath: '/deposits',
        role: 'receptionist',
        tenantId: TENANT_2.id,
        tables: { billing_deposits: [depositRow] }, // depositRow has TENANT_1.id
      });

      const res = await app.request('/deposits');
      expect(res.status).toBe(200);
      const body = await res.json() as { deposits: unknown[] };
      expect(body.deposits).toHaveLength(0);
    });
  });
});
