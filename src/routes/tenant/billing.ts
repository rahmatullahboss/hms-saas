import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createBillSchema, paymentSchema } from '../../schemas/billing';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getPagination, paginationMeta } from '../../lib/pagination';

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

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM bills b JOIN patients p ON b.patient_id = p.id ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const bills = await c.env.DB.prepare(
      `SELECT b.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile
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
  const tenantId = requireTenantId(c);

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
  const tenantId = requireTenantId(c);
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
  const tenantId = requireTenantId(c);
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

    // ─── Atomic batch: bill + items + income all succeed or all fail ──────
    const billStatement = c.env.DB.prepare(`
      INSERT INTO bills
        (patient_id, visit_id, invoice_no, subtotal, discount, total_amount, paid_amount, status, tenant_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?, ?, datetime('now'))
    `).bind(data.patientId, data.visitId ?? null, invoiceNo, subtotal, discount, total, tenantId, userId);

    const itemStatements = data.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return c.env.DB.prepare(`
        INSERT INTO invoice_items
          (bill_id, item_category, description, quantity, unit_price, line_total, reference_id, tenant_id)
        VALUES (last_insert_rowid(), ?, ?, ?, ?, ?, ?, ?)
      `).bind(item.itemCategory, item.description ?? null, item.quantity, item.unitPrice, lineTotal, item.referenceId ?? null, tenantId);
    });

    const incomeStatement = c.env.DB.prepare(`
      INSERT INTO income (date, source, amount, description, ref_id, tenant_id) VALUES (?, 'billing', ?, ?, last_insert_rowid(), ?)
    `).bind(today, total, `Invoice ${invoiceNo}`, tenantId);

    // Execute all statements atomically
    const batchResults = await c.env.DB.batch([billStatement, ...itemStatements, incomeStatement]);
    const billId = batchResults[0].meta.last_row_id;

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
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  try {
    const bill = await c.env.DB.prepare(
      'SELECT * FROM bills WHERE id = ? AND tenant_id = ?',
    ).bind(data.billId, tenantId).first<{
      id: number; total_amount: number; paid_amount: number; status: string;
    }>();
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.status === 'paid') throw new HTTPException(400, { message: 'Bill is already fully paid' });

    // Calculate the current outstanding balance to prevent overpayment
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
        (bill_id, amount, type, receipt_no, payment_method, received_by, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(data.billId, data.amount, data.type, receiptNo, data.paymentMethod ?? null, userId, tenantId).run();

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