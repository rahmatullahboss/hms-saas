/**
 * Direct login — no tenant slug required.
 *
 * POST /api/auth/login-direct
 *   body: { email, password }
 *   → Looks up user by email across all tenants
 *   → If exactly one match → login + return slug
 *   → If multiple matches → return hospital list to pick from
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth';
import type { Env } from '../types';

const loginDirectRoutes = new Hono<{ Bindings: Env }>();

const loginSchema = z.object({
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(1, { message: 'Password required' }),
  // Optional: if user picked a specific tenant from multi-tenant list
  tenantId: z.number().optional(),
});

// ─── Permission map (duplicated from tenant/auth.ts for independence) ──
function getPermissions(role: string): string[] {
  const permissions: Record<string, string[]> = {
    hospital_admin: [
      'patients:read', 'patients:write', 'patients:delete',
      'tests:read', 'tests:write', 'tests:delete',
      'billing:read', 'billing:write', 'billing:delete',
      'pharmacy:read', 'pharmacy:write', 'pharmacy:delete',
      'staff:read', 'staff:write', 'staff:delete',
      'reports:read', 'reports:write',
      'shareholders:read', 'shareholders:write', 'shareholders:delete',
      'settings:read', 'settings:write',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
    ],
    laboratory: ['tests:read', 'tests:write', 'patients:read'],
    reception: [
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
    ],
    pharmacist: ['pharmacy:read', 'pharmacy:write', 'patients:read'],
    md: [
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'pharmacy:read', 'pharmacy:write',
      'staff:read', 'staff:write', 'staff:delete',
      'reports:read', 'reports:write',
      'profit:calculate',
      'shareholders:read', 'shareholders:write',
      'settings:read', 'settings:write',
    ],
    director: [
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'pharmacy:read', 'pharmacy:write',
      'staff:read', 'staff:write', 'staff:delete',
      'reports:read', 'reports:write',
      'profit:calculate', 'profit:approve',
      'shareholders:read', 'shareholders:write', 'shareholders:delete',
      'settings:read', 'settings:write',
    ],
    accountant: [
      'billing:read',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
      'reports:read', 'reports:write',
    ],
  };
  return permissions[role] ?? [];
}

// ─── POST /api/auth/login-direct ──────────────────────────────────────
loginDirectRoutes.post('/', zValidator('json', loginSchema), async (c) => {
  const { email, password, tenantId: selectedTenantId } = c.req.valid('json');

  try {
    // Find all users with this email (could be in multiple hospitals)
    const { results: users } = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.password_hash, u.name, u.role, u.tenant_id,
              t.name AS hospital_name, t.subdomain AS slug, t.status AS tenant_status
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = ?`
    ).bind(email).all<{
      id: number;
      email: string;
      password_hash: string;
      name: string;
      role: string;
      tenant_id: number;
      hospital_name: string;
      slug: string;
      tenant_status: string;
    }>();

    if (!users || users.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Guard: ensure JWT_SECRET is configured
    if (!c.env.JWT_SECRET) {
      console.error('JWT_SECRET not configured');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    // Filter out inactive/suspended tenants
    const activeUsers = users.filter((u) => u.tenant_status === 'active');
    if (activeUsers.length === 0) {
      return c.json({ error: 'Your hospital account is inactive or suspended' }, 403);
    }

    // If user selected a specific tenant (multi-hospital scenario)
    let targetUser = activeUsers[0];
    if (selectedTenantId) {
      const found = activeUsers.find((u) => u.tenant_id === selectedTenantId);
      if (!found) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      targetUser = found;
    } else if (activeUsers.length > 1) {
      // Multiple hospitals — verify password first, then return list
      if (!activeUsers[0].password_hash) {
        return c.json({ error: 'This account uses Google login. Please use Google Sign-In.' }, 400);
      }
      const anyValid = await bcrypt.compare(password, activeUsers[0].password_hash);
      if (!anyValid) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      return c.json({
        requireHospitalSelection: true,
        hospitals: activeUsers.map((u) => ({
          tenantId: u.tenant_id,
          hospitalName: u.hospital_name,
          slug: u.slug,
          role: u.role,
        })),
      });
    }

    // Verify password
    if (!targetUser.password_hash) {
      return c.json({ error: 'This account uses Google login. Please use Google Sign-In.' }, 400);
    }
    const validPassword = await bcrypt.compare(password, targetUser.password_hash);
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Generate JWT
    const token = await generateToken(
      {
        userId: String(targetUser.id),
        role: targetUser.role,
        tenantId: String(targetUser.tenant_id),
        permissions: getPermissions(targetUser.role),
      },
      c.env.JWT_SECRET,
      8
    );

    return c.json({
      token,
      slug: targetUser.slug,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
      },
      hospital: {
        id: targetUser.tenant_id,
        name: targetUser.hospital_name,
        slug: targetUser.slug,
      },
    });
  } catch (error) {
    console.error('Direct login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

export default loginDirectRoutes;
