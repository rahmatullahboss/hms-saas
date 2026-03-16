import { Hono } from "hono";
import type { Env } from '../../../types';
import { zValidator } from "@hono/zod-validator";
import * as schemas from "../../../schemas/inventory";
import { generateSequenceNo } from "../../../utils/sequence";

const dispatch = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// GET /dispatch
dispatch.get("/", zValidator("query", schemas.listDispatchesSchema), async (c) => {
  const { page, limit, RequisitionId, SourceStoreId, DestinationStoreId, IsReceived, FromDate, ToDate } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["D.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (RequisitionId) { conditions.push("D.RequisitionId = ?"); params.push(RequisitionId); }
  if (SourceStoreId) { conditions.push("D.SourceStoreId = ?"); params.push(SourceStoreId); }
  if (DestinationStoreId) { conditions.push("D.DestinationStoreId = ?"); params.push(DestinationStoreId); }
  if (IsReceived) { conditions.push("D.ReceivedOn IS " + (IsReceived === 'true' ? "NOT NULL" : "NULL")); }
  if (FromDate) { conditions.push("D.DispatchDate >= ?"); params.push(FromDate); }
  if (ToDate) { conditions.push("D.DispatchDate <= ?"); params.push(ToDate); }

  const whereClause = conditions.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM InventoryDispatch D WHERE ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT D.*, S1.StoreName as SourceStoreName, S2.StoreName as DestinationStoreName
    FROM InventoryDispatch D
    JOIN InventoryStore S1 ON D.SourceStoreId = S1.StoreId
    JOIN InventoryStore S2 ON D.DestinationStoreId = S2.StoreId
    WHERE ${whereClause}
    ORDER BY D.DispatchId DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ data: results.results, pagination: { page, limit, total: count?.total || 0 } });
});

