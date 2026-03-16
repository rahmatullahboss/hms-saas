import { Hono } from "hono";
import type { Env } from '../../../types';
import { zValidator } from "@hono/zod-validator";
import * as schemas from "../../../schemas/inventory";
import { generateSequenceNo } from "../../../utils/sequence";

const writeoff = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// GET /writeoff
writeoff.get("/", zValidator("query", schemas.listWriteOffsSchema), async (c) => {
  const { page, limit, StoreId, Reason, IsApproved, FromDate, ToDate } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["W.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (StoreId) { conditions.push("W.StoreId = ?"); params.push(StoreId); }
  if (Reason) { conditions.push("W.WriteOffReason = ?"); params.push(Reason); }
  if (IsApproved) { conditions.push("W.IsApproved = ?"); params.push(IsApproved === 'true' ? 1 : 0); }
  if (FromDate) { conditions.push("W.WriteOffDate >= ?"); params.push(FromDate); }
  if (ToDate) { conditions.push("W.WriteOffDate <= ?"); params.push(ToDate); }

  const whereClause = conditions.join(" AND ");
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM InventoryWriteOff W WHERE ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT W.*, S.StoreName
    FROM InventoryWriteOff W
    JOIN InventoryStore S ON W.StoreId = S.StoreId
    WHERE ${whereClause}
    ORDER BY W.WriteOffId DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ data: results.results, pagination: { page, limit, total: count?.total || 0 } });
});

// POST /writeoff
writeoff.post("/", zValidator("json", schemas.createWriteOffSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString().slice(0, 10);

  const nextWONo = await generateSequenceNo(c.env.DB, 'WO', 'InventoryWriteOff', 'WriteOffNo', tenantId);

  // Insert Header
  const result = await c.env.DB.prepare(`
    INSERT INTO InventoryWriteOff (tenant_id, WriteOffNo, WriteOffDate, StoreId, WriteOffReason, Description, Remarks, IsApproved, CreatedBy, CreatedOn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, nextWONo, today, body.StoreId, body.Reason, body.Description || null, body.Remarks || null,
    0, userId ?? null, new Date().toISOString(),
  ).run();

  const woId = result.meta.last_row_id;
  const batchOps: D1PreparedStatement[] = [];

  for (const item of body.Items) {
    batchOps.push(c.env.DB.prepare(`
      INSERT INTO InventoryWriteOffItem (tenant_id, WriteOffId, ItemId, StockId, WriteOffQuantity, Remarks, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, woId, item.ItemId, item.StockId, item.Quantity, item.Remarks || null, userId ?? null, new Date().toISOString()));
  }

  if (batchOps.length > 0) await c.env.DB.batch(batchOps);

  return c.json({ message: "Write-off created", WriteOffId: woId, WriteOffNo: nextWONo }, 201);
});

// PUT /writeoff/:id/approve
writeoff.put("/:id/approve", zValidator("json", schemas.approveWriteOffSchema), async (c) => {
  const woId = c.req.param("id");
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString();

  if (!body.IsApproved) {
    return c.json({ error: "Only approval supported via this endpoint" }, 400);
  }

  const wo = await c.env.DB.prepare(
    "SELECT * FROM InventoryWriteOff WHERE WriteOffId = ? AND tenant_id = ?"
  ).bind(woId, tenantId).first<any>();
  if (!wo) return c.json({ error: "Write-off not found" }, 404);
  if (wo.IsApproved) return c.json({ error: "Already approved" }, 400);

  const items = await c.env.DB.prepare(
    "SELECT * FROM InventoryWriteOffItem WHERE WriteOffId = ? AND tenant_id = ?"
  ).bind(woId, tenantId).all<any>();
  const batchOps: D1PreparedStatement[] = [];

  for (const item of items.results) {
    // Deduct Stock (scoped)
    batchOps.push(c.env.DB.prepare(
      "UPDATE InventoryStock SET AvailableQuantity = AvailableQuantity - ? WHERE StockId = ? AND tenant_id = ?"
    ).bind(item.WriteOffQuantity, item.StockId, tenantId));

    // Transaction
    batchOps.push(c.env.DB.prepare(`
      INSERT INTO InventoryStockTransaction (tenant_id, StockId, ItemId, StoreId, TransactionType, Quantity, InOut, ReferenceNo, CreatedBy, CreatedOn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, item.StockId, item.ItemId, wo.StoreId, 'writeoff', item.WriteOffQuantity, 'out', wo.WriteOffNo, userId ?? null, today));
  }

  // Update Header (scoped)
  batchOps.push(c.env.DB.prepare(
    "UPDATE InventoryWriteOff SET IsApproved = 1, ApprovedBy = ?, ApprovedOn = ? WHERE WriteOffId = ? AND tenant_id = ?"
  ).bind(userId ?? null, today, woId, tenantId));

  await c.env.DB.batch(batchOps);

  return c.json({ message: "Write-off approved and stock deducted" });
});

export default writeoff;
