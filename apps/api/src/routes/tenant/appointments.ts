import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createAppointmentSchema, updateAppointmentSchema } from '../../schemas/appointment';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';

const appointmentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /api/appointments ───────────────────────────────────────────────────
// Params: date, doctorId, status, patientId
appointmentRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { date, doctorId, status, patientId } = c.req.query();

  try {
    let query = `
      SELECT a.*,
             p.name        AS patient_name,
             p.patient_code,
             p.mobile      AS patient_mobile,
             d.name        AS doctor_name,
             d.specialty   AS doctor_specialty
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.tenant_id = ?`;
    const params: (string | number)[] = [tenantId!];

    if (date)      { query += ' AND a.appt_date = ?'; params.push(date); }
    if (doctorId)  { query += ' AND a.doctor_id = ?'; params.push(doctorId); }
    if (status)    { query += ' AND a.status = ?';    params.push(status); }
    if (patientId) { query += ' AND a.patient_id = ?'; params.push(patientId); }

    query += ' ORDER BY a.appt_date ASC, a.token_no ASC LIMIT 200';
    const appts = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ appointments: appts.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch appointments' });
  }
});

// ─── GET /api/appointments/today ─────────────────────────────────────────────
appointmentRoutes.get('/today', async (c) => {
  const tenantId = c.get('tenantId');
  // Use Bangladesh time (UTC+6) so "today" is correct for local users
  const now = new Date();
  const bstOffset = 6 * 60; // minutes
  const bst = new Date(now.getTime() + (bstOffset + now.getTimezoneOffset()) * 60000);
  const today = bst.toISOString().split('T')[0];

  try {
    const appts = await c.env.DB.prepare(`
      SELECT a.*,
             p.name        AS patient_name,
             p.patient_code,
             p.mobile      AS patient_mobile,
             d.name        AS doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.tenant_id = ? AND a.appt_date = ?
      ORDER BY a.token_no ASC
    `).bind(tenantId, today).all();
    return c.json({ appointments: appts.results, date: today });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch today\'s appointments' });
  }
});

// ─── GET /api/appointments/:id ────────────────────────────────────────────────
appointmentRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const appt = await c.env.DB.prepare(`
      SELECT a.*,
             p.name AS patient_name, p.patient_code, p.mobile AS patient_mobile,
             d.name AS doctor_name, d.specialty, d.consultation_fee
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.id = ? AND a.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!appt) throw new HTTPException(404, { message: 'Appointment not found' });
    return c.json({ appointment: appt });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch appointment' });
  }
});

// ─── POST /api/appointments ───────────────────────────────────────────────────
appointmentRoutes.post('/', zValidator('json', createAppointmentSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');
  const data     = c.req.valid('json');

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Calculate the next token number for this doctor on this date
      const tokenRow = await c.env.DB.prepare(`
        SELECT COALESCE(MAX(token_no), 0) + 1 AS next_token
        FROM appointments
        WHERE tenant_id = ? AND appt_date = ? AND (doctor_id = ? OR (doctor_id IS NULL AND ? IS NULL))
      `).bind(tenantId, data.apptDate, data.doctorId ?? null, data.doctorId ?? null).first<{ next_token: number }>();

      const tokenNo = tokenRow?.next_token ?? 1;
      const apptNo  = await getNextSequence(c.env.DB, tenantId!, 'appointment', 'APT');

      const result = await c.env.DB.prepare(`
        INSERT INTO appointments
          (appt_no, token_no, patient_id, doctor_id, appt_date, appt_time,
           visit_type, status, chief_complaint, notes, fee, created_by, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
      `).bind(
        apptNo,
        tokenNo,
        data.patientId,
        data.doctorId ?? null,
        data.apptDate,
        data.apptTime ?? null,
        data.visitType,
        data.chiefComplaint ?? null,
        data.notes ?? null,
        data.fee,
        userId,
        tenantId,
      ).run();

      void createAuditLog(c.env, tenantId!, userId!, 'create', 'appointments', result.meta.last_row_id, null, {
        apptNo, tokenNo, patientId: data.patientId, apptDate: data.apptDate,
      });

      return c.json({ message: 'Appointment booked', id: result.meta.last_row_id, apptNo, tokenNo }, 201);
    } catch (error) {
      // Retry on unique constraint violation (concurrent token assignment)
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('UNIQUE constraint') && attempt < maxRetries - 1) continue;
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, { message: 'Failed to book appointment' });
    }
  }
  throw new HTTPException(500, { message: 'Failed to book appointment after retries' });
});

// ─── PUT /api/appointments/:id ────────────────────────────────────────────────
appointmentRoutes.put('/:id', zValidator('json', updateAppointmentSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');
  const id       = c.req.param('id');
  const data     = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM appointments WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Appointment not found' });

    // Build dynamic SET clause — only update fields that were provided
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: (string | number | null)[] = [];

    if (data.status         !== undefined) { sets.push('status = ?');          vals.push(data.status); }
    if (data.apptTime       !== undefined) { sets.push('appt_time = ?');       vals.push(data.apptTime); }
    if (data.notes          !== undefined) { sets.push('notes = ?');           vals.push(data.notes ?? null); }
    if (data.chiefComplaint !== undefined) { sets.push('chief_complaint = ?'); vals.push(data.chiefComplaint ?? null); }
    if (data.doctorId       !== undefined) { sets.push('doctor_id = ?');       vals.push(data.doctorId); }
    if (data.fee            !== undefined) { sets.push('fee = ?');             vals.push(data.fee); }

    vals.push(id as string, tenantId as string);

    await c.env.DB.prepare(
      `UPDATE appointments SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
    ).bind(...vals).run();

    void createAuditLog(c.env, tenantId!, userId!, 'update', 'appointments', Number(id), existing, data);
    return c.json({ message: 'Appointment updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update appointment' });
  }
});

// ─── DELETE /api/appointments/:id — cancel ────────────────────────────────────
appointmentRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');
  const id       = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM appointments WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Appointment not found' });

    await c.env.DB.prepare(`
      UPDATE appointments SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).run();

    void createAuditLog(c.env, tenantId!, userId!, 'cancel', 'appointments', Number(id), null, { status: 'cancelled' });
    return c.json({ message: 'Appointment cancelled' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to cancel appointment' });
  }
});

export default appointmentRoutes;
