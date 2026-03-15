import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';

const deposits = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createDepositSchema = z.object({
  patient_id: z.number().int().positive(),
  amount: z.number().positive(),
  payment_method: z.string().optional(),
  remarks: z.string().optional(),
});

const refundDepositSchema = z.object({
  patient_id: z.number().int().positive(),
  amount: z.number().positive(),
  remarks: z.string().optional(),
});

const adjustDepositSchema = z.object({
  patient_id: z.number().int().positive(),
  amount: z.number().positive(),
  bill_id: z.number().int().positive(),
  remarks: z.string().optional(),
});

// ─── GET / — list deposits ───────────────────────────────────────────────────

deposits.get('/', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const patientId = c.req.query('patient_id');
  const type = c.req.query('type');
  // P3#12: Pagination support
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const perPage = Math.min(200, Math.max(1, parseInt(c.req.query('per_page') || '50')));
  const offset = (page - 1) * perPage;

  let sql = `
    SELECT d.*, p.name as patient_name, p.patient_code
    FROM billing_deposits d
    LEFT JOIN patients p ON d.patient_id = p.id AND p.tenant_id = d.tenant_id
    WHERE d.tenant_id = ? AND d.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];

  if (patientId) { sql += ' AND d.patient_id = ?'; params.push(patientId); }
  if (type) { sql += ' AND d.transaction_type = ?'; params.push(type); }

  sql += ` ORDER BY d.created_at DESC LIMIT ${perPage} OFFSET ${offset}`;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ deposits: results, total: results.length, page, per_page: perPage });
});

// ─── GET /balance/:patientId — patient deposit balance ───────────────────────

deposits.get('/balance/:patientId', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const patientId = parseInt(c.req.param('patientId'));

  const result = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as total_deposits,
      COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END), 0) as total_refunds,
      COALESCE(SUM(CASE WHEN transaction_type = 'adjustment' THEN amount ELSE 0 END), 0) as total_adjustments
    FROM billing_deposits
    WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
  `).bind(tenantId, patientId).first<{
    total_deposits: number; total_refunds: number; total_adjustments: number;
  }>();

  const totalDeposits = result?.total_deposits ?? 0;
  const totalRefunds = result?.total_refunds ?? 0;
  const totalAdjustments = result?.total_adjustments ?? 0;
  const balance = totalDeposits - totalRefunds - totalAdjustments;

  return c.json({
    patient_id: patientId,
    total_deposits: totalDeposits,
    total_refunds: totalRefunds,
    total_adjustments: totalAdjustments,
    balance,
  });
});

// ─── POST / — collect deposit ────────────────────────────────────────────────

deposits.post('/', zValidator('json', createDepositSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  // P2#9: Validate patient belongs to tenant
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  const receiptNo = await getNextSequence(c.env.DB, String(tenantId), 'deposit', 'DEP');

  const result = await c.env.DB.prepare(`
    INSERT INTO billing_deposits (tenant_id, patient_id, deposit_receipt_no, amount, transaction_type, payment_method, remarks, created_by)
    VALUES (?, ?, ?, ?, 'deposit', ?, ?, ?)
  `).bind(tenantId, data.patient_id, receiptNo, data.amount, data.payment_method || null, data.remarks || null, userId).run();

  return c.json({ id: result.meta.last_row_id, receipt_no: receiptNo, message: 'Deposit collected' }, 201);
});

// ─── POST /refund — process refund ───────────────────────────────────────────

deposits.post('/refund', zValidator('json', refundDepositSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  // P2#9: Validate patient belongs to tenant
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  // P0#1: Check balance — we verify again after batch to prevent race conditions
  const balance = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'adjustment') THEN amount ELSE 0 END), 0) as balance
    FROM billing_deposits WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
  `).bind(tenantId, data.patient_id).first<{ balance: number }>();

  if ((balance?.balance ?? 0) < data.amount) {
    throw new HTTPException(400, { message: `Insufficient deposit balance (available: ${balance?.balance ?? 0})` });
  }

  const receiptNo = await getNextSequence(c.env.DB, String(tenantId), 'deposit_refund', 'DRF');

  // P0#1: Use batch to make the refund insert + post-check atomic
  const insertStmt = c.env.DB.prepare(`
    INSERT INTO billing_deposits (tenant_id, patient_id, deposit_receipt_no, amount, transaction_type, remarks, created_by)
    VALUES (?, ?, ?, ?, 'refund', ?, ?)
  `).bind(tenantId, data.patient_id, receiptNo, data.amount, data.remarks || null, userId);

  const postCheckStmt = c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'adjustment') THEN amount ELSE 0 END), 0) as balance
    FROM billing_deposits WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
  `).bind(tenantId, data.patient_id);

  const batchResults = await c.env.DB.batch([insertStmt, postCheckStmt]);
  const postBalance = (batchResults[1] as any).results?.[0]?.balance ?? 0;

  // If balance went negative due to concurrent request, rollback by soft-deleting the refund
  if (postBalance < -0.01) {
    await c.env.DB.prepare(
      'UPDATE billing_deposits SET is_active = 0 WHERE deposit_receipt_no = ? AND tenant_id = ?'
    ).bind(receiptNo, tenantId).run();
    throw new HTTPException(409, { message: 'Concurrent refund detected — insufficient balance. Please retry.' });
  }

  return c.json({ id: batchResults[0].meta.last_row_id, receipt_no: receiptNo, message: 'Refund processed' }, 201);
});

// ─── POST /adjust — adjust deposit against a bill ────────────────────────────

deposits.post('/adjust', zValidator('json', adjustDepositSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  // P2#9: Validate patient belongs to tenant
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  // Check balance
  const balance = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'adjustment') THEN amount ELSE 0 END), 0) as balance
    FROM billing_deposits WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
  `).bind(tenantId, data.patient_id).first<{ balance: number }>();

  if ((balance?.balance ?? 0) < data.amount) {
    throw new HTTPException(400, { message: `Insufficient deposit balance` });
  }

  // Verify bill exists
  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ? AND tenant_id = ?')
    .bind(data.bill_id, tenantId).first();
  if (!bill) throw new HTTPException(404, { message: 'Bill not found' });

  const receiptNo = await getNextSequence(c.env.DB, String(tenantId), 'deposit_adj', 'DAD');

  // P0#1 + P2#11: Atomic adjustment — removed legacy `paid` column update
  const stmts = [
    c.env.DB.prepare(`
      INSERT INTO billing_deposits (tenant_id, patient_id, deposit_receipt_no, amount, transaction_type, reference_bill_id, remarks, created_by)
      VALUES (?, ?, ?, ?, 'adjustment', ?, ?, ?)
    `).bind(tenantId, data.patient_id, receiptNo, data.amount, data.bill_id, data.remarks || 'Deposit adjustment', userId),
    c.env.DB.prepare(`
      UPDATE bills SET paid_amount = paid_amount + ?,
        status = CASE WHEN paid_amount + ? >= total_amount THEN 'paid' ELSE 'partially_paid' END
      WHERE id = ? AND tenant_id = ?
    `).bind(data.amount, data.amount, data.bill_id, tenantId),
  ];

  await c.env.DB.batch(stmts);

  return c.json({ receipt_no: receiptNo, message: 'Deposit adjusted against bill' }, 201);
});

export default deposits;
