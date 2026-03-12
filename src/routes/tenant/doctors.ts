import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createDoctorSchema, updateDoctorSchema } from '../../schemas/doctor';
import type { Env, Variables } from '../../types';

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const doctorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/doctors — list all active doctors
doctorRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const search = c.req.query('search') || '';

  try {
    let query = `SELECT id, name, specialty, mobile_number, consultation_fee, is_active, created_at
                 FROM doctors WHERE tenant_id = ? AND is_active = 1`;
    const params: (string | number)[] = [tenantId!];

    if (search) {
      query += ' AND (name LIKE ? OR specialty LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY name';
    const doctors = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ doctors: doctors.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch doctors' });
  }
});

// GET /api/doctors/dashboard — doctor's own dashboard data
doctorRoutes.get('/dashboard', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  if (!tenantId || !userId) throw new HTTPException(401, { message: 'Auth required' });

  try {
    // Find doctor linked to this user
    const doctor = await c.env.DB.prepare(
      `SELECT id, name, specialty, qualifications, consultation_fee
       FROM doctors WHERE user_id = ? AND tenant_id = ? AND is_active = 1 LIMIT 1`
    ).bind(userId, tenantId).first();

    if (!doctor) {
      // Also try matching by name from users table
      const user = await c.env.DB.prepare('SELECT name FROM users WHERE id = ? AND tenant_id = ?')
        .bind(userId, tenantId).first<{ name: string }>();
      if (user) {
        const byName = await c.env.DB.prepare(
          `SELECT id, name, specialty, qualifications, consultation_fee
           FROM doctors WHERE name = ? AND tenant_id = ? AND is_active = 1 LIMIT 1`
        ).bind(user.name, tenantId).first();
        if (!byName) return c.json({ error: 'No doctor profile linked' }, 404);
        // Fall through with byName
        return await buildDashboard(c, byName as Record<string, unknown>, tenantId);
      }
      return c.json({ error: 'No doctor profile linked' }, 404);
    }

    return await buildDashboard(c, doctor as Record<string, unknown>, tenantId);
  } catch (error) {
    console.error('Doctor dashboard error:', error);
    throw new HTTPException(500, { message: 'Failed to load doctor dashboard' });
  }
});

// Helper to build dashboard response
async function buildDashboard(c: AppContext, doctor: Record<string, unknown>, tenantId: string) {
  const doctorId = doctor.id as number;
  const today = new Date().toISOString().split('T')[0];

  // Today's appointments (queue)
  const { results: queue } = await c.env.DB.prepare(`
    SELECT a.id, a.patient_id, a.token_no, a.appt_time, a.visit_type, a.status, a.chief_complaint,
           p.name AS patient_name, p.patient_code, p.date_of_birth, p.gender
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    WHERE a.doctor_id = ? AND a.tenant_id = ? AND a.appt_date = ?
    ORDER BY a.token_no ASC
  `).bind(doctorId, tenantId, today).all();

  // KPI
  const total = queue.length;
  const completed = queue.filter((q: Record<string, unknown>) => q.status === 'completed' || q.status === 'paid').length;
  const waiting = queue.filter((q: Record<string, unknown>) => q.status === 'waiting').length;
  const inProgress = queue.filter((q: Record<string, unknown>) => q.status === 'in_progress').length;

  // Yesterday count
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const yesterdayRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM appointments WHERE doctor_id = ? AND tenant_id = ? AND appt_date = ?`
  ).bind(doctorId, tenantId, yesterday).first<{ cnt: number }>();

  // Visit types breakdown
  const { results: visitTypes } = await c.env.DB.prepare(`
    SELECT visit_type, COUNT(*) AS count FROM appointments
    WHERE doctor_id = ? AND tenant_id = ? AND appt_date = ?
    GROUP BY visit_type
  `).bind(doctorId, tenantId, today).all();

  // Recent prescriptions
  const { results: recentRx } = await c.env.DB.prepare(`
    SELECT p.id, p.rx_no, p.created_at, p.status,
           pt.name AS patient_name, pt.patient_code
    FROM prescriptions p
    LEFT JOIN patients pt ON p.patient_id = pt.id
    WHERE p.doctor_id = ? AND p.tenant_id = ?
    ORDER BY p.created_at DESC LIMIT 5
  `).bind(doctorId, tenantId).all();

  // Upcoming follow-ups (next 7 days)
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const { results: followUps } = await c.env.DB.prepare(`
    SELECT p.id AS rx_id, p.follow_up_date,
           pt.name AS patient_name, pt.patient_code, pt.mobile_number AS mobile
    FROM prescriptions p
    LEFT JOIN patients pt ON p.patient_id = pt.id
    WHERE p.doctor_id = ? AND p.tenant_id = ?
      AND p.follow_up_date >= ? AND p.follow_up_date <= ?
    ORDER BY p.follow_up_date ASC LIMIT 10
  `).bind(doctorId, tenantId, today, weekLater).all();

  return c.json({
    doctor,
    today,
    kpi: { total, completed, waiting, in_progress: inProgress, yesterday: yesterdayRow?.cnt ?? 0 },
    queue,
    visitTypes,
    recentRx,
    followUps,
  });
}

// GET /api/doctors/:id
doctorRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const doctor = await c.env.DB.prepare(
      'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();

    if (!doctor) throw new HTTPException(404, { message: 'Doctor not found' });
    return c.json({ doctor });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch doctor' });
  }
});

// POST /api/doctors — create doctor
doctorRoutes.post('/', zValidator('json', createDoctorSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO doctors (name, specialty, mobile_number, consultation_fee, is_active, tenant_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).bind(data.name, data.specialty ?? null, data.mobileNumber ?? null, data.consultationFee, tenantId).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Doctor added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add doctor' });
  }
});

// PUT /api/doctors/:id — update doctor
doctorRoutes.put('/:id', zValidator('json', updateDoctorSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Doctor not found' });

    await c.env.DB.prepare(
      `UPDATE doctors SET name = ?, specialty = ?, mobile_number = ?, consultation_fee = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.name              ?? existing['name'],
      data.specialty         !== undefined ? data.specialty        : existing['specialty'],
      data.mobileNumber      !== undefined ? data.mobileNumber     : existing['mobile_number'],
      data.consultationFee   !== undefined ? data.consultationFee  : existing['consultation_fee'],
      id, tenantId,
    ).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Doctor updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update doctor' });
  }
});

// DELETE /api/doctors/:id — soft delete
doctorRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Doctor not found' });

    await c.env.DB.prepare(
      `UPDATE doctors SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Doctor deactivated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to deactivate doctor' });
  }
});

export default doctorRoutes;
