import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createPaymentGateway, type GatewayName } from '../../lib/payment-gateway';
import { initiatePaymentSchema } from '../../schemas/payment';
import type { Env, Variables } from '../../types';

const paymentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Staff roles allowed to initiate payments
const PAYMENT_STAFF_ROLES = ['hospital_admin', 'reception', 'accountant'];

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
// Initiates bKash or Nagad payment, returns redirect URL for the patient.
paymentRoutes.post('/initiate', zValidator('json', initiatePaymentSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');
  const role     = c.get('role');
  if (!role || !PAYMENT_STAFF_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Only authorized staff can initiate payments' });
  }
  const data     = c.req.valid('json');

  // Verify bill belongs to this tenant and isn't already paid
  const bill = await c.env.DB.prepare(
    'SELECT id, total_amount, paid_amount, status FROM bills WHERE id = ? AND tenant_id = ?',
  ).bind(data.billId, tenantId).first<{ id: number; total_amount: number; paid_amount: number; status: string }>();
  if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
  if (bill.status === 'paid') throw new HTTPException(400, { message: 'Bill is already fully paid' });

  const outstanding = bill.total_amount - bill.paid_amount;
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
    await c.env.DB.prepare(`
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

paymentRoutes.post('/verify', async (c) => {
  const tenantId = c.get('tenantId');
  const userId   = c.get('userId');

  let body: { paymentId?: string; gateway?: string };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  const { paymentId, gateway } = body;
  if (!paymentId || !gateway) {
    throw new HTTPException(400, { message: 'paymentId and gateway are required' });
  }
  if (!VALID_GATEWAYS.includes(gateway)) {
    throw new HTTPException(400, { message: `Invalid gateway: ${gateway}` });
  }

  // Find the log entry
  const log = await c.env.DB.prepare(
    'SELECT * FROM payment_gateway_logs WHERE gateway = ? AND payment_id = ? AND tenant_id = ?',
  ).bind(gateway, paymentId, tenantId).first<{
    id: number; bill_id: number; amount: number; status: string; tenant_id: string;
  }>();

  if (!log) throw new HTTPException(404, { message: 'Payment session not found' });
  if (log.status === 'success') {
    return c.json({ message: 'Already processed', paymentId });
  }

  // Atomic idempotency: UPDATE ... WHERE status = 'pending' — only ONE request can flip it
  const lockResult = await c.env.DB.prepare(
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
    await c.env.DB.prepare(
      `UPDATE payment_gateway_logs SET status = 'failed', raw_response = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(JSON.stringify({ error: String(error) }), log.id).run();
    throw new HTTPException(502, { message: 'Payment verification failed' });
  }

  if (!verifyResult.success) {
    await c.env.DB.prepare(
      `UPDATE payment_gateway_logs SET status = 'failed', raw_response = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(JSON.stringify(verifyResult), log.id).run();
    return c.json({ success: false, message: verifyResult.message ?? 'Payment not completed' }, 200);
  }

  // Payment confirmed — record the payment on the bill (atomic batch)
  const bill = await c.env.DB.prepare(
    'SELECT total_amount, paid_amount FROM bills WHERE id = ? AND tenant_id = ?',
  ).bind(log.bill_id, log.tenant_id).first<{ total_amount: number; paid_amount: number }>();

  if (bill) {
    const newPaid = bill.paid_amount + log.amount;
    const status  = newPaid >= bill.total_amount ? 'paid' : 'partially_paid';
    const receiptNo = `${gateway.toUpperCase()}-${verifyResult.transactionId ?? paymentId}`;

    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO payments (bill_id, amount, type, receipt_no, payment_method, received_by, tenant_id, created_at)
        VALUES (?, ?, 'received', ?, ?, ?, ?, datetime('now'))
      `).bind(log.bill_id, log.amount, receiptNo, gateway, userId, log.tenant_id),
      c.env.DB.prepare(
        `UPDATE bills SET paid_amount = ?, status = ? WHERE id = ? AND tenant_id = ?`,
      ).bind(newPaid, status, log.bill_id, log.tenant_id),
      c.env.DB.prepare(
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
  const tenantId = c.get('tenantId');
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
    const logs = await c.env.DB.prepare(query).bind(...params).all();
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
