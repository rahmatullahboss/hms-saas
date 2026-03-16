import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as schemas from "../../../schemas/inventory";
import type { Env } from '../../../types';

const stock = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// GET /stock - List stocks
stock.get("/", zValidator("query", schemas.listStockSchema), async (c) => {
  const query = c.req.valid("query");
  const { page, limit, search, ItemId, StoreId, ExpiringBefore, BelowReorderLevel } = query;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["S.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (search) {
    conditions.push("(I.ItemName LIKE ? OR S.BatchNo LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (ItemId) { conditions.push("S.ItemId = ?"); params.push(ItemId); }
  if (StoreId) { conditions.push("S.StoreId = ?"); params.push(StoreId); }
  if (ExpiringBefore) { conditions.push("S.ExpiryDate <= ?"); params.push(ExpiringBefore); }
  if (BelowReorderLevel === "true") { conditions.push("S.AvailableQuantity < I.ReOrderLevel"); }

  const whereClause = conditions.join(" AND ");

  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as total
    FROM InventoryStock S
    JOIN InventoryItem I ON S.ItemId = I.ItemId
    JOIN InventoryStore ST ON S.StoreId = ST.StoreId
    WHERE ${whereClause}
  `).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT S.*, I.ItemName, I.ItemCode, I.ReOrderLevel, ST.StoreName
    FROM InventoryStock S
    JOIN InventoryItem I ON S.ItemId = I.ItemId
    JOIN InventoryStore ST ON S.StoreId = ST.StoreId
    WHERE ${whereClause}
    ORDER BY I.ItemName ASC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({
    data: results.results,
    pagination: { page, limit, total: countResult?.total || 0 },
  });
});

// POST /adjustment - Stock Adjustment
stock.post("/adjustment", zValidator("json", schemas.createStockAdjustmentSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString().slice(0, 10);

  const batchOps: D1PreparedStatement[] = [];

  for (const item of body.Items) {
    let stockId = item.StockId;
    let currentStock: any = null;

    // 1. Resolve StockId (with tenant scoping)
    if (stockId) {
      currentStock = await c.env.DB.prepare(
        "SELECT * FROM InventoryStock WHERE StockId = ? AND tenant_id = ?"
      ).bind(stockId, tenantId).first();
    } else if (item.ItemId && item.StoreId && item.BatchNo) {
      currentStock = await c.env.DB.prepare(
        "SELECT * FROM InventoryStock WHERE ItemId = ? AND StoreId = ? AND BatchNo = ? AND tenant_id = ?"
      ).bind(item.ItemId, item.StoreId, item.BatchNo, tenantId).first();
      if (currentStock) stockId = currentStock.StockId;
    }

    // 2. Handle Logic
    if (currentStock) {
      // Update existing stock
      let newQty = currentStock.AvailableQuantity;
      if (item.AdjustmentType === 'in') {
        newQty += item.Quantity;
      } else {
        newQty -= item.Quantity;
        if (newQty < 0) {
          return c.json({ error: `Insufficient stock for Item ${item.ItemId} Batch ${item.BatchNo}` }, 400);
        }
      }

      batchOps.push(
        c.env.DB.prepare("UPDATE InventoryStock SET AvailableQuantity = ? WHERE StockId = ? AND tenant_id = ?")
          .bind(newQty, stockId, tenantId),
      );

      // Ledger Transaction
      batchOps.push(
        c.env.DB.prepare(`
          INSERT INTO InventoryStockTransaction
          (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          tenantId, stockId, item.ItemId, item.StoreId,
          item.AdjustmentType === 'in' ? 'adjustment-in' : 'adjustment-out',
          item.Quantity, item.AdjustmentType === 'in' ? 'in' : 'out',
          null, userId ?? null, today,
        ),
      );
    } else {
      // Stock not found
      if (item.AdjustmentType === 'out') {
        return c.json({ error: `Cannot deduct stock. Stock not found for Item ${item.ItemId} Batch ${item.BatchNo}` }, 400);
      }

      // Create new stock entry (Adjustment In) — must await for StockId linkage
      const itemMaster = await c.env.DB.prepare(
        "SELECT StandardRate FROM InventoryItem WHERE ItemId = ? AND tenant_id = ?"
      ).bind(item.ItemId, tenantId).first<{ StandardRate: number }>();
      const costPrice = itemMaster?.StandardRate || 0;

      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const stockRes = await c.env.DB.prepare(`
        INSERT INTO InventoryStock (tenant_id, ItemId, StoreId, BatchNo, ExpiryDate, AvailableQuantity, CostPrice, MRP, CreatedBy, CreatedOn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tenantId, item.ItemId, item.StoreId, item.BatchNo || "ADJ-" + Date.now(),
        expiryDate.toISOString().slice(0, 10), item.Quantity, costPrice, costPrice,
        userId ?? null, today,
      ).run();

      // Now we have the StockId — insert the transaction log
      const newStockId = stockRes.meta.last_row_id;
      batchOps.push(
        c.env.DB.prepare(`
          INSERT INTO InventoryStockTransaction
          (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          tenantId, newStockId, item.ItemId, item.StoreId,
          'adjustment-in', item.Quantity, 'in', null,
          userId ?? null, today,
        ),
      );
    }
  }

  if (batchOps.length > 0) {
    await c.env.DB.batch(batchOps);
  }

  return c.json({ message: "Stock adjustment processed successfully" });
});

// GET /transactions - List Stock Transactions
stock.get("/transactions", zValidator("query", schemas.listStockTransactionsSchema), async (c) => {
  const { page, limit, ItemId, StoreId, TransactionType, FromDate, ToDate } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["T.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (ItemId) { conditions.push("T.ItemId = ?"); params.push(ItemId); }
  if (StoreId) { conditions.push("T.StoreId = ?"); params.push(StoreId); }
  if (TransactionType) { conditions.push("T.TransactionType = ?"); params.push(TransactionType); }
  if (FromDate) { conditions.push("T.CreatedOn >= ?"); params.push(FromDate); }
  if (ToDate) { conditions.push("T.CreatedOn <= ?"); params.push(ToDate); }

  const whereClause = conditions.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM InventoryStockTransaction T WHERE ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT T.*, I.ItemName, S.StoreName
    FROM InventoryStockTransaction T
    JOIN InventoryItem I ON T.ItemId = I.ItemId
    JOIN InventoryStore S ON T.StoreId = S.StoreId
    WHERE ${whereClause}
    ORDER BY T.TransactionId DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ data: results.results, pagination: { page, limit, total: count?.total || 0 } });
});

export default stock;
