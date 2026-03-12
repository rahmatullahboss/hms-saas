import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const discharge = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const upsertSummarySchema = z.object({
  admission_diagnosis:    z.string().optional(),
  final_diagnosis:        z.string().optional(),
  treatment_summary:      z.string().optional(),
  procedures_performed:   z.array(z.string()).optional(),
  medicines_on_discharge: z.array(z.object({
    name:      z.string(),
    dose:      z.string().optional(),
    frequency: z.string().optional(),
    duration:  z.string().optional(),
  })).optional(),
  follow_up_date:         z.string().optional(),
  follow_up_instructions: z.string().optional(),
  doctor_notes:           z.string().optional(),
  status:                 z.enum(['draft', 'final']).optional(),
});

// ─── GET /api/discharge/:admissionId — get or init summary ────────────────────

discharge.get('/:admissionId', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const admissionId = parseInt(c.req.param('admissionId'));

  // Get admission details for context
  const admission = await c.env.DB.prepare(`
    SELECT a.*, p.name as patient_name, p.patient_code, p.date_of_birth, p.gender,
           b.ward_name, b.bed_number,
           s.name as doctor_name,
           s.id as staff_id
    FROM admissions a
    LEFT JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    LEFT JOIN beds b ON b.id = a.bed_id AND b.tenant_id = a.tenant_id
    LEFT JOIN staff s ON s.id = a.doctor_id AND s.tenant_id = a.tenant_id
    WHERE a.id = ? AND a.tenant_id = ?
  `).bind(admissionId, tenantId).first<Record<string, unknown>>();

  if (!admission) {
    throw new HTTPException(404, { message: 'Admission not found' });
  }

  // Get discharge summary (may not exist yet)
  const summary = await c.env.DB.prepare(
    `SELECT * FROM discharge_summaries WHERE admission_id = ? AND tenant_id = ?`
  ).bind(admissionId, tenantId).first<Record<string, unknown>>();

  // Parse JSON fields if summary exists
  let parsedSummary = summary;
  if (summary) {
    try {
      parsedSummary = {
        ...summary,
        procedures_performed:   summary.procedures_performed
          ? JSON.parse(summary.procedures_performed as string)
          : [],
        medicines_on_discharge: summary.medicines_on_discharge
          ? JSON.parse(summary.medicines_on_discharge as string)
          : [],
      };
    } catch {
      // JSON parse failed — return raw
    }
  }

  return c.json({ admission, summary: parsedSummary ?? null });
});

// ─── PUT /api/discharge/:admissionId — create or update ──────────────────────

discharge.put('/:admissionId', zValidator('json', upsertSummarySchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = c.get('userId');
  const safeUserId = userId ? Number(userId) : null;
  const admissionId = parseInt(c.req.param('admissionId'));
  const data = c.req.valid('json');

  // Verify admission belongs to tenant
  const admission = await c.env.DB.prepare(
    `SELECT id, patient_id FROM admissions WHERE id = ? AND tenant_id = ?`
  ).bind(admissionId, tenantId).first<{ id: number; patient_id: number }>();

  if (!admission) {
    throw new HTTPException(404, { message: 'Admission not found' });
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM discharge_summaries WHERE admission_id = ? AND tenant_id = ?`
  ).bind(admissionId, tenantId).first<{ id: number }>();

  const proceduresJson = data.procedures_performed !== undefined
    ? JSON.stringify(data.procedures_performed)
    : undefined;

  const medicinesJson = data.medicines_on_discharge !== undefined
    ? JSON.stringify(data.medicines_on_discharge)
    : undefined;

  const finalizedAt = data.status === 'final' ? new Date().toISOString() : null;

  if (!existing) {
    // INSERT
    await c.env.DB.prepare(`
      INSERT INTO discharge_summaries
        (tenant_id, admission_id, patient_id,
         admission_diagnosis, final_diagnosis, treatment_summary,
         procedures_performed, medicines_on_discharge,
         follow_up_date, follow_up_instructions, doctor_notes,
         status, finalized_at, finalized_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, admissionId, admission.patient_id,
      data.admission_diagnosis ?? null,
      data.final_diagnosis ?? null,
      data.treatment_summary ?? null,
      proceduresJson ?? null,
      medicinesJson ?? null,
      data.follow_up_date ?? null,
      data.follow_up_instructions ?? null,
      data.doctor_notes ?? null,
      data.status ?? 'draft',
      finalizedAt,
      finalizedAt ? safeUserId : null,
    ).run();
  } else {
    // UPDATE — only set fields that were provided
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: (string | number | null)[] = [];

    if (data.admission_diagnosis !== undefined)    { sets.push('admission_diagnosis = ?');    vals.push(data.admission_diagnosis); }
    if (data.final_diagnosis !== undefined)        { sets.push('final_diagnosis = ?');        vals.push(data.final_diagnosis); }
    if (data.treatment_summary !== undefined)      { sets.push('treatment_summary = ?');      vals.push(data.treatment_summary); }
    if (proceduresJson !== undefined)              { sets.push('procedures_performed = ?');   vals.push(proceduresJson); }
    if (medicinesJson !== undefined)               { sets.push('medicines_on_discharge = ?'); vals.push(medicinesJson); }
    if (data.follow_up_date !== undefined)         { sets.push('follow_up_date = ?');         vals.push(data.follow_up_date); }
    if (data.follow_up_instructions !== undefined) { sets.push('follow_up_instructions = ?'); vals.push(data.follow_up_instructions); }
    if (data.doctor_notes !== undefined)           { sets.push('doctor_notes = ?');           vals.push(data.doctor_notes); }
    if (data.status !== undefined) {
      sets.push('status = ?');
      vals.push(data.status);
      if (data.status === 'final') {
        sets.push('finalized_at = ?', 'finalized_by = ?');
        vals.push(new Date().toISOString(), safeUserId as number);
      }
    }

    await c.env.DB.prepare(
      `UPDATE discharge_summaries SET ${sets.join(', ')} WHERE admission_id = ? AND tenant_id = ?`
    ).bind(...vals, admissionId, tenantId).run();
  }

  // Audit log
  await c.env.DB.prepare(`
    INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id, details)
    VALUES (?, ?, 'upsert', 'discharge_summary', ?, ?)
  `).bind(tenantId, safeUserId, admissionId, `status=${data.status ?? 'draft'}`).run();

  return c.json({ success: true });
});

export default discharge;
