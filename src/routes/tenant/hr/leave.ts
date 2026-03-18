import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import { getDb } from '../../../db';
import {
  createLeaveCategorySchema,
  updateLeaveCategorySchema,
  createLeaveRequestSchema,
  approveLeaveSchema,
  initLeaveBalanceSchema,
} from '../../../schemas/hr';

const leaveRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Leave Categories ──────────────────────────────────────────────────────────

// GET /api/hr/leave/categories
leaveRoutes.get('/categories', async (c) => {
  const tenantId = requireTenantId(c);
  const db = getDb(c.env.DB);

  const results = await db.$client
    .prepare('SELECT * FROM hr_leave_categories WHERE tenant_id = ? AND is_active = 1 ORDER BY leave_name')
    .bind(tenantId)
    .all();

  return c.json({ data: results.results });
});

// POST /api/hr/leave/categories
leaveRoutes.post('/categories', zValidator('json', createLeaveCategorySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    INSERT INTO hr_leave_categories (tenant_id, leave_name, description, max_days_per_year)
    VALUES (?, ?, ?, ?)
  `).bind(tenantId, data.leaveName, data.description ?? null, data.maxDaysPerYear).run();

  return c.json({ message: 'Leave category created', id: result.meta.last_row_id }, 201);
});

// PUT /api/hr/leave/categories/:id
leaveRoutes.put('/categories/:id', zValidator('json', updateLeaveCategorySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM hr_leave_categories WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();

  if (!existing) throw new HTTPException(404, { message: 'Leave category not found' });

  await c.env.DB.prepare(`
    UPDATE hr_leave_categories
    SET leave_name = ?, description = ?, max_days_per_year = ?, updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).bind(
    data.leaveName ?? existing.leave_name,
    data.description ?? existing.description,
    data.maxDaysPerYear ?? existing.max_days_per_year,
    id,
    tenantId,
  ).run();

  return c.json({ message: 'Leave category updated' });
});

// DELETE /api/hr/leave/categories/:id (soft delete)
leaveRoutes.delete('/categories/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));

  const result = await c.env.DB.prepare(
    'UPDATE hr_leave_categories SET is_active = 0 WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();

  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Leave category not found' });

  return c.json({ message: 'Leave category deactivated' });
});

// ─── Leave Balance ─────────────────────────────────────────────────────────────

