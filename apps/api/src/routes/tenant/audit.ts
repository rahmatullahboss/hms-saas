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

// ─── GET /api/audit/logs — for System Audit Log page ─────────────────────────
// Tries both audit_log and audit_logs tables (project uses both)
auditRoutes.get('/logs', async (c) => {
  const tenantId = c.get('tenantId');
  const { action, entity, limit = '200' } = c.req.query();

  let conditions = 'tenant_id = ?';
  const params: (string | number)[] = [tenantId!];

  if (action) { conditions += ' AND action = ?'; params.push(action); }
  if (entity) { conditions += ' AND entity = ?'; params.push(entity); }

  // Try audit_log first (used by newer routes), then audit_logs
  for (const tableName of ['audit_log', 'audit_logs']) {
    try {
      const { results } = await c.env.DB.prepare(`
        SELECT * FROM ${tableName}
        WHERE ${conditions}
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(...params, parseInt(limit)).all();

      // Normalize field names for frontend
      const logs = (results as Record<string, unknown>[]).map(r => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name || `User #${r.user_id || 'system'}`,
        action: r.action || r.operation || 'update',
        entity: r.entity || r.table_name || '—',
        entity_id: r.entity_id || r.record_id || null,
        details: r.details || r.changes || null,
        created_at: r.created_at,
      }));

      return c.json({ logs });
    } catch {
      continue; // try next table name
    }
  }

  return c.json({ logs: [] });
});

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
