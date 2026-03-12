import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../types';

const notifications = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── GET /api/notifications — list ────────────────────────────────────────────

notifications.get('/', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = c.get('userId');
  const filter = c.req.query('filter') || 'all'; // all, unread, read
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let sql = `SELECT * FROM notifications WHERE tenant_id = ? AND (user_id IS NULL OR user_id = ?)`;
  const params: (string | number | null)[] = [tenantId, userId ? Number(userId) : null];

  if (filter === 'unread') {
    sql += ` AND is_read = 0`;
  } else if (filter === 'read') {
    sql += ` AND is_read = 1`;
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  // Unread count
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM notifications WHERE tenant_id = ? AND (user_id IS NULL OR user_id = ?) AND is_read = 0`
  ).bind(tenantId, userId ? Number(userId) : null).first<{ cnt: number }>();

  return c.json({
    notifications: results,
    unreadCount: countRow?.cnt ?? 0,
  });
});

// ─── PUT /api/notifications/read-all — mark all read ──────────────────────────
// IMPORTANT: This must come BEFORE /:id/read so Hono doesn't match 'read-all' as :id

notifications.put('/read-all', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = c.get('userId');

  await c.env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND (user_id IS NULL OR user_id = ?) AND is_read = 0`
  ).bind(tenantId, userId ? Number(userId) : null).run();

  return c.json({ success: true });
});

// ─── PUT /api/notifications/:id/read — mark read ─────────────────────────────

notifications.put('/:id/read', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));

  await c.env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).run();

  return c.json({ success: true });
});

// ─── POST /api/notifications — create (internal) ─────────────────────────────

const createNotificationSchema = z.object({
  type: z.enum(['lab', 'appointment', 'billing', 'admission', 'pharmacy', 'system']).default('system'),
  title: z.string().min(1),
  message: z.string().min(1),
  user_id: z.number().int().positive().optional(),
  link: z.string().optional(),
});

notifications.post('/', zValidator('json', createNotificationSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const data = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    INSERT INTO notifications (tenant_id, user_id, type, title, message, link)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.user_id ?? null, data.type,
    data.title, data.message, data.link ?? null
  ).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

export default notifications;
