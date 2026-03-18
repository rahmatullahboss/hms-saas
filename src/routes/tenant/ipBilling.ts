import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getDb } from '../../db';


const ipBilling = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /patients — list IP patients with billing summary (used by frontend) ─
ipBilling.get('/patients', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const search = c.req.query('search');
  const billingStatus = c.req.query('billing_status');

  let sql = `
    SELECT
      a.id as admission_id, a.admission_no as admission_number,
      a.patient_id, p.name as patient_name, p.patient_code,
      b.ward_name, b.bed_number, s.name as doctor_name,
      a.admitted_at as admitted_date, a.expected_discharge,
      COALESCE(prov.total_charges, 0) as total_charges,
      COALESCE(pay.total_paid, 0) as total_paid,
      COALESCE(prov.total_charges, 0) - COALESCE(pay.total_paid, 0) as balance,
      CASE
        WHEN COALESCE(pay.total_paid, 0) >= COALESCE(prov.total_charges, 0) AND COALESCE(prov.total_charges, 0) > 0 THEN 'settled'
        WHEN COALESCE(pay.total_paid, 0) > 0 THEN 'partial'
        ELSE 'pending'
      END as billing_status
    FROM admissions a
    JOIN patients p ON a.patient_id = p.id AND p.tenant_id = a.tenant_id
    LEFT JOIN beds b ON a.bed_id = b.id
    LEFT JOIN staff s ON a.doctor_id = s.id
    LEFT JOIN (
      SELECT admission_id, SUM(total_amount) as total_charges
      FROM billing_provisional_items
      WHERE tenant_id = ? AND is_active = 1
      GROUP BY admission_id
    ) prov ON prov.admission_id = a.id
    LEFT JOIN (
      SELECT bi.id as bill_id, SUM(pay2.amount) as total_paid
      FROM bills bi
      LEFT JOIN payments pay2 ON pay2.bill_id = bi.id AND pay2.tenant_id = bi.tenant_id
      WHERE bi.tenant_id = ?
      GROUP BY bi.id
    ) pay ON pay.bill_id = a.id
    WHERE a.tenant_id = ? AND a.status = 'admitted'
  `;
  const params: (string | number)[] = [tenantId, tenantId, tenantId];
  if (search) { sql += ' AND (p.name LIKE ? OR p.patient_code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY a.admitted_at DESC';

  try {
    const { results } = await db.$client.prepare(sql).bind(...params).all();

    // Apply billing_status filter in JS (derived column)
    const filtered = billingStatus ? results.filter((r: any) => r.billing_status === billingStatus) : results;
    return c.json({ data: filtered });
  } catch {
    return c.json({ data: [] });
  }
});

