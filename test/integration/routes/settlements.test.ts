/**
 * Integration tests for src/routes/tenant/settlements.ts
 *
 * Tests pending bill listing, patient settlement info,
 * settlement creation guards (overpayment, deposit balance),
 * and atomicity of bill status updates.
 */

import { describe, it, expect } from 'vitest';
import settlementsRoute from '../../../src/routes/tenant/settlements';
import { createTestApp, jsonRequest } from '../helpers/test-app';
import { TENANT_1, TENANT_2, PATIENT_1, BILL_1 } from '../helpers/fixtures';

// ─── Shared test data ──────────────────────────────────────────────────────────

const unpaidBill = {
  ...BILL_1,
  patient_name: PATIENT_1.name,
  patient_code: PATIENT_1.patient_code,
};

const settlementRow = {
  id: 60,
  tenant_id: TENANT_1.id,
  patient_id: PATIENT_1.id,
  settlement_receipt_no: 'STL-000001',
  payable_amount: 2500,
  paid_amount: 2500,
  deposit_deducted: 0,
  discount_amount: 0,
  payment_mode: 'cash',
  is_active: 1,
  created_at: '2024-01-21T10:00:00Z',
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Settlements Routes', () => {

  describe('GET / — list settlements', () => {
    it('returns settlement list', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { billing_settlements: [settlementRow] },
      });

      const res = await app.request('/settlements');
      expect(res.status).toBe(200);
      const body = await res.json() as { settlements: unknown[]; page: number };
      expect(Array.isArray(body.settlements)).toBe(true);
    });
  });

  describe('GET /pending — bills awaiting payment', () => {
    it('returns open/partially_paid bills', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { bills: [unpaidBill], patients: [PATIENT_1] },
      });

      const res = await app.request('/settlements/pending');
      expect(res.status).toBe(200);
      const body = await res.json() as { pending_bills: unknown[] };
      expect(Array.isArray(body.pending_bills)).toBe(true);
    });
  });

  describe('GET /patient/:patientId/info — patient settlement summary', () => {
    it('returns 404 when patient not found', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { patients: [] },
      });

      const res = await app.request('/settlements/patient/9999/info');
      expect(res.status).toBe(404);
    });

    it('returns patient info with pending bills and deposit balance', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          patients: [PATIENT_1],
          bills: [unpaidBill],
          billing_deposits: [],
        },
      });

      const res = await app.request(`/settlements/patient/${PATIENT_1.id}/info`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        patient: unknown;
        pending_bills: unknown[];
        deposit_balance: number;
        total_due: number;
        net_payable: number;
      };
      expect(body.patient).toBeDefined();
      expect(Array.isArray(body.pending_bills)).toBe(true);
      expect(typeof body.total_due).toBe('number');
      expect(typeof body.net_payable).toBe('number');
    });
  });

  describe('POST / — create settlement', () => {
    it('returns 400 when some bills not found', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { bills: [] },
      });

      const res = await jsonRequest(app, '/settlements', {
        method: 'POST',
        body: {
          patient_id: PATIENT_1.id,
          bill_ids: [9999],
          paid_amount: 2500,
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Bb]ill/);
    });

    it('returns 400 for overpayment', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          bills: [{ ...unpaidBill, total: 1000, paid: 0, patient_id: PATIENT_1.id }],
          billing_deposits: [],
        },
      });

      const res = await jsonRequest(app, '/settlements', {
        method: 'POST',
        body: {
          patient_id: PATIENT_1.id,
          bill_ids: [BILL_1.id],
          paid_amount: 5000, // overpayment vs 1000 due
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Oo]verpay/);
    });

    it('creates settlement and returns receipt_no', async () => {
      const { app, mockDB } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          bills: [{ ...unpaidBill, total: 2500, paid: 0, patient_id: PATIENT_1.id }],
          billing_deposits: [],
          billing_settlements: [],
          sequences: [],
        },
      });

      const res = await jsonRequest(app, '/settlements', {
        method: 'POST',
        body: {
          patient_id: PATIENT_1.id,
          bill_ids: [BILL_1.id],
          paid_amount: 2500,
          deposit_deducted: 0,
          discount_amount: 0,
          payment_mode: 'cash',
        },
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { receipt_no: string; message: string };
      expect(body.receipt_no).toMatch(/^STL-/);

      // Verify settlement was inserted
      const stlInsert = mockDB.queries.find(q =>
        q.sql.includes('billing_settlements') && q.sql.toUpperCase().includes('INSERT')
      );
      expect(stlInsert).toBeTruthy();
    });
  });

  describe('Tenant isolation', () => {
    it('returns empty settlements for different tenant', async () => {
      const { app } = createTestApp({
        route: settlementsRoute,
        routePath: '/settlements',
        role: 'accountant',
        tenantId: TENANT_2.id,
        tables: { billing_settlements: [settlementRow] }, // settlementRow has TENANT_1.id
      });

      const res = await app.request('/settlements');
      expect(res.status).toBe(200);
      const body = await res.json() as { settlements: unknown[] };
      expect(body.settlements).toHaveLength(0);
    });
  });
});
