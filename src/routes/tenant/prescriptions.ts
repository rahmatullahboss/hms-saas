import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getNextSequence } from '../../lib/sequence';
import { createPrescriptionSchema, updatePrescriptionSchema, updateDeliveryStatusSchema } from '../../schemas/clinical';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /api/prescriptions?status=&patient= — list prescriptions ────────────
app.get('/', async (c) => {
  const tenantId = requireTenantId(c);
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
  const tenantId = requireTenantId(c);
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
  const tenantId = requireTenantId(c);
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
app.post('/', zValidator('json', createPrescriptionSchema), async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['doctor', 'md', 'hospital_admin'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to create prescriptions' });
  }

  const userId = requireUserId(c);
  const body = c.req.valid('json');

  // ✅ Use sequence-based rx_no (no more COUNT(*) race condition)
  const rxNo = await getNextSequence(c.env.DB, tenantId, 'prescription', 'RX');

  const prescriptionStmt = c.env.DB.prepare(`
    INSERT INTO prescriptions (rx_no, patient_id, doctor_id, appointment_id, bp, temperature, weight, spo2,
      chief_complaint, diagnosis, examination_notes, advice, lab_tests, follow_up_date, status, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    rxNo, body.patientId, body.doctorId ?? null, body.appointmentId ?? null,
    body.bp ?? null, body.temperature ?? null, body.weight ?? null, body.spo2 ?? null,
    body.chiefComplaint ?? null, body.diagnosis ?? null, body.examinationNotes ?? null,
    body.advice ?? null, body.labTests ? JSON.stringify(body.labTests) : null,
    body.followUpDate ?? null, body.status ?? 'draft', userId ?? 0, tenantId
  );

  // ✅ Atomic batch: prescription + items all succeed or all fail
  const batchStmts: D1PreparedStatement[] = [prescriptionStmt];

  if (body.items?.length) {
    for (const item of body.items) {
      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO prescription_items (prescription_id, medicine_name, dosage, frequency, duration, instructions, sort_order)
          VALUES (last_insert_rowid(), ?, ?, ?, ?, ?, ?)
        `).bind(
          item.medicine_name, item.dosage ?? null,
          item.frequency ?? null, item.duration ?? null,
          item.instructions ?? null, item.sort_order ?? 0
        )
      );
    }
  }

  const batchResults = await c.env.DB.batch(batchStmts);
  const rxId = batchResults[0].meta.last_row_id;

  return c.json({ id: rxId, rxNo }, 201);
});

// ─── PUT /api/prescriptions/:id — update prescription ─────────────────────────
app.put('/:id', zValidator('json', updatePrescriptionSchema), async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  const allowedRoles = ['doctor', 'md', 'hospital_admin'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to update prescriptions' });
  }

  const id = c.req.param('id');
  const body = c.req.valid('json');

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

// ─── POST /api/prescriptions/:id/share — generate share token ─────────────────
app.post('/:id/share', async (c) => {
  const tenantId = requireTenantId(c);

  const role = c.get('role');
  const allowedRoles = ['doctor', 'pharmacist', 'receptionist', 'nurse', 'hospital_admin', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to share prescriptions' });
  }

  const id = c.req.param('id');

  // Verify prescription exists for this tenant
  const rx = await c.env.DB.prepare(
    'SELECT id FROM prescriptions WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

  // Generate a cryptographically random token
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await c.env.DB.prepare(
    `UPDATE prescriptions SET share_token = ?, share_expires_at = ? WHERE id = ? AND tenant_id = ?`
  ).bind(token, expiresAt, id, tenantId).run();

  return c.json({
    token,
    expiresAt,
    url: `/rx/${token}`,
  });
});

// ─── POST /api/prescriptions/:id/order-delivery — place delivery order ────────
const orderDeliverySchema = z.object({
  address: z.string().min(5).max(500),
  phone:   z.string().min(6).max(20),
});

app.post('/:id/order-delivery', zValidator('json', orderDeliverySchema), async (c) => {
  const tenantId = requireTenantId(c);

  const role = c.get('role');
  const allowedRoles = ['pharmacist', 'hospital_admin', 'receptionist', 'doctor', 'md'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to order delivery' });
  }

  const id = c.req.param('id');
  const body = c.req.valid('json');

  const rx = await c.env.DB.prepare(
    'SELECT id FROM prescriptions WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });

  await c.env.DB.prepare(
    `UPDATE prescriptions SET delivery_status = 'ordered', delivery_address = ?, delivery_phone = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(body.address, body.phone, id, tenantId).run();

  return c.json({ success: true, delivery_status: 'ordered' });
});

// ─── PUT /api/prescriptions/:id/delivery-status — update delivery status ──────
// Only admins and pharmacy staff may update delivery status (not patients)
app.put('/:id/delivery-status', zValidator('json', updateDeliveryStatusSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const role = c.get('role');

  const allowedRoles = ['hospital_admin', 'pharmacist', 'nurse', 'doctor'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to update delivery status' });
  }

  const { status } = c.req.valid('json');

  await c.env.DB.prepare(
    'UPDATE prescriptions SET delivery_status = ? WHERE id = ? AND tenant_id = ?'
  ).bind(status, id, tenantId).run();

  return c.json({ success: true });
});

export default app;
