import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createAuditLog } from '../../lib/accounting-helpers';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { createIncomeSchema, updateIncomeSchema } from '../../schemas/accounting';
import { getDb } from '../../db';


const incomeRoutes = new Hono<{
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

incomeRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
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
    const result = await db.$client.prepare(query).bind(...params).all();
    return c.json({ income: result.results });
  } catch (error) {
    console.error('Error fetching income:', error);
    return c.json({ error: 'Failed to fetch income' }, 500);
  }
});

incomeRoutes.post('/', zValidator('json', createIncomeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { date, source, amount, description, bill_id } = c.req.valid('json');

  try {
    const result = await db.$client.prepare(`
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
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const result = await db.$client.prepare(`
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

incomeRoutes.put('/:id', zValidator('json', updateIncomeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = c.req.param('id');
  const { date, source, amount, description } = c.req.valid('json');

  try {
    const existing = await db.$client.prepare(`
      SELECT * FROM income WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Income not found' }, 404);
    }

    const oldAmount = (existing as any).amount;
    const amountDiff = amount ? amount - oldAmount : 0;

    await db.$client.prepare(`
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


    return c.json({ success: true, message: 'Income updated successfully' });
  } catch (error) {
    console.error('Error updating income:', error);
    return c.json({ error: 'Failed to update income' }, 500);
  }
});

incomeRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = c.req.param('id');

  try {
    const existing = await db.$client.prepare(`
      SELECT * FROM income WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Income not found' }, 404);
    }

    await db.$client.prepare(`
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

    return c.json({ success: true, message: 'Income deleted successfully' });
  } catch (error) {
    console.error('Error deleting income:', error);
    return c.json({ error: 'Failed to delete income' }, 500);
  }
});

export default incomeRoutes;
