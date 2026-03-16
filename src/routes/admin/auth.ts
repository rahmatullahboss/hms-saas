import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth';
import { loginSchema, registerSchema } from '../../schemas/admin';

const authRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    JWT_SECRET: string;
  };
}>();

// Login for super admin (main domain)
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  try {
    // Look up super admin user
    const user = await c.env.DB.prepare(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ? AND tenant_id IS NULL'
    ).bind(email).first<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      role: string;
    }>();
    
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    // Generate token
    const token = await generateToken({
      userId: user.id,
      role: user.role,
      permissions: getPermissions(user.role),
    }, c.env.JWT_SECRET, 24);

    
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

// Register first super admin (only if no super admin exists)
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  
  // Check if super admin already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE tenant_id IS NULL'
  ).first();
  
  if (existing) {
    return c.json({ error: 'Super admin already exists' }, 400);
  }
  
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await c.env.DB.prepare(
      'INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(email, passwordHash, name, 'super_admin').run();
    
    return c.json({ 
      message: 'Super admin created successfully',
      userId: result.meta.last_row_id 
    }, 201);
  } catch (error) {
    console.error('Register error:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

// Logout
authRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ message: 'Logged out' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Blacklist token for remaining validity (assuming 24h max)
    await c.env.KV.put(`blacklist:${token}`, '1', { expirationTtl: 86400 });
    return c.json({ message: 'Logged out successfully' });
  } catch (error) {
    return c.json({ message: 'Logged out' });
  }
});

function getPermissions(role: string): string[] {
  const permissions: Record<string, string[]> = {
    super_admin: [
      'hospitals:read', 'hospitals:write', 'hospitals:delete',
      'users:read', 'users:write',
      'settings:read', 'settings:write',
    ],
    hospital_admin: [
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'staff:read', 'staff:write',
      'reports:read',
    ],
    laboratory: [
      'tests:read', 'tests:write',
      'patients:read',
    ],
    reception: [
      'patients:read', 'patients:write',
      'tests:read', 'tests:write',
      'billing:read', 'billing:write',
      'income:read', 'income:write',
      'expenses:read', 'expenses:write',
    ],
    md: [
      'patients:read',
      'tests:read',
      'billing:read',
      'staff:read', 'staff:write',
      'reports:read',
      'profit:calculate',
    ],
    director: [
      'patients:read',
      'tests:read',
      'billing:read',
      'staff:read', 'staff:write',
      'reports:read',
      'profit:calculate', 'profit:approve',
      'shareholders:read', 'shareholders:write',
      'settings:read', 'settings:write',
    ],
  };
  
  return permissions[role] || [];
}

export default authRoutes;
