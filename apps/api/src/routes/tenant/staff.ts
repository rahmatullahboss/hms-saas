import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createStaffSchema, updateStaffSchema, paySalarySchema } from '../../schemas/staff';
import type { Env, Variables } from '../../types';

const staffRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/staff — list active staff
staffRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const staff = await c.env.DB.prepare(
      'SELECT * FROM staff WHERE tenant_id = ? AND status = ? ORDER BY position, name',
    ).bind(tenantId, 'active').all();
    return c.json({ staff: staff.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch staff' });
  }
});

// GET /api/staff/salary-report?month=YYYY-MM — monthly salary report for all staff
// ⚠ MUST be defined BEFORE /:id to prevent 'salary-report' from matching as :id
staffRoutes.get('/salary-report', async (c) => {
  const tenantId = c.get('tenantId');
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);

  try {
    const report = await c.env.DB.prepare(
      `SELECT s.id, s.name, s.position, s.salary as base_salary,
              sp.bonus, sp.deduction, sp.net_salary, sp.payment_method,
              sp.payment_date, sp.month,
              CASE WHEN sp.id IS NULL THEN 'unpaid' ELSE 'paid' END as status
       FROM staff s
       LEFT JOIN salary_payments sp ON s.id = sp.staff_id AND sp.month = ? AND sp.tenant_id = ?
       WHERE s.tenant_id = ? AND s.status = 'active'
       ORDER BY s.position, s.name`,
    ).bind(month, tenantId, tenantId).all();

    const summary = await c.env.DB.prepare(
      `SELECT COUNT(*) as total_staff,
              SUM(CASE WHEN sp.id IS NOT NULL THEN 1 ELSE 0 END) as paid_count,
              SUM(COALESCE(sp.net_salary, 0)) as total_paid
       FROM staff s
       LEFT JOIN salary_payments sp ON s.id = sp.staff_id AND sp.month = ? AND sp.tenant_id = ?
       WHERE s.tenant_id = ? AND s.status = 'active'`,
    ).bind(month, tenantId, tenantId).first();

    return c.json({ month, staff: report.results, summary });
  } catch {
    throw new HTTPException(500, { message: 'Failed to generate salary report' });
  }
});

// GET /api/staff/:id
staffRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const member = await c.env.DB.prepare(
      'SELECT * FROM staff WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!member) throw new HTTPException(404, { message: 'Staff not found' });
    return c.json({ staff: member });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch staff' });
  }
});

// POST /api/staff — add staff member with Zod validation
staffRoutes.post('/', zValidator('json', createStaffSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO staff (name, address, position, salary, bank_account, mobile, joining_date, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    ).bind(data.name, data.address, data.position, data.salary, data.bankAccount, data.mobile, data.joiningDate ?? null, tenantId).run();

    return c.json({ message: 'Staff added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add staff' });
  }
});

// PUT /api/staff/:id — update staff details
staffRoutes.put('/:id', zValidator('json', updateStaffSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM staff WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Staff not found' });

    await c.env.DB.prepare(
      `UPDATE staff SET name = ?, address = ?, position = ?, salary = ?, bank_account = ?, mobile = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.name        ?? existing['name'],
      data.address     ?? existing['address'],
      data.position    ?? existing['position'],
      data.salary      !== undefined ? data.salary      : existing['salary'],
      data.bankAccount ?? existing['bank_account'],
      data.mobile      ?? existing['mobile'],
      id, tenantId,
    ).run();

    return c.json({ message: 'Staff updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update staff' });
  }
});

// DELETE /api/staff/:id — soft deactivate
staffRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM staff WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Staff not found' });

    await c.env.DB.prepare(
      `UPDATE staff SET status = 'inactive' WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).run();
    return c.json({ message: 'Staff deactivated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to deactivate staff' });
  }
});

// POST /api/staff/:id/salary — pay salary with bonus & deduction
staffRoutes.post('/:id/salary', zValidator('json', paySalarySchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  try {
    const member = await c.env.DB.prepare(
      'SELECT * FROM staff WHERE id = ? AND tenant_id = ? AND status = ?',
    ).bind(id, tenantId, 'active').first<{ id: number; name: string; salary: number }>();
    if (!member) throw new HTTPException(404, { message: 'Staff not found' });

    // Check duplicate payment for same month
    const existing = await c.env.DB.prepare(
      'SELECT id FROM salary_payments WHERE staff_id = ? AND month = ? AND tenant_id = ?',
    ).bind(id, data.month, tenantId).first();
    if (existing) throw new HTTPException(409, { message: `Salary already paid for ${data.month}` });

    const bonus = data.bonus;
    const deduction = data.deduction;
    const netSalary = member.salary + bonus - deduction;

    await c.env.DB.prepare(
      `INSERT INTO salary_payments
         (staff_id, amount, bonus, deduction, net_salary, payment_method, reference_no, payment_date, month, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?)`,
    ).bind(id, member.salary, bonus, deduction, netSalary, data.paymentMethod ?? null, data.referenceNo ?? null, data.month, tenantId).run();

    // Record as expense
    await c.env.DB.prepare(
      `INSERT INTO expenses (date, category, amount, description, tenant_id)
       VALUES (date('now'), 'Salary', ?, ?, ?)`,
    ).bind(netSalary, `Salary for ${member.name} — ${data.month}`, tenantId).run();

    return c.json({
      message: 'Salary paid',
      breakdown: { baseSalary: member.salary, bonus, deduction, netSalary },
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to pay salary' });
  }
});

// GET /api/staff/:id/salary — salary history for one staff member
staffRoutes.get('/:id/salary', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');

  try {
    const payments = await c.env.DB.prepare(
      `SELECT sp.*, s.name as staff_name, s.position
       FROM salary_payments sp JOIN staff s ON sp.staff_id = s.id
       WHERE sp.staff_id = ? AND sp.tenant_id = ? ORDER BY sp.payment_date DESC`,
    ).bind(id, tenantId).all();
    return c.json({ payments: payments.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch salary history' });
  }
});

export default staffRoutes;