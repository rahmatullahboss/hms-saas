import { Hono } from "hono";
import type { Env } from '../../../types';
import { zValidator } from "@hono/zod-validator";
import * as schemas from "../../../schemas/inventory";

const items = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// GET /items
items.get("/", zValidator("query", schemas.listItemsSchema), async (c) => {
  const { page, limit, search, ItemCategoryId, SubCategoryId, IsActive } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions: string[] = ["I.tenant_id = ?"];
  const tenantId = c.get("tenantId");
  const params: any[] = [tenantId];

  if (search) {
    conditions.push("(I.ItemName LIKE ? OR I.ItemCode LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (ItemCategoryId) {
    conditions.push("I.ItemCategoryId = ?");
    params.push(ItemCategoryId);
  }

  if (SubCategoryId) {
    conditions.push("I.SubCategoryId = ?");
    params.push(SubCategoryId);
  }

  if (IsActive) {
    conditions.push("I.IsActive = ?");
    params.push(IsActive === "true" ? 1 : 0);
  }

  const whereClause = conditions.join(" AND ");

  const count = await c.env.DB.prepare(`
    SELECT COUNT(*) as total
    FROM InventoryItem I
    WHERE ${whereClause}
  `).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(`
    SELECT I.*, C.CategoryName, U.UOMName
    FROM InventoryItem I
    LEFT JOIN InventoryItemCategory C ON I.ItemCategoryId = C.ItemCategoryId
    LEFT JOIN InventoryUnitOfMeasurement U ON I.UOMId = U.UOMId
    WHERE ${whereClause}
    ORDER BY I.ItemName ASC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({
    data: results.results,
    pagination: { page, limit, total: count?.total || 0 },
  });
});

// POST /items
items.post("/", zValidator("json", schemas.createItemSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const today = new Date().toISOString();

  const result = await c.env.DB.prepare(`
    INSERT INTO InventoryItem (tenant_id, ItemName, ItemCode, ItemCategoryId, SubCategoryId, UOMId, StandardRate, ReOrderLevel, MinStockQuantity, BudgetedQuantity, Description, IsVATApplicable, VATPercentage, IsFixedAsset, IsActive, CreatedBy, CreatedOn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId,
    body.ItemName, body.ItemCode || null, body.ItemCategoryId || null, body.SubCategoryId || null, body.UOMId || null,
    body.StandardRate, body.ReOrderLevel, body.MinStockQuantity, body.BudgetedQuantity, body.Description || null,
    body.IsVATApplicable ? 1 : 0, body.VATPercentage, body.IsFixedAsset ? 1 : 0, body.IsActive ? 1 : 0,
    userId ?? null, today,
  ).run();

  return c.json({ message: "Item created", id: result.meta.last_row_id }, 201);
});

// PUT /items/:id — Explicit column allowlist
const ITEM_UPDATABLE_COLUMNS = [
  'ItemName', 'ItemCode', 'ItemCategoryId', 'SubCategoryId', 'UOMId',
  'StandardRate', 'ReOrderLevel', 'MinStockQuantity', 'BudgetedQuantity',
  'Description', 'IsVATApplicable', 'VATPercentage', 'IsFixedAsset', 'IsActive',
] as const;

items.put("/:id", zValidator("json", schemas.updateItemSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const tenantId = c.get('tenantId');

  const updates: string[] = [];
  const params: any[] = [];

  for (const col of ITEM_UPDATABLE_COLUMNS) {
    if ((body as any)[col] !== undefined) {
      let val = (body as any)[col];
      if (typeof val === 'boolean') val = val ? 1 : 0;
      updates.push(`${col} = ?`);
      params.push(val);
    }
  }

  if (updates.length > 0) {
    params.push(id, tenantId);
    await c.env.DB.prepare(
      `UPDATE InventoryItem SET ${updates.join(", ")} WHERE ItemId = ? AND tenant_id = ?`
    ).bind(...params).run();
  }

  return c.json({ message: "Item updated" });
});

export default items;
