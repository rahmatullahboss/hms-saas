import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const emergency = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createERPatientSchema = z.object({
  patient_id: z.number().int().positive().optional(),
  visit_id: z.number().int().positive().optional(),
  first_name: z.string().min(1),
  middle_name: z.string().optional(),
  last_name: z.string().min(1),
  gender: z.string().optional(),
  age: z.string().optional(),
  date_of_birth: z.string().optional(),
  contact_no: z.string().optional(),
  care_of_person_contact: z.string().optional(),
  address: z.string().optional(),
  referred_by: z.string().optional(),
  referred_to: z.string().optional(),
  case_type: z.string().optional(),
  condition_on_arrival: z.string().optional(),
  brought_by: z.string().optional(),
  relation_with_patient: z.string().optional(),
  mode_of_arrival_id: z.number().int().positive().optional(),
  care_of_person: z.string().optional(),
  performer_id: z.number().int().positive().optional(),
  performer_name: z.string().optional(),
  is_police_case: z.boolean().default(false),
  is_existing_patient: z.boolean().default(false),
  ward_no: z.number().int().positive().optional(),
  visit_datetime: z.string().optional(),
  patient_cases: z.object({
    main_case: z.number().optional(),
    sub_case: z.number().optional(),
    other_case_details: z.string().optional(),
    biting_site: z.number().optional(),
    datetime_of_bite: z.string().optional(),
    biting_animal: z.number().optional(),
    first_aid: z.number().optional(),
    first_aid_others: z.string().optional(),
    biting_animal_others: z.string().optional(),
    biting_site_others: z.string().optional(),
    biting_address: z.string().optional(),
    biting_animal_name: z.string().optional(),
  }).optional(),
});

const triageSchema = z.object({
  triage_code: z.enum(['red', 'yellow', 'green']),
});

const finalizeSchema = z.object({
  finalized_status: z.enum(['admitted', 'discharged', 'lama', 'dor', 'transferred', 'death']),
  finalized_remarks: z.string().optional(),
});

const dischargeSummarySchema = z.object({
  patient_id: z.number().int().positive(),
  visit_id: z.number().int().positive(),
  discharge_type: z.string().optional(),
  chief_complaints: z.string().optional(),
  treatment_in_er: z.string().optional(),
  investigations: z.string().optional(),
  advice_on_discharge: z.string().optional(),
  on_examination: z.string().optional(),
  provisional_diagnosis: z.string().optional(),
  doctor_name: z.string().optional(),
  medical_officer: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function nextERNumber(db: D1Database, tenantId: number): Promise<string> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(id), 0) as max_id FROM er_patients WHERE tenant_id = ?`
  ).bind(tenantId).first<{ max_id: number }>();
  const seq = (row?.max_id ?? 0) + 1;
  return `ER-${String(seq).padStart(5, '0')}`;
}

function getDateFilter(selectedCase: number): string {
  const date = new Date();
  date.setDate(date.getDate() + selectedCase);
  return date.toISOString().split('T')[0];
}

// ─── GET / — list ER patients ─────────────────────────────────────────────────

emergency.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const status = c.req.query('status') || 'all';
  const search = c.req.query('search');
  const days = parseInt(c.req.query('days') || '0');
  const dateFilter = getDateFilter(-Math.abs(days));

  let sql = `
    SELECT e.*, p.name as patient_name, p.patient_code,
           m.name as mode_of_arrival_name
    FROM er_patients e
    LEFT JOIN patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
    LEFT JOIN er_mode_of_arrival m ON m.id = e.mode_of_arrival_id AND m.tenant_id = e.tenant_id
    WHERE e.tenant_id = ? AND e.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];

  if (status !== 'all') {
    if (['admitted', 'discharged', 'lama', 'dor', 'transferred', 'death'].includes(status)) {
      sql += ` AND e.er_status = 'finalized' AND e.finalized_status = ?`;
      params.push(status);
    } else {
      sql += ` AND e.er_status = ?`;
      params.push(status);
    }
  }

  if (days > 0) {
    sql += ` AND DATE(e.visit_datetime) >= ?`;
    params.push(dateFilter);
  }

  if (search) {
    sql += ` AND (e.er_patient_number LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.contact_no LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY
    CASE e.triage_code WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 WHEN 'green' THEN 3 ELSE 4 END,
    e.created_at DESC
    LIMIT 100`;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ er_patients: results, total: results.length });
});

