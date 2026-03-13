import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /api/discharge/:admissionId — admission + existing summary ──────────
app.get('/:admissionId', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const admId = c.req.param('admissionId');

  // Get admission with patient, bed, doctor info
  const admission = await c.env.DB.prepare(`
    SELECT a.*, p.name AS patient_name, p.patient_code,
           b.ward_name, b.bed_number,
           d.name AS doctor_name
    FROM admissions a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN beds b ON a.bed_id = b.id
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).bind(admId, tenantId).first();

  if (!admission) throw new HTTPException(404, { message: 'Admission not found' });

  // Get existing summary if any
  const summary = await c.env.DB.prepare(
    `SELECT * FROM discharge_summaries WHERE admission_id = ? AND tenant_id = ?`
  ).bind(admId, tenantId).first();

  // Parse JSON fields safely
  let parsed = null;
  if (summary) {
    const raw = summary as Record<string, unknown>;
    let procedures: string[] = [];
    let medicines: unknown[] = [];
    try { procedures = JSON.parse(raw.procedures_performed as string || '[]'); } catch { /* empty */ }
    try { medicines = JSON.parse(raw.medicines_on_discharge as string || '[]'); } catch { /* empty */ }
    parsed = { ...raw, procedures_performed: procedures, medicines_on_discharge: medicines };
  }

  return c.json({ admission, summary: parsed });
});

// ─── PUT /api/discharge/:admissionId — upsert discharge summary ──────────────
app.put('/:admissionId', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const admId = c.req.param('admissionId');
  const userId = requireUserId(c);
  const body = await c.req.json<{
    admission_diagnosis?: string;
    final_diagnosis?: string;
    treatment_summary?: string;
    procedures_performed?: string[];
    medicines_on_discharge?: { name: string; dose?: string; frequency?: string; duration?: string }[];
    follow_up_date?: string;
    follow_up_instructions?: string;
    doctor_notes?: string;
    status?: 'draft' | 'final';
  }>();

  // Get patient_id from admission
  const adm = await c.env.DB.prepare(
    'SELECT patient_id FROM admissions WHERE id = ? AND tenant_id = ?'
  ).bind(admId, tenantId).first<{ patient_id: number }>();
  if (!adm) throw new HTTPException(404, { message: 'Admission not found' });

  const isFinal = body.status === 'final';
  const procedures = JSON.stringify(body.procedures_performed ?? []);
  const medicines = JSON.stringify(body.medicines_on_discharge ?? []);

  // Upsert
  const existing = await c.env.DB.prepare(
    'SELECT id FROM discharge_summaries WHERE admission_id = ? AND tenant_id = ?'
  ).bind(admId, tenantId).first();

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE discharge_summaries SET
        admission_diagnosis = ?, final_diagnosis = ?, treatment_summary = ?,
        procedures_performed = ?, medicines_on_discharge = ?,
        follow_up_date = ?, follow_up_instructions = ?, doctor_notes = ?,
        status = ?, updated_at = datetime('now'),
        finalized_at = CASE WHEN ? THEN datetime('now') ELSE finalized_at END,
        finalized_by = CASE WHEN ? THEN ? ELSE finalized_by END
      WHERE admission_id = ? AND tenant_id = ?
    `).bind(
      body.admission_diagnosis ?? null, body.final_diagnosis ?? null,
      body.treatment_summary ?? null, procedures, medicines,
      body.follow_up_date ?? null, body.follow_up_instructions ?? null,
      body.doctor_notes ?? null, body.status ?? 'draft',
      isFinal ? 1 : 0, isFinal ? 1 : 0, userId ?? null,
      admId, tenantId
    ).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO discharge_summaries
        (tenant_id, admission_id, patient_id, admission_diagnosis, final_diagnosis,
         treatment_summary, procedures_performed, medicines_on_discharge,
         follow_up_date, follow_up_instructions, doctor_notes, status,
         finalized_at, finalized_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, admId, adm.patient_id,
      body.admission_diagnosis ?? null, body.final_diagnosis ?? null,
      body.treatment_summary ?? null, procedures, medicines,
      body.follow_up_date ?? null, body.follow_up_instructions ?? null,
      body.doctor_notes ?? null, body.status ?? 'draft',
      isFinal ? new Date().toISOString() : null, isFinal ? (userId ?? null) : null
    ).run();
  }

  return c.json({ success: true });
});

export default app;
