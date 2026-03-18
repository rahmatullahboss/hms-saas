import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getNextSequence } from '../../lib/sequence';
import { z } from 'zod';
import { getDb } from '../../db';


/**
 * Provisional billing routes — operates on the existing `billing_provisional_items` table
 * which has columns: id, tenant_id, patient_id, admission_id, visit_id, item_category,
 * item_name, department, unit_price, quantity, discount_percent, discount_amount,
 * total_amount, doctor_id, doctor_name, reference_id, bill_status, is_insurance,
 * cancelled_by, cancelled_at, cancel_reason, billed_bill_id, is_active, created_by, created_at
 */

const billingProvisional = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Schemas (inline to match existing table) ────────────────────────────────

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const listProvisionalSchema = z.object({
  patient_id: z.coerce.number().int().positive().optional(),
  visit_id: z.coerce.number().int().positive().optional(),
  bill_status: z.enum(['provisional', 'finalized', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(50),
});

const createProvisionalItemsSchema = z.object({
  patient_id: z.number().int().positive(),
  visit_id: z.number().int().positive().optional(),
  admission_id: z.number().int().positive().optional(),
  items: z.array(z.object({
    item_name: z.string().min(1),
    item_category: z.string().optional(),
    department: z.string().optional(),
    unit_price: z.number().min(0),
    quantity: z.number().int().min(1).default(1),
    discount_percent: z.number().min(0).max(100).default(0),
    doctor_id: z.number().int().positive().optional(),
    doctor_name: z.string().optional(),
    is_insurance: z.boolean().default(false),
  })).min(1),
});

const cancelProvisionalSchema = z.object({
  cancel_reason: z.string().min(1).max(500),
});

const payProvisionalSchema = z.object({
  patient_id: z.number().int().positive(),
  provisional_item_ids: z.array(z.number().int().positive()).min(1),
  discount: z.number().min(0).default(0),
  payment_method: z.string().optional(),
  remarks: z.string().optional(),
});

// ─── Helper: validate numeric route param ────────────────────────────────────

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) throw new HTTPException(400, { message: 'Invalid ID' });
  return id;
}

// ─── GET / — list provisional items ──────────────────────────────────────────

