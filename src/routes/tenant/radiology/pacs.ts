import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../../types';
import { requireTenantId } from '../../../lib/context-helpers';
import { requireRole } from '../../../middleware/rbac';
import { createDicomStudySchema, pacsQuerySchema } from '../../../schemas/radiology';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const RAD_READ = ['hospital_admin', 'doctor', 'md', 'nurse', 'reception'];
const RAD_SCAN = ['hospital_admin', 'doctor', 'md', 'nurse'];

function parseId(v: string, label = 'ID'): number {
  const n = parseInt(v, 10);
  if (isNaN(n) || n <= 0) throw new HTTPException(400, { message: `Invalid ${label}` });
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST DICOM STUDIES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', requireRole(...RAD_READ), zValidator('query', pacsQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { page, limit, patient_id, modality, from_date, to_date } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let where = 'WHERE tenant_id = ?';
  const binds: unknown[] = [tenantId];

  if (patient_id) { where += ' AND patient_id = ?';   binds.push(patient_id); }
  if (modality)   { where += ' AND modality = ?';     binds.push(modality); }
  if (from_date)  { where += ' AND study_date >= ?';   binds.push(from_date); }
  if (to_date)    { where += ' AND study_date <= ?';   binds.push(to_date); }

  const countSql  = `SELECT COUNT(*) as total FROM radiology_dicom_studies ${where}`;
  const selectSql = `
    SELECT id, patient_id, patient_name, study_instance_uid, modality,
           study_date, study_description, series_count, image_count, is_mapped, created_at
    FROM radiology_dicom_studies
    ${where}
    ORDER BY id DESC LIMIT ? OFFSET ?`;

  const [countResult, data] = await Promise.all([
    c.env.DB.prepare(countSql).bind(...binds).first<{ total: number }>(),
    c.env.DB.prepare(selectSql).bind(...binds, limit, offset).all(),
  ]);

  const total = countResult?.total ?? 0;
  return c.json({
    studies: data.results,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET STUDY DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/:id', requireRole(...RAD_READ), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Study ID');

  const study = await c.env.DB.prepare(
    'SELECT * FROM radiology_dicom_studies WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first();

  if (!study) throw new HTTPException(404, { message: 'Study not found' });

  // Return OHIF viewer URL for the study
  const studyUid = (study as Record<string, unknown>).study_instance_uid as string;
  const viewerUrl = studyUid ? `https://viewer.ohif.org/viewer/${studyUid}` : null;

  return c.json({ study: { ...study, viewer_url: viewerUrl } });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE / REGISTER STUDY (on first image received from modality)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/', requireRole(...RAD_SCAN), zValidator('json', createDicomStudySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    const r = await c.env.DB.prepare(`
      INSERT INTO radiology_dicom_studies
      (tenant_id, patient_id, patient_name, study_instance_uid, sop_class_uid,
       study_date, modality, study_description, requisition_id, is_mapped)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId,
      data.patient_id       ?? null,
      data.patient_name     ?? null,
      data.study_instance_uid,
      data.sop_class_uid    ?? null,
      data.study_date       ?? null,
      data.modality         ?? null,
      data.study_description ?? null,
      data.requisition_id   ?? null,
      0,
    ).run();

    return c.json({ id: r.meta.last_row_id, message: 'Study registered' }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM radiology_dicom_studies WHERE study_instance_uid = ? AND tenant_id = ?',
      ).bind(data.study_instance_uid, tenantId).first<{ id: number }>();
      return c.json({ id: existing?.id, message: 'Study already registered' }, 200);
    }
    throw err;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET R2 UPLOAD URL (presigned — for future DICOM upload flow)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/upload-url', requireRole(...RAD_SCAN), async (c) => {
  const body = await c.req.json<{ file_name?: string; content_type?: string }>();
  const fileName = body.file_name ?? `dicom-${crypto.randomUUID()}.dcm`;
  const key = `dicom/${requireTenantId(c)}/${crypto.randomUUID()}/${fileName}`;

  // If R2 binding is available, generate presigned URL via R2
  // For now return the key (clients use R2 API directly or via Workers R2 binding)
  return c.json({
    key,
    message: 'Use this key to upload to R2 via PUT /api/radiology/upload/:key',
    content_type: body.content_type ?? 'application/dicom',
  });
});

export default app;