// POST /dispatch
dispatch.post("/", zValidator("json", schemas.createDispatchSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString().slice(0, 10);

  // Check Stock First (with tenant scoping)
  for (const item of body.Items) {
    const stock = await c.env.DB.prepare(
      "SELECT AvailableQuantity FROM InventoryStock WHERE StockId = ? AND tenant_id = ?"
    ).bind(item.StockId, tenantId).first<{ AvailableQuantity: number }>();
    if (!stock || stock.AvailableQuantity < item.DispatchedQuantity) {
      return c.json({ error: `Insufficient stock for StockId ${item.StockId}` }, 400);
    }
  }

  const nextDispNo = await generateSequenceNo(c.env.DB, 'DSP', 'InventoryDispatch', 'DispatchNo', tenantId);

  // Insert Header
  const result = await c.env.DB.prepare(`
    INSERT INTO InventoryDispatch (tenant_id, DispatchNo, DispatchDate, RequisitionId, SourceStoreId, DestinationStoreId, Remarks, CreatedBy, CreatedOn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, nextDispNo, today, body.RequisitionId, body.SourceStoreId, body.DestinationStoreId,
    body.Remarks || null, userId ?? null, new Date().toISOString(),
  ).run();

  const dispatchId = result.meta.last_row_id;
  const batchOps: D1PreparedStatement[] = [];

  // Process Items
  for (const item of body.Items) {
    // 1. Dispatch Item
    batchOps.push(c.env.DB.prepare(`
      INSERT INTO InventoryDispatchItem (tenant_id, DispatchId, ItemId, StockId, DispatchedQuantity, Remarks, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, dispatchId, item.ItemId, item.StockId, item.DispatchedQuantity, item.Remarks || null, userId ?? null, new Date().toISOString()));

    // 2. Update Source Stock (Deduct) — scoped
    batchOps.push(c.env.DB.prepare(
      "UPDATE InventoryStock SET AvailableQuantity = AvailableQuantity - ? WHERE StockId = ? AND tenant_id = ?"
    ).bind(item.DispatchedQuantity, item.StockId, tenantId));

    // 3. Stock Transaction
    batchOps.push(c.env.DB.prepare(`
      INSERT INTO InventoryStockTransaction (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, item.StockId, item.ItemId, body.SourceStoreId, 'dispatch-out',
      item.DispatchedQuantity, 'out', nextDispNo, userId ?? null, new Date().toISOString(),
    ));
  }

  if (batchOps.length > 0) await c.env.DB.batch(batchOps);

  return c.json({ message: "Dispatch created", DispatchId: dispatchId, DispatchNo: nextDispNo }, 201);
});

// PUT /dispatch/:id/receive
dispatch.put("/:id/receive", zValidator("json", schemas.receiveDispatchPayloadSchema), async (c) => {
  const dispatchId = c.req.param("id");
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString();

  // 1. Get Dispatch Details (tenant-scoped)
  const dispatchRecord = await c.env.DB.prepare(
    "SELECT * FROM InventoryDispatch WHERE DispatchId = ? AND tenant_id = ?"
  ).bind(dispatchId, tenantId).first<any>();

  if (!dispatchRecord) return c.json({ error: "Dispatch not found" }, 404);
  if (dispatchRecord.ReceivedOn) return c.json({ error: "Already received" }, 400);

  const items = await c.env.DB.prepare(
    "SELECT * FROM InventoryDispatchItem WHERE DispatchId = ? AND tenant_id = ?"
  ).bind(dispatchId, tenantId).all<any>();

  // Update Header
  await c.env.DB.prepare(
    "UPDATE InventoryDispatch SET ReceivedBy = ?, ReceivedOn = ?, ReceivedRemarks = ? WHERE DispatchId = ? AND tenant_id = ?"
  ).bind(userId ?? null, today, body.ReceivedRemarks || null, dispatchId, tenantId).run();

  // Process Items sequentially (need StockId for transaction log)
  for (const item of items.results) {
    const sourceStock = await c.env.DB.prepare(
      "SELECT * FROM InventoryStock WHERE StockId = ? AND tenant_id = ?"
    ).bind(item.StockId, tenantId).first<any>();
    if (!sourceStock) continue;

    // Find existing stock in Dest Store or create new
    const destStock = await c.env.DB.prepare(
      "SELECT StockId, AvailableQuantity FROM InventoryStock WHERE ItemId = ? AND StoreId = ? AND BatchNo = ? AND tenant_id = ?"
    ).bind(item.ItemId, dispatchRecord.DestinationStoreId, sourceStock.BatchNo, tenantId).first<any>();

    let finalStockId: number;
    if (destStock) {
      finalStockId = destStock.StockId;
      await c.env.DB.prepare(
        "UPDATE InventoryStock SET AvailableQuantity = AvailableQuantity + ? WHERE StockId = ? AND tenant_id = ?"
      ).bind(item.DispatchedQuantity, finalStockId, tenantId).run();
    } else {
      const res = await c.env.DB.prepare(`
        INSERT INTO InventoryStock (tenant_id, ItemId, StoreId, BatchNo, ExpiryDate, CostPrice, MRP, AvailableQuantity, CreatedBy, CreatedOn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tenantId, item.ItemId, dispatchRecord.DestinationStoreId, sourceStock.BatchNo, sourceStock.ExpiryDate,
        sourceStock.CostPrice, sourceStock.MRP, item.DispatchedQuantity, userId ?? null, today,
      ).run();
      finalStockId = res.meta.last_row_id as number;
    }

    // Stock Transaction
    await c.env.DB.prepare(`
      INSERT INTO InventoryStockTransaction (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, finalStockId, item.ItemId, dispatchRecord.DestinationStoreId, 'dispatch-in',
      item.DispatchedQuantity, 'in', dispatchRecord.DispatchNo, userId ?? null, today,
    ).run();
  }

  return c.json({ message: "Dispatch received" });
});

export default dispatch;
