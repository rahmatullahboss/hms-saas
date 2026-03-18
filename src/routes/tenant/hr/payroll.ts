import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import {
  createSalaryHeadSchema,
  updateSalaryHeadSchema,
  setSalaryStructureSchema,
  createPayrollRunSchema,
  payrollListQuerySchema,
} from '../../../schemas/hr';

const payrollRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ═══════════════════════════════════════════════════════════════════════
// SALARY HEADS (Basic, HRA, PF Deduction, Tax, etc.)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/hr/payroll/salary-heads
payrollRoutes.get('/salary-heads', async (c) => {
  const tenantId = requireTenantId(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM hr_salary_heads WHERE tenant_id = ? AND is_active = 1 ORDER BY head_type, head_name'
  ).bind(tenantId).all();

  return c.json({ data: results });
});

// POST /api/hr/payroll/salary-heads
payrollRoutes.post('/salary-heads', zValidator('json', createSalaryHeadSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    INSERT INTO hr_salary_heads (tenant_id, head_name, head_type, is_taxable)
    VALUES (?, ?, ?, ?)
  `).bind(tenantId, data.headName, data.headType, data.isTaxable ? 1 : 0).run();

  return c.json({ message: 'Salary head created', id: result.meta.last_row_id }, 201);
});

// PUT /api/hr/payroll/salary-heads/:id
payrollRoutes.put('/salary-heads/:id', zValidator('json', updateSalaryHeadSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM hr_salary_heads WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Salary head not found' });

  await c.env.DB.prepare(`
    UPDATE hr_salary_heads
    SET head_name = ?, head_type = ?, is_taxable = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(
    data.headName ?? existing.head_name,
    data.headType ?? existing.head_type,
    data.isTaxable !== undefined ? (data.isTaxable ? 1 : 0) : existing.is_taxable,
    id,
    tenantId,
  ).run();

  return c.json({ message: 'Salary head updated' });
});

// DELETE /api/hr/payroll/salary-heads/:id (soft delete)
payrollRoutes.delete('/salary-heads/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));

  const result = await c.env.DB.prepare(
    'UPDATE hr_salary_heads SET is_active = 0 WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();
  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Salary head not found' });

  return c.json({ message: 'Salary head deactivated' });
});

// ═══════════════════════════════════════════════════════════════════════
// STAFF SALARY STRUCTURE
// ═══════════════════════════════════════════════════════════════════════

// GET /api/hr/payroll/structure/:staffId
payrollRoutes.get('/structure/:staffId', async (c) => {
  const tenantId = requireTenantId(c);
  const staffId = Number(c.req.param('staffId'));

  const { results } = await c.env.DB.prepare(`
    SELECT ss.*, sh.head_name, sh.head_type
    FROM hr_staff_salary_structure ss
    JOIN hr_salary_heads sh ON ss.salary_head_id = sh.id
    WHERE ss.tenant_id = ? AND ss.staff_id = ? AND ss.is_active = 1
    ORDER BY sh.head_type, sh.head_name
  `).bind(tenantId, staffId).all();

  // Calculate totals
  let totalEarning = 0;
  let totalDeduction = 0;
  for (const item of results as { head_type: string; amount: number }[]) {
    if (item.head_type === 'earning') totalEarning += item.amount;
    else totalDeduction += item.amount;
  }

  return c.json({
    data: results,
    summary: {
      totalEarning,
      totalDeduction,
      netPay: totalEarning - totalDeduction,
    },
  });
});

// POST /api/hr/payroll/structure — Set/replace salary structure for a staff member
payrollRoutes.post('/structure', zValidator('json', setSalaryStructureSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { staffId, items } = c.req.valid('json');

  // Atomic: delete old structure + insert new
  const stmts = [
    c.env.DB.prepare(
      'DELETE FROM hr_staff_salary_structure WHERE tenant_id = ? AND staff_id = ?'
    ).bind(tenantId, staffId),
    ...items.map((item) =>
      c.env.DB.prepare(`
        INSERT INTO hr_staff_salary_structure (tenant_id, staff_id, salary_head_id, amount, calculation_type)
        VALUES (?, ?, ?, ?, ?)
      `).bind(tenantId, staffId, item.salaryHeadId, item.amount, item.calculationType)
    ),
  ];

  await c.env.DB.batch(stmts);

  return c.json({ message: 'Salary structure updated' });
});

