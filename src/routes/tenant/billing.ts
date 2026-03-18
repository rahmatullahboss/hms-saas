import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createBillSchema, paymentSchema, editBillSchema } from '../../schemas/billing';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getPagination, paginationMeta } from '../../lib/pagination';
import { getDb } from '../../db';


const billingRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /api/billing
 * Retrieves a paginated list of bills for the current tenant.
 * Supports filtering by status, date range (from/to), and a search string (patient name, code, or invoice number).
 *
 * @param {string} [status] - Optional bill status to filter by (e.g., 'open', 'paid').
 * @param {string} [from] - Optional start date (YYYY-MM-DD) for filtering.
 * @param {string} [to] - Optional end date (YYYY-MM-DD) for filtering.
 * @param {string} [search] - Optional search query for patient details or invoice number.
 * @param {string} [page=1] - Pagination: current page number.
 * @param {string} [limit=10] - Pagination: number of records per page.
 * @returns {Object} JSON response containing:
 *   - bills: Array of bill records with basic patient details.
 *   - meta: Pagination metadata.
 *
 * @example
 * // GET /api/billing?status=open&page=1&limit=20
 */
billingRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { status, from, to, search } = c.req.query();
  const { page, limit, offset } = getPagination(c);

  try {
    let whereClause = 'WHERE b.tenant_id = ?';
    const params: (string | number)[] = [tenantId];

    if (status) { whereClause += ' AND b.status = ?'; params.push(status); }
    if (from)   { whereClause += ' AND date(b.created_at) >= ?'; params.push(from); }
    if (to)     { whereClause += ' AND date(b.created_at) <= ?'; params.push(to); }
    if (search) { whereClause += ' AND (p.name LIKE ? OR b.invoice_no LIKE ? OR p.patient_code LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const countResult = await db.$client.prepare(
      `SELECT COUNT(*) as total FROM bills b JOIN patients p ON b.patient_id = p.id ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const bills = await db.$client.prepare(
      `SELECT b.*, b.total AS total_amount, b.paid AS paid_amount, (b.total - b.paid) AS outstanding,
              p.name as patient_name, p.patient_code, p.mobile as patient_mobile
       FROM bills b JOIN patients p ON b.patient_id = p.id
       ${whereClause} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    return c.json({ bills: bills.results, meta: paginationMeta(page, limit, total) });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch bills' });
  }
});

/**
 * GET /api/billing/due
 * Retrieves a list of outstanding (unpaid or partially paid) bills for the current tenant.
 * Calculates the outstanding amount (`total_amount` - `paid_amount`) for each bill.
 *
 * @returns {Object} JSON response containing:
 *   - bills: Array of outstanding bill records with patient details.
 *
 * @example
 * // GET /api/billing/due
 */
billingRoutes.get('/due', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);

  try {
    const bills = await db.$client.prepare(`
      SELECT b.*, b.total AS total_amount, b.paid AS paid_amount,
             p.name as patient_name, p.patient_code, p.mobile as patient_mobile,
             (b.total - b.paid) as outstanding
      FROM bills b
      JOIN patients p ON b.patient_id = p.id
      WHERE b.tenant_id = ? AND b.status IN ('open', 'partially_paid')
        AND b.total > b.paid
      ORDER BY b.created_at ASC
    `).bind(tenantId).all();
    return c.json({ bills: bills.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch dues' });
  }
});

/**
 * GET /api/billing/patient/:patientId
 * Retrieves all bills associated with a specific patient within the current tenant.
 * Calculates the outstanding amount for each bill.
 *
 * @param {string} patientId - The ID of the patient.
 * @returns {Object} JSON response containing:
 *   - bills: Array of bill records for the specified patient.
 *
 * @example
 * // GET /api/billing/patient/123
 */
