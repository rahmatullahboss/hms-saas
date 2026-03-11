import { Hono } from 'hono';
import { notifyDashboard, createAuditLog } from '../../lib/accounting-helpers';

const incomeRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    UPLOADS: R2Bucket;
    DASHBOARD_DO: DurableObjectNamespace;
    ENVIRONMENT: string;
  };
  Variables: {
    tenantId: string;
    userId: string;
    role: string;
  };
}>();

incomeRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate, source } = c.req.query();

  let query = 'SELECT * FROM income WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (startDate) {
    query += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND date <= ?';
    params.push(endDate);
  }
  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }

  query += ' ORDER BY date DESC, id DESC';

  try {
    const result = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ income: result.results });
  } catch (error) {
    console.error('Error fetching income:', error);
    return c.json({ error: 'Failed to fetch income' }, 500);
  }
});

incomeRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const body = await c.req.json();
  const { date, source, amount, description, bill_id } = body;

  if (!date || !source || !amount) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(date, source, amount, description || null, bill_id || null, tenantId, userId).run();

    const incomeId = result.meta.last_row_id;

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'CREATE',
      'income',
      incomeId,
      null,
      { date, source, amount, description }
    );

    await notifyDashboard(c.env, tenantId, 'income', amount);

    return c.json({ 
      success: true, 
      id: incomeId,
      message: 'Income created successfully' 
    }, 201);
  } catch (error) {
    console.error('Error creating income:', error);
    return c.json({ error: 'Failed to create income' }, 500);
  }
});

incomeRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(`
      SELECT * FROM income WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!result) {
      return c.json({ error: 'Income not found' }, 404);
    }

    return c.json({ income: result });
  } catch (error) {
    console.error('Error fetching income:', error);
    return c.json({ error: 'Failed to fetch income' }, 500);
  }
});

incomeRoutes.put('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { date, source, amount, description } = body;

  try {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM income WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Income not found' }, 404);
    }

    const oldAmount = (existing as any).amount;
    const amountDiff = amount ? amount - oldAmount : 0;

    await c.env.DB.prepare(`
      UPDATE income SET date = ?, source = ?, amount = ?, description = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(
      date || (existing as any).date,
      source || (existing as any).source,
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
      'income',
      parseInt(id),
      existing,
      { date, source, amount, description }
    );

    if (amountDiff !== 0) {
      await notifyDashboard(c.env, tenantId, 'income', amountDiff);
    }

    return c.json({ success: true, message: 'Income updated successfully' });
  } catch (error) {
    console.error('Error updating income:', error);
    return c.json({ error: 'Failed to update income' }, 500);
  }
});

incomeRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM income WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Income not found' }, 404);
    }

    await c.env.DB.prepare(`
      DELETE FROM income WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'DELETE',
      'income',
      parseInt(id),
      existing,
      null
    );

    await notifyDashboard(c.env, tenantId, 'income', -(existing as any).amount);

    return c.json({ success: true, message: 'Income deleted successfully' });
  } catch (error) {
    console.error('Error deleting income:', error);
    return c.json({ error: 'Failed to delete income' }, 500);
  }
});

export default incomeRoutes;
