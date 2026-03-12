import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /api/patient-portal/summary — aggregated patient self-service data ──
app.get('/summary', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  if (!tenantId || !userId) throw new HTTPException(401, { message: 'Auth required' });

  // Find patient linked to this user
  const patient = await c.env.DB.prepare(
    `SELECT id, name, patient_code, date_of_birth, gender, blood_group, address
     FROM patients WHERE user_id = ? AND tenant_id = ? LIMIT 1`
  ).bind(userId, tenantId).first();

  if (!patient) {
    // Try by mobile or email match — fall back to user record
    return c.json({ summary: null, message: 'No patient profile linked' });
  }

  const pid = (patient as Record<string, unknown>).id as number;
  const dob = (patient as Record<string, unknown>).date_of_birth as string | undefined;

  // Calculate age
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
    SELECT p.rx_no, p.created_at AS date, d.name AS doctor,
           (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = p.id) AS item_count
    FROM prescriptions p
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.patient_id = ? AND p.tenant_id = ?
    ORDER BY p.created_at DESC LIMIT 5
  `).bind(pid, tenantId).all();

  // Recent lab orders
  const { results: labs } = await c.env.DB.prepare(`
    SELECT lo.order_no AS lab_no, lo.order_date AS date, lo.status,
           GROUP_CONCAT(loi.test_name, ', ') AS test_name
    FROM lab_orders lo
    LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
    WHERE lo.patient_id = ? AND lo.tenant_id = ?
    GROUP BY lo.id
    ORDER BY lo.order_date DESC LIMIT 5
  `).bind(pid, tenantId).all();

  // Recent bills
  const { results: bills } = await c.env.DB.prepare(`
    SELECT bill_no, created_at AS date, total AS amount, status
    FROM billing WHERE patient_id = ? AND tenant_id = ?
    ORDER BY created_at DESC LIMIT 5
  `).bind(pid, tenantId).all();

  // Notifications
  const { results: notifs } = await c.env.DB.prepare(`
    SELECT id, message, created_at AS date, is_read AS read
    FROM notifications WHERE user_id = ? AND tenant_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).bind(userId, tenantId).all();

  return c.json({
    summary: {
      name: (patient as Record<string, unknown>).name,
      patient_code: (patient as Record<string, unknown>).patient_code,
      age,
      gender: (patient as Record<string, unknown>).gender,
      blood_group: (patient as Record<string, unknown>).blood_group,
      upcoming_appointment: upcomingAppt ?? null,
      recent_prescriptions: rxs,
      recent_labs: labs,
      recent_bills: bills,
      notifications: notifs,
    },
  });
});

export default app;