billingRoutes.get('/patient/:patientId', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.param('patientId');

  try {
    const bills = await db.$client.prepare(`
      SELECT b.*, b.total AS total_amount, b.paid AS paid_amount, (b.total - b.paid) as outstanding
      FROM bills b
      WHERE b.patient_id = ? AND b.tenant_id = ?
      ORDER BY b.created_at DESC
    `).bind(patientId, tenantId).all();
    return c.json({ bills: bills.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch patient bills' });
  }
});

/**
 * GET /api/billing/:id
 * Retrieves a single bill by its ID, along with its associated line items and payment records.
 *
 * @param {string} id - The ID of the bill to fetch.
 * @returns {Object} JSON response containing:
 *   - bill: The main bill record with patient details.
 *   - items: Array of `invoice_items` associated with the bill.
 *   - payments: Array of `payments` associated with the bill.
 * @throws {HTTPException} 404 if the bill is not found.
 *
 * @example
 * // GET /api/billing/456
 */
billingRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const bill = await db.$client.prepare(`
      SELECT b.*, b.total AS total_amount, b.paid AS paid_amount, (b.total - b.paid) AS outstanding,
             p.name as patient_name, p.patient_code, p.mobile, p.address
      FROM bills b JOIN patients p ON b.patient_id = p.id
      WHERE b.id = ? AND b.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });

    const items = await db.$client.prepare(
      'SELECT * FROM invoice_items WHERE bill_id = ? AND tenant_id = ?',
    ).bind(id, tenantId).all();

    const payments = await db.$client.prepare(
      'SELECT * FROM payments WHERE bill_id = ? AND tenant_id = ?',
    ).bind(id, tenantId).all();

    return c.json({ bill, items: items.results, payments: payments.results });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch bill' });
  }
});

/**
 * POST /api/billing
 * Creates a new itemized bill. This process performs an atomic batch operation
 * to insert the main bill record, all invoice items, and a corresponding income record.
 * Generates a unique invoice number and logs an audit event on success.
 *
 * @param {Object} body - Validated bill data (items, discount, patientId, visitId).
 * @returns {Object} JSON response containing:
 *   - message: Success message.
 *   - billId: The ID of the newly created bill.
 *   - invoiceNo: The unique invoice number (e.g., INV-000001).
 *   - total: The calculated total amount after discount.
 * @throws {HTTPException} 500 if the bill creation fails.
 *
 * @example
 * // POST /api/billing
 * // Body: { "patientId": 1, "items": [...], "discount": 10 }
 */
billingRoutes.post('/', zValidator('json', createBillSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  try {
    // Calculate the subtotal by summing the line totals (quantity * unit price) of all items
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const discount = data.discount;

    // Ensure the total amount never falls below zero, even with large discounts
    const total = Math.max(0, subtotal - discount);

    const invoiceNo = await getNextSequence(c.env.DB, tenantId!, 'invoice', 'INV');
    const today = new Date().toISOString().split('T')[0];

    // ─── Step 1: Insert bill (need billId before items can reference it) ─────
    // D1 batch does NOT propagate last_insert_rowid() across statements,
    // so we must insert the bill separately to get the real ID.
    const billResult = await db.$client.prepare(`
      INSERT INTO bills
        (patient_id, visit_id, invoice_no, discount, total, paid, due, status, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, 'open', ?, datetime('now'))
    `).bind(data.patientId, data.visitId ?? null, invoiceNo, discount, total, total, tenantId).run();

    const billId = billResult.meta.last_row_id;

    // ─── Step 2: Batch insert items + income using the real billId ───────────
    const itemStatements = data.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return db.$client.prepare(`
        INSERT INTO invoice_items
          (bill_id, item_category, description, quantity, unit_price, line_total, reference_id, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(billId, item.itemCategory, item.description ?? null, item.quantity, item.unitPrice, lineTotal, item.referenceId ?? null, tenantId);
    });

    const incomeStatement = db.$client.prepare(`
      INSERT INTO income (date, source, amount, description, bill_id, tenant_id)
      VALUES (?, 'billing', ?, ?, ?, ?)
    `).bind(today, total, `Invoice ${invoiceNo}`, billId, tenantId);

    await db.$client.batch([...itemStatements, incomeStatement]);

    // Audit log (fire-and-forget — non-critical path)
    void createAuditLog(c.env, tenantId!, userId!, 'create', 'bills', billId, null, { patientId: data.patientId, invoiceNo, total });

    return c.json({ message: 'Bill created', billId, invoiceNo, total }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to create bill' });
  }
});


/**
 * POST /api/billing/pay
 * Collects a payment for an existing bill.
 * Validates that the bill is not already fully paid and that the payment amount
 * does not exceed the outstanding balance. Updates the bill's paid amount and status,
 * inserts a payment record, and logs an audit event.
 *
 * @param {Object} body - Validated payment data (billId, amount, paymentMethod, type).
 * @returns {Object} JSON response containing:
 *   - message: Success message.
 *   - receiptNo: The generated receipt number.
 *   - paidAmount: The new total amount paid.
 *   - outstanding: The remaining balance.
 *   - status: The new status of the bill ('paid' or 'partially_paid').
 * @throws {HTTPException} 404 if the bill is not found.
 * @throws {HTTPException} 400 if the bill is fully paid or payment exceeds balance.
 *
 * @example
 * // POST /api/billing/pay
 * // Body: { "billId": 123, "amount": 500, "paymentMethod": "cash" }
 */