// ─── GET /stats — ER dashboard KPIs ──────────────────────────────────────────

emergency.get('/stats', async (c) => {
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];

  const [newCount, triagedCount, admittedCount, dischargedCount, lamaCount, totalToday] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM er_patients WHERE tenant_id = ? AND er_status = 'new' AND is_active = 1`)
      .bind(tenantId).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM er_patients WHERE tenant_id = ? AND er_status = 'triaged' AND is_active = 1`)
      .bind(tenantId).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM er_patients WHERE tenant_id = ? AND finalized_status = 'admitted' AND is_active = 1`)
      .bind(tenantId).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM er_patients WHERE tenant_id = ? AND finalized_status = 'discharged' AND is_active = 1 AND DATE(finalized_on) = ?`)
      .bind(tenantId, today).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM er_patients WHERE tenant_id = ? AND finalized_status = 'lama' AND is_active = 1`)
      .bind(tenantId).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM er_patients WHERE tenant_id = ? AND is_active = 1 AND DATE(visit_datetime) = ?`)
      .bind(tenantId, today).first<{ cnt: number }>(),
  ]);

  // Triage distribution
  const { results: triageDist } = await c.env.DB.prepare(
    `SELECT triage_code, COUNT(*) as cnt FROM er_patients
     WHERE tenant_id = ? AND er_status = 'triaged' AND is_active = 1
     GROUP BY triage_code`
  ).bind(tenantId).all();

  return c.json({
    new_patients: newCount?.cnt ?? 0,
    triaged_patients: triagedCount?.cnt ?? 0,
    admitted_today: admittedCount?.cnt ?? 0,
    discharged_today: dischargedCount?.cnt ?? 0,
    lama_count: lamaCount?.cnt ?? 0,
    total_today: totalToday?.cnt ?? 0,
    triage_distribution: triageDist,
  });
});

// ─── GET /modes-of-arrival — lookup data ─────────────────────────────────────

emergency.get('/modes-of-arrival', async (c) => {
  const tenantId = requireTenantId(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM er_mode_of_arrival WHERE tenant_id = ? AND is_active = 1 ORDER BY name'
  ).bind(tenantId).all();
  return c.json({ modes: results });
});

// ─── POST /modes-of-arrival — seed modes for tenant ──────────────────────────

emergency.post('/modes-of-arrival/seed', async (c) => {
  const tenantId = requireTenantId(c);
  const defaultModes = ['Ambulance', 'Walk-in', 'Police', 'Referred', 'Brought by Others', 'Self'];

  const existing = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM er_mode_of_arrival WHERE tenant_id = ?'
  ).bind(tenantId).first<{ cnt: number }>();

  if ((existing?.cnt ?? 0) > 0) {
    return c.json({ message: 'Modes already seeded' });
  }

  const stmts = defaultModes.map(name =>
    c.env.DB.prepare('INSERT INTO er_mode_of_arrival (tenant_id, name) VALUES (?, ?)').bind(tenantId, name)
  );
  await c.env.DB.batch(stmts);

  return c.json({ message: 'Seeded default modes of arrival', count: defaultModes.length }, 201);
});

// ─── GET /search-patients — search existing patients for ER registration ─────

emergency.get('/search-patients', async (c) => {
  const tenantId = requireTenantId(c);
  const search = c.req.query('q') || '';

  if (search.length < 2) {
    return c.json({ patients: [], total: 0 });
  }

  const term = `%${search}%`;
  const { results } = await c.env.DB.prepare(`
    SELECT id, name, patient_code, gender, mobile, address, date_of_birth
    FROM patients
    WHERE tenant_id = ? AND (name LIKE ? OR mobile LIKE ? OR patient_code LIKE ?)
    ORDER BY id DESC LIMIT 20
  `).bind(tenantId, term, term, term).all();

  return c.json({ patients: results, total: results.length });
});

// ─── GET /:id — single ER patient with cases + discharge summary ─────────────

