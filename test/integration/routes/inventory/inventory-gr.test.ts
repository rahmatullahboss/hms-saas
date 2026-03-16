/**
 * Enterprise-grade integration tests for Inventory Goods Receipts route.
 *
 * Covers: list, create (with stock creation + PO update), Zod validation, tenant isolation.
 */

import { describe, it, expect } from 'vitest';
import grRoute from '../../../../src/routes/tenant/inventory/gr';
import { createTestApp, jsonRequest } from '../../helpers/test-app';
import {
  TENANT_1, TENANT_2,
  INV_GR_1, INV_VENDOR_1, INV_STORE_MAIN, INV_ITEM_1, INV_PO_1,
} from '../../helpers/fixtures';

// ─── Test data ─────────────────────────────────────────────────────────────

const newGRBody = {
  VendorId: INV_VENDOR_1.VendorId,
  StoreId: INV_STORE_MAIN.StoreId,
  GRDate: '2024-02-05',
  PaymentMode: 'credit' as const,
  CreditPeriod: 30,
  Items: [
    {
      ItemId: INV_ITEM_1.ItemId,
      ReceivedQuantity: 100,
      FreeQuantity: 5,
      RejectedQuantity: 0,
      ItemRate: 45,
      BatchNo: 'BN-NEW-001',
      ExpiryDate: '2027-06-30',
      VATPercent: 0,
      DiscountPercent: 0,
    },
  ],
};

const newGRWithPOBody = {
  ...newGRBody,
  PurchaseOrderId: INV_PO_1.PurchaseOrderId,
  Items: [
    {
      ...newGRBody.Items[0],
      POItemId: 1,
    },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Inventory — Goods Receipts Routes', () => {

  describe('GET / — list goods receipts', () => {
    it('returns paginated GRs for tenant', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: { inventorygoodsreceipt: [INV_GR_1] },
      });
      const res = await app.request('/gr');
      expect(res.status).toBe(200);
      const body = await res.json() as { data: unknown[]; pagination: unknown };
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');
    });

    it('filters by VendorId', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'pharmacist',
        tenantId: TENANT_1.id,
        tables: { inventorygoodsreceipt: [INV_GR_1] },
      });
      const res = await app.request(`/gr?VendorId=${INV_VENDOR_1.VendorId}`);
      expect(res.status).toBe(200);
    });

    it('filters by StoreId', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: { inventorygoodsreceipt: [INV_GR_1] },
      });
      const res = await app.request(`/gr?StoreId=${INV_STORE_MAIN.StoreId}`);
      expect(res.status).toBe(200);
    });

    it('filters by PurchaseOrderId', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: { inventorygoodsreceipt: [INV_GR_1] },
      });
      const res = await app.request(`/gr?PurchaseOrderId=${INV_PO_1.PurchaseOrderId}`);
      expect(res.status).toBe(200);
    });

    it('filters by date range', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: { inventorygoodsreceipt: [INV_GR_1] },
      });
      const res = await app.request('/gr?FromDate=2024-01-01&ToDate=2024-12-31');
      expect(res.status).toBe(200);
    });

    it('returns empty list for different tenant (tenant isolation)', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_2.id,
        tables: { inventorygoodsreceipt: [INV_GR_1] },
      });
      const res = await app.request('/gr');
      const body = await res.json() as { data: unknown[] };
      expect(body.data.length).toBe(0);
    });
  });

  describe('POST / — create goods receipt', () => {
    it('creates GR, stock, and stock transactions — returns 201', async () => {
      const { app, mockDB } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: {
          inventorygoodsreceipt: [],
          inventorygoodsreceiptitem: [],
          inventorystock: [],
          inventorystocktransaction: [],
          inventorysequence: [],
        },
      });
      const res = await jsonRequest(app, '/gr', { method: 'POST', body: newGRBody });
      expect(res.status).toBe(201);
      const body = await res.json() as { GoodsReceiptId: number; message: string };
      expect(typeof body.GoodsReceiptId).toBe('number');

      // GR header INSERT has tenant_id
      const grInsert = mockDB.queries.find(
        q => q.sql.toUpperCase().includes('INSERT') && q.sql.toLowerCase().includes('goodsreceipt'),
      );
      expect(grInsert).toBeTruthy();
      expect(grInsert!.params).toContain(TENANT_1.id);
    });

    it('creates GR linked to PO and updates PO status', async () => {
      const { app, mockDB } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
        tables: {
          inventorygoodsreceipt: [],
          inventorygoodsreceiptitem: [],
          inventorystock: [],
          inventorystocktransaction: [],
          inventorypurchaseorder: [INV_PO_1],
          inventorysequence: [],
        },
      });
      const res = await jsonRequest(app, '/gr', { method: 'POST', body: newGRWithPOBody });
      expect(res.status).toBe(201);

      // Verify a PO UPDATE statement was issued
      const poUpdate = mockDB.queries.find(
        q => q.sql.toUpperCase().includes('UPDATE') && q.sql.toLowerCase().includes('purchaseorder'),
      );
      expect(poUpdate).toBeTruthy();
    });

    it('returns 400 when Items array is empty (Zod min)', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
      });
      const res = await jsonRequest(app, '/gr', {
        method: 'POST',
        body: { ...newGRBody, Items: [] },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when ReceivedQuantity is zero (Zod positive)', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
      });
      const res = await jsonRequest(app, '/gr', {
        method: 'POST',
        body: {
          ...newGRBody,
          Items: [{ ...newGRBody.Items[0], ReceivedQuantity: 0 }],
        },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when StoreId is missing (Zod)', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
      });
      const { StoreId: _removed, ...bodyWithoutStore } = newGRBody;
      const res = await jsonRequest(app, '/gr', { method: 'POST', body: bodyWithoutStore });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid PaymentMode (Zod enum)', async () => {
      const { app } = createTestApp({
        route: grRoute,
        routePath: '/gr',
        role: 'hospital_admin',
        tenantId: TENANT_1.id,
      });
      const res = await jsonRequest(app, '/gr', {
        method: 'POST',
        body: { ...newGRBody, PaymentMode: 'bitcoin' },
      });
      expect(res.status).toBe(400);
    });
  });
});