billingRoutes.post('/pay', zValidator('json', paymentSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  try {
    const bill = await db.$client.prepare(
      'SELECT id, total, paid, status FROM bills WHERE id = ? AND tenant_id = ?',
    ).bind(data.billId, tenantId).first<{
      id: number; total: number; paid: number; status: string;
    }>();
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.status === 'paid') throw new HTTPException(400, { message: 'Bill is already fully paid' });

    // Calculate the current outstanding balance to prevent overpayment
    const outstanding = bill.total - bill.paid;
    if (data.amount > outstanding) {
      throw new HTTPException(400, {
        message: `Payment amount (${data.amount}) exceeds outstanding balance (${outstanding})`,
      });
    }

    const newPaid = bill.paid + data.amount;
    const status = newPaid >= bill.total ? 'paid' : 'partially_paid';

    const receiptNo = await getNextSequence(c.env.DB, tenantId!, 'receipt', 'RCP');

    await db.$client.prepare(`
      INSERT INTO payments
        (bill_id, amount, type, receipt_no, payment_method, received_by, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(data.billId, data.amount, data.type, receiptNo, data.paymentMethod ?? null, userId, tenantId).run();

    await db.$client.prepare(
      `UPDATE bills SET paid = ?, due = ?, status = ? WHERE id = ? AND tenant_id = ?`,
    ).bind(newPaid, Math.max(0, bill.total - newPaid), status, data.billId, tenantId).run();

    // Audit log
    void createAuditLog(c.env, tenantId!, userId!, 'payment', 'bills', data.billId, { paidBefore: bill.paid }, { newPaid, status, receiptNo });

    return c.json({
      message: 'Payment recorded',
      receiptNo,
      paidAmount: newPaid,
      outstanding: Math.max(0, bill.total - newPaid),
      status,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to record payment' });
  }
});

// ─── PUT /api/billing/:id — edit bill (pre-payment only) ─────────────────────

/**
 * PUT /api/billing/:id
 * Allows editing a bill BEFORE any payment has been made.
 * Replaces existing bill items with the new set and recalculates totals.
 *
 * @param {string} id - The ID of the bill to edit.
 * @param {Object} body - Validated data containing items and optional discount.
 * @returns {Object} JSON response indicating success with updated totals.
 * @throws {HTTPException} 404 if bill not found.
 * @throws {HTTPException} 409 if bill already has payments (cannot edit).
 */
billingRoutes.put('/:id', zValidator('json', editBillSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    // Verify bill exists and belongs to tenant
    const bill = await db.$client.prepare(
      `SELECT id, status, paid, invoice_no FROM bills WHERE id = ? AND tenant_id = ?`
    ).bind(id, tenantId).first<{ id: number; status: string; paid: number; invoice_no: string }>();

    if (!bill) {
      throw new HTTPException(404, { message: 'Bill not found' });
    }

    // Only allow editing unpaid bills
    if (bill.paid > 0 || bill.status === 'paid') {
      throw new HTTPException(409, { message: 'Cannot edit bill — payment already received. Use credit note instead.' });
    }

    // Calculate new totals
    const subtotal = data.items.reduce((s, item) => s + item.quantity * item.unitPrice, 0);
    const discount = data.discount ?? 0;
    const totalAmount = subtotal - discount;

    // Atomic batch: delete old items, insert new ones, update bill totals
    const batchStmts: D1PreparedStatement[] = [
      // Delete existing items
      db.$client.prepare(
        `DELETE FROM invoice_items WHERE bill_id = ? AND tenant_id = ?`
      ).bind(id, tenantId),

      // Update bill totals
      db.$client.prepare(
        `UPDATE bills SET total = ?, discount = ?, due = ?, updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ?`
      ).bind(totalAmount, discount, totalAmount, id, tenantId),
    ];

    // Insert new items
    for (const item of data.items) {
      const lineTotal = item.quantity * item.unitPrice;
      batchStmts.push(
        db.$client.prepare(
          `INSERT INTO invoice_items (bill_id, item_category, description, quantity, unit_price, line_total, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, item.itemCategory, item.description ?? null, item.quantity, item.unitPrice, lineTotal, tenantId)
      );
    }

    // Audit log
    batchStmts.push(
      db.$client.prepare(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id, details)
         VALUES (?, ?, 'edit', 'bill', ?, ?)`
      ).bind(tenantId, userId, id, `Bill ${bill.invoice_no} edited — new total: ${totalAmount}`)
    );

    await db.$client.batch(batchStmts);

    return c.json({
      message: 'Bill updated',
      totalAmount,
      discount,
      itemCount: data.items.length,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to edit bill' });
  }
});

export default billingRoutes;