billingProvisional.get('/', zValidator('query', listProvisionalSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { patient_id, visit_id, bill_status, page, per_page } = c.req.valid('query');
  const offset = (page - 1) * per_page;

  let sql = `
    SELECT pi.*, p.name as patient_name, p.patient_code
    FROM billing_provisional_items pi
    JOIN patients p ON pi.patient_id = p.id AND p.tenant_id = pi.tenant_id
    WHERE pi.tenant_id = ? AND pi.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];

  if (patient_id) { sql += ' AND pi.patient_id = ?'; params.push(patient_id); }
  if (visit_id) { sql += ' AND pi.visit_id = ?'; params.push(visit_id); }
  if (bill_status) { sql += ' AND pi.bill_status = ?'; params.push(bill_status); }

  sql += ` ORDER BY pi.created_at DESC LIMIT ? OFFSET ?`;
  params.push(per_page, offset);

  const { results } = await db.$client.prepare(sql).bind(...params).all();
  return c.json({ data: results, page, per_page });
});

// ─── GET /patient/:patientId/summary — provisional summary ──────────────────

billingProvisional.get('/patient/:patientId/summary', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = parseId(c.req.param('patientId'));

  const summary = await db.$client.prepare(`
    SELECT
      COUNT(*) as total_items,
      COALESCE(SUM(CASE WHEN bill_status = 'provisional' THEN total_amount ELSE 0 END), 0) as pending_amount,
      COALESCE(SUM(CASE WHEN bill_status = 'finalized' THEN total_amount ELSE 0 END), 0) as finalized_amount,
      COALESCE(SUM(CASE WHEN bill_status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled_count
    FROM billing_provisional_items
    WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
  `).bind(tenantId, patientId).first();

  return c.json({ data: summary });
});

// ─── POST / — create provisional items (batch) ──────────────────────────────

billingProvisional.post('/', zValidator('json', createProvisionalItemsSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Validate patient
  const patient = await db.$client.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  const stmts = data.items.map(item => {
    const subtotal = item.quantity * item.unit_price;
    const discountAmount = Math.round((subtotal * item.discount_percent / 100) * 100) / 100;
    const totalAmount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

    return db.$client.prepare(`
      INSERT INTO billing_provisional_items
        (tenant_id, patient_id, admission_id, visit_id, item_category, item_name,
         department, unit_price, quantity, discount_percent, discount_amount, total_amount,
         doctor_id, doctor_name, bill_status, is_insurance, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provisional', ?, 1, ?)
    `).bind(
      tenantId, data.patient_id, data.admission_id ?? null, data.visit_id ?? null,
      item.item_category ?? null, item.item_name,
      item.department ?? null, item.unit_price, item.quantity,
      item.discount_percent, discountAmount, totalAmount,
      item.doctor_id ?? null, item.doctor_name ?? null,
      item.is_insurance ? 1 : 0, userId
    );
  });

  await db.$client.batch(stmts);
  return c.json({ message: `${data.items.length} provisional item(s) created`, count: data.items.length }, 201);
});

// ─── PATCH /:id/cancel — cancel a provisional item ──────────────────────────

billingProvisional.patch('/:id/cancel', zValidator('json', cancelProvisionalSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const item = await db.$client.prepare(
    'SELECT id, bill_status FROM billing_provisional_items WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<{ id: number; bill_status: string }>();

  if (!item) throw new HTTPException(404, { message: 'Provisional item not found' });
  if (item.bill_status !== 'provisional') {
    throw new HTTPException(400, { message: `Cannot cancel item with status '${item.bill_status}'` });
  }

  await db.$client.prepare(`
    UPDATE billing_provisional_items
    SET bill_status = 'cancelled', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP,
        cancel_reason = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(userId, data.cancel_reason, id, tenantId).run();

  return c.json({ message: 'Provisional item cancelled' });
});

// ─── POST /pay — convert provisional items to invoice (ATOMIC) ──────────────

billingProvisional.post('/pay', zValidator('json', payProvisionalSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Fetch all provisional items
  const placeholders = data.provisional_item_ids.map(() => '?').join(',');
  const { results: items } = await db.$client.prepare(
    `SELECT * FROM billing_provisional_items WHERE id IN (${placeholders}) AND tenant_id = ? AND bill_status = 'provisional'`
  ).bind(...data.provisional_item_ids, tenantId).all<any>();

  if (items.length !== data.provisional_item_ids.length) {
    throw new HTTPException(400, { message: 'Some provisional items not found or already processed' });
  }

  // Verify all items belong to the same patient
  if (items.some(item => item.patient_id !== data.patient_id)) {
    throw new HTTPException(400, { message: 'All items must belong to the same patient' });
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const discount = data.discount;
  const totalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  // Generate invoice number before the batch
  const invoiceNo = await getNextSequence(c.env.DB, String(tenantId), 'invoice', 'INV');
  const today = new Date().toISOString().split('T')[0];

  // ── ATOMIC BATCH: bill + items + provisional updates + income ──
  const batchStmts: D1PreparedStatement[] = [];

  // 1. Create the bill
  batchStmts.push(
    db.$client.prepare(`
      INSERT INTO bills (patient_id, visit_id, invoice_no, discount, total, paid, due, status, payment_method, remarks, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, 'open', ?, ?, ?, datetime('now'))
    `).bind(
      data.patient_id, items[0]?.visit_id ?? null, invoiceNo, discount,
      totalAmount, totalAmount, data.payment_method ?? null,
      data.remarks ?? null, tenantId
    )
  );

  // Note: D1 batch doesn't return last_row_id per statement.
  // We need to get the bill ID after the batch to link items.
  // Workaround: use a sub-select in subsequent statements.

  for (const item of items) {
    // 2. Invoice items — use sub-select to get bill ID
    batchStmts.push(
      db.$client.prepare(`
        INSERT INTO invoice_items (bill_id, item_category, description, quantity, unit_price, line_total, tenant_id)
        VALUES (
          (SELECT id FROM bills WHERE invoice_no = ? AND tenant_id = ? LIMIT 1),
          ?, ?, ?, ?, ?, ?
        )
      `).bind(
        invoiceNo, tenantId,
        item.item_category || 'provisional', item.item_name,
        item.quantity, item.unit_price, item.total_amount, tenantId
      )
    );

    // 3. Mark provisional as finalized
    batchStmts.push(
      db.$client.prepare(`
        UPDATE billing_provisional_items
        SET bill_status = 'finalized',
            billed_bill_id = (SELECT id FROM bills WHERE invoice_no = ? AND tenant_id = ? LIMIT 1)
        WHERE id = ? AND tenant_id = ?
      `).bind(invoiceNo, tenantId, item.id, tenantId)
    );
  }

  // 4. Income record
  batchStmts.push(
    db.$client.prepare(`
      INSERT INTO income (date, source, amount, description, bill_id, tenant_id)
      VALUES (?, 'billing', ?, ?,
        (SELECT id FROM bills WHERE invoice_no = ? AND tenant_id = ? LIMIT 1), ?)
    `).bind(today, totalAmount, `Invoice ${invoiceNo} (from provisional)`, invoiceNo, tenantId, tenantId)
  );

  await db.$client.batch(batchStmts);

  // Fetch the created bill ID for the response
  const bill = await db.$client.prepare(
    'SELECT id FROM bills WHERE invoice_no = ? AND tenant_id = ?'
  ).bind(invoiceNo, tenantId).first<{ id: number }>();

  return c.json({
    message: 'Provisional items converted to invoice',
    bill_id: bill?.id ?? null,
    invoice_no: invoiceNo,
    total: totalAmount,
    items_count: items.length,
  }, 201);
});

export default billingProvisional;
