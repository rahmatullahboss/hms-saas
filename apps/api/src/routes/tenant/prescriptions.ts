import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createPrescriptionSchema, updatePrescriptionSchema } from '../../schemas/prescription';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';

export const prescriptionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /api/prescriptions ───────────────────────────────────────────────────
prescriptionRoutes.get('/', async (c) => {
  const tenantId   = c.get('tenantId');
  const { patient, doctor, status, date } = c.req.query();

  const conditions: string[] = ['p.tenant_id = ?'];
  const params: (string | number)[] = [tenantId!];

  if (patient) { conditions.push('p.patient_id = ?'); params.push(Number(patient)); }
  if (doctor)  { conditions.push('p.doctor_id = ?');  params.push(Number(doctor)); }
  if (status) {
    if (!['draft', 'final'].includes(status)) throw new HTTPException(400, { message: 'Invalid status' });
    conditions.push('p.status = ?'); params.push(status);
  }
  if (date)    { conditions.push("date(p.created_at) = ?"); params.push(date); }

  const sql = `
    SELECT p.*,
           pt.name         AS patient_name,
           pt.patient_code,
           d.name          AS doctor_name,
           (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = p.id) AS item_count
    FROM   prescriptions p
    JOIN   patients pt ON p.patient_id = pt.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE  ${conditions.join(' AND ')}
    ORDER  BY p.created_at DESC
    LIMIT  100
  `;

  try {
    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ prescriptions: results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch prescriptions' });
  }
});

// ─── GET /api/prescriptions/:id/print ─────────────────── BEFORE /:id ────────
// Returns full data needed for A4 print view including BMDC, qualifications, hospital name
prescriptionRoutes.get('/:id/print', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  const rx = await c.env.DB.prepare(`
    SELECT p.*,
           pt.name          AS patient_name,
           pt.patient_code,
           pt.date_of_birth,
           pt.gender,
           pt.address,
           d.name           AS doctor_name,
           d.specialty,
           d.bmdc_reg_no,
           d.qualifications,
           d.visiting_hours,
           t.name           AS hospital_name
    FROM   prescriptions p
    JOIN   patients pt ON p.patient_id = pt.id AND pt.tenant_id = p.tenant_id
    LEFT JOIN doctors d ON p.doctor_id = d.id AND d.tenant_id = p.tenant_id
    LEFT JOIN tenants t ON t.id = p.tenant_id
    WHERE  p.id = ? AND p.tenant_id = ?
  `).bind(id, tenantId).first<Record<string, unknown>>();

  if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

  const { results: items } = await c.env.DB.prepare(`
    SELECT pi.* FROM prescription_items pi
    JOIN   prescriptions p ON pi.prescription_id = p.id
    WHERE  pi.prescription_id = ? AND p.tenant_id = ?
    ORDER  BY pi.sort_order ASC
  `).bind(id, tenantId).all();

  return c.json({ prescription: { ...rx, items, suggested_tests: rx.lab_tests } });
});

// ─── GET /api/prescriptions/:id ───────────────────────────────────────────────

prescriptionRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id       = c.req.param('id');

  try {
    const rx = await c.env.DB.prepare(
      `SELECT p.*,
              pt.name         AS patient_name,
              pt.patient_code,
              pt.mobile       AS patient_mobile,
              pt.date_of_birth,
              pt.gender,
              d.name          AS doctor_name,
              d.specialty     AS doctor_specialty
       FROM   prescriptions p
       JOIN   patients pt ON p.patient_id = pt.id
       LEFT JOIN doctors d ON p.doctor_id = d.id
       WHERE  p.id = ? AND p.tenant_id = ?`,
    ).bind(id, tenantId).first();

    if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

    const { results: items } = await c.env.DB.prepare(
      `SELECT pi.* FROM prescription_items pi
       JOIN prescriptions p ON pi.prescription_id = p.id
       WHERE pi.prescription_id = ? AND p.tenant_id = ?
       ORDER BY pi.sort_order ASC`
    ).bind(id, tenantId).all();

    return c.json({ ...rx, items });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(500, { message: 'Failed to fetch prescription' });
  }
});

