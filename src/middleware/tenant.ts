import type { MiddlewareHandler } from 'hono';

const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'super', 'mail', 'ftp', 'blog', 'shop', 'dev', 'test'];

export const tenantMiddleware: MiddlewareHandler<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
  };
  Variables: {
    tenantId?: string;
  };
}> = async (c, next) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname;
  
  // Check if it's the main domain (no subdomain)
  const parts = hostname.split('.');
  
  // For development (localhost)
  if (hostname === 'localhost' || hostname.includes('localhost')) {
    // Check for tenant query param, header, or subdomain header
    const tenantId = c.req.query('tenant') || c.req.header('X-Tenant-ID');
    const tenantSubdomain = c.req.header('X-Tenant-Subdomain');
    
    if (tenantSubdomain) {
      // Look up tenant by subdomain
      const result = await c.env.DB.prepare(
        'SELECT id, name, status FROM tenants WHERE subdomain = ?'
      ).bind(tenantSubdomain).first<{ id: string; name: string; status: string }>();
      
      if (result) {
        c.set('tenantId', result.id);
      }
    } else if (tenantId) {
      c.set('tenantId', tenantId);
    }
    await next();
    return;
  }
  
  // Main domain access (super admin) or workers.dev / pages.dev deployment
  // workers.dev hostnames like hms-saas-production.rahmatullahzisan.workers.dev
  // have 4+ parts but are NOT tenant subdomains — use header-based resolution
  if (parts.length <= 2 || hostname.endsWith('.workers.dev') || hostname.endsWith('.pages.dev')) {
    const tenantId = c.req.query('tenant') || c.req.header('X-Tenant-ID');
    const tenantSubdomain = c.req.header('X-Tenant-Subdomain');

    if (tenantSubdomain) {
      // Look up tenant by subdomain header
      const result = await c.env.DB.prepare(
        'SELECT id, name, status FROM tenants WHERE subdomain = ?'
      ).bind(tenantSubdomain).first<{ id: string; name: string; status: string }>();

      if (result) {
        c.set('tenantId', result.id);
      }
    } else if (tenantId) {
      c.set('tenantId', tenantId);
    }
    await next();
    return;
  }
  
  // Extract subdomain
  const subdomain = parts[0];
  
  // Check reserved names
  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return c.json({ error: 'Invalid subdomain' }, 400);
  }
  
  // Validate subdomain format (3-63 chars, lowercase, numbers, hyphens)
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(subdomain)) {
    return c.json({ error: 'Invalid subdomain format' }, 400);
  }
  
  // Look up tenant in database
  try {
    const result = await c.env.DB.prepare(
      'SELECT id, name, status FROM tenants WHERE subdomain = ?'
    ).bind(subdomain).first<{ id: string; name: string; status: string }>();
    
    if (!result) {
      return c.json({ error: 'Hospital not found' }, 404);
    }
    
    if (result.status === 'inactive') {
      return c.json({ error: 'Hospital account is inactive' }, 403);
    }
    
    if (result.status === 'suspended') {
      return c.json({ error: 'Hospital account is suspended' }, 403);
    }
    
    c.set('tenantId', result.id);
    await next();
  } catch (error) {
    console.error('Tenant lookup error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
};
