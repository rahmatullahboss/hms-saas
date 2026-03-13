import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /api/appointments
 * Retrieves a list of appointments for the current tenant.
 * Filters can be applied by date, doctor ID, and appointment status.
 *
 * @param {string} [date] - Optional appointment date to filter by (defaults to today).
 * @param {string} [doctorId] - Optional ID of the doctor to filter by.
 * @param {string} [status] - Optional appointment status to filter by.
 * @returns {Object} JSON response containing:
 *   - appointments: Array of appointment records with patient and doctor details.
 *
 * @example
 * // GET /api/appointments?date=2024-03-14&doctorId=2
 */
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

/**
 * POST /api/appointments
 * Creates a new appointment for the given patient and doctor.
 * Generates a daily token number specific to the doctor and a unique appointment number.
 *
 * @param {Object} body - Appointment details.
 * @param {number} body.patientId - The ID of the patient.
 * @param {number} [body.doctorId] - Optional ID of the doctor.
 * @param {string} body.apptDate - The date of the appointment (YYYY-MM-DD).
 * @param {string} [body.apptTime] - Optional time of the appointment.
 * @param {string} [body.visitType='opd'] - Type of visit.
 * @param {string} [body.chiefComplaint] - Optional chief complaint description.
 * @param {number} [body.fee=0] - The fee for the appointment.
 * @returns {Object} JSON response containing:
 *   - apptNo: The unique appointment number (e.g., APT-000001).
 *   - tokenNo: The daily token number for the doctor queue.
 * @throws {HTTPException} 400 if required fields are missing.
 *
 * @example
 * // POST /api/appointments
 * // Body: { "patientId": 1, "doctorId": 2, "apptDate": "2024-03-14" }
 */
app.post('/', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

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

  // Calculate the next available token number for a specific doctor on the given date.
  // This helps in queue management within the clinic for a particular day.
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

/**
 * PUT /api/appointments/:id
 * Updates the status of an existing appointment.
 *
 * @param {string} id - The ID of the appointment to update.
 * @param {Object} body - The data to update.
 * @param {string} body.status - The new status of the appointment.
 * @returns {Object} JSON response indicating success.
 *
 * @example
 * // PUT /api/appointments/123
 * // Body: { "status": "completed" }
 */
app.put('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const id = c.req.param('id');
  const body = await c.req.json<{ status: string }>();

  await c.env.DB.prepare(
    `UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
  ).bind(body.status, id, tenantId).run();

  return c.json({ success: true });
});

export default app;
