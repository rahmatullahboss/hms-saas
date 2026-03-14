import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth';

const adminRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    JWT_SECRET: string;
  };
  Variables: {
    userId?: string;
    role?: string;
  };
}>();

// Super admin login (no tenant required)
adminRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }
  
  try {
    const user = await c.env.DB.prepare(
      'SELECT id, email, password_hash, name, role, tenant_id FROM users WHERE email = ? AND role = \'super_admin\''
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
    
    // Verify password with bcrypt
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    // Generate token (no tenant for super admin)
    const token = generateToken({
      userId: user.id,
      role: user.role,
      tenantId: user.tenant_id?.toString() || undefined,
      permissions: ['*'],
    }, c.env.JWT_SECRET, '8h');
    
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

// Get all hospitals
adminRoutes.get('/hospitals', async (c) => {
  try {
    const hospitals = await c.env.DB.prepare(
      'SELECT id, name, subdomain, status, plan, created_at FROM tenants ORDER BY created_at DESC'
    ).all();
    
    return c.json({ hospitals: hospitals.results });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to fetch hospitals' }, 500);
  }
});

// Get single hospital
adminRoutes.get('/hospitals/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const hospital = await c.env.DB.prepare(
      'SELECT * FROM tenants WHERE id = ?'
    ).bind(id).first();
    
    if (!hospital) {
      return c.json({ error: 'Hospital not found' }, 404);
    }
    
    return c.json({ hospital });
  } catch (error) {
    return c.json({ error: 'Failed to fetch hospital' }, 500);
  }
});

// Create hospital (also creates D1 database)
adminRoutes.post('/hospitals', async (c) => {
  const { name, subdomain, adminEmail, adminName, adminPassword } = await c.req.json();
  
  // Validate subdomain
  const subdomainRegex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
  if (!subdomainRegex.test(subdomain)) {
    return c.json({ error: 'Invalid subdomain format' }, 400);
  }
  
  const RESERVED = ['www', 'api', 'admin', 'super', 'mail', 'ftp', 'test', 'dev'];
  if (RESERVED.includes(subdomain.toLowerCase())) {
    return c.json({ error: 'Subdomain is reserved' }, 400);
  }
  
  try {
    // Check if subdomain exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM tenants WHERE subdomain = ?'
    ).bind(subdomain).first();
    
    if (existing) {
      return c.json({ error: 'Subdomain already exists' }, 400);
    }
    
    // Create tenant
    const result = await c.env.DB.prepare(
      'INSERT INTO tenants (name, subdomain, status, plan, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(name, subdomain, 'active', 'basic').run();
    
    const tenantId = result.meta.last_row_id;
    
    // Auto-create website config (hospital gets a public website by default)
    try {
      await c.env.DB.prepare(
        `INSERT INTO website_config (tenant_id, is_enabled, theme, primary_color, secondary_color)
         VALUES (?, 1, 'arogyaseva', '#0891b2', '#059669')`
      ).bind(tenantId).run();
    } catch (e) {
      // Non-critical: website table may not exist yet if migration hasn't run
      console.warn('[Admin] Auto-create website_config skipped:', e);
    }

    // TODO: In production, create D1 database for this tenant
    // For now, we use the main database with tenant_id column
    
    return c.json({ 
      message: 'Hospital created successfully',
      hospital: { id: tenantId, name, subdomain }
    }, 201);
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to create hospital' }, 500);
  }
});

// Update hospital
adminRoutes.put('/hospitals/:id', async (c) => {
  const id = c.req.param('id');
  const { name, status, plan } = await c.req.json();
  
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

// Get usage stats
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

export default adminRoutes;
