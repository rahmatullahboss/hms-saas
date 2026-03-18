import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import {
  createAdmissionSchema,
  updateAdmissionSchema,
  createBedSchema,
  updateBedSchema,
} from '../../schemas/admission';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';
import { getDb } from '../../db';


const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/admissions?status=all|admitted|discharged|...&search=
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
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

  const { results } = await db.$client.prepare(sql).bind(...params).all();
  return c.json({ admissions: results });
});

// GET /api/admissions/stats
app.get('/stats', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const current = await db.$client.prepare(
    `SELECT COUNT(*) AS cnt FROM admissions WHERE tenant_id = ? AND status IN ('admitted','critical')`
  ).bind(tenantId).first<{ cnt: number }>();

  const totalBeds = await db.$client.prepare(
    `SELECT COUNT(*) AS cnt FROM beds WHERE tenant_id = ?`
  ).bind(tenantId).first<{ cnt: number }>();

  const avail = await db.$client.prepare(
    `SELECT COUNT(*) AS cnt FROM beds WHERE tenant_id = ? AND status = 'available'`
  ).bind(tenantId).first<{ cnt: number }>();

  const today = new Date().toISOString().split('T')[0];
  const dischToday = await db.$client.prepare(
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

// GET /api/admissions/occupancy — bed occupancy rates by ward
app.get('/occupancy', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  try {
    const wards = await db.$client.prepare(`
      SELECT
        ward_name,
        COUNT(*) as total_beds,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied_beds,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_beds
      FROM beds
      WHERE tenant_id = ?
      GROUP BY ward_name
      ORDER BY ward_name
    `).bind(tenantId).all<{
      ward_name: string; total_beds: number; occupied_beds: number; available_beds: number;
    }>();

    const wardStats = (wards.results || []).map((w) => ({
      ward: w.ward_name,
      total: w.total_beds,
      occupied: w.occupied_beds,
      available: w.available_beds,
      occupancyRate: w.total_beds > 0 ? Math.round((w.occupied_beds / w.total_beds) * 100) : 0,
    }));

    const totalBeds = wardStats.reduce((s, w) => s + w.total, 0);
    const totalOccupied = wardStats.reduce((s, w) => s + w.occupied, 0);

    return c.json({
      wards: wardStats,
      overall: {
        totalBeds,
        occupied: totalOccupied,
        available: totalBeds - totalOccupied,
        occupancyRate: totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0,
      },
    });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch occupancy rates' });
  }
});

// GET /api/admissions/beds?status=available
app.get('/beds', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const status = c.req.query('status');
  let sql = 'SELECT * FROM beds WHERE tenant_id = ?';
  const params: (string | number)[] = [tenantId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY ward_name, bed_number';

  const { results } = await db.$client.prepare(sql).bind(...params).all();
  return c.json({ beds: results });
});

// POST /api/admissions/beds — add a new bed (Zod validated)
app.post('/beds', zValidator('json', createBedSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['hospital_admin', 'director', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to create beds' });
  }

  const data = c.req.valid('json');

  await db.$client.prepare(
    `INSERT INTO beds (tenant_id, ward_name, bed_number, bed_type, floor, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    tenantId, data.ward_name, data.bed_number,
    data.bed_type, data.floor ?? null, data.notes ?? null
  ).run();

  return c.json({ success: true }, 201);
});

// PUT /api/admissions/beds/:id — update bed status (Zod validated)
app.put('/beds/:id', zValidator('json', updateBedSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['hospital_admin', 'director', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to update beds' });
  }

  const id = c.req.param('id');
  const data = c.req.valid('json');

  await db.$client.prepare(
    `UPDATE beds SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ? AND tenant_id = ?`
  ).bind(data.status ?? null, data.notes ?? null, id, tenantId).run();

  return c.json({ success: true });
});

// POST /api/admissions — create admission (Zod validated + atomic batch + sequence)
app.post('/', zValidator('json', createAdmissionSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['receptionist', 'doctor', 'nurse', 'hospital_admin', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to create admissions' });
  }

  const data = c.req.valid('json');

  // ✅ Use sequence-based admission number (no more COUNT(*) race condition)
  const admNo = await getNextSequence(c.env.DB, tenantId, 'admission', 'ADM');

  // ✅ Atomic batch: admission insert + bed status update in one transaction
  const batchStmts: D1PreparedStatement[] = [
    db.$client.prepare(
      `INSERT INTO admissions (tenant_id, admission_no, patient_id, bed_id, doctor_id, admission_type, provisional_diagnosis, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tenantId, admNo, data.patient_id, data.bed_id ?? null,
      data.doctor_id ?? null, data.admission_type,
      data.provisional_diagnosis ?? null, data.notes ?? null
    ),
  ];

  // Mark bed as occupied atomically with admission
  if (data.bed_id) {
    batchStmts.push(
      db.$client.prepare(
        `UPDATE beds SET status = 'occupied' WHERE id = ? AND tenant_id = ?`
      ).bind(data.bed_id, tenantId)
    );
  }

  await db.$client.batch(batchStmts);

  return c.json({ admission_no: admNo }, 201);
});

// PUT /api/admissions/:id — update admission (Zod validated + atomic discharge)
app.put('/:id', zValidator('json', updateAdmissionSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['receptionist', 'doctor', 'nurse', 'hospital_admin', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to update admissions' });
  }

  const id = c.req.param('id');
  const { status } = c.req.valid('json');

  if (status === 'discharged') {
    // Free the bed atomically with discharge
    const adm = await db.$client.prepare(
      `SELECT bed_id FROM admissions WHERE id = ? AND tenant_id = ?`
    ).bind(id, tenantId).first<{ bed_id: number | null }>();

    // ✅ Atomic batch: discharge + bed free in one transaction
    const batchStmts: D1PreparedStatement[] = [
      db.$client.prepare(
        `UPDATE admissions SET status = 'discharged', discharge_date = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
      ).bind(id, tenantId),
    ];

    if (adm?.bed_id) {
      batchStmts.push(
        db.$client.prepare(
          `UPDATE beds SET status = 'available' WHERE id = ? AND tenant_id = ?`
        ).bind(adm.bed_id, tenantId)
      );
    }

    await db.$client.batch(batchStmts);
  } else {
    await db.$client.prepare(
      `UPDATE admissions SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).bind(status, id, tenantId).run();
  }

  return c.json({ success: true });
});

export default app;
