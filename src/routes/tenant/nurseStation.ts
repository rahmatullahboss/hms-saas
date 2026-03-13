import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/nurse-station/dashboard — active inpatients with latest vitals
app.get('/dashboard', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const { results: admissions } = await c.env.DB.prepare(`
    SELECT a.id AS admission_id, a.admission_no, a.patient_id, a.status AS admission_status,
           a.provisional_diagnosis,
           p.name AS patient_name, p.patient_code,
           b.ward_name, b.bed_number,
           d.name AS doctor_name
    FROM admissions a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN beds b ON a.bed_id = b.id
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE a.tenant_id = ? AND a.status IN ('admitted', 'critical')
    ORDER BY CASE a.status WHEN 'critical' THEN 0 ELSE 1 END, a.admission_date DESC
  `).bind(tenantId).all();

  // Add latest vitals for each patient
  const patients = [];
  for (const adm of admissions as Record<string, unknown>[]) {
    const vital = await c.env.DB.prepare(`
      SELECT systolic, diastolic, temperature, heart_rate, spo2, recorded_at
      FROM patient_vitals
      WHERE tenant_id = ? AND patient_id = ?
      ORDER BY recorded_at DESC LIMIT 1
    `).bind(tenantId, adm.patient_id).first();

    patients.push({ ...adm, latestVitals: vital ?? null });
  }

  const pendingVitals = patients.filter(p => !p.latestVitals).length;

  return c.json({
    patients,
    stats: {
      activePatients: patients.length,
      pendingVitals,
      roundsCompleted: patients.length - pendingVitals,
      totalRounds: patients.length,
    },
  });
});

// GET /api/nurse-station/vitals?limit=10
app.get('/vitals', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const limit = Number(c.req.query('limit')) || 10;

  const { results } = await c.env.DB.prepare(`
    SELECT v.*, p.name AS patient_name
    FROM patient_vitals v
    LEFT JOIN patients p ON v.patient_id = p.id
    WHERE v.tenant_id = ?
    ORDER BY v.recorded_at DESC LIMIT ?
  `).bind(tenantId, limit).all();

  return c.json({ vitals: results });
});

// POST /api/nurse-station/vitals
app.post('/vitals', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const body = await c.req.json<{
    patient_id: number;
    systolic?: number;
    diastolic?: number;
    temperature?: number;
    heart_rate?: number;
    spo2?: number;
    respiratory_rate?: number;
    weight?: number;
    notes?: string;
  }>();

  if (!body.patient_id) throw new HTTPException(400, { message: 'patient_id required' });

  const userId = requireUserId(c);

  await c.env.DB.prepare(`
    INSERT INTO patient_vitals (tenant_id, patient_id, systolic, diastolic, temperature, heart_rate, spo2, respiratory_rate, weight, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, body.patient_id,
    body.systolic ?? null, body.diastolic ?? null,
    body.temperature ?? null, body.heart_rate ?? null,
    body.spo2 ?? null, body.respiratory_rate ?? null,
    body.weight ?? null, body.notes ?? null,
    userId ?? 'system'
  ).run();

  return c.json({ success: true }, 201);
});

export default app;
