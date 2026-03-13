import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createBillSchema, paymentSchema } from '../../schemas/billing';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';

const billingRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/billing — list all bills
billingRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { status, from, to, search } = c.req.query();

  try {
    let query = `
      SELECT b.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile
      FROM bills b
      JOIN patients p ON b.patient_id = p.id
      WHERE b.tenant_id = ?`;
    const params: (string | number)[] = [tenantId!];

    if (status) { query += ' AND b.status = ?'; params.push(status); }
    if (from)   { query += ' AND date(b.created_at) >= ?'; params.push(from); }
    if (to)     { query += ' AND date(b.created_at) <= ?'; params.push(to); }
    if (search) { query += ' AND (p.name LIKE ? OR b.invoice_no LIKE ? OR p.patient_code LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    query += ' ORDER BY b.created_at DESC LIMIT 100';
    const bills = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ bills: bills.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch bills' });
  }
});

// GET /api/billing/due — outstanding dues
billingRoutes.get('/due', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const bills = await c.env.DB.prepare(`
      SELECT b.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile,
             (b.total_amount - b.paid_amount) as outstanding
      FROM bills b
      JOIN patients p ON b.patient_id = p.id
      WHERE b.tenant_id = ? AND b.status IN ('open', 'partially_paid')
        AND b.total_amount > b.paid_amount
      ORDER BY b.created_at ASC
    `).bind(tenantId).all();
    return c.json({ bills: bills.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch dues' });
  }
});

// GET /api/billing/patient/:patientId — all bills for a patient
billingRoutes.get('/patient/:patientId', async (c) => {
  const tenantId = c.get('tenantId');
  const patientId = c.req.param('patientId');

  try {
    const bills = await c.env.DB.prepare(`
      SELECT b.*, (b.total_amount - b.paid_amount) as outstanding
      FROM bills b
      WHERE b.patient_id = ? AND b.tenant_id = ?
      ORDER BY b.created_at DESC
    `).bind(patientId, tenantId).all();
    return c.json({ bills: bills.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch patient bills' });
  }
});

// GET /api/billing/:id — single bill with items
billingRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const bill = await c.env.DB.prepare(`
      SELECT b.*, p.name as patient_name, p.patient_code, p.mobile, p.address
      FROM bills b JOIN patients p ON b.patient_id = p.id
      WHERE b.id = ? AND b.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });

    const items = await c.env.DB.prepare(
      'SELECT * FROM invoice_items WHERE bill_id = ? AND tenant_id = ?',
    ).bind(id, tenantId).all();

    const payments = await c.env.DB.prepare(
      'SELECT * FROM payments WHERE bill_id = ? AND tenant_id = ?',
    ).bind(id, tenantId).all();

    return c.json({ bill, items: items.results, payments: payments.results });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch bill' });
  }
});

// POST /api/billing — create itemized bill
billingRoutes.post('/', zValidator('json', createBillSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    // Calculate totals from line items
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const discount = data.discount;
    const total = Math.max(0, subtotal - discount);

    const invoiceNo = await getNextSequence(c.env.DB, tenantId!, 'invoice', 'INV');

    const billResult = await c.env.DB.prepare(`
      INSERT INTO bills
        (patient_id, visit_id, invoice_no, subtotal, discount, total_amount, paid_amount, status, tenant_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?, ?, datetime('now'))
    `).bind(data.patientId, data.visitId ?? null, invoiceNo, subtotal, discount, total, tenantId, userId).run();

    const billId = billResult.meta.last_row_id;

    // Insert invoice line items
    for (const item of data.items) {
      const lineTotal = item.quantity * item.unitPrice;
      await c.env.DB.prepare(`
        INSERT INTO invoice_items
          (bill_id, item_category, description, quantity, unit_price, line_total, reference_id, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(billId, item.itemCategory, item.description ?? null, item.quantity, item.unitPrice, lineTotal, item.referenceId ?? null, tenantId).run();
    }

    // Record income for accounting
    await c.env.DB.prepare(`
      INSERT INTO income (date, source, amount, description, bill_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(new Date().toISOString().split('T')[0], 'doctor_visit', total, `Invoice ${invoiceNo}`, billId, tenantId).run();

    // Audit log
    void createAuditLog(c.env, tenantId!, userId!, 'create', 'bills', billId, null, { patientId: data.patientId, invoiceNo, total });

    return c.json({ message: 'Bill created', billId, invoiceNo, total }, 201);
  } catch (error) {
    console.error('[billing] Failed to create bill:', error);
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to create bill' });
  }
});

// POST /api/billing/pay — collect payment on a bill
billingRoutes.post('/pay', zValidator('json', paymentSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    // ── Idempotency check ─────────────────────────────────────────────────────
    if (data.idempotencyKey) {
      const existing = await c.env.DB.prepare(
        `SELECT p.receipt_no, p.amount, b.total_amount, b.paid_amount as bill_paid, b.status as bill_status
         FROM payments p
         JOIN bills b ON p.bill_id = b.id
         WHERE p.idempotency_key = ? AND p.tenant_id = ?`,
      ).bind(data.idempotencyKey, tenantId).first<{
        receipt_no: string; amount: number; bill_paid: number;
        total_amount: number; bill_status: string;
      }>();
      if (existing) {
        return c.json({
          message: 'Payment already recorded (idempotent)',
          receiptNo: existing.receipt_no,
          paidAmount: existing.bill_paid,
          outstanding: Math.max(0, existing.total_amount - existing.bill_paid),
          status: existing.bill_status,
          idempotent: true,
        }, 200);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const bill = await c.env.DB.prepare(
      'SELECT * FROM bills WHERE id = ? AND tenant_id = ?',
    ).bind(data.billId, tenantId).first<{
      id: number; total_amount: number; paid_amount: number; status: string;
    }>();
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.status === 'paid') throw new HTTPException(400, { message: 'Bill is already fully paid' });

    const outstanding = bill.total_amount - bill.paid_amount;
    if (data.amount > outstanding) {
      throw new HTTPException(400, {
        message: `Payment amount (${data.amount}) exceeds outstanding balance (${outstanding})`,
      });
    }

    const newPaid = bill.paid_amount + data.amount;
    const status = newPaid >= bill.total_amount ? 'paid' : 'partially_paid';

    const receiptNo = await getNextSequence(c.env.DB, tenantId!, 'receipt', 'RCP');

    await c.env.DB.prepare(`
      INSERT INTO payments
        (bill_id, amount, type, receipt_no, payment_method, received_by, idempotency_key, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(data.billId, data.amount, data.type, receiptNo, data.paymentMethod ?? null, userId, data.idempotencyKey ?? null, tenantId).run();

    await c.env.DB.prepare(
      `UPDATE bills SET paid_amount = ?, status = ? WHERE id = ? AND tenant_id = ?`,
    ).bind(newPaid, status, data.billId, tenantId).run();

    // Audit log
    void createAuditLog(c.env, tenantId!, userId!, 'payment', 'bills', data.billId, { paidBefore: bill.paid_amount }, { newPaid, status, receiptNo });

    return c.json({
      message: 'Payment recorded',
      receiptNo,
      paidAmount: newPaid,
      outstanding: Math.max(0, bill.total_amount - newPaid),
      status,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to record payment' });
  }
});

export default billingRoutes;