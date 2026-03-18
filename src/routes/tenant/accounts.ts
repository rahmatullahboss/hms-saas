import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createAuditLog } from '../../lib/accounting-helpers';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { createAccountSchema, updateAccountSchema } from '../../schemas/accounting';
import { getDb } from '../../db';


const accountsRoutes = new Hono<{
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

accountsRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { type } = c.req.query();

  let query = 'SELECT * FROM chart_of_accounts WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY code';

  try {
    const result = await db.$client.prepare(query).bind(...params).all();
    return c.json({ accounts: result.results });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return c.json({ error: 'Failed to fetch accounts' }, 500);
  }
});

accountsRoutes.post('/', zValidator('json', createAccountSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const role = c.get('role');
  const { code, name, type, parent_id } = c.req.valid('json');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director access required.' }, 403);
  }

  try {
    const existing = await db.$client.prepare(`
      SELECT id FROM chart_of_accounts WHERE code = ? AND tenant_id = ?
    `).bind(code, tenantId).first();

    if (existing) {
      return c.json({ error: 'Account code already exists' }, 400);
    }

    const result = await db.$client.prepare(`
      INSERT INTO chart_of_accounts (code, name, type, parent_id, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(code, name, type, parent_id || null, tenantId).run();

    const accountId = result.meta.last_row_id;

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'CREATE',
      'chart_of_accounts',
      accountId,
      null,
      { code, name, type }
    );

    return c.json({ success: true, id: accountId, message: 'Account created successfully' }, 201);
  } catch (error) {
    console.error('Error creating account:', error);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

accountsRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const result = await db.$client.prepare(`
      SELECT * FROM chart_of_accounts WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!result) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ account: result });
  } catch (error) {
    console.error('Error fetching account:', error);
    return c.json({ error: 'Failed to fetch account' }, 500);
  }
});

accountsRoutes.put('/:id', zValidator('json', updateAccountSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const role = c.get('role');
  const id = c.req.param('id');
  const { name, type, is_active } = c.req.valid('json');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director access required.' }, 403);
  }

  try {
    const existing = await db.$client.prepare(`
      SELECT * FROM chart_of_accounts WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Account not found' }, 404);
    }

    await db.$client.prepare(`
      UPDATE chart_of_accounts SET name = ?, type = ?, is_active = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(
      name || (existing as any).name,
      type || (existing as any).type,
      is_active !== undefined ? is_active : (existing as any).is_active,
      id,
      tenantId
    ).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'UPDATE',
      'chart_of_accounts',
      parseInt(id),
      existing,
      { name, type, is_active }
    );

    return c.json({ success: true, message: 'Account updated successfully' });
  } catch (error) {
    console.error('Error updating account:', error);
    return c.json({ error: 'Failed to update account' }, 500);
  }
});

accountsRoutes.get('/verify-balance', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);

  try {
    const debitSum = await db.$client.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM journal_entries
      WHERE debit_account_id IN (SELECT id FROM chart_of_accounts WHERE tenant_id = ?)
      AND is_deleted = 0
    `).bind(tenantId).first<{ total: number }>();

    const creditSum = await db.$client.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM journal_entries
      WHERE credit_account_id IN (SELECT id FROM chart_of_accounts WHERE tenant_id = ?)
      AND is_deleted = 0
    `).bind(tenantId).first<{ total: number }>();

    const debits = debitSum?.total || 0;
    const credits = creditSum?.total || 0;
    const balanced = Math.abs(debits - credits) < 0.01;

    return c.json({
      balanced,
      totalDebits: debits,
      totalCredits: credits,
      difference: debits - credits
    });
  } catch (error) {
    console.error('Error verifying balance:', error);
    return c.json({ error: 'Failed to verify balance' }, 500);
  }
});

accountsRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const role = c.get('role');
  const id = c.req.param('id');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director access required.' }, 403);
  }

  try {
    const existing = await db.$client.prepare(`
      SELECT * FROM chart_of_accounts WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Account not found' }, 404);
    }

    await db.$client.prepare(`
      DELETE FROM chart_of_accounts WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'DELETE',
      'chart_of_accounts',
      parseInt(id),
      existing,
      null
    );

    return c.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return c.json({ error: 'Failed to delete account' }, 500);
  }
});

export default accountsRoutes;
