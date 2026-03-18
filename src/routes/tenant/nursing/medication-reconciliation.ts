import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { eq, and, desc } from 'drizzle-orm';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import {
  createReconciliationSchema,
  reconciliationItemSchema,
  reconciliationQuerySchema,
} from '../../../schemas/nursing';
import { getDb } from '../../../db';
import {
  clnMedicationReconciliation,
  clnMedicationReconciliationItems,
} from '../../../db/schema/clinicalMar';

type NursingEnv = { Bindings: Env; Variables: Variables };

export const medicationReconciliationRoutes = new Hono<NursingEnv>();

// ─── GET / — list reconciliations ───────────────────────────────────────────
medicationReconciliationRoutes.get('/', zValidator('query', reconciliationQuerySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { page, limit, patient_id, visit_id } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM cln_medication_reconciliation WHERE tenant_id = ? AND is_active = 1';
  const params: (string | number)[] = [tenantId];

  if (patient_id) { query += ' AND patient_id = ?'; params.push(patient_id); }
  if (visit_id) { query += ' AND visit_id = ?'; params.push(visit_id); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await db.$client.prepare(query).bind(...params).all();

  let countQuery = 'SELECT COUNT(*) as total FROM cln_medication_reconciliation WHERE tenant_id = ? AND is_active = 1';
  const countParams: (string | number)[] = [tenantId];
  if (patient_id) { countQuery += ' AND patient_id = ?'; countParams.push(patient_id); }
  if (visit_id) { countQuery += ' AND visit_id = ?'; countParams.push(visit_id); }
  const countResult = await db.$client.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return c.json({ Results: results, pagination: { page, limit, total: countResult?.total || 0 } });
});

// ─── GET /patient/:patientId — reconciliation history for a patient ─────────
medicationReconciliationRoutes.get('/patient/:patientId', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = parseInt(c.req.param('patientId'));
  if (isNaN(patientId)) throw new HTTPException(400, { message: 'Invalid patient ID' });

  const reconciliations = await db.select()
    .from(clnMedicationReconciliation)
    .where(
      and(
        eq(clnMedicationReconciliation.tenantId, tenantId),
        eq(clnMedicationReconciliation.patientId, patientId),
        eq(clnMedicationReconciliation.isActive, 1)
      )
    )
    .orderBy(desc(clnMedicationReconciliation.createdAt));

  return c.json({ Results: reconciliations });
});

// ─── GET /:id — single reconciliation with items ────────────────────────────
medicationReconciliationRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const recon = await db.select()
    .from(clnMedicationReconciliation)
    .where(
      and(
        eq(clnMedicationReconciliation.id, id),
        eq(clnMedicationReconciliation.tenantId, tenantId),
        eq(clnMedicationReconciliation.isActive, 1)
      )
    )
    .limit(1);

  if (recon.length === 0) throw new HTTPException(404, { message: 'Reconciliation not found' });

  const items = await db.select()
    .from(clnMedicationReconciliationItems)
    .where(
      and(
        eq(clnMedicationReconciliationItems.reconciliationId, id),
        eq(clnMedicationReconciliationItems.tenantId, tenantId),
        eq(clnMedicationReconciliationItems.isActive, 1)
      )
    );

  return c.json({ Results: { ...recon[0], items } });
});

// ─── POST / — create a new reconciliation ───────────────────────────────────
medicationReconciliationRoutes.post('/', zValidator('json', createReconciliationSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const result = await db.$client.prepare(`
    INSERT INTO cln_medication_reconciliation
      (tenant_id, patient_id, visit_id, reconciliation_type, status, performed_by, notes, created_by)
    VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)
  `).bind(
    tenantId, data.patient_id, data.visit_id,
    data.reconciliation_type, userId,
    data.notes ?? null, userId
  ).run();

  const reconId = result.meta.last_row_id;

  // If admission reconciliation: auto-populate with patient's active medication orders
  if (data.reconciliation_type === 'admission' && reconId) {
    const activeMeds = await db.$client.prepare(`
      SELECT medication_name, generic_name, dose, route, frequency
      FROM cln_medication_orders
      WHERE tenant_id = ? AND patient_id = ? AND status = 'active' AND is_active = 1
    `).bind(tenantId, data.patient_id).all();

    if (activeMeds.results.length > 0) {
      for (const med of activeMeds.results) {
        const m = med as Record<string, string | null>;
        await db.$client.prepare(`
          INSERT INTO cln_medication_reconciliation_items
            (tenant_id, reconciliation_id, medication_name, generic_name, dose, route, frequency, source, action)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'inpatient', 'continue')
        `).bind(
          tenantId, reconId,
          m.medication_name || 'Unknown',
          m.generic_name ?? null,
          m.dose ?? null,
          m.route ?? null,
          m.frequency ?? null
        ).run();
      }
    }
  }

  return c.json({ Results: { id: reconId } }, 201);
});

