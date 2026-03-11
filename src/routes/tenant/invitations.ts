import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth';
import type { Env, Variables } from '../../types';

const invitationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Helpers ───────────────────────────────────────────────────────────

/** Generate a 32-byte crypto-safe random hex token */
function generateToken32(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Return ISO string 7 days from now */
function expiresIn7Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

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

// ─── Schemas ─────────────────────────────────────────────────────────
const VALID_ROLES = ['hospital_admin','laboratory','reception','md','director','pharmacist','accountant'] as const;

const createInviteSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(VALID_ROLES, { message: 'Invalid role' }),
  name: z.string().optional(), // optional pre-fill name hint
});

const acceptInviteSchema = z.object({
  name: z.string().min(1, 'Name required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ─── POST /api/invitations — Create invitation (hospital_admin only) ──
invitationRoutes.post('/', zValidator('json', createInviteSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const callerId = c.get('userId');
  const callerRole = c.get('role');

  if (!tenantId) return c.json({ error: 'Tenant not identified' }, 400);
  if (callerRole !== 'hospital_admin') {
    return c.json({ error: 'Only hospital admins can send invitations' }, 403);
  }

  const { email, role } = c.req.valid('json');

  try {
    // Check if email already has an account in this tenant
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND tenant_id = ?'
    ).bind(email, tenantId).first();

    if (existingUser) {
      return c.json({ error: 'A user with this email already exists in your hospital' }, 409);
    }

    // Check for pending invitation
    const existingInvite = await c.env.DB.prepare(
      'SELECT id FROM invitations WHERE email = ? AND tenant_id = ? AND accepted_at IS NULL AND expires_at > datetime("now")'
    ).bind(email, tenantId).first();

    if (existingInvite) {
      return c.json({ error: 'A pending invitation already exists for this email' }, 409);
    }

    const token = generateToken32();
    const expiresAt = expiresIn7Days();

    await c.env.DB.prepare(
      'INSERT INTO invitations (tenant_id, email, role, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(tenantId, email, role, token, callerId ?? 0, expiresAt).run();

    // Get tenant slug for building the link
    const tenant = await c.env.DB.prepare(
      'SELECT subdomain FROM tenants WHERE id = ?'
    ).bind(tenantId).first<{ subdomain: string }>();

    const slug = tenant?.subdomain ?? 'hospital';
    const inviteLink = `/h/${slug}/accept-invite?token=${token}`;

    return c.json({
      message: 'Invitation created',
      invite: { email, role, expiresAt, token, inviteLink },
    }, 201);
  } catch (error) {
    console.error('Invitation error:', error);
    return c.json({ error: 'Failed to create invitation' }, 500);
  }
});

// ─── GET /api/invitations — List invitations (hospital_admin only) ────
invitationRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const callerRole = c.get('role');

  if (!tenantId) return c.json({ error: 'Tenant not identified' }, 400);
  if (callerRole !== 'hospital_admin') return c.json({ error: 'Forbidden' }, 403);

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, i.created_at,
              u.name AS invited_by_name
       FROM invitations i
       LEFT JOIN users u ON u.id = i.invited_by
       WHERE i.tenant_id = ?
       ORDER BY i.created_at DESC
       LIMIT 100`
    ).bind(tenantId).all();

    return c.json({ invitations: results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch invitations' }, 500);
  }
});

// ─── GET /api/invitations/:token — Validate token (PUBLIC) ───────────
invitationRoutes.get('/:token', async (c) => {
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

// ─── POST /api/invitations/:token/accept — Accept invitation (PUBLIC) ─
invitationRoutes.post('/:token/accept', zValidator('json', acceptInviteSchema), async (c) => {
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

    // Issue JWT for immediate login
    const jwtToken = generateToken(
      {
        userId: String(userId),
        role: invite.role,
        tenantId: String(invite.tenant_id),
        permissions: getPermissions(invite.role),
      },
      c.env.JWT_SECRET,
      '8h'
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

export default invitationRoutes;
