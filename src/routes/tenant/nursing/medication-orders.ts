import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import {
  createMedicationOrderSchema,
  updateOrderStatusSchema,
  medicationOrderQuerySchema,
} from '../../../schemas/nursing';
import { getDb } from '../../../db';
import { clnMedicationOrders } from '../../../db/schema/clinicalMar';

type NursingEnv = { Bindings: Env; Variables: Variables };

export const medicationOrderRoutes = new Hono<NursingEnv>();

// ─── GET /medication-orders — list orders with formulary JOIN ────────────────
medicationOrderRoutes.get('/', zValidator('query', medicationOrderQuerySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { page, limit, patient_id, visit_id, status } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let query = `
    SELECT
      o.*,
      f.name AS formulary_name,
      f.generic_name AS formulary_generic_name,
      f.strength AS formulary_strength,
      f.dosage_form AS formulary_dosage_form,
      f.is_antibiotic,
      f.is_controlled
    FROM cln_medication_orders o
    LEFT JOIN formulary_items f ON f.id = o.formulary_item_id
    WHERE o.tenant_id = ? AND o.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];

  if (patient_id) { query += ' AND o.patient_id = ?'; params.push(patient_id); }
  if (visit_id) { query += ' AND o.visit_id = ?'; params.push(visit_id); }
  if (status) { query += ' AND o.status = ?'; params.push(status); }

  query += ` ORDER BY CASE o.priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 WHEN 'routine' THEN 2 WHEN 'prn' THEN 3 END ASC, o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await db.$client.prepare(query).bind(...params).all();

  // Count
  let countQuery = 'SELECT COUNT(*) as total FROM cln_medication_orders WHERE tenant_id = ? AND is_active = 1';
  const countParams: (string | number)[] = [tenantId];
  if (patient_id) { countQuery += ' AND patient_id = ?'; countParams.push(patient_id); }
  if (visit_id) { countQuery += ' AND visit_id = ?'; countParams.push(visit_id); }
  if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
  const countResult = await db.$client.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return c.json({ Results: results, pagination: { page, limit, total: countResult?.total || 0 } });
});

// ─── GET /medication-orders/:id — single order with administration history ──
medicationOrderRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const order = await db.$client.prepare(`
    SELECT
      o.*,
      f.name AS formulary_name,
      f.generic_name,
      f.strength,
      f.dosage_form,
      f.common_dosages,
      f.max_daily_dose_mg,
      f.is_antibiotic,
      f.is_controlled
    FROM cln_medication_orders o
    LEFT JOIN formulary_items f ON f.id = o.formulary_item_id
    WHERE o.id = ? AND o.tenant_id = ? AND o.is_active = 1
  `).bind(id, tenantId).first();

  if (!order) throw new HTTPException(404, { message: 'Order not found' });

  // Get administration history for this order
  const administrations = await db.$client.prepare(`
    SELECT * FROM nur_medication_admin
    WHERE order_id = ? AND tenant_id = ? AND is_active = 1
    ORDER BY COALESCE(actual_time, scheduled_time) DESC
  `).bind(id, tenantId).all();

  return c.json({ Results: { ...order, administrations: administrations.results } });
});

// ─── POST /medication-orders — create a new medication order ────────────────
medicationOrderRoutes.post('/', zValidator('json', createMedicationOrderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Insert order + auto-generated MAR entry together for consistency
  const startDt = data.start_datetime ?? new Date().toISOString();

  const orderStmt = db.$client.prepare(`
    INSERT INTO cln_medication_orders
      (tenant_id, patient_id, visit_id, formulary_item_id, medication_name, generic_name,
       strength, dosage_form, dose, route, frequency, duration, instructions,
       priority, start_datetime, end_datetime, status, ordered_by, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(
    tenantId, data.patient_id, data.visit_id, data.formulary_item_id ?? null,
    data.medication_name, data.generic_name ?? null,
    data.strength ?? null, data.dosage_form ?? null,
    data.dose, data.route, data.frequency,
    data.duration ?? null, data.instructions ?? null,
    data.priority, startDt,
    data.end_datetime ?? null, userId, userId
  );

  const orderResult = await orderStmt.run();
  const orderId = orderResult.meta.last_row_id;

  // Auto-generate initial MAR schedule entry (log error but don't crash)
  if (orderId) {
    try {
      await db.$client.prepare(`
        INSERT INTO nur_medication_admin
          (tenant_id, patient_id, visit_id, medication_name, dose, route, frequency,
           order_id, formulary_item_id, generic_name, strength, scheduled_time, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tenantId, data.patient_id, data.visit_id, data.medication_name,
        data.dose, data.route, data.frequency,
        orderId, data.formulary_item_id ?? null,
        data.generic_name ?? null, data.strength ?? null,
        startDt, userId
      ).run();
    } catch (err) {
      console.error(`[WARN] Auto-MAR entry creation failed for order ${orderId}:`, err);
    }
  }

  return c.json({ Results: { id: orderId } }, 201);
});

