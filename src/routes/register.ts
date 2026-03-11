import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth';
import type { Env } from '../types';

const registerRoutes = new Hono<{ Bindings: Env }>();

const registerSchema = z.object({
  hospitalName: z.string().min(2, 'Hospital name must be at least 2 characters'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(63, 'Slug must be at most 63 characters')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase letters, numbers, or hyphens'),
  adminName: z.string().min(1, 'Admin name required'),
  adminEmail: z.string().email('Valid email required'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const RESERVED_SLUGS = ['www', 'api', 'admin', 'super', 'mail', 'ftp', 'test', 'dev', 'app', 'dashboard', 'health'];

// ─── POST /api/register — Public hospital self-signup ─────────────────
registerRoutes.post('/', zValidator('json', registerSchema), async (c) => {
  const { hospitalName, slug, adminName, adminEmail, adminPassword } = c.req.valid('json');

  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return c.json({ error: 'This slug is reserved. Please choose another.' }, 400);
  }

  try {
    // Check slug uniqueness
    const existing = await c.env.DB.prepare(
      'SELECT id FROM tenants WHERE subdomain = ?'
    ).bind(slug).first();

    if (existing) {
      return c.json({ error: 'This slug is already taken. Please choose another.' }, 409);
    }

    // Check admin email uniqueness (global)
    const existingEmail = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND tenant_id IS NULL'
    ).bind(adminEmail).first();

    if (existingEmail) {
      return c.json({ error: 'An account with this email already exists.' }, 409);
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // Create tenant + admin user atomically
    const [tenantResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO tenants (name, subdomain, status, plan, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
      ).bind(hospitalName, slug, 'active', 'basic'),
    ]);

    const tenantId = tenantResult.meta.last_row_id;

    // Create hospital admin user
    const userResult = await c.env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, role, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
    ).bind(adminEmail, passwordHash, adminName, 'hospital_admin', tenantId).run();

    const userId = userResult.meta.last_row_id;

    // Auto-login: generate JWT
    const token = generateToken(
      {
        userId: String(userId),
        role: 'hospital_admin',
        tenantId: String(tenantId),
        permissions: [
          'patients:read', 'patients:write', 'patients:delete',
          'tests:read', 'tests:write', 'billing:read', 'billing:write',
          'pharmacy:read', 'pharmacy:write', 'staff:read', 'staff:write',
          'reports:read', 'reports:write', 'shareholders:read', 'shareholders:write',
          'settings:read', 'settings:write', 'income:read', 'income:write',
          'expenses:read', 'expenses:write',
        ],
      },
      c.env.JWT_SECRET,
      '8h'
    );

    return c.json({
      message: 'Hospital registered successfully',
      slug,
      token,
      user: { id: userId, name: adminName, email: adminEmail, role: 'hospital_admin' },
      hospital: { id: tenantId, name: hospitalName, slug },
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Registration failed. Please try again.' }, 500);
  }
});

export default registerRoutes;
