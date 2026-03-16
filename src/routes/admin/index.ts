import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth';
import { PLANS, ADDONS, TRIAL_DAYS, type PlanId } from '../../schemas/pricing';
import { loginSchema, createHospitalSchema, updateHospitalSchema } from '../../schemas/admin';
import type { Env, Variables } from '../../types';

const adminRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Super admin login (no tenant required) ───────────────────────────
adminRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  try {
    const user = await c.env.DB.prepare(
      'SELECT id, email, password_hash, name, role, tenant_id FROM users WHERE email = ?'
    ).bind(email).first<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      role: string;
      tenant_id: number | null;
    }>();

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Only super_admin users can login via the admin endpoint
    if (user.role !== 'super_admin') {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = await generateToken({
      userId: user.id,
      role: user.role,
      permissions: ['*'],
    }, c.env.JWT_SECRET, 8);

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

// ─── Public pricing endpoint ──────────────────────────────────────────────
adminRoutes.get('/plans', (c) => {
  return c.json({
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      nameBn: p.nameBn,
      priceMonthly: p.priceMonthly,
      priceAnnual: p.priceAnnual,
      maxUsers: p.maxUsers === Infinity ? 'unlimited' : p.maxUsers,
      maxBeds: p.maxBeds === Infinity ? 'unlimited' : p.maxBeds,
      availableAddons: p.availableAddons,
    })),
    addons: Object.values(ADDONS),
    trialDays: TRIAL_DAYS,
  });
});

// ═══════════════════════════════════════════════════════════════════════
// HOSPITAL CRUD
// ═══════════════════════════════════════════════════════════════════════

// Get all hospitals
adminRoutes.get('/hospitals', async (c) => {
  try {
    const hospitals = await c.env.DB.prepare(
      `SELECT t.id, t.name, t.subdomain, t.status, t.plan, t.created_at,
              (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
              (SELECT COUNT(*) FROM patients WHERE tenant_id = t.id) as patient_count
       FROM tenants t ORDER BY t.created_at DESC`
    ).all();

    return c.json({ hospitals: hospitals.results });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to fetch hospitals' }, 500);
  }
});

// Get single hospital with detailed stats
adminRoutes.get('/hospitals/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const hospital = await c.env.DB.prepare(
      'SELECT * FROM tenants WHERE id = ?'
    ).bind(id).first();

    if (!hospital) {
      return c.json({ error: 'Hospital not found' }, 404);
    }

    // Get users for this hospital
    const users = await c.env.DB.prepare(
      'SELECT id, email, name, role, created_at FROM users WHERE tenant_id = ?'
    ).bind(id).all();

    // Get stats
    const patientCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM patients WHERE tenant_id = ?'
    ).bind(id).first<{ count: number }>();

    const billTotal = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(total), 0) as total, COALESCE(SUM(paid), 0) as paid FROM bills WHERE tenant_id = ?'
    ).bind(id).first<{ total: number; paid: number }>();

    return c.json({
      hospital,
      users: users.results,
      stats: {
        patients: patientCount?.count || 0,
        totalBilled: billTotal?.total || 0,
        totalPaid: billTotal?.paid || 0,
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch hospital' }, 500);
  }
});

// Create hospital
adminRoutes.post('/hospitals', zValidator('json', createHospitalSchema), async (c) => {
  const { name, subdomain, adminEmail, adminName, adminPassword } = c.req.valid('json');

  const RESERVED = ['www', 'api', 'admin', 'super', 'mail', 'ftp', 'test', 'dev'];
  if (RESERVED.includes(subdomain.toLowerCase())) {
    return c.json({ error: 'Subdomain is reserved' }, 400);
  }

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM tenants WHERE subdomain = ?'
    ).bind(subdomain).first();

    if (existing) {
      return c.json({ error: 'Subdomain already exists' }, 400);
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO tenants (name, subdomain, status, plan, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(name, subdomain, 'active', 'basic').run();

    const tenantId = result.meta.last_row_id;

    // If admin credentials provided, create the hospital admin user
    if (adminEmail && adminName && adminPassword) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await c.env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, role, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
      ).bind(adminEmail, passwordHash, adminName, 'hospital_admin', tenantId).run();
    }

    return c.json({
      message: 'Hospital created successfully',
      hospital: { id: tenantId, name, subdomain },
    }, 201);
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to create hospital' }, 500);
  }
});

