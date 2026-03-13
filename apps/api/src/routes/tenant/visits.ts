import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createVisitSchema, updateVisitSchema, dischargeSchema } from '../../schemas/visit';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';

const visitRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/visits — list visits with filters
visitRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { patientId, doctorId, type, date } = c.req.query();

  try {
    let query = `
      SELECT v.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile,
             d.name as doctor_name, d.specialty as doctor_specialty
      FROM visits v
      JOIN patients p ON v.patient_id = p.id AND p.tenant_id = v.tenant_id
      LEFT JOIN doctors d ON v.doctor_id = d.id AND d.tenant_id = v.tenant_id
      WHERE v.tenant_id = ?`;
    const params: (string | number)[] = [tenantId!];

    if (patientId) { query += ' AND v.patient_id = ?'; params.push(patientId); }
    if (doctorId)  { query += ' AND v.doctor_id = ?';  params.push(doctorId); }
    if (type)      { query += ' AND v.visit_type = ?';  params.push(type); }
    if (date)      { query += ' AND date(v.created_at) = ?'; params.push(date); }

    query += ' ORDER BY v.created_at DESC LIMIT 100';
    const visits = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ visits: visits.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch visits' });
  }
});

// GET /api/visits/:id — single visit detail
visitRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const visit = await c.env.DB.prepare(`
      SELECT v.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile,
             d.name as doctor_name, d.specialty
      FROM visits v
      JOIN patients p ON v.patient_id = p.id AND p.tenant_id = v.tenant_id
      LEFT JOIN doctors d ON v.doctor_id = d.id AND d.tenant_id = v.tenant_id
      WHERE v.id = ? AND v.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!visit) throw new HTTPException(404, { message: 'Visit not found' });
    return c.json({ visit });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch visit' });
  }
});

// POST /api/visits — create new OPD or IPD visit
visitRoutes.post('/', zValidator('json', createVisitSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    const visitNo = await getNextSequence(c.env.DB, tenantId!, 'visit', 'V');
    const admissionNo = data.visitType === 'ipd'
      ? await getNextSequence(c.env.DB, tenantId!, 'admission', 'ADM')
      : null;

    const result = await c.env.DB.prepare(`
      INSERT INTO visits
        (patient_id, visit_no, doctor_id, visit_type, admission_flag, admission_no,
         admission_date, notes, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.patientId,
      visitNo,
      data.doctorId ?? null,
      data.visitType,
      data.admissionFlag ? 1 : 0,
      admissionNo,
      data.admissionDate ?? null,
      data.notes ?? null,
      tenantId,
      userId,
    ).run();

    // Audit log
    void createAuditLog(c.env, tenantId!, userId!, 'create', 'visits', result.meta.last_row_id, null, { visitType: data.visitType, visitNo });
    return c.json({ message: 'Visit created', id: result.meta.last_row_id, visitNo }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to create visit' });
  }
});

// PUT /api/visits/:id — update notes, doctor
visitRoutes.put('/:id', zValidator('json', updateVisitSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM visits WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Visit not found' });

    await c.env.DB.prepare(`
      UPDATE visits
      SET doctor_id = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).bind(
      data.doctorId ?? existing['doctor_id'],
      data.notes    !== undefined ? data.notes : existing['notes'],
      id, tenantId,
    ).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Visit updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update visit' });
  }
});

// POST /api/visits/:id/discharge — mark IPD discharge
visitRoutes.post('/:id/discharge', zValidator('json', dischargeSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM visits WHERE id = ? AND tenant_id = ? AND visit_type = ?',
    ).bind(id, tenantId, 'ipd').first();
    if (!existing) throw new HTTPException(404, { message: 'IPD visit not found' });

    await c.env.DB.prepare(`
      UPDATE visits
      SET discharge_date = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).bind(data.dischargeDate, data.notes ?? null, id, tenantId).run();

    // Audit log
    void createAuditLog(c.env, tenantId!, userId!, 'discharge', 'visits', Number(id), null, { dischargeDate: data.dischargeDate });
    return c.json({ message: 'Patient discharged', dischargeDate: data.dischargeDate });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to discharge patient' });
  }
});

export default visitRoutes;
