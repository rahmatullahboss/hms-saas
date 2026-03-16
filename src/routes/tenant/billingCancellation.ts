import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const cancellation = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const cancelBillSchema = z.object({ reason: z.string().min(1, 'Cancel reason required') });
const cancelItemSchema = z.object({ invoice_item_id: z.number().int().positive(), reason: z.string().min(1) });
const cancelBatchSchema = z.object({ invoice_item_ids: z.array(z.number().int().positive()).min(1), reason: z.string().min(1) });
const cancelProvisionalSchema = z.object({ reason: z.string().min(1) });

// ─── PUT /bill/:id — cancel entire bill ──────────────────────────────────────

cancellation.put('/bill/:id', zValidator('json', cancelBillSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  const { reason } = c.req.valid('json');

  const bill = await c.env.DB.prepare('SELECT id, status FROM bills WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<any>();
  if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
  if (bill.status === 'cancelled') throw new HTTPException(400, { message: 'Bill already cancelled' });

  const stmts = [
    c.env.DB.prepare(`UPDATE bills SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now'), cancel_reason = ? WHERE id = ? AND tenant_id = ?`).bind(userId, reason, id, tenantId),
    c.env.DB.prepare(`UPDATE invoice_items SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now'), cancel_reason = ? WHERE bill_id = ? AND tenant_id = ?`).bind(userId, reason, id, tenantId),
  ];
  await c.env.DB.batch(stmts);

  return c.json({ message: 'Bill cancelled', bill_id: id });
});

// ─── PUT /item — cancel single item ─────────────────────────────────────────

cancellation.put('/item', zValidator('json', cancelItemSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { invoice_item_id, reason } = c.req.valid('json');

  const item = await c.env.DB.prepare('SELECT * FROM invoice_items WHERE id = ? AND tenant_id = ?').bind(invoice_item_id, tenantId).first<any>();
  if (!item) throw new HTTPException(404, { message: 'Item not found' });
  if (item.status === 'cancelled') throw new HTTPException(400, { message: 'Item already cancelled' });

  await c.env.DB.prepare(`
    UPDATE invoice_items SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now'), cancel_reason = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(userId, reason, invoice_item_id, tenantId).run();

  // Recalculate bill total
  const { results: activeItems } = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(line_total), 0) as new_total FROM invoice_items WHERE bill_id = ? AND tenant_id = ? AND COALESCE(status, 'active') = 'active'"
  ).bind(item.bill_id, tenantId).all<any>();

  const newTotal = activeItems[0]?.new_total || 0;
  await c.env.DB.prepare(`
    UPDATE bills SET total = ?, status = CASE WHEN paid >= ? THEN 'paid' WHEN paid > 0 THEN 'partially_paid' ELSE 'open' END
    WHERE id = ? AND tenant_id = ?
  `).bind(newTotal, newTotal, item.bill_id, tenantId).run();

  return c.json({ message: 'Item cancelled', new_bill_total: newTotal });
});

// ─── PUT /items/batch — cancel multiple items ────────────────────────────────

cancellation.put('/items/batch', zValidator('json', cancelBatchSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { invoice_item_ids, reason } = c.req.valid('json');

  const placeholders = invoice_item_ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`
    UPDATE invoice_items SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now'), cancel_reason = ?
    WHERE id IN (${placeholders}) AND tenant_id = ?
  `).bind(userId, reason, ...invoice_item_ids, tenantId).run();

  return c.json({ message: `${result.meta.changes} items cancelled` });
});

// ─── PUT /provisional/:id — cancel provisional IPD item ──────────────────────

cancellation.put('/provisional/:id', zValidator('json', cancelProvisionalSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  const { reason } = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    UPDATE billing_provisional_items SET bill_status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now'), cancel_reason = ?
    WHERE id = ? AND tenant_id = ? AND bill_status = 'provisional'
  `).bind(userId, reason, id, tenantId).run();

  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Provisional item not found or already processed' });
  return c.json({ message: 'Provisional item cancelled' });
});

export default cancellation;
