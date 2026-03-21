import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../../types';
import { requireTenantId, parseId } from '../../../lib/context-helpers';
import { requireRole } from '../../../middleware/rbac';
import { createDicomStudySchema, pacsQuerySchema, uploadUrlSchema } from '../../../schemas/radiology';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const RAD_READ = ['hospital_admin', 'doctor', 'md', 'nurse', 'reception'];
const RAD_SCAN = ['hospital_admin', 'doctor', 'md', 'nurse'];

// ═══════════════════════════════════════════════════════════════════════════════
// LIST DICOM STUDIES  (F-04: added is_active filter)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/', requireRole(...RAD_READ), zValidator('query', pacsQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { page, limit, patient_id, modality, from_date, to_date } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let where = 'WHERE tenant_id = ? AND is_active = 1';
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
// GET STUDY DETAIL  (F-12: configurable OHIF URL)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/:id', requireRole(...RAD_READ), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Study ID');

  const study = await c.env.DB.prepare(
    'SELECT * FROM radiology_dicom_studies WHERE id = ? AND tenant_id = ? AND is_active = 1',
  ).bind(id, tenantId).first();

  if (!study) throw new HTTPException(404, { message: 'Study not found' });

  // F-12: Use configurable OHIF base URL from env, fallback to note
  const studyUid = (study as Record<string, unknown>).study_instance_uid as string;
  const ohifBase = (c.env as unknown as Record<string, unknown>).OHIF_BASE_URL as string | undefined;
  const viewerUrl = studyUid && ohifBase ? `${ohifBase}/viewer/${studyUid}` : null;

  return c.json({
    study: { ...study, viewer_url: viewerUrl },
    ...(viewerUrl ? {} : { note: 'Set OHIF_BASE_URL env var to enable viewer links' }),
  });
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
      // F-09 FIX: Check with tenant_id scoping
      const existing = await c.env.DB.prepare(
        'SELECT id FROM radiology_dicom_studies WHERE study_instance_uid = ? AND tenant_id = ? AND is_active = 1',
      ).bind(data.study_instance_uid, tenantId).first<{ id: number }>();
      return c.json({ id: existing?.id, message: 'Study already registered' }, 200);
    }
    throw err;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SOFT DELETE STUDY
// ═══════════════════════════════════════════════════════════════════════════════

app.delete('/:id', requireRole(...RAD_SCAN), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Study ID');

  const r = await c.env.DB.prepare(
    `UPDATE radiology_dicom_studies SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND is_active = 1`,
  ).bind(id, tenantId).run();

  if (!r.meta.changes) throw new HTTPException(404, { message: 'Study not found' });
  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET R2 UPLOAD URL  (F-05: validated with Zod)
// ═══════════════════════════════════════════════════════════════════════════════

// F-05 FIX: Actual R2 upload endpoint for DICOM files
app.put('/upload/:key{.+}', requireRole(...RAD_SCAN), async (c) => {
  const tenantId = requireTenantId(c);
  const key = c.req.param('key');

  // Security: ensure key belongs to this tenant
  const expectedPrefix = `dicom/${tenantId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new HTTPException(403, { message: 'Upload key does not match tenant' });
  }

  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) {
    throw new HTTPException(400, { message: 'Empty file body' });
  }

  // Max 50MB for DICOM files
  if (body.byteLength > 50 * 1024 * 1024) {
    throw new HTTPException(413, { message: 'File too large (max 50MB)' });
  }

  const contentType = c.req.header('content-type') ?? 'application/dicom';
  await c.env.UPLOADS.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { tenant_id: tenantId, uploaded_at: new Date().toISOString() },
  });

  return c.json({ success: true, key, size: body.byteLength });
});

export default app;