emergency.get('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));

  const patient = await c.env.DB.prepare(`
    SELECT e.*, p.name as patient_name, p.patient_code,
           m.name as mode_of_arrival_name
    FROM er_patients e
    LEFT JOIN patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
    LEFT JOIN er_mode_of_arrival m ON m.id = e.mode_of_arrival_id AND m.tenant_id = e.tenant_id
    WHERE e.id = ? AND e.tenant_id = ?
  `).bind(id, tenantId).first();

  if (!patient) throw new HTTPException(404, { message: 'ER patient not found' });

  // Get patient cases
  const cases = await c.env.DB.prepare(
    'SELECT * FROM er_patient_cases WHERE er_patient_id = ? AND tenant_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1'
  ).bind(id, tenantId).first();

  // Get discharge summary if exists
  const patientAny = patient as any;
  const dischargeSummary = patientAny.discharge_summary_id
    ? await c.env.DB.prepare(
        'SELECT * FROM er_discharge_summaries WHERE id = ? AND tenant_id = ?'
      ).bind(patientAny.discharge_summary_id, tenantId).first()
    : null;

  return c.json({
    er_patient: {
      ...patient,
      patient_cases: cases || null,
      discharge_summary: dischargeSummary,
    },
  });
});

// ─── POST / — register new ER patient ────────────────────────────────────────

