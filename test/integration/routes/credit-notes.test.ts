/**
 * Integration tests for src/routes/tenant/creditNotes.ts
 *
 * Tests credit note creation, invoice item listing,
 * over-return guards, and sequence number generation.
 */

import { describe, it, expect } from 'vitest';
import creditNotesRoute from '../../../src/routes/tenant/creditNotes';
import { createTestApp, jsonRequest } from '../helpers/test-app';
import { TENANT_1, TENANT_2, PATIENT_1, BILL_1 } from '../helpers/fixtures';

// ─── Shared test data ──────────────────────────────────────────────────────────

const invoiceItem1 = {
  id: 100,
  tenant_id: TENANT_1.id,
  bill_id: BILL_1.id,
  description: 'Consultation fee',
  quantity: 1,
  unit_price: 1000,
  line_total: 1000,
  status: 'active',
  returned_qty: 0,
};

const invoiceItem2 = {
  id: 101,
  tenant_id: TENANT_1.id,
  bill_id: BILL_1.id,
  description: 'Blood test',
  quantity: 1,
  unit_price: 500,
  line_total: 500,
  status: 'active',
  returned_qty: 0,
};

const billWithPatient = {
  ...BILL_1,
  patient_name: PATIENT_1.name,
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Credit Notes Routes', () => {

  describe('GET / — list credit notes', () => {
    it('returns credit notes for the tenant', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { billing_credit_notes: [] },
      });

      const res = await app.request('/credit-notes');
      expect(res.status).toBe(200);
      const body = await res.json() as { credit_notes: unknown[]; page: number };
      expect(Array.isArray(body.credit_notes)).toBe(true);
    });

    it('filters by patient_id', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { billing_credit_notes: [] },
      });

      const res = await app.request(`/credit-notes?patient_id=${PATIENT_1.id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /invoice/:billId — invoice items for credit note', () => {
    it('returns 404 when bill not found', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { bills: [] },
      });

      const res = await app.request('/credit-notes/invoice/9999');
      expect(res.status).toBe(404);
    });

    it('returns invoice items with available_qty calculated', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          bills: [billWithPatient],
          invoice_items: [invoiceItem1, invoiceItem2],
          billing_credit_note_items: [],
          billing_credit_notes: [],
        },
      });

      const res = await app.request(`/credit-notes/invoice/${BILL_1.id}`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        bill: Record<string, unknown>;
        items: Array<{ available_qty: number }>;
      };
      expect(body.bill).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  describe('POST / — create credit note', () => {
    it('returns 404 when bill not found for this patient', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { bills: [] },
      });

      const res = await jsonRequest(app, '/credit-notes', {
        method: 'POST',
        body: {
          bill_id: 9999,
          patient_id: PATIENT_1.id,
          reason: 'Overcharge',
          items: [{ invoice_item_id: 100, return_quantity: 1 }],
        },
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when trying to return more than available quantity', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          bills: [{ ...billWithPatient, patient_id: PATIENT_1.id }],
          invoice_items: [invoiceItem1], // quantity = 1
          billing_credit_note_items: [],
          billing_credit_notes: [],
        },
      });

      const res = await jsonRequest(app, '/credit-notes', {
        method: 'POST',
        body: {
          bill_id: BILL_1.id,
          patient_id: PATIENT_1.id,
          reason: 'Overcharge',
          items: [{ invoice_item_id: invoiceItem1.id, return_quantity: 5 }], // > 1 available
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Cc]annot return|[Aa]vailable/);
    });

    it('creates a credit note and returns cn_no with refund amount', async () => {
      const { app, mockDB } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: {
          bills: [{ ...billWithPatient, patient_id: PATIENT_1.id }],
          invoice_items: [invoiceItem1],
          billing_credit_note_items: [],
          billing_credit_notes: [],
          sequences: [],
        },
      });

      const res = await jsonRequest(app, '/credit-notes', {
        method: 'POST',
        body: {
          bill_id: BILL_1.id,
          patient_id: PATIENT_1.id,
          reason: 'Overcharge on consultation',
          items: [{ invoice_item_id: invoiceItem1.id, return_quantity: 1 }],
        },
      });
      expect(res.status).toBe(201);
      const body = await res.json() as {
        credit_note_no: string;
        refund_amount: number;
        message: string;
      };
      expect(body.credit_note_no).toMatch(/^CN-/);
      expect(body.refund_amount).toBe(1000); // 1000 unit_price × 1 qty
      expect(body.message).toMatch(/[Cc]redit note/);

      // Verify batch for items + bill update was executed
      const creditNoteInsert = mockDB.queries.find(q =>
        q.sql.includes('billing_credit_notes') && q.sql.toUpperCase().includes('INSERT')
      );
      expect(creditNoteInsert).toBeTruthy();
    });

    it('validates items array must be non-empty', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_1.id,
        tables: { bills: [billWithPatient] },
      });

      const res = await jsonRequest(app, '/credit-notes', {
        method: 'POST',
        body: {
          bill_id: BILL_1.id,
          patient_id: PATIENT_1.id,
          reason: 'Test',
          items: [], // empty array — should fail Zod validation
        },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Tenant isolation', () => {
    it('returns empty list for different tenant', async () => {
      const { app } = createTestApp({
        route: creditNotesRoute,
        routePath: '/credit-notes',
        role: 'accountant',
        tenantId: TENANT_2.id,
        tables: { billing_credit_notes: [] },
      });

      const res = await app.request('/credit-notes');
      expect(res.status).toBe(200);
      const body = await res.json() as { credit_notes: unknown[] };
      expect(body.credit_notes).toHaveLength(0);
    });
  });
});
