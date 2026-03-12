import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const doctorDashboardRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /api/doctors/dashboard
 *
 * Returns all data needed for the Doctor Dashboard in a single query batch:
 * - Doctor profile linked to the current user
 * - Today's appointment stats + queue
 * - Recent prescriptions (last 5)
 * - Upcoming follow-ups from prescriptions (next 7 days)
 * - Visit-type breakdown for today
 */
doctorDashboardRoutes.get('/dashboard', async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');

  // BST (Bangladesh Standard Time = UTC+6). Workers always run in UTC,
  // so adding 6 hours gives us the correct local date in Bangladesh.
  const now    = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const today  = now.toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // ── 1. Doctor profile linked to this user ──────────────────────────────
    let doctorRecord: Record<string, unknown> | null = null;

    // Try staff link first (may fail if staff.doctor_id column doesn't exist)
    try {
      doctorRecord = await c.env.DB.prepare(
        `SELECT d.* FROM doctors d
         JOIN staff s ON s.doctor_id = d.id
         WHERE s.user_id = ? AND d.tenant_id = ?
         LIMIT 1`,
      ).bind(userId, tenantId).first<Record<string, unknown>>();
    } catch {
      // staff table may not have doctor_id column — fall through
    }

    // Fallback: try doctors table directly by user_id field
    if (!doctorRecord) {
      doctorRecord = await c.env.DB.prepare(
        'SELECT * FROM doctors WHERE user_id = ? AND tenant_id = ? LIMIT 1'
      ).bind(userId, tenantId).first<Record<string, unknown>>();
    }

    if (!doctorRecord) {
      throw new HTTPException(404, { message: 'Doctor profile not found for this user' });
    }

    const doctorId = doctorRecord.id as number;

    // ── 2. Today's appointment queue ───────────────────────────────────────
    const { results: todayAppointments } = await c.env.DB.prepare(`
      SELECT a.id, a.patient_id, a.token_no, a.appt_time, a.visit_type, a.status, a.notes,
             a.chief_complaint, a.fee,
             p.name AS patient_name, p.patient_code, p.date_of_birth, p.gender
      FROM   appointments a
      JOIN   patients p ON a.patient_id = p.id
      WHERE  a.doctor_id = ? AND a.appt_date = ? AND a.tenant_id = ?
      ORDER  BY a.token_no ASC
    `).bind(doctorId, today, tenantId).all();

    // ── 3. KPI aggregates ──────────────────────────────────────────────────
    const kpi = await c.env.DB.prepare(`
      SELECT
        COUNT(*)                                                        AS total,
        SUM(CASE WHEN status IN ('completed','paid') THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'waiting'             THEN 1 ELSE 0 END) AS waiting,
        SUM(CASE WHEN status = 'in_progress'         THEN 1 ELSE 0 END) AS in_progress
      FROM appointments
      WHERE doctor_id = ? AND appt_date = ? AND tenant_id = ?
    `).bind(doctorId, today, tenantId).first<Record<string, number>>();

    // ── 4. Yesterday's total (for trend arrows) ────────────────────────────
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const prevKpi = await c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM appointments WHERE doctor_id = ? AND appt_date = ? AND tenant_id = ?'
    ).bind(doctorId, yesterdayStr, tenantId).first<{ total: number }>();

    // ── 5. Visit-type breakdown (today) ────────────────────────────────────
    const { results: visitTypes } = await c.env.DB.prepare(`
      SELECT visit_type, COUNT(*) AS count
      FROM   appointments
      WHERE  doctor_id = ? AND appt_date = ? AND tenant_id = ?
      GROUP  BY visit_type
    `).bind(doctorId, today, tenantId).all();

    // ── 6. Recent prescriptions (last 5 finalised) ─────────────────────────
    const { results: recentRx } = await c.env.DB.prepare(`
      SELECT p.id, p.rx_no, p.created_at, p.status,
             pt.name AS patient_name, pt.patient_code
      FROM   prescriptions p
      JOIN   patients pt ON p.patient_id = pt.id
      WHERE  p.doctor_id = ? AND p.tenant_id = ?
      ORDER  BY p.created_at DESC
      LIMIT  5
    `).bind(doctorId, tenantId).all();

    // ── 7. Upcoming follow-ups (next 7 days) ───────────────────────────────
    const in7days = new Date(now);
    in7days.setDate(in7days.getDate() + 7);
    const in7daysStr = in7days.toISOString().split('T')[0];

    const { results: followUps } = await c.env.DB.prepare(`
      SELECT p.id AS rx_id, p.follow_up_date,
             pt.name AS patient_name, pt.patient_code, pt.mobile
      FROM   prescriptions p
      JOIN   patients pt ON p.patient_id = pt.id
      WHERE  p.doctor_id  = ? AND p.tenant_id = ?
        AND  p.follow_up_date >= ? AND p.follow_up_date <= ?
      ORDER  BY p.follow_up_date ASC
      LIMIT  10
    `).bind(doctorId, tenantId, today, in7daysStr).all();

    return c.json({
      doctor:            doctorRecord,
      today,
      kpi: {
        total:       kpi?.total      ?? 0,
        completed:   kpi?.completed  ?? 0,
        waiting:     kpi?.waiting    ?? 0,
        in_progress: kpi?.in_progress ?? 0,
        yesterday:   prevKpi?.total  ?? 0,
      },
      queue:       todayAppointments,
      visitTypes,
      recentRx,
      followUps,
    });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    console.error('[doctor-dashboard]', e);
    throw new HTTPException(500, { message: 'Failed to load dashboard' });
  }
});

export default doctorDashboardRoutes;
