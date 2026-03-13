import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/appointments?date=YYYY-MM-DD&doctorId=&status=
app.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const doctorId = c.req.query('doctorId');
  const status = c.req.query('status');

  let sql = `
    SELECT a.*, p.name AS patient_name, p.patient_code, p.mobile AS patient_mobile,
           d.name AS doctor_name, d.specialty AS doctor_specialty
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE a.tenant_id = ? AND a.appt_date = ?
  `;
  const params: (string | number)[] = [tenantId, date];

  if (doctorId) { sql += ' AND a.doctor_id = ?'; params.push(Number(doctorId)); }
  if (status)   { sql += ' AND a.status = ?';    params.push(status); }
  sql += ' ORDER BY a.token_no ASC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ appointments: results });
});

// POST /api/appointments
app.post('/', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['receptionist', 'doctor', 'hospital_admin', 'nurse', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to create appointments' });
  }

  const body = await c.req.json<{
    patientId: number;
    doctorId?: number;
    apptDate: string;
    apptTime?: string;
    visitType?: string;
    chiefComplaint?: string;
    fee?: number;
  }>();

  if (!body.patientId || !body.apptDate) {
    throw new HTTPException(400, { message: 'patientId and apptDate are required' });
  }

  // Get next token number for the day+doctor combo
  const tokenRow = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(token_no), 0) + 1 AS next_token
     FROM appointments WHERE tenant_id = ? AND appt_date = ? AND doctor_id IS ?`
  ).bind(tenantId, body.apptDate, body.doctorId ?? null).first<{ next_token: number }>();
  const tokenNo = tokenRow?.next_token ?? 1;

  // Generate appointment number
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM appointments WHERE tenant_id = ?'
  ).bind(tenantId).first<{ cnt: number }>();
  const apptNo = `APT-${String((countRow?.cnt ?? 0) + 1).padStart(6, '0')}`;

  await c.env.DB.prepare(
    `INSERT INTO appointments (appt_no, token_no, patient_id, doctor_id, appt_date, appt_time, visit_type, chief_complaint, fee, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    apptNo, tokenNo, body.patientId, body.doctorId ?? null,
    body.apptDate, body.apptTime ?? null,
    body.visitType ?? 'opd', body.chiefComplaint ?? null,
    body.fee ?? 0, tenantId
  ).run();

  return c.json({ apptNo, tokenNo }, 201);
});

// PUT /api/appointments/:id — update status
app.put('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['receptionist', 'doctor', 'hospital_admin', 'nurse', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to update appointments' });
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ status: string }>();

  await c.env.DB.prepare(
    `UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
  ).bind(body.status, id, tenantId).run();

  return c.json({ success: true });
});

export default app;