// ═══════════════════════════════════════════════════════════════════════
// PAYROLL RUNS (Monthly batch processing)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/hr/payroll/runs?page=&limit=
payrollRoutes.get('/runs', zValidator('query', payrollListQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const query = c.req.valid('query');
  const offset = (query.page - 1) * query.limit;

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM hr_payroll_runs
    WHERE tenant_id = ?
    ORDER BY run_month DESC
    LIMIT ? OFFSET ?
  `).bind(tenantId, query.limit, offset).all();

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM hr_payroll_runs WHERE tenant_id = ?'
  ).bind(tenantId).first<{ total: number }>();

  return c.json({
    data: results,
    pagination: { page: query.page, limit: query.limit, total: countRow?.total ?? 0 },
  });
});

// GET /api/hr/payroll/runs/:id
payrollRoutes.get('/runs/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));

  const run = await c.env.DB.prepare(
    'SELECT * FROM hr_payroll_runs WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!run) throw new HTTPException(404, { message: 'Payroll run not found' });

  const { results: payslips } = await c.env.DB.prepare(`
    SELECT ps.*, s.name as staff_name, s.position, s.bank_account
    FROM hr_payslips ps
    JOIN staff s ON ps.staff_id = s.id
    WHERE ps.payroll_run_id = ? AND ps.tenant_id = ?
    ORDER BY s.name
  `).bind(id, tenantId).all();

  return c.json({ data: { ...run, payslips } });
});

// POST /api/hr/payroll/runs — Create DRAFT payroll run + generate payslips
payrollRoutes.post('/runs', zValidator('json', createPayrollRunSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { runMonth } = c.req.valid('json');

  // Idempotent: check if run already exists
  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM hr_payroll_runs WHERE tenant_id = ? AND run_month = ?'
  ).bind(tenantId, runMonth).first();

  if (existing) {
    return c.json({ data: existing, message: 'Payroll run already exists for this month' });
  }

  // 1. Create the payroll run
  const runResult = await c.env.DB.prepare(`
    INSERT INTO hr_payroll_runs (tenant_id, run_month, status, created_by)
    VALUES (?, ?, 'draft', ?)
  `).bind(tenantId, runMonth, userId).run();

  const payrollRunId = runResult.meta.last_row_id;

  // 2. Fetch all active staff with salary structures
  const { results: structures } = await c.env.DB.prepare(`
    SELECT ss.staff_id, ss.salary_head_id, ss.amount, sh.head_type, sh.head_name
    FROM hr_staff_salary_structure ss
    JOIN hr_salary_heads sh ON ss.salary_head_id = sh.id
    JOIN staff s ON ss.staff_id = s.id
    WHERE ss.tenant_id = ? AND ss.is_active = 1 AND s.status = 'active'
    ORDER BY ss.staff_id, sh.head_type
  `).bind(tenantId).all() as { results: { staff_id: number; salary_head_id: number; amount: number; head_type: string; head_name: string }[] };

  if (!structures || structures.length === 0) {
    return c.json({
      message: 'Payroll run created but no staff with salary structure found',
      id: payrollRunId,
    }, 201);
  }

  // 3. Group by staff
  const staffMap = new Map<number, { earning: number; deduction: number; components: { head: string; type: string; amount: number }[] }>();

  for (const row of structures) {
    if (!staffMap.has(row.staff_id)) {
      staffMap.set(row.staff_id, { earning: 0, deduction: 0, components: [] });
    }
    const entry = staffMap.get(row.staff_id)!;
    entry.components.push({ head: row.head_name, type: row.head_type, amount: row.amount });
    if (row.head_type === 'earning') entry.earning += row.amount;
    else entry.deduction += row.amount;
  }

  // 4. Generate payslips in batch
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const payslipStmts = [];
  for (const [staffId, data] of staffMap.entries()) {
    const net = data.earning - data.deduction;
    totalGross += data.earning;
    totalDeductions += data.deduction;
    totalNet += net;

    payslipStmts.push(
      c.env.DB.prepare(`
        INSERT INTO hr_payslips (tenant_id, payroll_run_id, staff_id, month, total_earning, total_deduction, net_pay, breakdown_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(tenantId, payrollRunId, staffId, runMonth, data.earning, data.deduction, net, JSON.stringify({ components: data.components }))
    );
  }

  // Update run summary
  payslipStmts.push(
    c.env.DB.prepare(`
      UPDATE hr_payroll_runs
      SET total_employees = ?, total_gross = ?, total_deductions = ?, total_net = ?
      WHERE id = ?
    `).bind(staffMap.size, totalGross, totalDeductions, totalNet, payrollRunId)
  );

  // Batch insert (chunk to 50 for D1 limits)
  const chunkSize = 50;
  for (let i = 0; i < payslipStmts.length; i += chunkSize) {
    await c.env.DB.batch(payslipStmts.slice(i, i + chunkSize));
  }

  return c.json({
    message: `Payroll generated for ${staffMap.size} employees`,
    id: payrollRunId,
    summary: { totalEmployees: staffMap.size, totalGross, totalDeductions, totalNet },
  }, 201);
});

