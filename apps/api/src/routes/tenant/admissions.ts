import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const admissions = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const admitSchema = z.object({
  patient_id: z.number().int().positive(),
  bed_id: z.number().int().positive().optional(),
  doctor_id: z.number().int().positive().optional(),
  admission_type: z.enum(['planned', 'emergency', 'transfer']).default('planned'),
  provisional_diagnosis: z.string().optional(),
  notes: z.string().optional(),
});

const updateAdmissionSchema = z.object({
  status: z.enum(['admitted', 'discharged', 'transferred', 'critical']).optional(),
  bed_id: z.number().int().positive().optional(),
  final_diagnosis: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Sequence helper ──────────────────────────────────────────────────────────

async function nextAdmissionNo(db: D1Database, tenantId: number): Promise<string> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(id), 0) as max_id FROM admissions WHERE tenant_id = ?`
  ).bind(tenantId).first<{ max_id: number }>();
  const seq = (row?.max_id ?? 0) + 1;
  return `ADM-${String(seq).padStart(5, '0')}`;
}

// ─── GET /api/admissions — list ───────────────────────────────────────────────

admissions.get('/', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const status = c.req.query('status');
  const search = c.req.query('search');

  let sql = `
    SELECT a.*, p.name as patient_name, p.patient_code,
           b.ward_name, b.bed_number,
           s.name as doctor_name
    FROM admissions a
    LEFT JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    LEFT JOIN beds b ON b.id = a.bed_id AND b.tenant_id = a.tenant_id
    LEFT JOIN staff s ON s.id = a.doctor_id AND s.tenant_id = a.tenant_id
    WHERE a.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];

  if (status && status !== 'all') {
    sql += ` AND a.status = ?`;
    params.push(status);
  }

  if (search) {
    sql += ` AND (a.admission_no LIKE ? OR p.name LIKE ? OR b.bed_number LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  sql += ` ORDER BY a.created_at DESC LIMIT 100`;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ admissions: results });
});

// ─── GET /api/admissions/stats — KPIs ─────────────────────────────────────────

admissions.get('/stats', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const today = new Date().toISOString().split('T')[0];

  const [current, beds, discharged, avgStay] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM admissions WHERE tenant_id = ? AND status IN ('admitted','critical')`)
      .bind(tenantId).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available FROM beds WHERE tenant_id = ?`)
      .bind(tenantId).first<{ total: number; available: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM admissions WHERE tenant_id = ? AND status = 'discharged' AND DATE(discharge_date) = ?`)
      .bind(tenantId, today).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT AVG(JULIANDAY(COALESCE(discharge_date, datetime('now'))) - JULIANDAY(admission_date)) as avg_days FROM admissions WHERE tenant_id = ?`)
      .bind(tenantId).first<{ avg_days: number | null }>(),
  ]);

  return c.json({
    currentAdmissions: current?.cnt ?? 0,
    totalBeds: beds?.total ?? 0,
    availableBeds: beds?.available ?? 0,
    dischargesToday: discharged?.cnt ?? 0,
    avgStayDays: avgStay?.avg_days ? parseFloat(avgStay.avg_days.toFixed(1)) : 0,
  });
});

// ─── GET /api/admissions/beds — available beds ────────────────────────────────

admissions.get('/beds', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const statusFilter = c.req.query('status') || 'available';

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM beds WHERE tenant_id = ? AND status = ? ORDER BY ward_name, bed_number`
  ).bind(tenantId, statusFilter).all();

  return c.json({ beds: results });
});

// ─── GET /api/admissions/beds/all — all beds ──────────────────────────────────

