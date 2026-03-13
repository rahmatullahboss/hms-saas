import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Helper: resolve patient from authenticated user ─────────────────────────
async function resolvePatient(db: D1Database, userId: string, tenantId: string) {
  const patient = await db.prepare(
    `SELECT id, name, patient_code, date_of_birth, gender, blood_group, address, phone
     FROM patients WHERE user_id = ? AND tenant_id = ? LIMIT 1`
  ).bind(userId, tenantId).first();

  if (!patient) {
    throw new HTTPException(403, { message: 'No patient profile linked to this account' });
  }
  return patient as Record<string, unknown> & { id: number };
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/patient-portal/summary — aggregated overview for patient
// ═══════════════════════════════════════════════════════════════════════
app.get('/summary', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);
  const pid      = patient.id;

  // Calculate age
  const dob = patient.date_of_birth as string | undefined;
  let age: string | undefined;
  if (dob) {
    const diff = Date.now() - new Date(dob).getTime();
    age = `${Math.floor(diff / (365.25 * 86400000))}Y`;
  }

  // Next upcoming appointment
  const today = new Date().toISOString().split('T')[0];
  const upcomingAppt = await c.env.DB.prepare(`
    SELECT a.appt_date AS date, d.name AS doctor, d.specialty AS department
    FROM appointments a
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE a.patient_id = ? AND a.tenant_id = ? AND a.appt_date >= ? AND a.status = 'scheduled'
    ORDER BY a.appt_date ASC LIMIT 1
  `).bind(pid, tenantId, today).first();

  // Recent prescriptions
  const { results: rxs } = await c.env.DB.prepare(`
    SELECT p.id, p.rx_no, p.created_at AS date, d.name AS doctor,
           (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = p.id) AS item_count
    FROM prescriptions p
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.patient_id = ? AND p.tenant_id = ?
    ORDER BY p.created_at DESC LIMIT 5
  `).bind(pid, tenantId).all();

  // Recent lab orders
  const { results: labs } = await c.env.DB.prepare(`
    SELECT lo.id, lo.order_no AS lab_no, lo.order_date AS date, lo.status,
           GROUP_CONCAT(loi.test_name, ', ') AS test_name
    FROM lab_orders lo
    LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
    WHERE lo.patient_id = ? AND lo.tenant_id = ?
    GROUP BY lo.id
    ORDER BY lo.order_date DESC LIMIT 5
  `).bind(pid, tenantId).all();

  // Outstanding bills
  const { results: bills } = await c.env.DB.prepare(`
    SELECT bill_no, created_at AS date, total AS amount, status
    FROM billing WHERE patient_id = ? AND tenant_id = ? AND status IN ('pending', 'partial')
    ORDER BY created_at DESC LIMIT 10
  `).bind(pid, tenantId).all();

  // Notifications
  const { results: notifs } = await c.env.DB.prepare(`
    SELECT id, message, created_at AS date, is_read AS read
    FROM notifications WHERE user_id = ? AND tenant_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).bind(userId, tenantId).all();

  return c.json({
    summary: {
      name: patient.name,
      patient_code: patient.patient_code,
      age,
      gender: patient.gender,
      blood_group: patient.blood_group,
      upcoming_appointment: upcomingAppt ?? null,
      recent_prescriptions: rxs,
      recent_labs: labs,
      outstanding_bills: bills,
      notifications: notifs,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Appointments: list + self-schedule
// ═══════════════════════════════════════════════════════════════════════

// GET /api/patient-portal/appointments
app.get('/appointments', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);

  const { results } = await c.env.DB.prepare(`
    SELECT a.id, a.appt_date, a.appt_time, a.status, a.reason,
           d.name AS doctor_name, d.specialty
    FROM appointments a
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE a.patient_id = ? AND a.tenant_id = ?
    ORDER BY a.appt_date DESC LIMIT 50
  `).bind(patient.id, tenantId).all();

  return c.json({ appointments: results });
});

// POST /api/patient-portal/appointments — self-schedule
const selfScheduleSchema = z.object({
  doctor_id: z.number().int().positive(),
  appt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appt_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason:    z.string().max(500).optional(),
});

app.post('/appointments', zValidator('json', selfScheduleSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);
  const body     = c.req.valid('json');

  // Insert first — then derive appointment number from auto-incremented ID (no race condition)
  const result = await c.env.DB.prepare(`
    INSERT INTO appointments (tenant_id, patient_id, doctor_id, appt_date, appt_time, reason, status, appt_no)
    VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 'APT-TMP')
  `).bind(
    tenantId, patient.id, body.doctor_id,
    body.appt_date, body.appt_time ?? null,
    body.reason ?? null
  ).run();

  const newId = result.meta.last_row_id;
  const apptNo = `APT-${String(newId).padStart(5, '0')}`;
  await c.env.DB.prepare(`UPDATE appointments SET appt_no = ? WHERE id = ?`).bind(apptNo, newId).run();

  return c.json({ id: newId, appt_no: apptNo }, 201);
});

// ═══════════════════════════════════════════════════════════════════════
// Prescriptions: detail view
// ═══════════════════════════════════════════════════════════════════════
app.get('/prescriptions/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);
  const rxId     = c.req.param('id');

  const rx = await c.env.DB.prepare(`
    SELECT p.*, d.name AS doctor_name, d.specialty, d.bmdc_reg_no
    FROM prescriptions p
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.id = ? AND p.patient_id = ? AND p.tenant_id = ?
  `).bind(rxId, patient.id, tenantId).first();

  if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY sort_order'
  ).bind(rxId).all();

  return c.json({ prescription: { ...rx, items } });
});

// ═══════════════════════════════════════════════════════════════════════
// Lab Results: detail view with reference ranges
// ═══════════════════════════════════════════════════════════════════════
app.get('/lab-results/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);
  const labId    = c.req.param('id');

  const order = await c.env.DB.prepare(`
    SELECT lo.*, d.name AS doctor_name
    FROM lab_orders lo
    LEFT JOIN doctors d ON lo.doctor_id = d.id
    WHERE lo.id = ? AND lo.patient_id = ? AND lo.tenant_id = ?
  `).bind(labId, patient.id, tenantId).first();

  if (!order) throw new HTTPException(404, { message: 'Lab order not found' });

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM lab_order_items WHERE lab_order_id = ? ORDER BY id'
  ).bind(labId).all();

  return c.json({ lab_order: { ...order, items } });
});

// ═══════════════════════════════════════════════════════════════════════
// Vitals: history + self-recording
// ═══════════════════════════════════════════════════════════════════════
app.get('/vitals', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);
  const limit    = Math.min(Number(c.req.query('limit')) || 30, 100);

  const { results } = await c.env.DB.prepare(`
    SELECT systolic, diastolic, temperature, heart_rate, spo2,
           respiratory_rate, weight, recorded_at, recorded_by
    FROM patient_vitals
    WHERE patient_id = ? AND tenant_id = ?
    ORDER BY recorded_at DESC LIMIT ?
  `).bind(patient.id, tenantId, limit).all();

  return c.json({ vitals: results });
});

// POST /api/patient-portal/vitals — patient records vitals from home
const patientVitalsSchema = z.object({
  systolic:    z.number().int().min(0).max(300).optional(),
  diastolic:   z.number().int().min(0).max(200).optional(),
  temperature: z.number().min(30).max(45).optional(),
  heart_rate:  z.number().int().min(0).max(250).optional(),
  spo2:        z.number().int().min(0).max(100).optional(),
  weight:      z.number().min(0).max(500).optional(),
  notes:       z.string().max(500).optional(),
});

app.post('/vitals', zValidator('json', patientVitalsSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);
  const body     = c.req.valid('json');

  await c.env.DB.prepare(`
    INSERT INTO patient_vitals
      (tenant_id, patient_id, systolic, diastolic, temperature, heart_rate, spo2, weight, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, patient.id,
    body.systolic ?? null, body.diastolic ?? null,
    body.temperature ?? null, body.heart_rate ?? null,
    body.spo2 ?? null, body.weight ?? null,
    body.notes ?? null, `patient:${userId}`
  ).run();

  return c.json({ success: true }, 201);
});