// POST /api/hr/payroll/runs/:id/lock — DRAFT → LOCKED
payrollRoutes.post('/runs/:id/lock', async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));
  const userId = requireUserId(c);

  const run = await c.env.DB.prepare(
    'SELECT status FROM hr_payroll_runs WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<{ status: string }>();

  if (!run) throw new HTTPException(404, { message: 'Payroll run not found' });
  if (run.status !== 'draft') throw new HTTPException(409, { message: `Cannot lock run with status: ${run.status}` });

  await c.env.DB.prepare(`
    UPDATE hr_payroll_runs
    SET status = 'locked', locked_by = ?, locked_on = datetime('now')
    WHERE id = ?
  `).bind(userId, id).run();

  return c.json({ message: 'Payroll run locked' });
});

// POST /api/hr/payroll/runs/:id/approve — LOCKED → APPROVED
payrollRoutes.post('/runs/:id/approve', async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));
  const userId = requireUserId(c);

  const run = await c.env.DB.prepare(
    'SELECT status FROM hr_payroll_runs WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<{ status: string }>();

  if (!run) throw new HTTPException(404, { message: 'Payroll run not found' });
  if (run.status !== 'locked') throw new HTTPException(409, { message: `Cannot approve run with status: ${run.status}` });

  await c.env.DB.prepare(`
    UPDATE hr_payroll_runs
    SET status = 'approved', approved_by = ?, approved_on = datetime('now')
    WHERE id = ?
  `).bind(userId, id).run();

  return c.json({ message: 'Payroll run approved' });
});

// ─── Individual Payslip Lookup ────────────────────────────────────────────────

// GET /api/hr/payroll/payslips/:staffId?month=
payrollRoutes.get('/payslips/:staffId', async (c) => {
  const tenantId = requireTenantId(c);
  const staffId = Number(c.req.param('staffId'));
  const month = c.req.query('month');

  let query = `
    SELECT ps.*, pr.run_month, pr.status as run_status
    FROM hr_payslips ps
    JOIN hr_payroll_runs pr ON ps.payroll_run_id = pr.id
    WHERE ps.tenant_id = ? AND ps.staff_id = ?
  `;
  const params: (string | number)[] = [Number(tenantId), staffId];

  if (month) {
    query += ' AND ps.month = ?';
    params.push(month);
  }

  query += ' ORDER BY ps.month DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ data: results });
});

// ─── HR Dashboard Stats ───────────────────────────────────────────────────────

// GET /api/hr/payroll/dashboard
payrollRoutes.get('/dashboard', async (c) => {
  const tenantId = requireTenantId(c);

  const totalStaff = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM staff WHERE tenant_id = ? AND status = 'active'"
  ).bind(tenantId).first<{ count: number }>();

  const today = new Date().toISOString().split('T')[0];
  const presentToday = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM hr_attendance WHERE tenant_id = ? AND date = ? AND status IN ('present', 'late')"
  ).bind(tenantId, today).first<{ count: number }>();

  const pendingLeaves = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM hr_leave_requests WHERE tenant_id = ? AND status = 'pending'"
  ).bind(tenantId).first<{ count: number }>();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const latestRun = await c.env.DB.prepare(
    'SELECT * FROM hr_payroll_runs WHERE tenant_id = ? AND run_month = ?'
  ).bind(tenantId, currentMonth).first();

  return c.json({
    totalStaff: totalStaff?.count ?? 0,
    presentToday: presentToday?.count ?? 0,
    pendingLeaves: pendingLeaves?.count ?? 0,
    currentPayrollRun: latestRun ?? null,
  });
});

export default payrollRoutes;
