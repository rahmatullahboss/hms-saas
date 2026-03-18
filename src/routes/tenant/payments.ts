import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createPaymentGateway, type GatewayName } from '../../lib/payment-gateway';
import { initiatePaymentSchema } from '../../schemas/payment';
import { verifyPaymentSchema } from '../../schemas/accounting';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getDb } from '../../db';


const paymentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET / — list all payments (with filters) ─────────────────────────────────
paymentRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { search, status, payment_method, date_from, date_to } = c.req.query();

  let sql = `
    SELECT p.id, p.receipt_no as payment_ref, pt.name as patient_name, pt.patient_code,
      p.amount, COALESCE(p.payment_method, 'cash') as payment_method,
      COALESCE(p.payment_type, p.type, 'received') as payment_type,
      'completed' as status,
      p.date as paid_at, p.created_at
    FROM payments p
    LEFT JOIN bills b ON p.bill_id = b.id
    LEFT JOIN patients pt ON b.patient_id = pt.id AND pt.tenant_id = p.tenant_id
    WHERE p.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];

  if (search) {
    sql += ' AND (pt.name LIKE ? OR pt.patient_code LIKE ? OR p.receipt_no LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (payment_method && payment_method !== 'all') {
    sql += ' AND p.payment_method = ?';
    params.push(payment_method);
  }
  if (date_from) { sql += ' AND date(p.created_at) >= ?'; params.push(date_from); }
  if (date_to)   { sql += ' AND date(p.created_at) <= ?'; params.push(date_to); }

  sql += ' ORDER BY p.created_at DESC LIMIT 200';

  try {
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ data: results });
  } catch {
    return c.json({ data: [] });
  }
});

// ─── GET /stats — payment KPI stats ────────────────────────────────────────────
paymentRoutes.get('/stats', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];

  try {
    const batchResults = await db.$client.batch([
      db.$client.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE tenant_id = ? AND date(created_at) = ?"
      ).bind(tenantId, today),
      db.$client.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE tenant_id = ? AND date(created_at) = ? AND (type = 'received' OR type = 'current')"
      ).bind(tenantId, today),
      db.$client.prepare(
        "SELECT COUNT(*) as count FROM payment_gateway_logs WHERE tenant_id = ? AND status = 'pending'"
      ).bind(tenantId),
      db.$client.prepare(
        "SELECT COUNT(*) as count FROM payment_gateway_logs WHERE tenant_id = ? AND status = 'failed'"
      ).bind(tenantId),
      db.$client.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE tenant_id = ? AND date(created_at) = ? AND payment_method = 'cash'"
      ).bind(tenantId, today),
      db.$client.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE tenant_id = ? AND date(created_at) = ? AND payment_method = 'card'"
      ).bind(tenantId, today),
    ]);

    return c.json({
      total_today:     (batchResults[0].results[0] as any)?.total ?? 0,
      completed_today: (batchResults[1].results[0] as any)?.total ?? 0,
      pending_count:   (batchResults[2].results[0] as any)?.count ?? 0,
      failed_count:    (batchResults[3].results[0] as any)?.count ?? 0,
      cash_total:      (batchResults[4].results[0] as any)?.total ?? 0,
      card_total:      (batchResults[5].results[0] as any)?.total ?? 0,
    });
  } catch {
    return c.json({ total_today: 0, completed_today: 0, pending_count: 0, failed_count: 0, cash_total: 0, card_total: 0 });
  }
});

// ─── GET /:id — single payment detail ──────────────────────────────────────────
paymentRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid payment ID' }, 400);

  try {
    const result = await db.$client.prepare(`
      SELECT p.id, p.receipt_no as payment_ref, pt.name as patient_name, pt.patient_code,
        p.amount, COALESCE(p.payment_method, 'cash') as payment_method,
        COALESCE(p.payment_type, p.type, 'received') as payment_type,
        'completed' as status,
        p.date as paid_at, p.created_at,
        p.bill_id, s.name as collected_by
      FROM payments p
      LEFT JOIN bills b ON p.bill_id = b.id
      LEFT JOIN patients pt ON b.patient_id = pt.id AND pt.tenant_id = p.tenant_id
      LEFT JOIN staff s ON p.received_by = s.id
      WHERE p.id = ? AND p.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!result) return c.json({ error: 'Payment not found' }, 404);
    return c.json({ data: result });
  } catch {
    return c.json({ error: 'Failed to fetch payment' }, 500);
  }
});

