/**
 * Protected invitation routes (require tenant + auth middleware).
 *
 * POST /api/invitations    → Create invitation (hospital_admin only)
 * GET  /api/invitations    → List invitations (hospital_admin only)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const invitationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Helpers ───────────────────────────────────────────────────────────

/** Generate a 32-byte crypto-safe random hex token */
function generateInviteToken(): string {
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

// ─── Schemas ─────────────────────────────────────────────────────────
const VALID_ROLES = ['hospital_admin','laboratory','reception','md','director','pharmacist','accountant'] as const;

const createInviteSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(VALID_ROLES, { message: 'Invalid role' }),
});

// ─── POST /api/invitations — Create invitation (hospital_admin only) ──
invitationRoutes.post('/', zValidator('json', createInviteSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const callerId = requireUserId(c);
  const callerRole = c.get('role');

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

    const token = generateInviteToken();
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
  const tenantId = requireTenantId(c);
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

export default invitationRoutes;
