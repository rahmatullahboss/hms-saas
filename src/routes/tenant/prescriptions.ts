import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /api/prescriptions?status=&patient= — list prescriptions ────────────
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const status = c.req.query('status');
  const patientId = c.req.query('patient');

  let sql = `
    SELECT p.*, pt.name AS patient_name, pt.patient_code,
           d.name AS doctor_name,
           (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = p.id) AS item_count
    FROM prescriptions p
    LEFT JOIN patients pt ON p.patient_id = pt.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];

  if (status)    { sql += ' AND p.status = ?';      params.push(status); }
  if (patientId) { sql += ' AND p.patient_id = ?';  params.push(Number(patientId)); }
  sql += ' ORDER BY p.created_at DESC LIMIT 100';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ prescriptions: results });
});

// ─── GET /api/prescriptions/:id — single prescription with items ─────────────
app.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const id = c.req.param('id');
  const rx = await c.env.DB.prepare(
    `SELECT p.*, pt.name AS patient_name, pt.patient_code,
            d.name AS doctor_name
     FROM prescriptions p
     LEFT JOIN patients pt ON p.patient_id = pt.id
     LEFT JOIN doctors d ON p.doctor_id = d.id
     WHERE p.id = ? AND p.tenant_id = ?`
  ).bind(id, tenantId).first();

  if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

  const { results: items } = await c.env.DB.prepare(
    `SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY sort_order`
  ).bind(id).all();

  return c.json({ ...rx, items });
});

// ─── GET /api/prescriptions/:id/print — rich print data ──────────────────────
app.get('/:id/print', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const id = c.req.param('id');
  const rx = await c.env.DB.prepare(`
    SELECT p.*,
           pt.name AS patient_name, pt.patient_code, pt.date_of_birth, pt.gender, pt.address,
           d.name AS doctor_name, d.specialty, d.bmdc_reg_no, d.qualifications, d.visiting_hours
    FROM prescriptions p
    LEFT JOIN patients pt ON p.patient_id = pt.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.id = ? AND p.tenant_id = ?
  `).bind(id, tenantId).first();

  if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

  const { results: items } = await c.env.DB.prepare(
    `SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY sort_order`
  ).bind(id).all();

  // Get hospital name from settings
  const setting = await c.env.DB.prepare(
    `SELECT value FROM settings WHERE tenant_id = ? AND key = 'hospital_name'`
  ).bind(tenantId).first<{ value: string }>();

  return c.json({
    prescription: {
      ...rx,
      suggested_tests: (rx as Record<string, unknown>).lab_tests, // alias for frontend
      hospital_name: setting?.value ?? 'Hospital',
      items,
    },
  });
});

// ─── POST /api/prescriptions — create prescription ────────────────────────────
app.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const userId = c.get('userId');
  const body = await c.req.json<{
    patientId: number;
    doctorId?: number;
    appointmentId?: number;
    bp?: string; temperature?: string; weight?: string; spo2?: string;
    chiefComplaint?: string; diagnosis?: string; examinationNotes?: string;
    advice?: string; labTests?: string[]; followUpDate?: string;
    status?: string;
    items?: { medicine_name: string; dosage?: string; frequency?: string; duration?: string; instructions?: string; sort_order?: number }[];
  }>();

  if (!body.patientId) throw new HTTPException(400, { message: 'patientId required' });

  // Generate rx_no
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM prescriptions WHERE tenant_id = ?'
  ).bind(tenantId).first<{ cnt: number }>();
  const rxNo = `RX-${String((countRow?.cnt ?? 0) + 1).padStart(5, '0')}`;

  const result = await c.env.DB.prepare(`
    INSERT INTO prescriptions (rx_no, patient_id, doctor_id, appointment_id, bp, temperature, weight, spo2,
      chief_complaint, diagnosis, examination_notes, advice, lab_tests, follow_up_date, status, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    rxNo, body.patientId, body.doctorId ?? null, body.appointmentId ?? null,
    body.bp ?? null, body.temperature ?? null, body.weight ?? null, body.spo2 ?? null,
    body.chiefComplaint ?? null, body.diagnosis ?? null, body.examinationNotes ?? null,
    body.advice ?? null, body.labTests ? JSON.stringify(body.labTests) : null,
    body.followUpDate ?? null, body.status ?? 'draft', userId ?? 0, tenantId
  ).run();

  const rxId = result.meta.last_row_id;

  // Insert items
  if (body.items?.length) {
    for (const item of body.items) {
      await c.env.DB.prepare(`
        INSERT INTO prescription_items (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        rxId, item.medicine_name, item.dosage ?? null,
        item.frequency ?? null, item.duration ?? null,
        item.instructions ?? null, item.sort_order ?? 0
      ).run();
    }
  }

  return c.json({ id: rxId, rxNo }, 201);
});

// ─── PUT /api/prescriptions/:id — update prescription ─────────────────────────
app.put('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const id = c.req.param('id');
  const body = await c.req.json<{
    bp?: string; temperature?: string; weight?: string; spo2?: string;
    chiefComplaint?: string; diagnosis?: string; examinationNotes?: string;
    advice?: string; labTests?: string[]; followUpDate?: string;
    status?: string; dispense_status?: string;
    items?: { medicine_name: string; dosage?: string; frequency?: string; duration?: string; instructions?: string; sort_order?: number }[];
  }>();

  // Build SET clause dynamically
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: (string | number | null)[] = [];

  if (body.bp !== undefined)               { sets.push('bp = ?'); vals.push(body.bp); }
  if (body.temperature !== undefined)      { sets.push('temperature = ?'); vals.push(body.temperature); }
  if (body.weight !== undefined)           { sets.push('weight = ?'); vals.push(body.weight); }
  if (body.spo2 !== undefined)             { sets.push('spo2 = ?'); vals.push(body.spo2); }
  if (body.chiefComplaint !== undefined)   { sets.push('chief_complaint = ?'); vals.push(body.chiefComplaint); }
  if (body.diagnosis !== undefined)        { sets.push('diagnosis = ?'); vals.push(body.diagnosis); }
  if (body.examinationNotes !== undefined) { sets.push('examination_notes = ?'); vals.push(body.examinationNotes); }
  if (body.advice !== undefined)           { sets.push('advice = ?'); vals.push(body.advice); }
  if (body.labTests !== undefined)         { sets.push('lab_tests = ?'); vals.push(JSON.stringify(body.labTests)); }
  if (body.followUpDate !== undefined)     { sets.push('follow_up_date = ?'); vals.push(body.followUpDate); }
  if (body.status !== undefined)           { sets.push('status = ?'); vals.push(body.status); }

  vals.push(Number(id), tenantId as unknown as string);
  await c.env.DB.prepare(
    `UPDATE prescriptions SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  // Replace items if provided
  if (body.items) {
    await c.env.DB.prepare('DELETE FROM prescription_items WHERE prescription_id = ?').bind(id).run();
    for (const item of body.items) {
      await c.env.DB.prepare(`
        INSERT INTO prescription_items (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, item.medicine_name, item.dosage ?? null,
        item.frequency ?? null, item.duration ?? null,
        item.instructions ?? null, item.sort_order ?? 0
      ).run();
    }
  }

  return c.json({ success: true });
});

export default app;
