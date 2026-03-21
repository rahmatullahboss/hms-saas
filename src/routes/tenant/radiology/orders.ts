import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId, parseId } from '../../../lib/context-helpers';
import { requireRole } from '../../../middleware/rbac';
import {
  createRequisitionSchema,
  markScannedSchema,
  cancelRequisitionSchema,
  requisitionQuerySchema,
} from '../../../schemas/radiology';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const RAD_READ  = ['hospital_admin', 'doctor', 'md', 'nurse', 'reception'];
const RAD_WRITE = ['hospital_admin', 'doctor', 'md'];
const RAD_SCAN  = ['hospital_admin', 'doctor', 'md', 'nurse'];

// ═══════════════════════════════════════════════════════════════════════════════
// LIST REQUISITIONS  (F-06: removed CAST from JOIN)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', requireRole(...RAD_READ), zValidator('query', requisitionQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { page, limit, status, patient_id, from_date, to_date, urgency, search } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let where = 'WHERE r.tenant_id = ? AND r.is_active = 1';
  const binds: unknown[] = [tenantId];

  if (status)     { where += ' AND r.order_status = ?'; binds.push(status); }
  if (patient_id) { where += ' AND r.patient_id = ?';   binds.push(patient_id); }
  if (from_date)  { where += ' AND r.imaging_date >= ?'; binds.push(from_date); }
  if (to_date)    { where += ' AND r.imaging_date <= ?'; binds.push(to_date); }
  if (urgency)    { where += ' AND r.urgency = ?';      binds.push(urgency); }
  // F-12: Server-side search by patient name or imaging item
  if (search)     { where += ' AND (p.name LIKE ? OR r.imaging_item_name LIKE ?)'; binds.push(`%${search}%`, `%${search}%`); }

  // F-12: count must also join patients when search is active
  const countSql   = search
    ? `SELECT COUNT(*) as total FROM radiology_requisitions r LEFT JOIN patients p ON p.id = r.patient_id AND p.tenant_id = r.tenant_id ${where}`
    : `SELECT COUNT(*) as total FROM radiology_requisitions r ${where}`;
  const selectSql  = `
    SELECT r.id, r.patient_id, p.name as patient_name, r.imaging_type_name,
           r.imaging_item_name, r.urgency, r.order_status, r.imaging_date,
           r.is_scanned, r.is_report_saved, r.prescriber_name, r.created_at
    FROM radiology_requisitions r
    LEFT JOIN patients p ON p.id = r.patient_id AND p.tenant_id = r.tenant_id
    ${where}
    ORDER BY r.id DESC LIMIT ? OFFSET ?`;

  const [countResult, data] = await Promise.all([
    c.env.DB.prepare(countSql).bind(...binds).first<{ total: number }>(),
    c.env.DB.prepare(selectSql).bind(...binds, limit, offset).all(),
  ]);

  const total = countResult?.total ?? 0;
  return c.json({
    requisitions: data.results,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE REQUISITION
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/', requireRole(...RAD_WRITE), zValidator('json', createRequisitionSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Validate patient exists in this tenant (F-03 FIX: tenantId is TEXT, not Number)
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?',
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: `Patient #${data.patient_id} not found` });

  // Auto-lookup names if IDs provided
  let imagingTypeName = data.imaging_type_name;
  let imagingItemName = data.imaging_item_name;
  let procedureCode   = data.procedure_code;

  if (data.imaging_type_id && !imagingTypeName) {
    const t = await c.env.DB.prepare(
      'SELECT name FROM radiology_imaging_types WHERE id = ? AND tenant_id = ?',
    ).bind(data.imaging_type_id, tenantId).first<{ name: string }>();
    imagingTypeName = t?.name;
  }

  if (data.imaging_item_id && !imagingItemName) {
    const it = await c.env.DB.prepare(
      'SELECT name, procedure_code FROM radiology_imaging_items WHERE id = ? AND tenant_id = ?',
    ).bind(data.imaging_item_id, tenantId).first<{ name: string; procedure_code: string }>();
    imagingItemName = it?.name;
    procedureCode  = procedureCode ?? it?.procedure_code;
  }

  const imagingDate = data.imaging_date ?? new Date().toISOString().split('T')[0];

  const r = await c.env.DB.prepare(`
    INSERT INTO radiology_requisitions
    (tenant_id, patient_id, visit_id, admission_id, imaging_type_id, imaging_type_name,
     imaging_item_id, imaging_item_name, procedure_code, prescriber_id, prescriber_name,
     imaging_date, requisition_remarks, urgency, ward_name, has_insurance, order_status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    tenantId,
    data.patient_id,
    data.visit_id       ?? null,
    data.admission_id   ?? null,
    data.imaging_type_id ?? null,
    imagingTypeName     ?? null,
    data.imaging_item_id ?? null,
    imagingItemName     ?? null,
    procedureCode       ?? null,
    data.prescriber_id  ?? null,
    data.prescriber_name ?? null,
    imagingDate,
    data.requisition_remarks ?? null,
    data.urgency ?? 'normal',
    data.ward_name ?? null,
    data.has_insurance ? 1 : 0,
    userId,
  ).run();

  return c.json({ id: r.meta.last_row_id, message: 'Requisition created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET SINGLE REQUISITION  (F-06: removed CAST from JOIN)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/:id', requireRole(...RAD_READ), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Requisition ID');

  const req = await c.env.DB.prepare(`
    SELECT r.*, p.name as patient_name, p.phone as patient_phone
    FROM radiology_requisitions r
    LEFT JOIN patients p ON p.id = r.patient_id AND p.tenant_id = r.tenant_id
    WHERE r.id = ? AND r.tenant_id = ?
  `).bind(id, tenantId).first();

  if (!req) throw new HTTPException(404, { message: 'Requisition not found' });
  return c.json({ requisition: req });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MARK AS SCANNED
// ═══════════════════════════════════════════════════════════════════════════════

app.patch('/:id/scan', requireRole(...RAD_SCAN), zValidator('json', markScannedSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseId(c.req.param('id'), 'Requisition ID');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id, order_status FROM radiology_requisitions WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first<{ id: number; order_status: string }>();

  if (!existing) throw new HTTPException(404, { message: 'Requisition not found' });
  if (existing.order_status === 'cancelled') throw new HTTPException(400, { message: 'Cannot scan a cancelled requisition' });
  if (existing.order_status === 'reported') throw new HTTPException(400, { message: 'Cannot scan a reported requisition' });

  await c.env.DB.prepare(`
    UPDATE radiology_requisitions SET
      is_scanned = 1, scanned_by = ?, scanned_on = datetime('now'),
      scan_remarks = ?, film_type_id = ?, film_quantity = ?,
      order_status = 'scanned', updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).bind(
    userId,
    data.scan_remarks  ?? null,
    data.film_type_id  ?? null,
    data.film_quantity ?? null,
    id,
    tenantId,
  ).run();

  return c.json({ success: true, message: 'Marked as scanned' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UN-SCAN (F-11: reverse scan marking)
// ═══════════════════════════════════════════════════════════════════════════════

app.patch('/:id/unscan', requireRole(...RAD_WRITE), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Requisition ID');

  const existing = await c.env.DB.prepare(
    'SELECT id, order_status, is_report_saved FROM radiology_requisitions WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first<{ id: number; order_status: string; is_report_saved: number }>();

  if (!existing) throw new HTTPException(404, { message: 'Requisition not found' });
  if (existing.order_status !== 'scanned') {
    throw new HTTPException(400, { message: `Cannot un-scan: current status is '${existing.order_status}'` });
  }
  if (existing.is_report_saved) {
    throw new HTTPException(400, { message: 'Cannot un-scan: a report has been saved for this requisition' });
  }

  await c.env.DB.prepare(`
    UPDATE radiology_requisitions SET
      is_scanned = 0, scanned_by = NULL, scanned_on = NULL,
      scan_remarks = NULL, film_type_id = NULL, film_quantity = NULL,
      order_status = 'pending', updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).bind(id, tenantId).run();

  return c.json({ success: true, message: 'Scan marking reversed' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANCEL REQUISITION  (F-10: save cancel_remarks to DB)
// ═══════════════════════════════════════════════════════════════════════════════

app.patch('/:id/cancel', requireRole(...RAD_WRITE), zValidator('json', cancelRequisitionSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Requisition ID');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id, order_status FROM radiology_requisitions WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first<{ id: number; order_status: string }>();

  if (!existing) throw new HTTPException(404, { message: 'Requisition not found' });
  if (existing.order_status === 'reported') throw new HTTPException(400, { message: 'Cannot cancel a reported requisition' });

  // F-10: Actually save cancel_remarks to DB
  await c.env.DB.prepare(
    `UPDATE radiology_requisitions SET order_status = 'cancelled', cancel_remarks = ?, is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
  ).bind(data.cancel_remarks ?? null, id, tenantId).run();

  return c.json({ success: true, message: 'Requisition cancelled' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE (soft)
// ═══════════════════════════════════════════════════════════════════════════════

app.delete('/:id', requireRole(...RAD_WRITE), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Requisition ID');

  const r = await c.env.DB.prepare(
    `UPDATE radiology_requisitions SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
  ).bind(id, tenantId).run();

  if (!r.meta.changes) throw new HTTPException(404, { message: 'Requisition not found' });
  return c.json({ success: true });
});

export default app;
