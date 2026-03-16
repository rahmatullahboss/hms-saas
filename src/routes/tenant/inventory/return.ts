import { Hono } from "hono";
import type { Env } from '../../../types';
import { zValidator } from "@hono/zod-validator";
import * as schemas from "../../../schemas/inventory";
import { generateSequenceNo } from "../../../utils/sequence";

const ret = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// GET /return
ret.get("/", zValidator("query", schemas.listReturnToVendorSchema), async (c) => {
  const { page, limit, VendorId, StoreId, FromDate, ToDate } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["R.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (VendorId) { conditions.push("R.VendorId = ?"); params.push(VendorId); }
  if (StoreId) { conditions.push("R.StoreId = ?"); params.push(StoreId); }
  if (FromDate) { conditions.push("R.ReturnDate >= ?"); params.push(FromDate); }
  if (ToDate) { conditions.push("R.ReturnDate <= ?"); params.push(ToDate); }

  const whereClause = conditions.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM InventoryReturnToVendor R WHERE ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT R.*, V.VendorName
    FROM InventoryReturnToVendor R
    JOIN InventoryVendor V ON R.VendorId = V.VendorId
    WHERE ${whereClause}
    ORDER BY R.ReturnToVendorId DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ data: results.results, pagination: { page, limit, total: count?.total || 0 } });
});

// POST /return
ret.post("/", zValidator("json", schemas.createReturnToVendorSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString().slice(0, 10);

  const nextRetNo = await generateSequenceNo(c.env.DB, 'RET', 'InventoryReturnToVendor', 'ReturnNo', tenantId);

  // Insert Header
  const result = await c.env.DB.prepare(`
    INSERT INTO InventoryReturnToVendor (tenant_id, ReturnNo, ReturnDate, VendorId, StoreId, GoodsReceiptId, Background, CreditNoteNo, Remarks, CreatedBy, CreatedOn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, nextRetNo, today, body.VendorId, body.StoreId, body.GoodsReceiptId,
    body.Reason, body.CreditNoteNo || null, body.Remarks || null,
    userId ?? null, new Date().toISOString(),
  ).run();

  const retId = result.meta.last_row_id;
  const batchOps: D1PreparedStatement[] = [];

  // Process Items
  for (const item of body.Items) {
    // Find Stock by GRItemId (tenant-scoped)
    const stock = await c.env.DB.prepare(
      "SELECT StockId, AvailableQuantity FROM InventoryStock WHERE GRItemId = ? AND ItemId = ? AND tenant_id = ?"
    ).bind(item.GRItemId, item.ItemId, tenantId).first<{ StockId: number; AvailableQuantity: number }>();

    if (!stock || stock.AvailableQuantity < item.ReturnQuantity) {
      return c.json({ error: `Insufficient stock for Return (Item ${item.ItemId} from GR Item ${item.GRItemId})` }, 400);
    }

    batchOps.push(c.env.DB.prepare(`
      INSERT INTO InventoryReturnToVendorItem (tenant_id, ReturnToVendorId, ItemId, GRItemId, ReturnQuantity, Remarks, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, retId, item.ItemId, item.GRItemId, item.ReturnQuantity, item.Remarks || null, userId ?? null, new Date().toISOString()));

    // Deduct Stock (scoped)
    batchOps.push(c.env.DB.prepare(
      "UPDATE InventoryStock SET AvailableQuantity = AvailableQuantity - ? WHERE StockId = ? AND tenant_id = ?"
    ).bind(item.ReturnQuantity, stock.StockId, tenantId));

    // Transaction
    batchOps.push(c.env.DB.prepare(`
      INSERT INTO InventoryStockTransaction (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, stock.StockId, item.ItemId, body.StoreId, 'return-to-vendor', item.ReturnQuantity, 'out', nextRetNo, userId ?? null, new Date().toISOString()));
  }

  if (batchOps.length > 0) await c.env.DB.batch(batchOps);

  return c.json({ message: "Return created", ReturnId: retId, ReturnNo: nextRetNo }, 201);
});

export default ret;
