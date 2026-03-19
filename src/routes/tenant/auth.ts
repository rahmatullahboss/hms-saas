import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth';
import type { Env, Variables } from '../../types';
import { getDb } from '../../db';


const tenantAuthRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Validation schemas ──────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(1, { message: 'Password required' }),
});

const registerSchema = z.object({
  email: z.string().email({ message: 'Valid email required' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  name: z.string().min(1, { message: 'Name required' }),
  role: z.enum([
    'hospital_admin', 'laboratory', 'reception', 'md', 'director', 'pharmacist', 'accountant',
  ], { message: 'Invalid role' }),
});

// ─── Login ────────────────────────────────────────────────────────────
tenantAuthRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = getDb(c.env.DB);
  const { email, password } = c.req.valid('json');
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ error: 'Tenant not identified' }, 400);
  }

  try {
    const user = await db.$client.prepare(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ? AND tenant_id = ?'
    ).bind(email, tenantId).first<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      role: string;
    }>();

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Bcrypt-only password verification (no dev backdoors)
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = await generateToken(
      {
        userId: user.id,
        role: user.role,
        tenantId,
        permissions: getPermissions(user.role),
      },
      c.env.JWT_SECRET,
      8
    );

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

// ─── Register (requires hospital_admin role) ─────────────────────────
tenantAuthRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const db = getDb(c.env.DB);
  const { email, password, name, role } = c.req.valid('json');
  const tenantId = c.get('tenantId');
  const callerRole = c.get('role');

  if (!tenantId) {
    return c.json({ error: 'Tenant not identified' }, 400);
  }

  // Only hospital_admin can create users
  if (callerRole !== 'hospital_admin') {
    return c.json({ error: 'Forbidden: only hospital_admin can register users' }, 403);
  }

  try {
    // Check if email already exists for this tenant
    const existing = await db.$client.prepare(
      'SELECT id FROM users WHERE email = ? AND tenant_id = ?'
    ).bind(email, tenantId).first();

    if (existing) {
      return c.json({ error: 'User with this email already exists' }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.$client.prepare(
      'INSERT INTO users (email, password_hash, name, role, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
    ).bind(email, passwordHash, name, role, tenantId).run();

    return c.json({
      message: 'User created successfully',
      userId: result.meta.last_row_id,
    }, 201);
  } catch (error) {
    console.error('Register error:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

// ─── Logout ───────────────────────────────────────────────────────────
tenantAuthRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ message: 'Logged out' });
  }

  const token = authHeader.substring(7);

  try {
    // Blacklist token for 8 hours (matching token lifetime)
    await c.env.KV.put(`blacklist:${token}`, '1', { expirationTtl: 8 * 3600 });
    return c.json({ message: 'Logged out successfully' });
  } catch {
    return c.json({ message: 'Logged out' });
  }
});

// ─── Permission map ───────────────────────────────────────────────────
function getPermissions(role: string): string[] {
  const permissions: Record<string, string[]> = {
    hospital_admin: ['*'],
    laboratory: [
      'dashboard:read',
      'tests:read', 'tests:write',
      'patients:read',
    ],
    reception: [
      'dashboard:read',
      'patients:read', 'patients:write',
      'appointments:read', 'appointments:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
    ],
    pharmacist: [
      'dashboard:read',
      'pharmacy:read', 'pharmacy:write',
      'patients:read',
    ],
    md: [
      'dashboard:read',
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'pharmacy:read', 'pharmacy:write',
      'staff:read', 'staff:write', 'staff:delete',
      'hr:read', 'hr:write',
      'reports:read', 'reports:write',
      'accounting:read', 'accounting:write',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
      'profit:calculate',
      'shareholders:read', 'shareholders:write',
      'settings:read', 'settings:write',
      'audit:read',
    ],
    director: [
      'dashboard:read',
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'pharmacy:read', 'pharmacy:write',
      'staff:read', 'staff:write', 'staff:delete',
      'reports:read', 'reports:write',
      'accounting:read', 'accounting:write',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
      'profit:calculate', 'profit:approve',
      'shareholders:read', 'shareholders:write', 'shareholders:delete',
      'settings:read', 'settings:write',
      'audit:read',
    ],
  };

  return permissions[role] || [];
}

export default tenantAuthRoutes;
