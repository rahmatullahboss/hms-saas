import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const vitals = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createVitalsSchema = z.object({
  patient_id: z.number().int().positive(),
  visit_id: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  pulse: z.number().int().optional(),
  blood_pressure_systolic: z.number().int().optional(),
  blood_pressure_diastolic: z.number().int().optional(),
  respiratory_rate: z.number().int().optional(),
  spo2: z.number().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  pain_scale: z.number().int().min(0).max(10).optional(),
  blood_sugar: z.number().optional(),
  notes: z.string().optional(),
});

// ─── Helper: auto-calculate BMI ──────────────────────────────────────────────

function calcBMI(weight?: number, height?: number): number | null {
  if (!weight || !height || height <= 0) return null;
  const heightM = height / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

// ─── GET / — list vitals for a patient/visit ─────────────────────────────────

vitals.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patient_id');
  const visitId = c.req.query('visit_id');

  if (!patientId && !visitId) {
    throw new HTTPException(400, { message: 'patient_id or visit_id required' });
  }

  let sql = `
    SELECT v.*, s.name as taken_by_name
    FROM clinical_vitals v
    LEFT JOIN staff s ON v.taken_by = s.id AND s.tenant_id = v.tenant_id
    WHERE v.tenant_id = ? AND v.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];

  if (visitId) { sql += ' AND v.visit_id = ?'; params.push(visitId); }
  else if (patientId) { sql += ' AND v.patient_id = ?'; params.push(patientId); }

  sql += ' ORDER BY v.taken_at DESC LIMIT 50';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  // Cross-visit: if visit filtered and <3 records, get previous visit vitals
  if (visitId && results.length < 3 && patientId) {
    const prevVisit = await c.env.DB.prepare(`
      SELECT id FROM visits WHERE patient_id = ? AND tenant_id = ? AND id != ? ORDER BY visit_date DESC LIMIT 1
    `).bind(patientId, tenantId, visitId).first<{ id: number }>();

    if (prevVisit) {
      const { results: older } = await c.env.DB.prepare(`
        SELECT v.*, s.name as taken_by_name, 1 as from_previous_visit
        FROM clinical_vitals v
        LEFT JOIN staff s ON v.taken_by = s.id AND s.tenant_id = v.tenant_id
        WHERE v.tenant_id = ? AND v.visit_id = ? AND v.is_active = 1
        ORDER BY v.taken_at DESC LIMIT 3
      `).bind(tenantId, prevVisit.id).all();

      return c.json({ vitals: [...results, ...older], has_previous_visit_data: true });
    }
  }

  return c.json({ vitals: results, has_previous_visit_data: false });
});

// ─── GET /latest/:patientId — latest vitals for a patient ────────────────────

vitals.get('/latest/:patientId', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = parseInt(c.req.param('patientId'));

  const latest = await c.env.DB.prepare(`
    SELECT v.*, s.name as taken_by_name
    FROM clinical_vitals v
    LEFT JOIN staff s ON v.taken_by = s.id AND s.tenant_id = v.tenant_id
    WHERE v.tenant_id = ? AND v.patient_id = ? AND v.is_active = 1
    ORDER BY v.taken_at DESC LIMIT 1
  `).bind(tenantId, patientId).first();

  if (!latest) return c.json({ vitals: null, message: 'No vitals recorded' });
  return c.json({ vitals: latest });
});

// ─── POST / — record vitals ─────────────────────────────────────────────────

vitals.post('/', zValidator('json', createVitalsSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // P2#9: Validate patient belongs to tenant
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  const bmi = calcBMI(data.weight, data.height);

  // P1#5: Use ?? (nullish coalescing) instead of || to preserve valid zero values
  const result = await c.env.DB.prepare(`
    INSERT INTO clinical_vitals (
      tenant_id, patient_id, visit_id,
      temperature, pulse, blood_pressure_systolic, blood_pressure_diastolic,
      respiratory_rate, spo2, weight, height, bmi,
      pain_scale, blood_sugar, notes, taken_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.patient_id, data.visit_id ?? null,
    data.temperature ?? null, data.pulse ?? null,
    data.blood_pressure_systolic ?? null, data.blood_pressure_diastolic ?? null,
    data.respiratory_rate ?? null, data.spo2 ?? null,
    data.weight ?? null, data.height ?? null, bmi,
    data.pain_scale ?? null, data.blood_sugar ?? null,
    data.notes ?? null, userId
  ).run();

  return c.json({ id: result.meta.last_row_id, bmi, message: 'Vitals recorded' }, 201);
});

// ─── DELETE /:id — soft-delete vitals record ─────────────────────────────────

vitals.delete('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));

  const existing = await c.env.DB.prepare(
    'SELECT id FROM clinical_vitals WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Vitals record not found' });

  // P3#14: Record who deleted and when for audit trail
  await c.env.DB.prepare(
    "UPDATE clinical_vitals SET is_active = 0, updated_at = datetime('now'), notes = COALESCE(notes, '') || ' [Removed by user ' || ? || ' at ' || datetime('now') || ']' WHERE id = ? AND tenant_id = ?"
  ).bind(userId, id, tenantId).run();

  return c.json({ success: true, message: 'Vitals record removed' });
});

export default vitals;
