import { Hono } from 'hono';

const auditRoutes = new Hono<{
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

auditRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { userId, tableName, startDate, endDate, limit = '50' } = c.req.query();

  let query = 'SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE a.tenant_id = ?';
  const params: any[] = [tenantId];

  if (userId) {
    query += ' AND a.user_id = ?';
    params.push(userId);
  }
  if (tableName) {
    query += ' AND a.table_name = ?';
    params.push(tableName);
  }
  if (startDate) {
    query += ' AND a.created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND a.created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  try {
    const result = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ auditLogs: result.results });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return c.json({ error: 'Failed to fetch audit logs' }, 500);
  }
});

auditRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(`
      SELECT a.*, u.name as user_name 
      FROM audit_logs a 
      LEFT JOIN users u ON a.user_id = u.id 
      WHERE a.id = ? AND a.tenant_id = ?
    `).bind(id, tenantId).first();

    if (!result) {
      return c.json({ error: 'Audit log not found' }, 404);
    }

    return c.json({ auditLog: result });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    return c.json({ error: 'Failed to fetch audit log' }, 500);
  }
});

export default auditRoutes;