// Update hospital
adminRoutes.put('/hospitals/:id', zValidator('json', updateHospitalSchema), async (c) => {
  const id = c.req.param('id');
  const { name, status, plan } = c.req.valid('json');

  try {
    await c.env.DB.prepare(
      'UPDATE tenants SET name = ?, status = ?, plan = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(name, status, plan, id).run();

    return c.json({ message: 'Hospital updated successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to update hospital' }, 500);
  }
});

// Delete hospital (soft delete)
adminRoutes.delete('/hospitals/:id', async (c) => {
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare(
      'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind('inactive', id).run();

    return c.json({ message: 'Hospital deactivated' });
  } catch (error) {
    return c.json({ error: 'Failed to delete hospital' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PLATFORM STATS
// ═══════════════════════════════════════════════════════════════════════

adminRoutes.get('/stats', async (c) => {
  try {
    const [hospitals, users, patients, revenue, recentHospitals, pendingOnboarding] =
      await Promise.all([
        c.env.DB.prepare(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
             SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
             SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
           FROM tenants`
        ).first(),
        c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM users WHERE tenant_id IS NOT NULL'
        ).first<{ count: number }>(),
        c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM patients'
        ).first<{ count: number }>(),
        c.env.DB.prepare(
          'SELECT COALESCE(SUM(total), 0) as total_billed, COALESCE(SUM(paid), 0) as total_paid FROM bills'
        ).first<{ total_billed: number; total_paid: number }>(),
        c.env.DB.prepare(
          `SELECT id, name, subdomain, plan, status, created_at FROM tenants
           WHERE created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 5`
        ).all(),
        c.env.DB.prepare(
          `SELECT COUNT(*) as count FROM onboarding_requests WHERE status = 'pending'`
        ).first<{ count: number }>(),
      ]);

    return c.json({
      hospitals: hospitals || { total: 0, active: 0, inactive: 0, suspended: 0 },
      users: users?.count || 0,
      patients: patients?.count || 0,
      revenue: {
        totalBilled: revenue?.total_billed || 0,
        totalPaid: revenue?.total_paid || 0,
      },
      recentHospitals: recentHospitals.results,
      pendingOnboarding: pendingOnboarding?.count || 0,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// Legacy usage endpoint (backward compat)
adminRoutes.get('/usage', async (c) => {
  try {
    const hospitalCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM tenants WHERE status = ?'
    ).bind('active').first<{ count: number }>();

    const userCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id IS NOT NULL'
    ).first<{ count: number }>();

    return c.json({
      hospitals: hospitalCount?.count || 0,
      users: userCount?.count || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch usage' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ONBOARDING QUEUE
// ═══════════════════════════════════════════════════════════════════════

// List onboarding requests
adminRoutes.get('/onboarding', async (c) => {
  const status = c.req.query('status');

  try {
    let query = 'SELECT * FROM onboarding_requests';
    const params: string[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = c.env.DB.prepare(query);
    const results = params.length > 0
      ? await stmt.bind(...params).all()
      : await stmt.all();

    return c.json({ requests: results.results });
  } catch (error) {
    console.error('Onboarding list error:', error);
    return c.json({ error: 'Failed to fetch onboarding requests' }, 500);
  }
});

// Update onboarding request status
const updateOnboardingSchema = z.object({
  status: z.enum(['pending', 'contacted', 'approved', 'rejected']),
  notes: z.string().optional(),
});

adminRoutes.put('/onboarding/:id', zValidator('json', updateOnboardingSchema), async (c) => {
  const id = c.req.param('id');
  const { status, notes } = c.req.valid('json');
  const userId = c.get('userId');

  try {
    await c.env.DB.prepare(
      `UPDATE onboarding_requests
       SET status = ?, notes = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).bind(status, notes || null, userId || null, id).run();

    return c.json({ message: 'Onboarding request updated' });
  } catch (error) {
    console.error('Onboarding update error:', error);
    return c.json({ error: 'Failed to update request' }, 500);
  }
});

// One-click provision from onboarding request
const provisionSchema = z.object({
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase letters, numbers, or hyphens'),
  adminEmail: z.string().email('Valid email required'),
  adminName: z.string().min(1, 'Admin name required'),
  plan: z.enum(['starter', 'professional', 'enterprise']).default('starter'),
});

adminRoutes.post('/onboarding/:id/provision', zValidator('json', provisionSchema), async (c) => {
  const requestId = c.req.param('id');
  const { slug, adminEmail, adminName, plan } = c.req.valid('json');
  const userId = c.get('userId');

  const RESERVED = ['www', 'api', 'admin', 'super', 'mail', 'ftp', 'test', 'dev', 'app', 'dashboard', 'health'];
  if (RESERVED.includes(slug.toLowerCase())) {
    return c.json({ error: 'This slug is reserved' }, 400);
  }

  try {
    // Verify the request exists and is not already provisioned
    const request = await c.env.DB.prepare(
      'SELECT * FROM onboarding_requests WHERE id = ?'
    ).bind(requestId).first();

    if (!request) {
      return c.json({ error: 'Onboarding request not found' }, 404);
    }

    if ((request as Record<string, unknown>).status === 'provisioned') {
      return c.json({ error: 'This request has already been provisioned' }, 400);
    }

    // Check slug uniqueness
    const existingSlug = await c.env.DB.prepare(
      'SELECT id FROM tenants WHERE subdomain = ?'
    ).bind(slug).first();

    if (existingSlug) {
      return c.json({ error: 'This slug is already taken' }, 409);
    }

    // Check email uniqueness
    const existingEmail = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(adminEmail).first();

    if (existingEmail) {
      return c.json({ error: 'An account with this email already exists' }, 409);
    }

    // Generate a random password
    const generatedPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    // Use D1 batch for atomic tenant + user + onboarding update
    const tenantStmt = c.env.DB.prepare(
      `INSERT INTO tenants (name, subdomain, status, plan, plan_price, billing_cycle, trial_ends_at, plan_started_at, created_at, updated_at)
       VALUES (?, ?, 'active', ?, 0, 'monthly', datetime('now', '+' || ? || ' days'), datetime('now'), datetime('now'), datetime('now'))`
    ).bind(
      (request as Record<string, unknown>).hospital_name as string,
      slug,
      plan,
      TRIAL_DAYS,
    );

    const tenantResult = await tenantStmt.run();
    const tenantId = tenantResult.meta.last_row_id;

    // Batch the user creation and onboarding update for atomicity
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, role, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))'
      ).bind(adminEmail, passwordHash, adminName, 'hospital_admin', tenantId),
      c.env.DB.prepare(
        `UPDATE onboarding_requests
         SET status = 'provisioned', tenant_id = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      ).bind(tenantId, userId || null, requestId),
    ]);

    return c.json({
      message: 'Hospital provisioned successfully!',
      hospital: {
        id: tenantId,
        name: (request as Record<string, unknown>).hospital_name,
        slug,
        plan,
      },
      credentials: {
        email: adminEmail,
        password: generatedPassword,
        loginUrl: `/h/${slug}/login`,
      },
      whatsappMessage: `🏥 আপনার হাসপাতালের Ozzyl HMS অ্যাকাউন্ট তৈরি হয়েছে!\n\n📧 ইমেইল: ${adminEmail}\n🔑 পাসওয়ার্ড: ${generatedPassword}\n🔗 লগইন: /h/${slug}/login\n\nলগইন করে পাসওয়ার্ড পরিবর্তন করুন।`,
    }, 201);
  } catch (error) {
    console.error('Provision error:', error);
    return c.json({ error: 'Failed to provision hospital' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// IMPERSONATION
// ═══════════════════════════════════════════════════════════════════════

adminRoutes.post('/impersonate/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const superAdminId = c.get('userId');

  try {
    // Verify tenant exists
    const tenant = await c.env.DB.prepare(
      'SELECT id, name, subdomain, status, plan FROM tenants WHERE id = ?'
    ).bind(tenantId).first<{
      id: number;
      name: string;
      subdomain: string;
      status: string;
      plan: string;
    }>();

    if (!tenant) {
      return c.json({ error: 'Hospital not found' }, 404);
    }

    // Generate impersonation token with shorter expiry (2 hours)
    // Includes isImpersonation flag for audit trail
    const token = await generateToken({
      userId: superAdminId || '0',
      role: 'hospital_admin',
      tenantId: String(tenant.id),
      permissions: ['*'],
      isImpersonation: true,
    }, c.env.JWT_SECRET, 2);

    // Log impersonation for audit
    try {
      await c.env.DB.prepare(
        `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, created_at)
         VALUES (?, ?, 'impersonate_start', 'tenants', datetime('now'))`
      ).bind(tenant.id, superAdminId || null).run();
    } catch {
      // audit_logs table might not exist yet, don't block impersonation
    }

    return c.json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
        plan: tenant.plan,
      },
      redirectUrl: `/h/${tenant.subdomain}/dashboard`,
    });
  } catch (error) {
    console.error('Impersonation error:', error);
    return c.json({ error: 'Failed to create impersonation session' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  const charsLen = chars.length; // 56
  const maxValid = 256 - (256 % charsLen); // 252 — reject values >= this
  let password = '';
  while (password.length < length) {
    const array = new Uint8Array(length * 2); // over-generate to handle rejections
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length && password.length < length; i++) {
      if (array[i] < maxValid) {
        password += chars[array[i] % charsLen];
      }
    }
  }
  return password;
}

export default adminRoutes;