emergency.post('/', zValidator('json', createERPatientSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const now = new Date().toISOString();
  const erNumber = await nextERNumber(c.env.DB, tenantId);

  let patientId = data.patient_id || null;
  let visitId = data.visit_id || null;

  // If new patient (not existing), create patient record first
  if (!data.is_existing_patient && !patientId) {
    const lastPatient = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(id), 0) as max_id FROM patients WHERE tenant_id = ?'
    ).bind(tenantId).first<{ max_id: number }>();
    const nextId = (lastPatient?.max_id ?? 0) + 1;
    const patientCode = `P-${String(nextId).padStart(6, '0')}`;

    const pResult = await c.env.DB.prepare(`
      INSERT INTO patients (tenant_id, patient_code, name, father_husband, gender, mobile, address, date_of_birth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, patientCode,
      `${data.first_name} ${data.last_name}`.trim(),
      '', data.gender || null, data.contact_no || '',
      data.address || '', data.date_of_birth || null, now
    ).run();

    patientId = pResult.meta.last_row_id as number;
  }

  // Create visit record for emergency
  if (!visitId && patientId) {
    const vResult = await c.env.DB.prepare(`
      INSERT INTO visits (tenant_id, patient_id, visit_date, visit_type, status, created_at)
      VALUES (?, ?, ?, 'emergency', 'initiated', ?)
    `).bind(tenantId, patientId, now.split('T')[0], now).run();
    visitId = vResult.meta.last_row_id as number;
  }

  // Create ER patient record
  const erResult = await c.env.DB.prepare(`
    INSERT INTO er_patients (
      tenant_id, er_patient_number, patient_id, visit_id, visit_datetime,
      first_name, middle_name, last_name, gender, age, date_of_birth,
      contact_no, care_of_person_contact, address, referred_by, referred_to,
      case_type, condition_on_arrival, brought_by, relation_with_patient,
      mode_of_arrival_id, care_of_person, er_status, performer_id, performer_name,
      is_police_case, is_existing_patient, ward_no, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, erNumber, patientId, visitId,
    data.visit_datetime || now,
    data.first_name, data.middle_name || null, data.last_name,
    data.gender || null, data.age || null, data.date_of_birth || null,
    data.contact_no || null, data.care_of_person_contact || null,
    data.address || null, data.referred_by || null, data.referred_to || null,
    data.case_type || null, data.condition_on_arrival || null,
    data.brought_by || null, data.relation_with_patient || null,
    data.mode_of_arrival_id || null, data.care_of_person || null,
    data.performer_id || null, data.performer_name || null,
    data.is_police_case ? 1 : 0, data.is_existing_patient ? 1 : 0,
    data.ward_no || null, userId
  ).run();

  const erPatientId = erResult.meta.last_row_id as number;

  // Create patient cases if provided
  if (data.patient_cases) {
    const pc = data.patient_cases;
    await c.env.DB.prepare(`
      INSERT INTO er_patient_cases (
        tenant_id, er_patient_id, main_case, sub_case, other_case_details,
        biting_site, datetime_of_bite, biting_animal, first_aid,
        first_aid_others, biting_animal_others, biting_site_others,
        biting_address, biting_animal_name, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, erPatientId,
      pc.main_case || null, pc.sub_case || null, pc.other_case_details || null,
      pc.biting_site || null, pc.datetime_of_bite || null,
      pc.biting_animal || null, pc.first_aid || null,
      pc.first_aid_others || null, pc.biting_animal_others || null,
      pc.biting_site_others || null, pc.biting_address || null,
      pc.biting_animal_name || null, userId
    ).run();
  }

  return c.json({
    id: erPatientId,
    er_patient_number: erNumber,
    patient_id: patientId,
    visit_id: visitId,
  }, 201);
});

// ─── PUT /:id/triage — assign triage code ────────────────────────────────────

emergency.put('/:id/triage', zValidator('json', triageSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  const { triage_code } = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM er_patients WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();

  if (!existing) throw new HTTPException(404, { message: 'ER patient not found' });

  await c.env.DB.prepare(`
    UPDATE er_patients SET
      triage_code = ?, er_status = 'triaged',
      triaged_by = ?, triaged_on = ?,
      updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(triage_code, userId, now, now, id, tenantId).run();

  return c.json({ success: true, triage_code });
});

// ─── PUT /:id/undo-triage — revert to new ───────────────────────────────────

emergency.put('/:id/undo-triage', async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  const now = new Date().toISOString();

  const existing = await c.env.DB.prepare(
    `SELECT id FROM er_patients WHERE id = ? AND tenant_id = ? AND er_status = 'triaged'`
  ).bind(id, tenantId).first();

  if (!existing) throw new HTTPException(404, { message: 'Triaged ER patient not found' });

  await c.env.DB.prepare(`
    UPDATE er_patients SET
      er_status = 'new', triage_code = NULL,
      triaged_by = NULL, triaged_on = NULL,
      updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(now, id, tenantId).run();

  return c.json({ success: true, message: 'Triage undone' });
});

// ─── PUT /:id/finalize — admit/discharge/transfer/lama/death/dor ─────────────

emergency.put('/:id/finalize', zValidator('json', finalizeSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  const { finalized_status, finalized_remarks } = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = await c.env.DB.prepare(
    'SELECT id, er_status FROM er_patients WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();

  if (!existing) throw new HTTPException(404, { message: 'ER patient not found' });

  await c.env.DB.prepare(`
    UPDATE er_patients SET
      er_status = 'finalized',
      finalized_status = ?, finalized_remarks = ?,
      finalized_by = ?, finalized_on = ?,
      updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(finalized_status, finalized_remarks || null, userId, now, now, id, tenantId).run();

  return c.json({ success: true, finalized_status });
});

// ─── POST /discharge-summary — create ER discharge summary ──────────────────

emergency.post('/discharge-summary', zValidator('json', dischargeSummarySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(`
    INSERT INTO er_discharge_summaries (
      tenant_id, patient_id, visit_id, discharge_type, chief_complaints,
      treatment_in_er, investigations, advice_on_discharge, on_examination,
      provisional_diagnosis, doctor_name, medical_officer, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.patient_id, data.visit_id,
    data.discharge_type || null, data.chief_complaints || null,
    data.treatment_in_er || null, data.investigations || null,
    data.advice_on_discharge || null, data.on_examination || null,
    data.provisional_diagnosis || null, data.doctor_name || null,
    data.medical_officer || null, userId
  ).run();

  const summaryId = result.meta.last_row_id as number;

  // Update ER patient with discharge summary and finalize
  await c.env.DB.prepare(`
    UPDATE er_patients SET
      discharge_summary_id = ?,
      er_status = 'finalized', finalized_status = 'discharged',
      finalized_by = ?, finalized_on = ?, updated_at = ?
    WHERE patient_id = ? AND visit_id = ? AND tenant_id = ? AND er_status != 'finalized'
  `).bind(summaryId, userId, now, now, data.patient_id, data.visit_id, tenantId).run();

  return c.json({ id: summaryId, message: 'Discharge summary created' }, 201);
});

// ─── PUT /:id — general update ───────────────────────────────────────────────

emergency.put('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json() as Record<string, unknown>;
  const now = new Date().toISOString();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM er_patients WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'ER patient not found' });

  const allowedFields = [
    'first_name', 'middle_name', 'last_name', 'gender', 'age',
    'date_of_birth', 'contact_no', 'care_of_person_contact', 'address',
    'referred_by', 'referred_to', 'case_type', 'condition_on_arrival',
    'brought_by', 'relation_with_patient', 'mode_of_arrival_id',
    'care_of_person', 'performer_id', 'performer_name',
    'is_police_case', 'ward_no',
  ];

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      vals.push(body[field] as string | number | null);
    }
  }

  if (sets.length === 0) return c.json({ message: 'No fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(now, id, tenantId);

  await c.env.DB.prepare(
    `UPDATE er_patients SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ success: true });
});

export default emergency;