// ─── POST /api/prescriptions ──────────────────────────────────────────────────
prescriptionRoutes.post('/', zValidator('json', createPrescriptionSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');
  const data     = c.req.valid('json');

  try {
    const rxNo = await getNextSequence(c.env.DB, tenantId!, 'prescription', 'RX');

    const result = await c.env.DB.prepare(`
      INSERT INTO prescriptions
        (rx_no, patient_id, doctor_id, appointment_id,
         bp, temperature, weight, spo2,
         chief_complaint, diagnosis, examination_notes, advice, lab_tests, follow_up_date,
         status, created_by, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      rxNo,
      data.patientId,
      data.doctorId       ?? null,
      data.appointmentId  ?? null,
      data.bp             ?? null,
      data.temperature    ?? null,
      data.weight         ?? null,
      data.spo2           ?? null,
      data.chiefComplaint ?? null,
      data.diagnosis      ?? null,
      data.examinationNotes ?? null,
      data.advice         ?? null,
      JSON.stringify(data.labTests ?? []),
      data.followUpDate   ?? null,
      data.status,
      userId,
      tenantId,
    ).run();

    const rxId = result.meta.last_row_id;

    // Insert medicines in a batch
    if (data.items.length > 0) {
      const itemStmt = c.env.DB.prepare(`
        INSERT INTO prescription_items
          (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
        VALUES (?,?,?,?,?,?,?)
      `);
      await c.env.DB.batch(
        data.items.map((it, idx) =>
          itemStmt.bind(rxId, it.medicine_name, it.dosage ?? null, it.frequency ?? null, it.duration ?? null, it.instructions ?? null, it.sort_order ?? idx)
        )
      );
    }

    void createAuditLog(c.env, tenantId!, userId!, 'create', 'prescriptions', rxId, null, { rxNo, patientId: data.patientId });
    return c.json({ message: 'Prescription saved', id: rxId, rxNo }, 201);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(500, { message: 'Failed to save prescription' });
  }
});

// ─── PUT /api/prescriptions/:id ───────────────────────────────────────────────
prescriptionRoutes.put('/:id', zValidator('json', updatePrescriptionSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');
  const id       = c.req.param('id');
  const data     = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM prescriptions WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Prescription not found' });

    // 🔴 Guard: do not allow editing a finalised prescription (except dispense_status)
    if (existing.status === 'final' && data.status !== 'draft' && !data.dispense_status) {
      // Only allow dispense_status updates on final prescriptions
      // Use !== undefined to avoid truthiness bugs (0, "" are valid values)
      const hasContentChanges = data.bp !== undefined || data.temperature !== undefined || data.weight !== undefined || data.spo2 !== undefined ||
        data.chiefComplaint !== undefined || data.diagnosis !== undefined || data.examinationNotes !== undefined || data.advice !== undefined ||
        data.labTests !== undefined || data.followUpDate !== undefined || data.items !== undefined;
      if (hasContentChanges) {
        throw new HTTPException(409, { message: 'Cannot edit a finalised prescription. Revert to draft first.' });
      }
    }

    // Build dynamic SET clause
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: (string | number | null)[] = [];

    if (data.bp             !== undefined) { sets.push('bp = ?');               vals.push(data.bp ?? null); }
    if (data.temperature    !== undefined) { sets.push('temperature = ?');       vals.push(data.temperature ?? null); }
    if (data.weight         !== undefined) { sets.push('weight = ?');            vals.push(data.weight ?? null); }
    if (data.spo2           !== undefined) { sets.push('spo2 = ?');              vals.push(data.spo2 ?? null); }
    if (data.chiefComplaint !== undefined) { sets.push('chief_complaint = ?');   vals.push(data.chiefComplaint ?? null); }
    if (data.diagnosis      !== undefined) { sets.push('diagnosis = ?');         vals.push(data.diagnosis ?? null); }
    if (data.examinationNotes !== undefined) { sets.push('examination_notes = ?'); vals.push(data.examinationNotes ?? null); }
    if (data.advice         !== undefined) { sets.push('advice = ?');            vals.push(data.advice ?? null); }
    if (data.labTests       !== undefined) { sets.push('lab_tests = ?');         vals.push(JSON.stringify(data.labTests)); }
    if (data.followUpDate   !== undefined) { sets.push('follow_up_date = ?');    vals.push(data.followUpDate ?? null); }
    if (data.status         !== undefined) { sets.push('status = ?');            vals.push(data.status); }
    if (data.dispense_status !== undefined) { sets.push('dispense_status = ?');  vals.push(data.dispense_status); }

    vals.push(id, tenantId!);

    await c.env.DB.prepare(
      `UPDATE prescriptions SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
    ).bind(...vals).run();

    // Replace items if provided
    if (data.items !== undefined) {
      await c.env.DB.prepare(
        `DELETE FROM prescription_items WHERE prescription_id = ?
         AND prescription_id IN (SELECT id FROM prescriptions WHERE tenant_id = ?)`
      ).bind(id, tenantId).run();
      if (data.items.length > 0) {
        const itemStmt = c.env.DB.prepare(`
          INSERT INTO prescription_items
            (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
          VALUES (?,?,?,?,?,?,?)
        `);
        await c.env.DB.batch(
          data.items.map((it, idx) =>
            itemStmt.bind(Number(id), it.medicine_name, it.dosage ?? null, it.frequency ?? null, it.duration ?? null, it.instructions ?? null, it.sort_order ?? idx)
          )
        );
      }
    }

    void createAuditLog(c.env, tenantId!, userId!, 'update', 'prescriptions', Number(id), existing, data);
    return c.json({ message: 'Prescription updated' });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(500, { message: 'Failed to update prescription' });
  }
});

// ─── DELETE /api/prescriptions/:id  (soft: mark cancelled via status) ─────────
prescriptionRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id       = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM prescriptions WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Prescription not found' });

    await c.env.DB.prepare(
      `UPDATE prescriptions SET status = 'draft', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).bind(id, tenantId).run();
    return c.json({ message: 'Prescription reverted to draft' });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(500, { message: 'Failed to update prescription' });
  }
});