// ─── POST /:id/items — add item to reconciliation ──────────────────────────
medicationReconciliationRoutes.post('/:id/items', zValidator('json', reconciliationItemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const reconId = parseInt(c.req.param('id'));
  if (isNaN(reconId)) throw new HTTPException(400, { message: 'Invalid reconciliation ID' });

  // Verify the reconciliation exists and is in_progress
  const recon = await db.select({ id: clnMedicationReconciliation.id, status: clnMedicationReconciliation.status })
    .from(clnMedicationReconciliation)
    .where(
      and(
        eq(clnMedicationReconciliation.id, reconId),
        eq(clnMedicationReconciliation.tenantId, tenantId),
        eq(clnMedicationReconciliation.isActive, 1)
      )
    )
    .limit(1);

  if (recon.length === 0) throw new HTTPException(404, { message: 'Reconciliation not found' });
  if (recon[0].status !== 'in_progress') {
    throw new HTTPException(400, { message: 'Reconciliation is already completed or cancelled' });
  }

  const data = c.req.valid('json');

  const result = await db.insert(clnMedicationReconciliationItems).values({
    tenantId,
    reconciliationId: reconId,
    medicationName: data.medication_name,
    genericName: data.generic_name ?? null,
    dose: data.dose ?? null,
    route: data.route ?? null,
    frequency: data.frequency ?? null,
    source: data.source,
    action: data.action,
    actionReason: data.action_reason ?? null,
    newDose: data.new_dose ?? null,
    newRoute: data.new_route ?? null,
    newFrequency: data.new_frequency ?? null,
  }).returning({ id: clnMedicationReconciliationItems.id });

  return c.json({ Results: { id: result[0]?.id } }, 201);
});

// ─── PUT /:id/complete — complete and sign the reconciliation ───────────────
medicationReconciliationRoutes.put('/:id/complete', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const existing = await db.select({ id: clnMedicationReconciliation.id, status: clnMedicationReconciliation.status })
    .from(clnMedicationReconciliation)
    .where(
      and(
        eq(clnMedicationReconciliation.id, id),
        eq(clnMedicationReconciliation.tenantId, tenantId),
        eq(clnMedicationReconciliation.isActive, 1)
      )
    )
    .limit(1);

  if (existing.length === 0) throw new HTTPException(404, { message: 'Reconciliation not found' });
  if (existing[0].status !== 'in_progress') {
    throw new HTTPException(400, { message: 'Reconciliation is not in progress' });
  }

  await db.update(clnMedicationReconciliation)
    .set({
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: parseInt(userId) || null,
    })
    .where(
      and(
        eq(clnMedicationReconciliation.id, id),
        eq(clnMedicationReconciliation.tenantId, tenantId)
      )
    );

  return c.json({ Results: { id, status: 'completed' } });
});

// ─── DELETE /:id — soft delete a reconciliation ─────────────────────────────
medicationReconciliationRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const existing = await db.select({ id: clnMedicationReconciliation.id })
    .from(clnMedicationReconciliation)
    .where(
      and(
        eq(clnMedicationReconciliation.id, id),
        eq(clnMedicationReconciliation.tenantId, tenantId),
        eq(clnMedicationReconciliation.isActive, 1)
      )
    )
    .limit(1);

  if (existing.length === 0) throw new HTTPException(404, { message: 'Reconciliation not found' });

  await db.update(clnMedicationReconciliation)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(clnMedicationReconciliation.id, id),
        eq(clnMedicationReconciliation.tenantId, tenantId)
      )
    );

  return c.json({ Results: true });
});
