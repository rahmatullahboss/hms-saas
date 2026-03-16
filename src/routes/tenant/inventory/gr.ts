import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as schemas from "../../../schemas/inventory";
import type { Env } from '../../../types';
import { generateSequenceNo } from "../../../utils/sequence";

const gr = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// GET /gr
gr.get("/", zValidator("query", schemas.listGoodsReceiptsSchema), async (c) => {
  const { page, limit, VendorId, StoreId, FromDate, ToDate } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["G.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (VendorId) { conditions.push("G.VendorId = ?"); params.push(VendorId); }
  if (StoreId) { conditions.push("G.StoreId = ?"); params.push(StoreId); }
  if (FromDate) { conditions.push("G.GoodsReceiptDate >= ?"); params.push(FromDate); }
  if (ToDate) { conditions.push("G.GoodsReceiptDate <= ?"); params.push(ToDate); }

  const whereClause = conditions.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM InventoryGoodsReceipt G WHERE ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT G.*, V.VendorName
    FROM InventoryGoodsReceipt G
    JOIN InventoryVendor V ON G.VendorId = V.VendorId
    WHERE ${whereClause}
    ORDER BY G.GoodsReceiptId DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ data: results.results, pagination: { page, limit, total: count?.total || 0 } });
});

// POST /gr
gr.post("/", zValidator("json", schemas.createGoodsReceiptSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  // Calculate totals
  let subTotal = 0;
  let totalVAT = 0;
  body.Items.forEach(item => {
    const itemTotal = item.ReceivedQuantity * item.ItemRate;
    subTotal += itemTotal;
    if (item.VATPercent) totalVAT += (itemTotal * (item.VATPercent / 100));
  });
  const taxableAmount = subTotal - body.DiscountAmount;
  const totalAmount = taxableAmount + totalVAT;

  const today = new Date().toISOString().slice(0, 10);
  const nextGRNo = await generateSequenceNo(c.env.DB, 'GRN', 'InventoryGoodsReceipt', 'GoodsReceiptNo', tenantId);

  // Insert GR Header
  const result = await c.env.DB.prepare(`
    INSERT INTO InventoryGoodsReceipt (tenant_id, GoodsReceiptNo, GoodsReceiptDate, PurchaseOrderId, VendorId, StoreId, VendorBillNo, VendorBillDate, SubTotal, DiscountAmount, VATAmount, TotalAmount, PaymentMode, CreditPeriod, Remarks, CreatedBy, CreatedOn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId,
    nextGRNo, body.GRDate || today, body.PurchaseOrderId || null, body.VendorId, body.StoreId,
    body.VendorBillNo || null, body.VendorBillDate || null, subTotal, body.DiscountAmount, totalVAT, totalAmount,
    body.PaymentMode, body.CreditPeriod, body.Remarks || null, userId ?? null, new Date().toISOString(),
  ).run();

  const grId = result.meta.last_row_id;

  // Process Items (sequential for linked IDs)
  for (const item of body.Items) {
    // 1. Insert GR Item
    const grItemRes = await c.env.DB.prepare(`
      INSERT INTO InventoryGoodsReceiptItem (tenant_id, GoodsReceiptId, ItemId, BatchNo, ExpiryDate, ManufactureDate, ReceivedQuantity, FreeQuantity, RejectedQuantity, ItemRate, MRP, TotalAmount, VATAmount, DiscountAmount, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, grId, item.ItemId, item.BatchNo || null, item.ExpiryDate || null, item.ManufactureDate || null,
      item.ReceivedQuantity, item.FreeQuantity, item.RejectedQuantity, item.ItemRate, item.MRP || item.ItemRate,
      (item.ReceivedQuantity * item.ItemRate), 0, 0,
      userId ?? null, new Date().toISOString(),
    ).run();

    const grItemId = grItemRes.meta.last_row_id;

    // 2. Insert Stock
    const stockRes = await c.env.DB.prepare(`
      INSERT INTO InventoryStock (tenant_id, ItemId, StoreId, GRItemId, BatchNo, ExpiryDate, CostPrice, MRP, AvailableQuantity, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, item.ItemId, body.StoreId, grItemId, item.BatchNo || "NA", item.ExpiryDate || null,
      item.ItemRate, item.MRP || item.ItemRate, item.ReceivedQuantity + item.FreeQuantity,
      userId ?? null, new Date().toISOString(),
    ).run();

    const stockId = stockRes.meta.last_row_id;

    // 3. Stock Transaction
    await c.env.DB.prepare(`
      INSERT INTO InventoryStockTransaction (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, stockId, item.ItemId, body.StoreId, 'goods-receipt',
      item.ReceivedQuantity + item.FreeQuantity, 'in', nextGRNo,
      userId ?? null, new Date().toISOString(),
    ).run();
  }

  // Update PO Status if linked — check for partial vs complete
  if (body.PurchaseOrderId) {
    // Check total PO quantities vs total received across all GRs
    const poItems = await c.env.DB.prepare(
      "SELECT SUM(Quantity) as totalOrdered FROM InventoryPurchaseOrderItem WHERE PurchaseOrderId = ? AND tenant_id = ?"
    ).bind(body.PurchaseOrderId, tenantId).first<{ totalOrdered: number }>();

    const grItems = await c.env.DB.prepare(`
      SELECT SUM(GRI.ReceivedQuantity) as totalReceived
      FROM InventoryGoodsReceiptItem GRI
      JOIN InventoryGoodsReceipt GR ON GRI.GoodsReceiptId = GR.GoodsReceiptId
      WHERE GR.PurchaseOrderId = ? AND GR.tenant_id = ?
    `).bind(body.PurchaseOrderId, tenantId).first<{ totalReceived: number }>();

    const totalOrdered = poItems?.totalOrdered || 0;
    const totalReceived = grItems?.totalReceived || 0;
    const newStatus = totalReceived >= totalOrdered ? 'complete' : 'partial';

    await c.env.DB.prepare(
      "UPDATE InventoryPurchaseOrder SET POStatus = ? WHERE PurchaseOrderId = ? AND tenant_id = ?"
    ).bind(newStatus, body.PurchaseOrderId, tenantId).run();
  }

  return c.json({ message: "Goods Receipt created", GoodsReceiptId: grId, GRNo: nextGRNo }, 201);
});

export default gr;
