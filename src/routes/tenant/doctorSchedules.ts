import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';
import { createDoctorScheduleSchema, updateDoctorScheduleSchema } from '../../schemas/clinical';
import { getDb } from '../../db';


const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/doctor-schedules/doctors — doctors with schedule_count
app.get('/doctors', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const { results } = await db.$client.prepare(`
    SELECT d.id, d.name, d.specialty, d.bmdc_reg_no, d.qualifications, d.visiting_hours,
           (SELECT COUNT(*) FROM doctor_schedules ds WHERE ds.doctor_id = d.id AND ds.tenant_id = d.tenant_id AND ds.is_active = 1) AS schedule_count
    FROM doctors d
    WHERE d.tenant_id = ?
    ORDER BY d.name
  `).bind(tenantId).all();

  return c.json({ doctors: results });
});

// GET /api/doctor-schedules?doctor_id= (doctor_id is optional — lists all if omitted)
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const doctorId = c.req.query('doctor_id');

  let results;
  if (doctorId) {
    const r = await db.$client.prepare(`
      SELECT ds.*, d.name AS doctor_name, d.specialty
      FROM doctor_schedules ds
      LEFT JOIN doctors d ON d.id = ds.doctor_id AND d.tenant_id = ds.tenant_id
      WHERE ds.tenant_id = ? AND ds.doctor_id = ? AND ds.is_active = 1
      ORDER BY CASE ds.day_of_week
        WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2
        WHEN 'wed' THEN 3 WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6
      END, ds.start_time
    `).bind(tenantId, Number(doctorId)).all();
    results = r.results;
  } else {
    const r = await db.$client.prepare(`
      SELECT ds.*, d.name AS doctor_name, d.specialty
      FROM doctor_schedules ds
      LEFT JOIN doctors d ON d.id = ds.doctor_id AND d.tenant_id = ds.tenant_id
      WHERE ds.tenant_id = ? AND ds.is_active = 1
      ORDER BY d.name, CASE ds.day_of_week
        WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2
        WHEN 'wed' THEN 3 WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6
      END, ds.start_time
    `).bind(tenantId).all();
    results = r.results;
  }

  return c.json({ schedules: results, total: results.length });
});


// POST /api/doctor-schedules
app.post('/', zValidator('json', createDoctorScheduleSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['hospital_admin', 'md', 'receptionist'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to modify schedules' });
  }

  const body = c.req.valid('json');

  await db.$client.prepare(`
    INSERT INTO doctor_schedules (tenant_id, doctor_id, day_of_week, start_time, end_time, session_type, chamber, max_patients, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, body.doctor_id, body.day_of_week,
    body.start_time, body.end_time,
    body.session_type ?? 'morning', body.chamber ?? null,
    body.max_patients ?? 20, body.notes ?? null
  ).run();

  return c.json({ success: true }, 201);
});

// PUT /api/doctor-schedules/:id
app.put('/:id', zValidator('json', updateDoctorScheduleSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['hospital_admin', 'md', 'receptionist'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to modify schedules' });
  }

  const id = c.req.param('id');
  const body = c.req.valid('json');

  await db.$client.prepare(`
    UPDATE doctor_schedules SET
      day_of_week = COALESCE(?, day_of_week),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      session_type = COALESCE(?, session_type),
      chamber = COALESCE(?, chamber),
      max_patients = COALESCE(?, max_patients),
      notes = COALESCE(?, notes)
    WHERE id = ? AND tenant_id = ?
  `).bind(
    body.day_of_week ?? null, body.start_time ?? null,
    body.end_time ?? null, body.session_type ?? null,
    body.chamber ?? null, body.max_patients ?? null,
    body.notes ?? null, id, tenantId
  ).run();

  return c.json({ success: true });
});

// DELETE /api/doctor-schedules/:id
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['hospital_admin', 'md', 'receptionist'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to modify schedules' });
  }

  const id = c.req.param('id');
  await db.$client.prepare(
    `UPDATE doctor_schedules SET is_active = 0 WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).run();

  return c.json({ success: true });
});

export default app;
