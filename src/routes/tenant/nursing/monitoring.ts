import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import { createMonitoringSchema, updateMonitoringSchema, NursingQuerySchema } from '../../../schemas/nursing';

type NursingEnv = { Bindings: Env; Variables: Variables };
const ALLOWED_UPDATE_FIELDS = ['temperature', 'temperature_unit', 'pulse', 'respiration', 'bp_systolic', 'bp_diastolic', 'spo2', 'pain_scale', 'remarks', 'recorded_on'];

export const monitoringRoutes = new Hono<NursingEnv>();

monitoringRoutes.get('/', zValidator('query', NursingQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { page, limit, patient_id, visit_id } = c.req.valid('query');
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM nur_patient_monitoring WHERE tenant_id = ? AND is_active = 1';
  const params: (string | number)[] = [tenantId];
  if (patient_id) { query += ' AND patient_id = ?'; params.push(patient_id); }
  if (visit_id) { query += ' AND visit_id = ?'; params.push(visit_id); }
  query += ' ORDER BY recorded_on DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  let countQuery = 'SELECT COUNT(*) as total FROM nur_patient_monitoring WHERE tenant_id = ? AND is_active = 1';
  const countParams: (string | number)[] = [tenantId];
  if (patient_id) { countQuery += ' AND patient_id = ?'; countParams.push(patient_id); }
  if (visit_id) { countQuery += ' AND visit_id = ?'; countParams.push(visit_id); }
  const count = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();
  return c.json({ Results: results, pagination: { page, limit, total: count?.total || 0 } });
});

monitoringRoutes.get('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });
  const result = await c.env.DB.prepare('SELECT * FROM nur_patient_monitoring WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(id, tenantId).first();
  if (!result) throw new HTTPException(404, { message: 'Not found' });
  return c.json({ Results: result });
});

monitoringRoutes.post('/', zValidator('json', createMonitoringSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(`
    INSERT INTO nur_patient_monitoring (tenant_id, patient_id, visit_id, temperature, temperature_unit, pulse, respiration, bp_systolic, bp_diastolic, spo2, pain_scale, remarks, recorded_on, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.patient_id, data.visit_id,
    data.temperature ?? null, data.temperature_unit ?? 'F',
    data.pulse ?? null, data.respiration ?? null,
    data.bp_systolic ?? null, data.bp_diastolic ?? null,
    data.spo2 ?? null, data.pain_scale ?? null,
    data.remarks ?? null, data.recorded_on ?? null, userId
  ).run();
  return c.json({ Results: { id: result.meta.last_row_id } }, 201);
});

monitoringRoutes.put('/:id', zValidator('json', updateMonitoringSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });
  const existing = await c.env.DB.prepare('SELECT 1 FROM nur_patient_monitoring WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Not found' });
  const data = c.req.valid('json');
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  Object.entries(data).forEach(([key, value]) => {
    if (ALLOWED_UPDATE_FIELDS.includes(key) && value !== undefined) { fields.push(`${key} = ?`); values.push(value as string | number | null); }
  });
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')", 'updated_by = ?');
    values.push(userId, id, tenantId);
    await c.env.DB.prepare(`UPDATE nur_patient_monitoring SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...values).run();
  }
  return c.json({ Results: true });
});

monitoringRoutes.delete('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });
  const existing = await c.env.DB.prepare('SELECT 1 FROM nur_patient_monitoring WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Not found' });
  await c.env.DB.prepare("UPDATE nur_patient_monitoring SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
  return c.json({ Results: true });
});
