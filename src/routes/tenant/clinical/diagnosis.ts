import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import { getDb } from '../../../db';
import { createDiagnosisSchema } from '../../../schemas/clinical-assessments';

type ClinicalEnv = { Bindings: Env; Variables: Variables };

export const diagnosisRoutes = new Hono<ClinicalEnv>();

// ─── ICD-10 search ──────────────────────────────────────────────────────────

diagnosisRoutes.get('/icd10/search', async (c) => {
  const db = getDb(c.env.DB);
  const q = c.req.query('q');
  if (!q || q.length < 2) {
    throw new HTTPException(400, { message: 'Search query must be at least 2 characters' });
  }

  const pattern = `%${q}%`;
  const { results } = await db.$client
    .prepare('SELECT ICD10ID, ICD10Code, DiseaseName FROM ICD10Diseases WHERE (ICD10Code LIKE ? OR DiseaseName LIKE ?) AND IsActive = 1 LIMIT 50')
    .bind(pattern, pattern)
    .all();

  return c.json({ Results: results });
});

// ─── List diagnoses for a patient/visit ─────────────────────────────────────

diagnosisRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patientId');
  const visitId = c.req.query('visitId');

  if (!patientId || isNaN(Number(patientId))) {
    throw new HTTPException(400, { message: 'patientId query param is required' });
  }

  let query = 'SELECT * FROM ClinicalDiagnosis WHERE tenant_id = ? AND PatientId = ? AND IsActive = 1';
  const params: (string | number)[] = [tenantId, Number(patientId)];

  if (visitId) {
    query += ' AND PatientVisitId = ?';
    params.push(Number(visitId));
  }

  query += ' ORDER BY CreatedOn DESC';

  const { results } = await db.$client.prepare(query).bind(...params).all();
  return c.json({ Results: results });
});

// ─── Add diagnosis ──────────────────────────────────────────────────────────

diagnosisRoutes.post('/', zValidator('json', createDiagnosisSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const result = await db.$client
    .prepare(`
      INSERT INTO ClinicalDiagnosis (
        tenant_id, PatientId, PatientVisitId, ICD10ID, ICD10Code,
        ICD10Description, DiagnosisType, Notes, CreatedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      tenantId, data.PatientId, data.PatientVisitId ?? null,
      data.ICD10ID ?? null, data.ICD10Code ?? null,
      data.ICD10Description, data.DiagnosisType, data.Notes ?? null, userId,
    )
    .run();

  return c.json({ Results: { id: result.meta.last_row_id } }, 201);
});

// ─── Remove diagnosis (soft delete) ─────────────────────────────────────────

diagnosisRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid DiagnosisId' });

  const existing = await db.$client
    .prepare('SELECT DiagnosisId FROM ClinicalDiagnosis WHERE DiagnosisId = ? AND tenant_id = ? AND IsActive = 1')
    .bind(id, tenantId)
    .first();
  if (!existing) throw new HTTPException(404, { message: 'Diagnosis not found' });

  await db.$client
    .prepare("UPDATE ClinicalDiagnosis SET IsActive = 0, ModifiedBy = ?, ModifiedOn = datetime('now') WHERE DiagnosisId = ? AND tenant_id = ?")
    .bind(userId, id, tenantId)
    .run();

  return c.json({ Results: true });
});
