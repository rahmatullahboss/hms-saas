import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import { requireRole } from '../../../middleware/rbac';
import {
  createReportSchema,
  updateReportSchema,
  reportQuerySchema,
} from '../../../schemas/radiology';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const RAD_READ   = ['hospital_admin', 'doctor', 'md', 'nurse', 'reception'];
const RAD_REPORT = ['hospital_admin', 'doctor', 'md'];

function parseId(v: string, label = 'ID'): number {
  const n = parseInt(v, 10);
  if (isNaN(n) || n <= 0) throw new HTTPException(400, { message: `Invalid ${label}` });
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', requireRole(...RAD_READ), zValidator('query', reportQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { page, limit, patient_id, from_date, to_date, order_status } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let where = 'WHERE r.tenant_id = ? AND r.is_active = 1';
  const binds: unknown[] = [tenantId];

  if (patient_id)   { where += ' AND r.patient_id = ?';   binds.push(patient_id); }
  if (from_date)    { where += ' AND date(r.created_at) >= ?'; binds.push(from_date); }
  if (to_date)      { where += ' AND date(r.created_at) <= ?'; binds.push(to_date); }
  if (order_status) { where += ' AND r.order_status = ?'; binds.push(order_status); }

  const countSql = `SELECT COUNT(*) as total FROM radiology_reports r ${where}`;
  const selectSql = `
    SELECT r.id, r.requisition_id, r.patient_id, p.name as patient_name,
           r.imaging_type_name, r.imaging_item_name, r.radiology_number,
           r.order_status, r.performer_name, r.created_at
    FROM radiology_reports r
    LEFT JOIN patients p ON p.id = r.patient_id AND p.tenant_id = CAST(r.tenant_id AS INTEGER)
    ${where}
    ORDER BY r.id DESC LIMIT ? OFFSET ?`;

  const [countResult, data] = await Promise.all([
    c.env.DB.prepare(countSql).bind(...binds).first<{ total: number }>(),
    c.env.DB.prepare(selectSql).bind(...binds, limit, offset).all(),
  ]);

  const total = countResult?.total ?? 0;
  return c.json({
    reports: data.results,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/', requireRole(...RAD_REPORT), zValidator('json', createReportSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Validate requisition exists and belongs to tenant
  const req = await c.env.DB.prepare(
    'SELECT id, is_report_saved, order_status FROM radiology_requisitions WHERE id = ? AND tenant_id = ?',
  ).bind(data.requisition_id, tenantId).first<{ id: number; is_report_saved: number; order_status: string }>();

  if (!req) throw new HTTPException(404, { message: 'Requisition not found' });
  if (req.is_report_saved) throw new HTTPException(409, { message: 'Report already exists for this requisition' });
  if (req.order_status === 'cancelled') throw new HTTPException(400, { message: 'Cannot report a cancelled requisition' });

  // Generate radiology number: RAD-YYYYMMDD-XXX
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM radiology_reports WHERE tenant_id = ? AND radiology_number LIKE ?`,
  ).bind(tenantId, `RAD-${today}%`).first<{ cnt: number }>();
  const seq = (countRow?.cnt ?? 0) + 1;
  const radNumber = data.radiology_number ?? `RAD-${today}-${String(seq).padStart(3, '0')}`;

  const r = await c.env.DB.prepare(`
    INSERT INTO radiology_reports
    (tenant_id, requisition_id, patient_id, visit_id,
     imaging_type_id, imaging_type_name, imaging_item_id, imaging_item_name,
     prescriber_id, prescriber_name, performer_id, performer_name,
     template_id, report_text, indication, radiology_number,
     image_key, patient_study_id, signatories, order_status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId,
    data.requisition_id,
    data.patient_id,
    data.visit_id           ?? null,
    data.imaging_type_id    ?? null,
    data.imaging_type_name  ?? null,
    data.imaging_item_id    ?? null,
    data.imaging_item_name  ?? null,
    data.prescriber_id      ?? null,
    data.prescriber_name    ?? null,
    data.performer_id       ?? null,
    data.performer_name     ?? null,
    data.template_id        ?? null,
    data.report_text        ?? null,
    data.indication         ?? null,
    radNumber,
    data.image_key          ?? null,
    data.patient_study_id   ?? null,
    data.signatories        ?? null,
    data.order_status       ?? 'pending',
    userId,
  ).run();

  // Update requisition as reported
  await c.env.DB.prepare(
    `UPDATE radiology_requisitions SET is_report_saved = 1, order_status = 'reported', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
  ).bind(data.requisition_id, tenantId).run();

  return c.json({ id: r.meta.last_row_id, radiology_number: radNumber, message: 'Report created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET SINGLE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/:id', requireRole(...RAD_READ), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Report ID');

  const report = await c.env.DB.prepare(`
    SELECT r.*, p.name as patient_name, p.phone as patient_phone, p.dob as patient_dob
    FROM radiology_reports r
    LEFT JOIN patients p ON p.id = r.patient_id AND p.tenant_id = CAST(r.tenant_id AS INTEGER)
    WHERE r.id = ? AND r.tenant_id = ?
  `).bind(id, tenantId).first();

  if (!report) throw new HTTPException(404, { message: 'Report not found' });
  return c.json({ report });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

app.put('/:id', requireRole(...RAD_REPORT), zValidator('json', updateReportSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Report ID');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM radiology_reports WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Report not found' });

  const sets: string[] = [];
  const vals: unknown[] = [];

  const fieldMap: Record<string, string> = {
    imaging_type_name: 'imaging_type_name',
    imaging_item_name: 'imaging_item_name',
    performer_id:      'performer_id',
    performer_name:    'performer_name',
    template_id:       'template_id',
    report_text:       'report_text',
    indication:        'indication',
    radiology_number:  'radiology_number',
    image_key:         'image_key',
    patient_study_id:  'patient_study_id',
    signatories:       'signatories',
    order_status:      'order_status',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push((data as Record<string, unknown>)[key]);
    }
  }

  if (!sets.length) throw new HTTPException(400, { message: 'No fields to update' });
  sets.push("updated_at = datetime('now')");
  vals.push(tenantId, id);

  await c.env.DB.prepare(
    `UPDATE radiology_reports SET ${sets.join(', ')} WHERE tenant_id = ? AND id = ?`,
  ).bind(...vals).run();

  return c.json({ success: true, message: 'Report updated' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINALIZE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

app.patch('/:id/finalize', requireRole(...RAD_REPORT), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Report ID');

  const r = await c.env.DB.prepare(
    `UPDATE radiology_reports SET order_status = 'final', updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND order_status = 'pending'`,
  ).bind(id, tenantId).run();

  if (!r.meta.changes) throw new HTTPException(404, { message: 'Report not found or already finalized' });
  return c.json({ success: true, message: 'Report finalized' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE (soft)
// ═══════════════════════════════════════════════════════════════════════════════

app.delete('/:id', requireRole(...RAD_REPORT), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Report ID');

  const r = await c.env.DB.prepare(
    `UPDATE radiology_reports SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
  ).bind(id, tenantId).run();

  if (!r.meta.changes) throw new HTTPException(404, { message: 'Report not found' });
  return c.json({ success: true });
});

export default app;
