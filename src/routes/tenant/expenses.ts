import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createAuditLog } from '../../lib/accounting-helpers';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { createExpenseSchema, updateExpenseSchema } from '../../schemas/accounting';

const expenseRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    UPLOADS: R2Bucket;
    ENVIRONMENT: string;
  };
  Variables: {
    tenantId: string;
    userId: string;
    role: string;
  };
}>();

const APPROVAL_THRESHOLD = 10000;

expenseRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate, category, status } = c.req.query();

  let query = 'SELECT * FROM expenses WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (startDate) {
    query += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND date <= ?';
    params.push(endDate);
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY date DESC, id DESC';

  try {
    const result = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ expenses: result.results });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return c.json({ error: 'Failed to fetch expenses' }, 500);
  }
});

expenseRoutes.get('/pending', async (c) => {
  const tenantId = requireTenantId(c);
  const role = c.get('role');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director access required.' }, 403);
  }

  try {
    const result = await c.env.DB.prepare(`
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.tenant_id = ? AND e.status = 'pending'
      ORDER BY e.date DESC, e.id DESC
    `).bind(tenantId).all();

    return c.json({ expenses: result.results });
  } catch (error) {
    console.error('Error fetching pending expenses:', error);
    return c.json({ error: 'Failed to fetch pending expenses' }, 500);
  }
});

expenseRoutes.post('/', zValidator('json', createExpenseSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { date, category, amount, description } = c.req.valid('json');

  const status = amount > APPROVAL_THRESHOLD ? 'pending' : 'approved';

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO expenses (date, category, amount, description, status, tenant_id, created_by, approved_by, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      date,
      category,
      amount,
      description || null,
      status,
      tenantId,
      userId,
      status === 'approved' ? userId : null,
      status === 'approved' ? new Date().toISOString() : null
    ).run();

    const expenseId = result.meta.last_row_id;

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      status === 'approved' ? 'CREATE' : 'CREATE',
      'expenses',
      expenseId,
      null,
      { date, category, amount, description, status }
    );


    return c.json({ 
      success: true, 
      id: expenseId,
      status,
      message: status === 'pending' ? 'Expense created. Requires director approval.' : 'Expense created successfully' 
    }, 201);
  } catch (error) {
    console.error('Error creating expense:', error);
    return c.json({ error: 'Failed to create expense' }, 500);
  }
});

expenseRoutes.get('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(`
      SELECT e.*, u.name as created_by_name, a.name as approved_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users a ON e.approved_by = a.id
      WHERE e.id = ? AND e.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!result) {
      return c.json({ error: 'Expense not found' }, 404);
    }

    return c.json({ expense: result });
  } catch (error) {
    console.error('Error fetching expense:', error);
    return c.json({ error: 'Failed to fetch expense' }, 500);
  }
});

expenseRoutes.put('/:id', zValidator('json', updateExpenseSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = c.req.param('id');
  const { date, category, amount, description } = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM expenses WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Expense not found' }, 404);
    }

    const oldStatus = (existing as any).status;
    const oldAmount = (existing as any).amount;

    if (oldStatus === 'pending') {
      return c.json({ error: 'Cannot edit pending expense. Approve or reject first.' }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE expenses SET date = ?, category = ?, amount = ?, description = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(
      date || (existing as any).date,
      category || (existing as any).category,
      amount || (existing as any).amount,
      description !== undefined ? description : (existing as any).description,
      id,
      tenantId
    ).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'UPDATE',
      'expenses',
      parseInt(id),
      existing,
      { date, category, amount, description }
    );


    return c.json({ success: true, message: 'Expense updated successfully' });
  } catch (error) {
    console.error('Error updating expense:', error);
    return c.json({ error: 'Failed to update expense' }, 500);
  }
});

expenseRoutes.post('/:id/approve', async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const role = c.get('role');
  const id = c.req.param('id');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director approval required.' }, 403);
  }

  try {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM expenses WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Expense not found' }, 404);
    }

    if ((existing as any).status !== 'pending') {
      return c.json({ error: 'Expense is not pending approval' }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE expenses SET status = 'approved', approved_by = ?, approved_at = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(userId, new Date().toISOString(), id, tenantId).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'APPROVE',
      'expenses',
      parseInt(id),
      { status: 'pending' },
      { status: 'approved' }
    );

    return c.json({ success: true, message: 'Expense approved successfully' });
  } catch (error) {
    console.error('Error approving expense:', error);
    return c.json({ error: 'Failed to approve expense' }, 500);
  }
});

expenseRoutes.post('/:id/reject', async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const role = c.get('role');
  const id = c.req.param('id');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director rejection required.' }, 403);
  }

  try {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM expenses WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Expense not found' }, 404);
    }

    if ((existing as any).status !== 'pending') {
      return c.json({ error: 'Expense is not pending approval' }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE expenses SET status = 'rejected', approved_by = ?, approved_at = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(userId, new Date().toISOString(), id, tenantId).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'REJECT',
      'expenses',
      parseInt(id),
      { status: 'pending' },
      { status: 'rejected' }
    );

    return c.json({ success: true, message: 'Expense rejected' });
  } catch (error) {
    console.error('Error rejecting expense:', error);
    return c.json({ error: 'Failed to reject expense' }, 500);
  }
});

export default expenseRoutes;
