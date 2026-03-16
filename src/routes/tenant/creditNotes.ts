import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const creditNotes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createCreditNoteSchema = z.object({
  bill_id: z.number().int().positive(),
  patient_id: z.number().int().positive(),
  reason: z.string().min(1),
  payment_mode: z.string().optional(),
  remarks: z.string().optional(),
  items: z.array(z.object({
    invoice_item_id: z.number().int().positive(),
    return_quantity: z.number().int().positive(),
    remarks: z.string().optional(),
  })).min(1),
});

// ─── GET / — list credit notes ───────────────────────────────────────────────

creditNotes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patient_id');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const perPage = Math.min(200, Math.max(1, parseInt(c.req.query('per_page') || '50')));
  const offset = (page - 1) * perPage;

  let sql = `
    SELECT cn.*, p.name as patient_name, p.patient_code, b.invoice_no
    FROM billing_credit_notes cn
    JOIN patients p ON cn.patient_id = p.id AND p.tenant_id = cn.tenant_id
    JOIN bills b ON cn.bill_id = b.id
    WHERE cn.tenant_id = ? AND cn.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];
  if (patientId) { sql += ' AND cn.patient_id = ?'; params.push(patientId); }
  sql += ` ORDER BY cn.created_at DESC LIMIT ${perPage} OFFSET ${offset}`;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ credit_notes: results, page, per_page: perPage });
});

// ─── GET /invoice/:billId — get invoice items for credit note ────────────────

creditNotes.get('/invoice/:billId', async (c) => {
  const tenantId = requireTenantId(c);
  const billId = parseInt(c.req.param('billId'));

  const bill = await c.env.DB.prepare(
    'SELECT b.*, p.name as patient_name FROM bills b JOIN patients p ON b.patient_id = p.id WHERE b.id = ? AND b.tenant_id = ?'
  ).bind(billId, tenantId).first();
  if (!bill) throw new HTTPException(404, { message: 'Bill not found' });

  // Get items with already-returned quantities
  const { results: items } = await c.env.DB.prepare(`
    SELECT ii.*,
      COALESCE((SELECT SUM(cni.return_quantity) FROM billing_credit_note_items cni
        JOIN billing_credit_notes cn ON cni.credit_note_id = cn.id
        WHERE cni.invoice_item_id = ii.id AND cn.is_active = 1), 0) as returned_qty
    FROM invoice_items ii
    WHERE ii.bill_id = ? AND ii.tenant_id = ? AND COALESCE(ii.status, 'active') = 'active'
  `).bind(billId, tenantId).all();

  const itemsWithAvailable = (items as any[]).map((item: any) => ({
    ...item,
    available_qty: (item.quantity || 1) - (item.returned_qty || 0),
  }));

  return c.json({ bill, items: itemsWithAvailable });
});

// ─── POST / — create credit note ────────────────────────────────────────────

creditNotes.post('/', zValidator('json', createCreditNoteSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Validate invoice belongs to patient
  const bill = await c.env.DB.prepare(
    'SELECT * FROM bills WHERE id = ? AND tenant_id = ? AND patient_id = ?'
  ).bind(data.bill_id, tenantId, data.patient_id).first<any>();
  if (!bill) throw new HTTPException(404, { message: 'Bill not found for this patient' });

  // Validate items and calculate refund
  const { results: invoiceItems } = await c.env.DB.prepare(`
    SELECT ii.*,
      COALESCE((SELECT SUM(cni.return_quantity) FROM billing_credit_note_items cni
        JOIN billing_credit_notes cn ON cni.credit_note_id = cn.id
        WHERE cni.invoice_item_id = ii.id AND cn.is_active = 1), 0) as returned_qty
    FROM invoice_items ii WHERE ii.bill_id = ? AND ii.tenant_id = ?
  `).bind(data.bill_id, tenantId).all<any>();

  const itemMap = new Map(invoiceItems.map((i: any) => [i.id, i]));
  let totalRefund = 0;

  for (const returnItem of data.items) {
    const original = itemMap.get(returnItem.invoice_item_id);
    if (!original) throw new HTTPException(400, { message: `Item ${returnItem.invoice_item_id} not in invoice` });
    const available = (original.quantity || 1) - (original.returned_qty || 0);
    if (returnItem.return_quantity > available) {
      throw new HTTPException(400, { message: `Cannot return ${returnItem.return_quantity} of ${original.description}. Available: ${available}` });
    }
    totalRefund += (original.unit_price || 0) * returnItem.return_quantity;
  }

  const cnNo = await getNextSequence(c.env.DB, String(tenantId), 'credit_note', 'CN');

  // P0#2: Two-phase atomic approach — insert CN first to get ID, then batch items + bill update
  // Phase 1: Insert credit note
  const cnResult = await c.env.DB.prepare(`
    INSERT INTO billing_credit_notes (tenant_id, credit_note_no, bill_id, patient_id, reason, total_amount, refund_amount, payment_mode, remarks, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, cnNo, data.bill_id, data.patient_id, data.reason, totalRefund, totalRefund, data.payment_mode || 'cash', data.remarks || null, userId).run();

  const cnId = cnResult.meta.last_row_id;

  // Phase 2: Batch items + bill update atomically
  const itemStmts: any[] = [];
  for (const returnItem of data.items) {
    const original = itemMap.get(returnItem.invoice_item_id)!;
    const itemTotal = (original.unit_price || 0) * returnItem.return_quantity;
    itemStmts.push(
      c.env.DB.prepare(`
        INSERT INTO billing_credit_note_items (tenant_id, credit_note_id, invoice_item_id, item_name, unit_price, return_quantity, total_amount, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(tenantId, cnId, returnItem.invoice_item_id, original.description, original.unit_price, returnItem.return_quantity, itemTotal, returnItem.remarks || null)
    );
  }

  // P1#7: Fix bill status logic — compare against total
  itemStmts.push(
    c.env.DB.prepare(`
      UPDATE bills SET paid = MAX(0, paid - ?),
        status = CASE
          WHEN MAX(0, paid - ?) >= total THEN 'paid'
          WHEN MAX(0, paid - ?) > 0 THEN 'partially_paid'
          ELSE 'refunded'
        END
      WHERE id = ? AND tenant_id = ?
    `).bind(totalRefund, totalRefund, totalRefund, data.bill_id, tenantId)
  );

  await c.env.DB.batch(itemStmts);

  return c.json({ id: cnId, credit_note_no: cnNo, refund_amount: totalRefund, message: 'Credit note created' }, 201);
});

export default creditNotes;
