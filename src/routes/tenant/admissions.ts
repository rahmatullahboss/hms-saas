import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/admissions?status=all|admitted|discharged|...&search=
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const status = c.req.query('status') || 'all';
  const search = c.req.query('search') || '';

  let sql = `
    SELECT a.*, p.name AS patient_name, p.patient_code,
           b.ward_name, b.bed_number,
           d.name AS doctor_name
    FROM admissions a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN beds b ON a.bed_id = b.id
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE a.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];

  if (status !== 'all') { sql += ' AND a.status = ?'; params.push(status); }
  if (search) {
    sql += ` AND (p.name LIKE ? OR p.patient_code LIKE ? OR a.admission_no LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ' ORDER BY a.admission_date DESC LIMIT 100';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ admissions: results });
});

// GET /api/admissions/stats
app.get('/stats', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const current = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM admissions WHERE tenant_id = ? AND status IN ('admitted','critical')`
  ).bind(tenantId).first<{ cnt: number }>();

  const totalBeds = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM beds WHERE tenant_id = ?`
  ).bind(tenantId).first<{ cnt: number }>();

  const avail = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM beds WHERE tenant_id = ? AND status = 'available'`
  ).bind(tenantId).first<{ cnt: number }>();

  const today = new Date().toISOString().split('T')[0];
  const dischToday = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM admissions WHERE tenant_id = ? AND status = 'discharged' AND DATE(discharge_date) = ?`
  ).bind(tenantId, today).first<{ cnt: number }>();

  return c.json({
    currentAdmissions: current?.cnt ?? 0,
    totalBeds: totalBeds?.cnt ?? 0,
    availableBeds: avail?.cnt ?? 0,
    dischargesToday: dischToday?.cnt ?? 0,
    avgStayDays: 0,
  });
});

// GET /api/admissions/beds?status=available
app.get('/beds', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const status = c.req.query('status');
  let sql = 'SELECT * FROM beds WHERE tenant_id = ?';
  const params: (string | number)[] = [tenantId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY ward_name, bed_number';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ beds: results });
});

// POST /api/admissions/beds — add a new bed
app.post('/beds', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const body = await c.req.json<{
    ward_name: string;
    bed_number: string;
    bed_type?: string;
    floor?: string;
    notes?: string;
  }>();

  if (!body.ward_name || !body.bed_number) {
    throw new HTTPException(400, { message: 'ward_name and bed_number required' });
  }

  await c.env.DB.prepare(
    `INSERT INTO beds (tenant_id, ward_name, bed_number, bed_type, floor, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    tenantId, body.ward_name, body.bed_number,
    body.bed_type ?? 'general', body.floor ?? null, body.notes ?? null
  ).run();

  return c.json({ success: true }, 201);
});

// PUT /api/admissions/beds/:id — update bed status
app.put('/beds/:id', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string; notes?: string }>();

  await c.env.DB.prepare(
    `UPDATE beds SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ? AND tenant_id = ?`
  ).bind(body.status ?? null, body.notes ?? null, id, tenantId).run();

  return c.json({ success: true });
});

// POST /api/admissions
app.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const body = await c.req.json<{
    patient_id: number;
    bed_id?: number;
    doctor_id?: number;
    admission_type?: string;
    provisional_diagnosis?: string;
    notes?: string;
  }>();

  if (!body.patient_id) throw new HTTPException(400, { message: 'patient_id required' });

  // Generate admission number
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM admissions WHERE tenant_id = ?'
  ).bind(tenantId).first<{ cnt: number }>();
  const admNo = `ADM-${String((countRow?.cnt ?? 0) + 1).padStart(5, '0')}`;

  await c.env.DB.prepare(
    `INSERT INTO admissions (tenant_id, admission_no, patient_id, bed_id, doctor_id, admission_type, provisional_diagnosis, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tenantId, admNo, body.patient_id, body.bed_id ?? null,
    body.doctor_id ?? null, body.admission_type ?? 'planned',
    body.provisional_diagnosis ?? null, body.notes ?? null
  ).run();

  // Mark bed as occupied
  if (body.bed_id) {
    await c.env.DB.prepare(
      `UPDATE beds SET status = 'occupied' WHERE id = ? AND tenant_id = ?`
    ).bind(body.bed_id, tenantId).run();
  }

  return c.json({ admission_no: admNo }, 201);
});

// PUT /api/admissions/:id
app.put('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const id = c.req.param('id');
  const body = await c.req.json<{ status: string }>();

  if (body.status === 'discharged') {
    // Free the bed
    const adm = await c.env.DB.prepare(
      `SELECT bed_id FROM admissions WHERE id = ? AND tenant_id = ?`
    ).bind(id, tenantId).first<{ bed_id: number | null }>();

    await c.env.DB.prepare(
      `UPDATE admissions SET status = 'discharged', discharge_date = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).bind(id, tenantId).run();

    if (adm?.bed_id) {
      await c.env.DB.prepare(
        `UPDATE beds SET status = 'available' WHERE id = ? AND tenant_id = ?`
      ).bind(adm.bed_id, tenantId).run();
    }
  } else {
    await c.env.DB.prepare(
      `UPDATE admissions SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).bind(body.status, id, tenantId).run();
  }

  return c.json({ success: true });
});

export default app;