// ─── PUT /medication-orders/:id/status — update order status ────────────────
medicationOrderRoutes.put('/:id/status', zValidator('json', updateOrderStatusSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const existing = await db.select({ id: clnMedicationOrders.id })
    .from(clnMedicationOrders)
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId),
        eq(clnMedicationOrders.isActive, 1)
      )
    )
    .limit(1);

  if (existing.length === 0) throw new HTTPException(404, { message: 'Order not found' });

  const data = c.req.valid('json');

  await db.update(clnMedicationOrders)
    .set({
      status: data.status,
      statusReason: data.status_reason ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: parseInt(userId) || null,
    })
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId)
      )
    );

  return c.json({ Results: { id, status: data.status } });
});

// ─── PUT /medication-orders/:id/discontinue — discontinue order ─────────────
medicationOrderRoutes.put('/:id/discontinue', zValidator('json', updateOrderStatusSchema.pick({ status_reason: true })), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const existing = await db.select({ id: clnMedicationOrders.id, status: clnMedicationOrders.status })
    .from(clnMedicationOrders)
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId),
        eq(clnMedicationOrders.isActive, 1)
      )
    )
    .limit(1);

  if (existing.length === 0) throw new HTTPException(404, { message: 'Order not found' });
  if (existing[0].status === 'discontinued') {
    throw new HTTPException(400, { message: 'Order is already discontinued' });
  }

  const data = c.req.valid('json');

  await db.update(clnMedicationOrders)
    .set({
      status: 'discontinued',
      statusReason: data.status_reason ?? null,
      endDatetime: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: parseInt(userId) || null,
    })
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId)
      )
    );

  return c.json({ Results: { id, status: 'discontinued' } });
});

// ─── PUT /medication-orders/:id/hold — hold/resume an order ─────────────────
medicationOrderRoutes.put('/:id/hold', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const existing = await db.select({ id: clnMedicationOrders.id, status: clnMedicationOrders.status })
    .from(clnMedicationOrders)
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId),
        eq(clnMedicationOrders.isActive, 1)
      )
    )
    .limit(1);

  if (existing.length === 0) throw new HTTPException(404, { message: 'Order not found' });

  // Only allow toggle between active ↔ on_hold
  const currentStatus = existing[0].status;
  if (currentStatus !== 'active' && currentStatus !== 'on_hold') {
    throw new HTTPException(400, {
      message: `Cannot hold/resume order with status '${currentStatus}'. Only active or on_hold orders can be toggled.`,
    });
  }
  const newStatus = currentStatus === 'on_hold' ? 'active' : 'on_hold';

  await db.update(clnMedicationOrders)
    .set({
      status: newStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: parseInt(userId) || null,
    })
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId)
      )
    );

  return c.json({ Results: { id, status: newStatus } });
});

// ─── DELETE /medication-orders/:id — soft delete ────────────────────────────
medicationOrderRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ID' });

  const existing = await db.select({ id: clnMedicationOrders.id })
    .from(clnMedicationOrders)
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId),
        eq(clnMedicationOrders.isActive, 1)
      )
    )
    .limit(1);

  if (existing.length === 0) throw new HTTPException(404, { message: 'Order not found' });

  await db.update(clnMedicationOrders)
    .set({ isActive: 0, updatedAt: new Date().toISOString(), updatedBy: parseInt(userId) || null })
    .where(
      and(
        eq(clnMedicationOrders.id, id),
        eq(clnMedicationOrders.tenantId, tenantId)
      )
    );

  return c.json({ Results: true });
});
