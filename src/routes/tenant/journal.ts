import { Hono } from 'hono';
import { createAuditLog } from '../../lib/accounting-helpers';

const journalRoutes = new Hono<{
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

journalRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate, accountId } = c.req.query();

  let query = `
    SELECT j.*, 
           da.code as debit_code, da.name as debit_name,
           ca.code as credit_code, ca.name as credit_name,
           u.name as created_by_name
    FROM journal_entries j
    LEFT JOIN chart_of_accounts da ON j.debit_account_id = da.id
    LEFT JOIN chart_of_accounts ca ON j.credit_account_id = ca.id
    LEFT JOIN users u ON j.created_by = u.id
    WHERE j.tenant_id = ? AND j.is_deleted = 0
  `;
  const params: any[] = [tenantId];

  if (startDate) {
    query += ' AND j.entry_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND j.entry_date <= ?';
    params.push(endDate);
  }
  if (accountId) {
    query += ' AND (j.debit_account_id = ? OR j.credit_account_id = ?)';
    params.push(accountId, accountId);
  }

  query += ' ORDER BY j.entry_date DESC, j.id DESC';

  try {
    const result = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ journalEntries: result.results });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return c.json({ error: 'Failed to fetch journal entries' }, 500);
  }
});

journalRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const body = await c.req.json();
  const { entry_date, reference, description, debit_account_id, credit_account_id, amount } = body;

  if (!entry_date || !debit_account_id || !credit_account_id || !amount) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (debit_account_id === credit_account_id) {
    return c.json({ error: 'Debit and credit accounts must be different' }, 400);
  }

  try {
    const debitAccount = await c.env.DB.prepare(`
      SELECT id, is_active FROM chart_of_accounts WHERE id = ? AND tenant_id = ?
    `).bind(debit_account_id, tenantId).first();

    const creditAccount = await c.env.DB.prepare(`
      SELECT id, is_active FROM chart_of_accounts WHERE id = ? AND tenant_id = ?
    `).bind(credit_account_id, tenantId).first();

    if (!debitAccount || !creditAccount) {
      return c.json({ error: 'Invalid account ID' }, 400);
    }

    if (!debitAccount.is_active || !creditAccount.is_active) {
      return c.json({ error: 'Cannot use inactive accounts' }, 400);
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO journal_entries (entry_date, reference, description, debit_account_id, credit_account_id, amount, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(entry_date, reference || null, description || null, debit_account_id, credit_account_id, amount, tenantId, userId).run();

    const entryId = result.meta.last_row_id;

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'CREATE',
      'journal_entries',
      entryId,
      null,
      { entry_date, reference, description, debit_account_id, credit_account_id, amount }
    );

    return c.json({ success: true, id: entryId, message: 'Journal entry created successfully' }, 201);
  } catch (error) {
    console.error('Error creating journal entry:', error);
    return c.json({ error: 'Failed to create journal entry' }, 500);
  }
});

journalRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(`
      SELECT j.*, 
             da.code as debit_code, da.name as debit_name,
             ca.code as credit_code, ca.name as credit_name,
             u.name as created_by_name
      FROM journal_entries j
      LEFT JOIN chart_of_accounts da ON j.debit_account_id = da.id
      LEFT JOIN chart_of_accounts ca ON j.credit_account_id = ca.id
      LEFT JOIN users u ON j.created_by = u.id
      WHERE j.id = ? AND j.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!result) {
      return c.json({ error: 'Journal entry not found' }, 404);
    }

    return c.json({ journalEntry: result });
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    return c.json({ error: 'Failed to fetch journal entry' }, 500);
  }
});

journalRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const role = c.get('role');
  const id = c.req.param('id');

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director access required.' }, 403);
  }

  try {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM journal_entries WHERE id = ? AND tenant_id = ? AND is_deleted = 0
    `).bind(id, tenantId).first();

    if (!existing) {
      return c.json({ error: 'Journal entry not found' }, 404);
    }

    await c.env.DB.prepare(`
      UPDATE journal_entries SET is_deleted = 1 WHERE id = ? AND tenant_id = ?
    `).bind(id, tenantId).run();

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'DELETE',
      'journal_entries',
      parseInt(id),
      existing,
      { is_deleted: 1 }
    );

    return c.json({ success: true, message: 'Journal entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    return c.json({ error: 'Failed to delete journal entry' }, 500);
  }
});

export default journalRoutes;
