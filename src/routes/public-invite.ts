/**
 * Public invitation routes — no auth/tenant middleware needed.
 * These look up invitations by token directly from DB.
 *
 * GET  /api/invite/:token          → Validate invitation token
 * POST /api/invite/:token/accept   → Accept invitation & create account
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth';
import type { Env } from '../types';

const publicInviteRoutes = new Hono<{ Bindings: Env }>();

function getPermissions(role: string): string[] {
  const map: Record<string, string[]> = {
    hospital_admin: ['patients:read','patients:write','tests:read','tests:write','billing:read','billing:write','pharmacy:read','pharmacy:write','staff:read','staff:write','reports:read','settings:read','settings:write','income:read','income:write','expenses:read','expenses:write'],
    laboratory: ['tests:read','tests:write','patients:read'],
    reception: ['patients:read','patients:write','tests:read','tests:write','billing:read','billing:write','income:read','income:write','expenses:read','expenses:write'],
    pharmacist: ['pharmacy:read','pharmacy:write','patients:read'],
    md: ['patients:read','patients:write','tests:read','tests:write','billing:read','billing:write','pharmacy:read','pharmacy:write','staff:read','staff:write','reports:read','reports:write','profit:calculate','shareholders:read','shareholders:write','settings:read','settings:write'],
    director: ['patients:read','patients:write','tests:read','tests:write','billing:read','billing:write','pharmacy:read','pharmacy:write','staff:read','staff:write','staff:delete','reports:read','reports:write','profit:calculate','profit:approve','shareholders:read','shareholders:write','shareholders:delete','settings:read','settings:write'],
    accountant: ['billing:read','income:read','income:write','expenses:read','expenses:write','reports:read','reports:write'],
  };
  return map[role] ?? [];
}

const acceptSchema = z.object({
  name: z.string().min(1, 'Name required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ─── GET /api/invite/:token — Validate token ──────────────────────────
publicInviteRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');

  try {
    const invite = await c.env.DB.prepare(
      `SELECT i.email, i.role, i.expires_at, i.accepted_at, t.name AS hospital_name, t.subdomain
       FROM invitations i
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.token = ?`
    ).bind(token).first<{
      email: string;
      role: string;
      expires_at: string;
      accepted_at: string | null;
      hospital_name: string;
      subdomain: string;
    }>();

    if (!invite) {
      return c.json({ error: 'Invitation not found or already invalid' }, 404);
    }
    if (invite.accepted_at) {
      return c.json({ error: 'This invitation has already been accepted' }, 410);
    }
    if (new Date(invite.expires_at) < new Date()) {
      return c.json({ error: 'This invitation has expired' }, 410);
    }

    return c.json({
      valid: true,
      email: invite.email,
      role: invite.role,
      hospitalName: invite.hospital_name,
      slug: invite.subdomain,
    });
  } catch (error) {
    return c.json({ error: 'Failed to validate invitation' }, 500);
  }
});

// ─── POST /api/invite/:token/accept — Accept + create account ─────────
publicInviteRoutes.post('/:token/accept', zValidator('json', acceptSchema), async (c) => {
  const token = c.req.param('token');
  const { name, password } = c.req.valid('json');

  try {
    const invite = await c.env.DB.prepare(
      `SELECT i.id, i.email, i.role, i.tenant_id, i.expires_at, i.accepted_at
       FROM invitations i
       WHERE i.token = ?`
    ).bind(token).first<{
      id: number;
      email: string;
      role: string;
      tenant_id: number;
      expires_at: string;
      accepted_at: string | null;
    }>();

    if (!invite) return c.json({ error: 'Invalid invitation token' }, 404);
    if (invite.accepted_at) return c.json({ error: 'Invitation already used' }, 410);
    if (new Date(invite.expires_at) < new Date()) return c.json({ error: 'Invitation expired' }, 410);

    // Check email not already registered in this tenant
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND tenant_id = ?'
    ).bind(invite.email, invite.tenant_id).first();

    if (existingUser) {
      return c.json({ error: 'An account with this email already exists' }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user + mark invitation accepted atomically
    const [userResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, role, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
      ).bind(invite.email, passwordHash, name, invite.role, invite.tenant_id),
      c.env.DB.prepare(
        'UPDATE invitations SET accepted_at = datetime("now") WHERE id = ?'
      ).bind(invite.id),
    ]);

    const userId = userResult.meta.last_row_id;

    const jwtToken = await generateToken(
      {
        userId: String(userId),
        role: invite.role,
        tenantId: String(invite.tenant_id),
        permissions: getPermissions(invite.role),
      },
      c.env.JWT_SECRET,
      8
    );


    return c.json({
      message: 'Account created successfully',
      token: jwtToken,
      user: { id: userId, name, email: invite.email, role: invite.role },
    }, 201);
  } catch (error) {
    console.error('Accept invite error:', error);
    return c.json({ error: 'Failed to accept invitation' }, 500);
  }
});

export default publicInviteRoutes;