// POST /api/hr/leave/init-balance — Initialize leave balances for a staff member for a year
leaveRoutes.post('/init-balance', zValidator('json', initLeaveBalanceSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { staffId, year } = c.req.valid('json');

  // Fetch all active leave categories
  const { results: categories } = await c.env.DB.prepare(
    'SELECT id, max_days_per_year FROM hr_leave_categories WHERE tenant_id = ? AND is_active = 1'
  ).bind(tenantId).all();

  if (!categories || categories.length === 0) {
    throw new HTTPException(400, { message: 'No leave categories found. Create leave categories first.' });
  }

  // Insert balance for each category (ignore if already exists)
  const stmts = (categories as { id: number; max_days_per_year: number }[]).map((cat) =>
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO hr_employee_leave_balances
        (tenant_id, staff_id, leave_category_id, year, total_allowed, balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(tenantId, staffId, cat.id, year, cat.max_days_per_year, cat.max_days_per_year)
  );

  await c.env.DB.batch(stmts);

  return c.json({ message: `Leave balance initialized for ${categories.length} categories` });
});

// GET /api/hr/leave/balance/:staffId?year=
leaveRoutes.get('/balance/:staffId', async (c) => {
  const tenantId = requireTenantId(c);
  const staffId = Number(c.req.param('staffId'));
  const year = Number(c.req.query('year') || new Date().getFullYear());

  const { results } = await c.env.DB.prepare(`
    SELECT lb.*, lc.leave_name, lc.max_days_per_year
    FROM hr_employee_leave_balances lb
    JOIN hr_leave_categories lc ON lb.leave_category_id = lc.id
    WHERE lb.tenant_id = ? AND lb.staff_id = ? AND lb.year = ?
  `).bind(tenantId, staffId, year).all();

  return c.json({ data: results });
});

// ─── Leave Requests ────────────────────────────────────────────────────────────

// POST /api/hr/leave/request
leaveRoutes.post('/request', zValidator('json', createLeaveRequestSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  // Calculate days
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Check balance
  const year = start.getFullYear();
  const balance = await c.env.DB.prepare(`
    SELECT balance FROM hr_employee_leave_balances
    WHERE tenant_id = ? AND staff_id = ? AND leave_category_id = ? AND year = ?
  `).bind(tenantId, data.staffId, data.leaveCategoryId, year).first<{ balance: number }>();

  if (!balance || balance.balance < totalDays) {
    throw new HTTPException(400, {
      message: `Insufficient leave balance. Available: ${balance?.balance ?? 0} day(s), Requested: ${totalDays} day(s)`,
    });
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO hr_leave_requests (tenant_id, staff_id, leave_category_id, start_date, end_date, total_days, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.staffId, data.leaveCategoryId, data.startDate, data.endDate, totalDays, data.reason ?? null).run();

  return c.json({ message: 'Leave request submitted', id: result.meta.last_row_id }, 201);
});

// GET /api/hr/leave/requests?status=pending&staffId=
leaveRoutes.get('/requests', async (c) => {
  const tenantId = requireTenantId(c);
  const status = c.req.query('status');
  const staffId = c.req.query('staffId');

  let query = `
    SELECT lr.*, s.name as staff_name, s.position, lc.leave_name
    FROM hr_leave_requests lr
    JOIN staff s ON lr.staff_id = s.id
    JOIN hr_leave_categories lc ON lr.leave_category_id = lc.id
    WHERE lr.tenant_id = ?
  `;
  const params: (string | number)[] = [Number(tenantId)];

  if (status) {
    query += ' AND lr.status = ?';
    params.push(status);
  }
  if (staffId) {
    query += ' AND lr.staff_id = ?';
    params.push(Number(staffId));
  }

  query += ' ORDER BY lr.created_at DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ data: results });
});

// PUT /api/hr/leave/requests/:id/approve
leaveRoutes.put('/requests/:id/approve', zValidator('json', approveLeaveSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));
  const userId = requireUserId(c);
  const { status } = c.req.valid('json');

  const request = await c.env.DB.prepare(
    'SELECT * FROM hr_leave_requests WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<{
    staff_id: number;
    leave_category_id: number;
    status: string;
    start_date: string;
    total_days: number;
  }>();

  if (!request) throw new HTTPException(404, { message: 'Leave request not found' });
  if (request.status !== 'pending') {
    throw new HTTPException(400, { message: `Leave request already ${request.status}` });
  }

  if (status === 'approved') {
    const year = new Date(request.start_date).getFullYear();
    const balance = await c.env.DB.prepare(`
      SELECT balance FROM hr_employee_leave_balances
      WHERE tenant_id = ? AND staff_id = ? AND leave_category_id = ? AND year = ?
    `).bind(tenantId, request.staff_id, request.leave_category_id, year).first<{ balance: number }>();

    if (!balance || balance.balance < request.total_days) {
      throw new HTTPException(400, {
        message: `Insufficient balance. Available: ${balance?.balance ?? 0}, Required: ${request.total_days}`,
      });
    }

    // Atomic: deduct balance + update status
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE hr_employee_leave_balances
        SET balance = balance - ?, used = used + ?
        WHERE tenant_id = ? AND staff_id = ? AND leave_category_id = ? AND year = ?
      `).bind(request.total_days, request.total_days, tenantId, request.staff_id, request.leave_category_id, year),
      c.env.DB.prepare(`
        UPDATE hr_leave_requests
        SET status = 'approved', approved_by = ?, approved_on = datetime('now')
        WHERE id = ?
      `).bind(userId, id),
    ]);

    return c.json({ message: 'Leave approved', daysDeducted: request.total_days });
  }

  // Rejected / cancelled
  await c.env.DB.prepare(`
    UPDATE hr_leave_requests
    SET status = ?, approved_by = ?, approved_on = datetime('now')
    WHERE id = ?
  `).bind(status, userId, id).run();

  return c.json({ message: `Leave request ${status}` });
});

export default leaveRoutes;