// Staff roles allowed to initiate payments
const PAYMENT_STAFF_ROLES = ['hospital_admin', 'reception', 'accountant'];

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
// Initiates bKash or Nagad payment, returns redirect URL for the patient.
paymentRoutes.post('/initiate', zValidator('json', initiatePaymentSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);
  const role     = c.get('role');
  if (!role || !PAYMENT_STAFF_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Only authorized staff can initiate payments' });
  }
  const data     = c.req.valid('json');

  // Verify bill belongs to this tenant and isn't already paid
  const bill = await db.$client.prepare(
    'SELECT id, total, paid, status FROM bills WHERE id = ? AND tenant_id = ?',
  ).bind(data.billId, tenantId).first<{ id: number; total: number; paid: number; status: string }>();
  if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
  if (bill.status === 'paid') throw new HTTPException(400, { message: 'Bill is already fully paid' });

  const outstanding = bill.total - bill.paid;
  if (data.amount > outstanding + 0.01) {  // 0.01 tolerance for float rounding
    throw new HTTPException(400, { message: `Amount ৳${data.amount} exceeds outstanding ৳${outstanding.toFixed(2)}` });
  }

  const gateway = createPaymentGateway(data.gateway as GatewayName, c.env);

  try {
    const result = await gateway.initiate({
      billId: data.billId,
      amount: data.amount,
      callbackUrl: data.callbackUrl,
    });

    // Log the initiation in gateway_logs
    await db.$client.prepare(`
      INSERT INTO payment_gateway_logs
        (tenant_id, bill_id, gateway, payment_id, amount, status, initiated_by)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).bind(tenantId, data.billId, data.gateway, result.paymentId, data.amount, userId).run();

    return c.json({
      paymentId:   result.paymentId,
      redirectUrl: result.redirectUrl,
      gateway:     data.gateway,
      amount:      data.amount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Gateway error';
    throw new HTTPException(502, { message: `Payment gateway error: ${msg}` });
  }
});

// ─── POST /api/payments/verify ────────────────────────────────────────────────
// Server-side verification endpoint. After gateway callback redirect,
// staff verifies the payment from dashboard (OR patient lands on a page that auto-calls this).
// This is a POST (not GET) to prevent accidental replays.
const VALID_GATEWAYS = ['bkash', 'nagad'];

paymentRoutes.post('/verify', zValidator('json', verifyPaymentSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId   = requireUserId(c);

  const { paymentId, gateway } = c.req.valid('json');

  // Find the log entry
  const log = await db.$client.prepare(
    'SELECT * FROM payment_gateway_logs WHERE gateway = ? AND payment_id = ? AND tenant_id = ?',
  ).bind(gateway, paymentId, tenantId).first<{
    id: number; bill_id: number; amount: number; status: string; tenant_id: string;
  }>();

  if (!log) throw new HTTPException(404, { message: 'Payment session not found' });
  if (log.status === 'success') {
    return c.json({ message: 'Already processed', paymentId });
  }

  // Atomic idempotency: UPDATE ... WHERE status = 'pending' — only ONE request can flip it
  const lockResult = await db.$client.prepare(
    `UPDATE payment_gateway_logs SET status = 'verifying', updated_at = datetime('now') WHERE id = ? AND status = 'pending'`,
  ).bind(log.id).run();
  if (!lockResult.meta.changes || lockResult.meta.changes === 0) {
    return c.json({ message: 'Payment already being processed or completed', paymentId });
  }

  // Verify with gateway
  const gw = createPaymentGateway(gateway as GatewayName, c.env);
  let verifyResult;
  try {
    verifyResult = await gw.verify(paymentId);
  } catch (error) {
    await db.$client.prepare(
      `UPDATE payment_gateway_logs SET status = 'failed', raw_response = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(JSON.stringify({ error: String(error) }), log.id).run();
    throw new HTTPException(502, { message: 'Payment verification failed' });
  }

  if (!verifyResult.success) {
    await db.$client.prepare(
      `UPDATE payment_gateway_logs SET status = 'failed', raw_response = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(JSON.stringify(verifyResult), log.id).run();
    return c.json({ success: false, message: verifyResult.message ?? 'Payment not completed' }, 200);
  }

  // Payment confirmed — record the payment on the bill (atomic batch)
  const bill = await db.$client.prepare(
    'SELECT total, paid FROM bills WHERE id = ? AND tenant_id = ?',
  ).bind(log.bill_id, log.tenant_id).first<{ total: number; paid: number }>();

  if (bill) {
    const newPaid = bill.paid + log.amount;
    const status  = newPaid >= bill.total ? 'paid' : 'partially_paid';
    const receiptNo = `${gateway.toUpperCase()}-${verifyResult.transactionId ?? paymentId}`;

    await db.$client.batch([
      db.$client.prepare(`
        INSERT INTO payments (bill_id, amount, type, receipt_no, payment_method, received_by, tenant_id, created_at)
        VALUES (?, ?, 'received', ?, ?, ?, ?, datetime('now'))
      `).bind(log.bill_id, log.amount, receiptNo, gateway, userId, log.tenant_id),
      db.$client.prepare(
        `UPDATE bills SET paid = ?, status = ? WHERE id = ? AND tenant_id = ?`,
      ).bind(newPaid, status, log.bill_id, log.tenant_id),
      db.$client.prepare(
        `UPDATE payment_gateway_logs SET status = 'success', raw_response = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(JSON.stringify(verifyResult), log.id),
    ]);
  }

  return c.json({
    success: true,
    paymentId,
    transactionId: verifyResult.transactionId,
    message: 'Payment completed successfully',
  });
});

