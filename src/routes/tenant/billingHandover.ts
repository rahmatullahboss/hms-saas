import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const handover = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET / — list handovers ─────────────────────────────────────────────────

handover.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const { status, staff_id } = c.req.query();

  let sql = `
    SELECT h.*,
      s1.name as handover_by_name, s2.name as handover_to_name, s3.name as received_by_name
    FROM billing_handovers h
    LEFT JOIN staff s1 ON h.handover_by = s1.id
    LEFT JOIN staff s2 ON h.handover_to = s2.id
    LEFT JOIN staff s3 ON h.received_by = s3.id
    WHERE h.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (status) { sql += ' AND h.status = ?'; params.push(status); }
  if (staff_id) { sql += ' AND (h.handover_by = ? OR h.handover_to = ?)'; params.push(staff_id, staff_id); }
  sql += ' ORDER BY h.created_at DESC LIMIT 100';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ handovers: results });
});

// ─── GET /pending — pending handovers for me ────────────────────────────────

handover.get('/pending/:staffId', async (c) => {
  const tenantId = requireTenantId(c);
  const staffId = parseInt(c.req.param('staffId'));

  const { results } = await c.env.DB.prepare(`
    SELECT h.*, s.name as handover_by_name
    FROM billing_handovers h LEFT JOIN staff s ON h.handover_by = s.id
    WHERE h.tenant_id = ? AND h.handover_to = ? AND h.status = 'pending'
    ORDER BY h.created_at DESC
  `).bind(tenantId, staffId).all();
  return c.json({ pending: results });
});

// ─── POST / — create handover ───────────────────────────────────────────────

handover.post('/', zValidator('json', z.object({
  handover_to: z.number().int().positive(),
  handover_amount: z.number().min(0),
  due_amount: z.number().min(0).default(0),
  handover_type: z.enum(['cashier', 'counter', 'department']).default('cashier'),
  remarks: z.string().optional(),
})), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // P3#13: Prevent self-handover
  if (data.handover_to === Number(userId)) {
    throw new HTTPException(400, { message: 'Cannot create handover to yourself' });
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO billing_handovers (tenant_id, handover_type, handover_by, handover_to, handover_amount, due_amount, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.handover_type, userId, data.handover_to, data.handover_amount, data.due_amount, data.remarks || null).run();

  return c.json({ id: result.meta.last_row_id, message: 'Handover created' }, 201);
});

// ─── PUT /:id/receive — confirm receipt ──────────────────────────────────────

handover.put('/:id/receive', zValidator('json', z.object({ remarks: z.string().optional() })), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  const { remarks } = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    UPDATE billing_handovers SET status = 'received', received_by = ?, received_at = datetime('now'), received_remarks = ?
    WHERE id = ? AND tenant_id = ? AND status = 'pending'
  `).bind(userId, remarks || null, id, tenantId).run();

  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Pending handover not found' });
  return c.json({ message: 'Handover received' });
});

// ─── PUT /:id/verify — admin verify ──────────────────────────────────────────

handover.put('/:id/verify', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));

  await c.env.DB.prepare("UPDATE billing_handovers SET status = 'verified' WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
  return c.json({ message: 'Handover verified' });
});

// ─── GET /report/daily — daily collection vs handover report ─────────────────

handover.get('/report/daily', async (c) => {
  const tenantId = requireTenantId(c);
  const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
  const staffId = c.req.query('staff_id');
  if (!staffId) throw new HTTPException(400, { message: 'staff_id required' });

  const collections = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(paid), 0) as total_collection
    FROM bills WHERE tenant_id = ? AND date(created_at) = ? AND created_by = ? AND status IN ('paid', 'partially_paid')
  `).bind(tenantId, date, staffId).first<{ total_collection: number }>();

  const handovers = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(handover_amount), 0) as total_handover
    FROM billing_handovers WHERE tenant_id = ? AND date(created_at) = ? AND handover_by = ?
  `).bind(tenantId, date, staffId).first<{ total_handover: number }>();

  const totalC = collections?.total_collection || 0;
  const totalH = handovers?.total_handover || 0;

  return c.json({
    date, staff_id: staffId,
    total_collection: totalC,
    total_handover: totalH,
    difference: totalC - totalH,
  });
});

export default handover;