admissions.get('/beds/all', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, a.admission_no, p.name as patient_name
     FROM beds b
     LEFT JOIN admissions a ON a.bed_id = b.id AND a.tenant_id = b.tenant_id AND a.status IN ('admitted','critical')
     LEFT JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
     WHERE b.tenant_id = ?
     ORDER BY b.ward_name, b.bed_number`
  ).bind(tenantId).all();

  return c.json({ beds: results });
});

// ─── POST /api/admissions/beds — add new bed ─────────────────────────────────

const addBedSchema = z.object({
  ward_name: z.string().min(1),
  bed_number: z.string().min(1),
  bed_type: z.enum(['general', 'semi-private', 'private', 'icu', 'nicu', 'pediatric']).default('general'),
});

admissions.post('/beds', zValidator('json', addBedSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const data = c.req.valid('json');

  // Check if bed number already exists in ward
  const existing = await c.env.DB.prepare(
    `SELECT id FROM beds WHERE tenant_id = ? AND ward_name = ? AND bed_number = ?`
  ).bind(tenantId, data.ward_name, data.bed_number).first();

  if (existing) {
    throw new HTTPException(409, { message: `Bed ${data.bed_number} already exists in ${data.ward_name}` });
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO beds (tenant_id, ward_name, bed_number, bed_type, status) VALUES (?, ?, ?, ?, 'available')
  `).bind(tenantId, data.ward_name, data.bed_number, data.bed_type).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

// ─── POST /api/admissions — admit patient ─────────────────────────────────────

admissions.post('/', zValidator('json', admitSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const data = c.req.valid('json');
  const admissionNo = await nextAdmissionNo(c.env.DB, tenantId);

  // If bed assigned, mark it occupied
  if (data.bed_id) {
    const bed = await c.env.DB.prepare(
      `SELECT status FROM beds WHERE id = ? AND tenant_id = ?`
    ).bind(data.bed_id, tenantId).first<{ status: string }>();

    if (!bed) throw new HTTPException(404, { message: 'Bed not found' });
    if (bed.status !== 'available') throw new HTTPException(400, { message: 'Bed is not available' });

    await c.env.DB.prepare(
      `UPDATE beds SET status = 'occupied' WHERE id = ? AND tenant_id = ?`
    ).bind(data.bed_id, tenantId).run();
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO admissions (tenant_id, admission_no, patient_id, bed_id, doctor_id, admission_type, provisional_diagnosis, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, admissionNo, data.patient_id,
    data.bed_id ?? null, data.doctor_id ?? null,
    data.admission_type, data.provisional_diagnosis ?? null,
    data.notes ?? null
  ).run();

  return c.json({ id: result.meta.last_row_id, admission_no: admissionNo }, 201);
});

// ─── PUT /api/admissions/:id — update / discharge ─────────────────────────────

admissions.put('/:id', zValidator('json', updateAdmissionSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    `SELECT * FROM admissions WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).first();

  if (!existing) throw new HTTPException(404, { message: 'Admission not found' });

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (data.status) {
    sets.push('status = ?');
    vals.push(data.status);

    // If discharging, free the bed and set discharge date
    if (data.status === 'discharged' || data.status === 'transferred') {
      sets.push('discharge_date = ?');
      vals.push(new Date().toISOString());

      if (existing.bed_id) {
        await c.env.DB.prepare(
          `UPDATE beds SET status = 'available' WHERE id = ? AND tenant_id = ?`
        ).bind(existing.bed_id as number, tenantId).run();
      }
    }
  }

  if (data.bed_id !== undefined) {
    // Free old bed if changing
    if (existing.bed_id && data.bed_id !== existing.bed_id) {
      await c.env.DB.prepare(
        `UPDATE beds SET status = 'available' WHERE id = ? AND tenant_id = ?`
      ).bind(existing.bed_id as number, tenantId).run();
    }
    // Occupy new bed
    if (data.bed_id) {
      await c.env.DB.prepare(
        `UPDATE beds SET status = 'occupied' WHERE id = ? AND tenant_id = ?`
      ).bind(data.bed_id, tenantId).run();
    }
    sets.push('bed_id = ?');
    vals.push(data.bed_id);
  }

  if (data.final_diagnosis !== undefined) {
    sets.push('final_diagnosis = ?');
    vals.push(data.final_diagnosis);
  }

  if (data.notes !== undefined) {
    sets.push('notes = ?');
    vals.push(data.notes);
  }

  if (sets.length === 0) {
    return c.json({ message: 'No fields to update' }, 400);
  }

  sets.push("updated_at = datetime('now')");
  const finalVals: (string | number | null)[] = [...vals, id, tenantId];

  await c.env.DB.prepare(
    `UPDATE admissions SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...finalVals).run();

  return c.json({ success: true });
});

export default admissions;