// ─── GET /api/payments/logs — list gateway payment logs (admin only) ───────
paymentRoutes.get('/logs', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const role     = c.get('role');
  if (role !== 'hospital_admin') throw new HTTPException(403, { message: 'Admin only' });

  const { billId, gateway, status, from, to } = c.req.query();

  let query = `SELECT l.*, b.invoice_no, p.name as patient_name
    FROM payment_gateway_logs l
    JOIN bills b ON l.bill_id = b.id
    JOIN patients p ON b.patient_id = p.id
    WHERE l.tenant_id = ?`;
  const params: (string | number)[] = [tenantId!];

  if (billId)  { query += ' AND l.bill_id = ?';  params.push(billId); }
  if (gateway) { query += ' AND l.gateway = ?';  params.push(gateway); }
  if (status)  { query += ' AND l.status = ?';   params.push(status); }
  if (from)    { query += ' AND date(l.created_at) >= ?'; params.push(from); }
  if (to)      { query += ' AND date(l.created_at) <= ?'; params.push(to); }

  query += ' ORDER BY l.created_at DESC LIMIT 100';

  try {
    const logs = await db.$client.prepare(query).bind(...params).all();
    return c.json({ logs: logs.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch payment logs' });
  }
});

// ─── GET /api/payments/stub-callback — development-only test endpoint ─────
paymentRoutes.get('/stub-callback', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available' }, 404);
  }
  const { paymentId } = c.req.query();
  return c.json({ message: 'Stub callback received', paymentId, status: 'success' });
});

export default paymentRoutes;