// ═══════════════════════════════════════════════════════════════════════
// Bills: outstanding with payment option
// ═══════════════════════════════════════════════════════════════════════
app.get('/bills', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);

  const { results } = await c.env.DB.prepare(`
    SELECT id, bill_no, created_at AS date, total, discount, paid_amount, status
    FROM billing WHERE patient_id = ? AND tenant_id = ?
    ORDER BY created_at DESC LIMIT 50
  `).bind(patient.id, tenantId).all();

  return c.json({ bills: results });
});

// ═══════════════════════════════════════════════════════════════════════
// Telemedicine: upcoming/past sessions
// ═══════════════════════════════════════════════════════════════════════
app.get('/telemedicine', async (c) => {
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const patient  = await resolvePatient(c.env.DB, userId, tenantId);

  const { results } = await c.env.DB.prepare(`
    SELECT ts.id, ts.scheduled_at, ts.status, ts.room_id,
           d.name AS doctor_name, d.specialty
    FROM telemedicine_sessions ts
    LEFT JOIN doctors d ON ts.doctor_id = d.id
    WHERE ts.patient_id = ? AND ts.tenant_id = ?
    ORDER BY ts.scheduled_at DESC LIMIT 20
  `).bind(patient.id, tenantId).all();

  return c.json({ sessions: results });
});

export default app;

