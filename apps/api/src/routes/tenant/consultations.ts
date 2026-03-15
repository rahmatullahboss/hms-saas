import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const consultationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── POST / — book a consultation ─────────────────────────────────────────────
consultationRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const body = await c.req.json();
  const { doctorId, patientId, scheduledAt, durationMin, chiefComplaint } = body;

  if (!patientId || !scheduledAt) {
    throw new HTTPException(400, { message: 'patientId and scheduledAt are required' });
  }

  // Validate patient exists
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?',
  ).bind(patientId, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  // Validate doctor if provided
  if (doctorId) {
    const doctor = await c.env.DB.prepare(
      'SELECT id FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(doctorId, tenantId).first();
    if (!doctor) throw new HTTPException(404, { message: 'Doctor not found' });
  }

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO consultations
        (patient_id, doctor_id, scheduled_at, notes, status, tenant_id, created_by)
      VALUES (?, ?, ?, ?, 'scheduled', ?, ?)
    `).bind(
      patientId,
      doctorId ?? null,
      scheduledAt,
      chiefComplaint ?? null,
      tenantId,
      userId,
    ).run();

    return c.json({ id: result.meta.last_row_id, message: 'Consultation booked' }, 201);
  } catch (err) {
    console.error('Create consultation error:', err);
    throw new HTTPException(500, { message: 'Failed to book consultation' });
  }
});

// ─── GET / — list consultations ────────────────────────────────────────────────
consultationRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { doctorId, patientId, status } = c.req.query();

  let query = `
    SELECT ts.*, p.name as patient_name, d.name as doctor_name
    FROM consultations ts
    JOIN patients p ON ts.patient_id = p.id AND p.tenant_id = ts.tenant_id
    LEFT JOIN doctors d ON ts.doctor_id = d.id AND d.tenant_id = ts.tenant_id
    WHERE ts.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId!];

  if (doctorId) { query += ' AND ts.doctor_id = ?'; params.push(doctorId); }
  if (patientId) { query += ' AND ts.patient_id = ?'; params.push(patientId); }
  if (status) { query += ' AND ts.status = ?'; params.push(status); }

  query += ' ORDER BY ts.scheduled_at DESC LIMIT 100';

  try {
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ consultations: results.results });
  } catch (err) {
    console.error('List consultations error:', err);
    throw new HTTPException(500, { message: 'Failed to fetch consultations' });
  }
});

// ─── GET /:id — get single consultation ────────────────────────────────────────
consultationRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const consultation = await c.env.DB.prepare(`
      SELECT ts.*, p.name as patient_name, d.name as doctor_name
      FROM consultations ts
      JOIN patients p ON ts.patient_id = p.id AND p.tenant_id = ts.tenant_id
      LEFT JOIN doctors d ON ts.doctor_id = d.id AND d.tenant_id = ts.tenant_id
      WHERE ts.id = ? AND ts.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!consultation) throw new HTTPException(404, { message: 'Consultation not found' });
    return c.json({ consultation });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(500, { message: 'Failed to fetch consultation' });
  }
});

// ─── PUT /:id — update consultation ────────────────────────────────────────────
consultationRoutes.put('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { scheduledAt, durationMin, chiefComplaint, status } = body;

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM consultations WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Consultation not found' });

    const updates: string[] = [];
    const vals: (string | number | null)[] = [];

    if (scheduledAt) { updates.push('scheduled_at = ?'); vals.push(scheduledAt); }
    if (chiefComplaint !== undefined) { updates.push('notes = ?'); vals.push(chiefComplaint); }
    if (status) { updates.push('status = ?'); vals.push(status); }

    if (updates.length === 0) return c.json({ message: 'No fields to update' });

    vals.push(id, tenantId!);
    await c.env.DB.prepare(
      `UPDATE consultations SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
    ).bind(...vals).run();

    return c.json({ message: 'Consultation updated' });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(500, { message: 'Failed to update consultation' });
  }
});

// ─── PUT /:id/end — complete consultation ──────────────────────────────────────
consultationRoutes.put('/:id/end', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { prescription, followupDate } = body as Record<string, string>;

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM consultations WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Consultation not found' });

    await c.env.DB.prepare(`
      UPDATE consultations
      SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).run();

    return c.json({ message: 'Consultation completed', prescription: prescription ?? null, followupDate: followupDate ?? null });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(500, { message: 'Failed to end consultation' });
  }
});

// ─── DELETE /:id — cancel consultation ────────────────────────────────────────
consultationRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM consultations WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Consultation not found' });

    await c.env.DB.prepare(
      `UPDATE consultations SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).run();

    return c.json({ message: 'Consultation cancelled' });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(500, { message: 'Failed to cancel consultation' });
  }
});

export default consultationRoutes;
