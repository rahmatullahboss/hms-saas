import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../../types';

const invitationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const sendInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.string().min(1, 'Role required'),
  name: z.string().optional(),
  message: z.string().optional(),
});

// ─── POST / — send an invitation ─────────────────────────────────────────────
invitationRoutes.post('/', zValidator('json', sendInvitationSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO invitations (email, role, invited_by, status, tenant_id, created_at)
      VALUES (?, ?, ?, 'pending', ?, datetime('now'))
    `).bind(data.email, data.role, userId, tenantId).run();

    return c.json({ id: result.meta.last_row_id, message: 'Invitation sent', email: data.email }, 201);
  } catch (err) {
    console.error('Create invitation error:', err);
    throw new HTTPException(500, { message: 'Failed to create invitation' });
  }
});

// ─── GET / — list invitations ─────────────────────────────────────────────────
invitationRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM invitations WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100',
    ).bind(tenantId).all();

    return c.json({ invitations: results });
  } catch {
    return c.json({ invitations: [] });
  }
});

export default invitationRoutes;