// ─── GET /stats — IP billing summary stats (used by frontend KPI cards) ──────
ipBilling.get('/stats', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];

  try {
    const batchResults = await db.$client.batch([
      db.$client.prepare(
        "SELECT COUNT(*) as count FROM admissions WHERE tenant_id = ? AND status = 'admitted'"
      ).bind(tenantId),
      db.$client.prepare(
        `SELECT COUNT(DISTINCT a.id) as count FROM admissions a
         LEFT JOIN billing_provisional_items bp ON bp.admission_id = a.id AND bp.tenant_id = a.tenant_id
         WHERE a.tenant_id = ? AND a.status = 'admitted' AND bp.bill_status = 'provisional'`
      ).bind(tenantId),
      db.$client.prepare(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM billing_provisional_items
         WHERE tenant_id = ? AND date(created_at) = ? AND is_active = 1`
      ).bind(tenantId, today),
      db.$client.prepare(
        `SELECT COALESCE(SUM(bi.total), 0) as total FROM bills bi
         JOIN admissions a ON bi.patient_id = a.patient_id AND bi.tenant_id = a.tenant_id
         WHERE bi.tenant_id = ? AND date(bi.created_at) = ? AND bi.status = 'paid'`
      ).bind(tenantId, today),
    ]);

    return c.json({
      total_inpatients: (batchResults[0].results[0] as any)?.count ?? 0,
      pending_billing: (batchResults[1].results[0] as any)?.count ?? 0,
      total_charges_today: (batchResults[2].results[0] as any)?.total ?? 0,
      settled_today: (batchResults[3].results[0] as any)?.total ?? 0,
    });
  } catch {
    return c.json({ total_inpatients: 0, pending_billing: 0, total_charges_today: 0, settled_today: 0 });
  }
});

// ─── GET /admitted — list admitted patients for IP billing ────────────────────

ipBilling.get('/admitted', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const search = c.req.query('search');

  let sql = `
    SELECT a.*, p.name as patient_name, p.patient_code, p.mobile,
      b.ward_name, b.bed_number, s.name as doctor_name
    FROM admissions a
    JOIN patients p ON a.patient_id = p.id AND p.tenant_id = a.tenant_id
    LEFT JOIN beds b ON a.bed_id = b.id
    LEFT JOIN staff s ON a.doctor_id = s.id
    WHERE a.tenant_id = ? AND a.status = 'admitted'
  `;
  const params: (string | number)[] = [tenantId];
  if (search) { sql += ' AND (p.name LIKE ? OR p.patient_code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY a.admitted_at DESC';

  const { results } = await db.$client.prepare(sql).bind(...params).all();
  return c.json({ patients: results });
});

// ─── GET /pending/:admissionId — pending charges for an admission ────────────

ipBilling.get('/pending/:admissionId', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const admissionId = parseInt(c.req.param('admissionId'));

  // Get provisional items
  const { results: items } = await db.$client.prepare(`
    SELECT * FROM billing_provisional_items
    WHERE tenant_id = ? AND admission_id = ? AND bill_status = 'provisional' AND is_active = 1
    ORDER BY created_at ASC
  `).bind(tenantId, admissionId).all();

  // Calculate bed charges
  const admission = await db.$client.prepare(`
    SELECT a.admitted_at, a.bed_id, b.rate as bed_rate
    FROM admissions a LEFT JOIN beds b ON a.bed_id = b.id
    WHERE a.id = ? AND a.tenant_id = ? AND a.status = 'admitted'
  `).bind(admissionId, tenantId).first<any>();

  let bedCharges = null;
  if (admission?.bed_rate) {
    const admittedDate = new Date(admission.admitted_at);
    const now = new Date();
    const days = Math.max(1, Math.ceil((now.getTime() - admittedDate.getTime()) / (1000 * 60 * 60 * 24)));
    bedCharges = { days, rate_per_day: admission.bed_rate, total: days * admission.bed_rate };
  }

  const provisionalTotal = (items as any[]).reduce((sum, i: any) => sum + (i.total_amount || 0), 0);
  const bedTotal = bedCharges?.total || 0;

  // Get deposit balance
  const deposit = await db.$client.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'adjustment') THEN amount ELSE 0 END), 0) as balance
    FROM billing_deposits WHERE tenant_id = ? AND patient_id = (SELECT patient_id FROM admissions WHERE id = ? AND tenant_id = ?) AND is_active = 1
  `).bind(tenantId, admissionId, tenantId).first<{ balance: number }>();

  return c.json({
    items,
    bed_charges: bedCharges,
    summary: {
      provisional_total: provisionalTotal,
      bed_total: bedTotal,
      grand_total: provisionalTotal + bedTotal,
      deposit_balance: deposit?.balance || 0,
      net_payable: Math.max(0, provisionalTotal + bedTotal - (deposit?.balance || 0)),
    },
  });
});

// ─── POST /provisional — add provisional charge ─────────────────────────────

ipBilling.post('/provisional', zValidator('json', z.object({
  patient_id: z.number().int().positive(),
  admission_id: z.number().int().positive().optional(),
  visit_id: z.number().int().positive().optional(),
  item_category: z.string().min(1),
  item_name: z.string().min(1),
  department: z.string().optional(),
  unit_price: z.number().min(0),
  quantity: z.number().int().positive().default(1),
  discount_percent: z.number().min(0).max(100).default(0),
  doctor_id: z.number().int().positive().optional(),
  doctor_name: z.string().optional(),
  reference_id: z.number().int().positive().optional(),
})), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const discountAmt = data.unit_price * data.quantity * (data.discount_percent / 100);
  const totalAmt = data.unit_price * data.quantity - discountAmt;

  const result = await db.$client.prepare(`
    INSERT INTO billing_provisional_items (tenant_id, patient_id, admission_id, visit_id, item_category, item_name, department,
      unit_price, quantity, discount_percent, discount_amount, total_amount, doctor_id, doctor_name, reference_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.patient_id, data.admission_id || null, data.visit_id || null, data.item_category, data.item_name,
    data.department || null, data.unit_price, data.quantity, data.discount_percent, discountAmt, totalAmt,
    data.doctor_id || null, data.doctor_name || null, data.reference_id || null, userId).run();

  return c.json({ id: result.meta.last_row_id, total_amount: totalAmt, message: 'Provisional charge added' }, 201);
});

// ─── POST /discharge-bill — finalize discharge bill ──────────────────────────

ipBilling.post('/discharge-bill', zValidator('json', z.object({
  admission_id: z.number().int().positive(),
  discount_percent: z.number().min(0).max(100).default(0),
  deposit_deducted: z.number().min(0).default(0),
  payment_mode: z.string().default('cash'),
  paid_amount: z.number().min(0).default(0),
  remarks: z.string().optional(),
})), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const admission = await db.$client.prepare(
    "SELECT * FROM admissions WHERE id = ? AND tenant_id = ? AND status = 'admitted'"
  ).bind(data.admission_id, tenantId).first<any>();
  if (!admission) throw new HTTPException(404, { message: 'Active admission not found' });

  // Get provisional items
  const { results: provItems } = await db.$client.prepare(
    "SELECT * FROM billing_provisional_items WHERE tenant_id = ? AND admission_id = ? AND bill_status = 'provisional' AND is_active = 1"
  ).bind(tenantId, data.admission_id).all<any>();

  const subtotal = provItems.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const discountAmt = subtotal * (data.discount_percent / 100);
  const totalAmt = subtotal - discountAmt;
  const netPayable = totalAmt - data.deposit_deducted;
  const billStatus = data.paid_amount >= netPayable ? 'paid' : (data.paid_amount > 0 ? 'partially_paid' : 'open');

  const invoiceNo = await getNextSequence(c.env.DB, String(tenantId), 'invoice', 'INV');

  // Create bill
  const billResult = await db.$client.prepare(`
    INSERT INTO bills (patient_id, visit_id, invoice_no, subtotal, discount, total, paid, status, tenant_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(admission.patient_id, admission.visit_id || null, invoiceNo, subtotal, discountAmt, totalAmt, data.paid_amount, billStatus, tenantId, userId).run();

  const billId = billResult.meta.last_row_id;

  // P0#4: Batch all remaining writes atomically
  const batchStmts: any[] = [];

  // Convert provisional items to invoice items
  for (const item of provItems) {
    batchStmts.push(
      db.$client.prepare(`
        INSERT INTO invoice_items (bill_id, item_category, description, quantity, unit_price, line_total, reference_id, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(billId, item.item_category, item.item_name, item.quantity, item.unit_price, item.total_amount, item.reference_id, tenantId)
    );
    batchStmts.push(
      db.$client.prepare("UPDATE billing_provisional_items SET bill_status = 'billed', billed_bill_id = ? WHERE id = ?").bind(billId, item.id)
    );
  }

  // Deduct deposit if used
  if (data.deposit_deducted > 0) {
    const receiptNo = await getNextSequence(c.env.DB, String(tenantId), 'deposit_adj', 'DAD');
    batchStmts.push(
      db.$client.prepare(`
        INSERT INTO billing_deposits (tenant_id, patient_id, deposit_receipt_no, amount, transaction_type, reference_bill_id, remarks, created_by)
        VALUES (?, ?, ?, ?, 'adjustment', ?, 'Discharge bill deduction', ?)
      `).bind(tenantId, admission.patient_id, receiptNo, data.deposit_deducted, billId, userId)
    );
  }

  // Update admission status
  batchStmts.push(
    db.$client.prepare(`
      UPDATE admissions SET status = 'discharged', discharged_at = datetime('now') WHERE id = ? AND tenant_id = ?
    `).bind(data.admission_id, tenantId)
  );

  // Free bed
  if (admission.bed_id) {
    batchStmts.push(
      db.$client.prepare("UPDATE beds SET is_occupied = 0 WHERE id = ? AND tenant_id = ?").bind(admission.bed_id, tenantId)
    );
  }

  if (batchStmts.length > 0) await db.$client.batch(batchStmts);

  return c.json({ bill_id: billId, invoice_no: invoiceNo, total_amount: totalAmt, paid_amount: data.paid_amount, status: billStatus, message: 'Discharge bill created' }, 201);
});

export default ipBilling;
