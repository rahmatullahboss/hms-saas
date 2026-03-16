import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const settlements = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET / — list settlements ────────────────────────────────────────────────

settlements.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patient_id');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const perPage = Math.min(200, Math.max(1, parseInt(c.req.query('per_page') || '50')));
  const offset = (page - 1) * perPage;

  let sql = `
    SELECT s.*, p.name as patient_name, p.patient_code
    FROM billing_settlements s
    JOIN patients p ON s.patient_id = p.id AND p.tenant_id = s.tenant_id
    WHERE s.tenant_id = ? AND s.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];
  if (patientId) { sql += ' AND s.patient_id = ?'; params.push(patientId); }
  sql += ` ORDER BY s.created_at DESC LIMIT ${perPage} OFFSET ${offset}`;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ settlements: results, page, per_page: perPage });
});

// ─── GET /pending — credit bills awaiting payment ────────────────────────────

settlements.get('/pending', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patient_id');

  let sql = `
    SELECT b.*, p.name as patient_name, p.patient_code,
      (b.total - b.paid) as due_amount
    FROM bills b
    JOIN patients p ON b.patient_id = p.id AND p.tenant_id = b.tenant_id
    WHERE b.tenant_id = ? AND b.status IN ('open', 'partially_paid')
      AND b.total > b.paid
  `;
  const params: (string | number)[] = [tenantId];
  if (patientId) { sql += ' AND b.patient_id = ?'; params.push(patientId); }
  sql += ' ORDER BY b.created_at ASC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ pending_bills: results });
});

// ─── GET /patient/:patientId/info — settlement summary for a patient ─────────

settlements.get('/patient/:patientId/info', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = parseInt(c.req.param('patientId'));

  const patient = await c.env.DB.prepare(
    'SELECT id, name, patient_code, mobile FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  const { results: pendingBills } = await c.env.DB.prepare(`
    SELECT id, invoice_no, total, paid,
      (total - paid) as due_amount, created_at, status
    FROM bills WHERE patient_id = ? AND tenant_id = ? AND status IN ('open', 'partially_paid')
    ORDER BY created_at ASC
  `).bind(patientId, tenantId).all();

  const deposit = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'adjustment') THEN amount ELSE 0 END), 0) as balance
    FROM billing_deposits WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
  `).bind(tenantId, patientId).first<{ balance: number }>();

  const totalDue = (pendingBills as any[]).reduce((sum, b: any) => sum + (b.due_amount || 0), 0);

  return c.json({
    patient,
    pending_bills: pendingBills,
    deposit_balance: deposit?.balance || 0,
    total_due: totalDue,
    net_payable: Math.max(0, totalDue - (deposit?.balance || 0)),
  });
});

// ─── POST / — create settlement ─────────────────────────────────────────────

settlements.post('/', zValidator('json', z.object({
  patient_id: z.number().int().positive(),
  bill_ids: z.array(z.number().int().positive()).min(1),
  paid_amount: z.number().min(0).default(0),
  deposit_deducted: z.number().min(0).default(0),
  discount_amount: z.number().min(0).default(0),
  payment_mode: z.string().default('cash'),
  remarks: z.string().optional(),
})), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Validate all bills belong to patient
  const placeholders = data.bill_ids.map(() => '?').join(',');
  const { results: bills } = await c.env.DB.prepare(
    `SELECT id, total, paid, patient_id FROM bills WHERE id IN (${placeholders}) AND tenant_id = ?`
  ).bind(...data.bill_ids, tenantId).all<any>();

  if (bills.length !== data.bill_ids.length) throw new HTTPException(400, { message: 'Some bills not found' });
  if (bills.some(b => b.patient_id !== data.patient_id)) throw new HTTPException(400, { message: 'Bill does not belong to patient' });

  const totalDue = bills.reduce((sum, b) => sum + (b.total - b.paid), 0);
  const totalPayment = data.paid_amount + data.deposit_deducted + data.discount_amount;
  // P1#6: Round to 2 decimals for reliable float comparison
  const roundedPayment = Math.round(totalPayment * 100) / 100;
  const roundedDue = Math.round(totalDue * 100) / 100;
  if (roundedPayment > roundedDue) throw new HTTPException(400, { message: `Overpayment: due ${roundedDue}, paying ${roundedPayment}` });

  // Validate deposit balance
  if (data.deposit_deducted > 0) {
    const dep = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'adjustment') THEN amount ELSE 0 END), 0) as balance
      FROM billing_deposits WHERE tenant_id = ? AND patient_id = ? AND is_active = 1
    `).bind(tenantId, data.patient_id).first<{ balance: number }>();
    if (data.deposit_deducted > (dep?.balance || 0)) {
      throw new HTTPException(400, { message: `Insufficient deposit: available ${dep?.balance || 0}` });
    }
  }

  const receiptNo = await getNextSequence(c.env.DB, String(tenantId), 'settlement', 'STL');

  const stlResult = await c.env.DB.prepare(`
    INSERT INTO billing_settlements (tenant_id, patient_id, settlement_receipt_no, payable_amount, paid_amount,
      deposit_deducted, discount_amount, payment_mode, remarks, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.patient_id, receiptNo, totalDue, data.paid_amount,
    data.deposit_deducted, data.discount_amount, data.payment_mode, data.remarks || null, userId).run();

  const stlId = stlResult.meta.last_row_id;

  // P0#3: Batch all bill updates + deposit deduction atomically
  const batchStmts: any[] = [];
  let remaining = totalPayment;
  const sorted = bills.sort((a, b) => a.id - b.id);

  for (const bill of sorted) {
    if (remaining <= 0.01) break;
    const due = bill.total - bill.paid;
    const payment = Math.min(due, remaining);
    const newPaid = Math.round((bill.paid + payment) * 100) / 100;
    const newStatus = newPaid >= bill.total ? 'paid' : 'partially_paid';
    remaining = Math.round((remaining - payment) * 100) / 100;

    batchStmts.push(
      c.env.DB.prepare(`
        UPDATE bills SET paid = ?, status = ?, settlement_id = ? WHERE id = ? AND tenant_id = ?
      `).bind(newPaid, newStatus, stlId, bill.id, tenantId)
    );
  }

  // Deduct deposit if used
  if (data.deposit_deducted > 0) {
    const depReceiptNo = await getNextSequence(c.env.DB, String(tenantId), 'deposit_adj', 'DAD');
    batchStmts.push(
      c.env.DB.prepare(`
        INSERT INTO billing_deposits (tenant_id, patient_id, deposit_receipt_no, amount, transaction_type, remarks, created_by)
        VALUES (?, ?, ?, ?, 'adjustment', 'Settlement deduction', ?)
      `).bind(tenantId, data.patient_id, depReceiptNo, data.deposit_deducted, userId)
    );
  }

  if (batchStmts.length > 0) await c.env.DB.batch(batchStmts);

  return c.json({ id: stlId, receipt_no: receiptNo, message: 'Settlement created' }, 201);
});

export default settlements;
