import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../../types';
import { websiteConfigSchema, websiteServiceSchema } from '../../schemas/website';
import { preRenderTenantSite } from '../public/prerender';

const websiteRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Whitelist of allowed column names for dynamic SQL (P0 SQL injection fix)
const ALLOWED_CONFIG_COLUMNS = new Set([
  'is_enabled', 'theme', 'tagline', 'about_text', 'mission_text',
  'founded_year', 'bed_count', 'operating_hours', 'google_maps_embed',
  'whatsapp_number', 'facebook_url', 'seo_title', 'seo_description',
  'seo_keywords', 'primary_color', 'secondary_color',
]);

const ALLOWED_SERVICE_COLUMNS = new Set([
  'name', 'name_bn', 'description', 'icon', 'category', 'is_active', 'sort_order',
]);

// ─── Helper: Get tenant ID from context ──────────────────────────────
function getTenantId(c: any): number {
  const id = c.get('tenantId');
  if (!id) throw new HTTPException(401, { message: 'Tenant not found' });
  return Number(id);
}

function getSubdomain(c: any): string {
  return c.req.header('x-tenant-subdomain') || 'unknown';
}

// ─── GET /api/website/config ─────────────────────────────────────────
websiteRoutes.get('/config', async (c) => {
  const tenantId = getTenantId(c);
  const config = await c.env.DB.prepare(
    'SELECT * FROM website_config WHERE tenant_id = ?'
  ).bind(tenantId).first();

  if (!config) {
    return c.json({ data: null, message: 'No website config found' });
  }

  return c.json({ data: config });
});

// ─── PUT /api/website/config ─────────────────────────────────────────
websiteRoutes.put('/config', zValidator('json', websiteConfigSchema), async (c) => {
  const tenantId = getTenantId(c);
  const data = c.req.valid('json');

  // Build SET clause dynamically — only whitelisted column names (P0 fix)
  const fields = Object.entries(data).filter(([k, v]) => v !== undefined && ALLOWED_CONFIG_COLUMNS.has(k));
  if (fields.length === 0) {
    throw new HTTPException(400, { message: 'No fields to update' });
  }

  fields.push(['updated_at', new Date().toISOString()] as any);

  const setClauses = fields.map(([k]) => `${k} = ?`).join(', ');
  const values = fields.map(([, v]) => v);

  // Upsert: try UPDATE, if 0 rows affected → INSERT
  const result = await c.env.DB.prepare(
    `UPDATE website_config SET ${setClauses} WHERE tenant_id = ?`
  ).bind(...values, tenantId).run();

  if (!result.meta.changes || result.meta.changes === 0) {
    // Insert new config
    const insertFields = ['tenant_id', ...fields.map(([k]) => k)];
    const insertPlaceholders = insertFields.map(() => '?').join(', ');
    await c.env.DB.prepare(
      `INSERT INTO website_config (${insertFields.join(', ')}) VALUES (${insertPlaceholders})`
    ).bind(tenantId, ...values).run();
  }

  // Trigger pre-render in background (non-blocking per adversarial review)
  const subdomain = getSubdomain(c);
  c.executionCtx.waitUntil(
    preRenderTenantSite(c.env.DB, c.env.KV, tenantId, subdomain)
  );

  return c.json({ success: true, message: 'Website config saved. Pages will be refreshed shortly.' });
});

// ─── GET /api/website/services ───────────────────────────────────────
websiteRoutes.get('/services', async (c) => {
  const tenantId = getTenantId(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM website_services WHERE tenant_id = ? ORDER BY sort_order'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

// ─── POST /api/website/services ──────────────────────────────────────
websiteRoutes.post('/services', zValidator('json', websiteServiceSchema), async (c) => {
  const tenantId = getTenantId(c);
  const data = c.req.valid('json');

  await c.env.DB.prepare(
    `INSERT INTO website_services (tenant_id, name, name_bn, description, icon, category, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tenantId, data.name, data.name_bn ?? null, data.description ?? null,
    data.icon ?? '🏥', data.category ?? 'general', data.is_active ?? 1, data.sort_order ?? 0
  ).run();

  // Re-render
  const subdomain = getSubdomain(c);
  c.executionCtx.waitUntil(preRenderTenantSite(c.env.DB, c.env.KV, tenantId, subdomain));

  return c.json({ success: true }, 201);
});

// ─── PUT /api/website/services/:id ───────────────────────────────────
websiteRoutes.put('/services/:id', zValidator('json', websiteServiceSchema.partial()), async (c) => {
  const tenantId = getTenantId(c);
  const serviceId = c.req.param('id');
  const data = c.req.valid('json');

  const fields = Object.entries(data).filter(([k, v]) => v !== undefined && ALLOWED_SERVICE_COLUMNS.has(k));
  if (fields.length === 0) throw new HTTPException(400, { message: 'No fields to update' });

  const setClauses = fields.map(([k]) => `${k} = ?`).join(', ');
  const values = fields.map(([, v]) => v);

  await c.env.DB.prepare(
    `UPDATE website_services SET ${setClauses} WHERE id = ? AND tenant_id = ?`
  ).bind(...values, serviceId, tenantId).run();

  const subdomain = getSubdomain(c);
  c.executionCtx.waitUntil(preRenderTenantSite(c.env.DB, c.env.KV, tenantId, subdomain));

  return c.json({ success: true });
});

// ─── DELETE /api/website/services/:id ────────────────────────────────
websiteRoutes.delete('/services/:id', async (c) => {
  const tenantId = getTenantId(c);
  const serviceId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM website_services WHERE id = ? AND tenant_id = ?'
  ).bind(serviceId, tenantId).run();

  const subdomain = getSubdomain(c);
  c.executionCtx.waitUntil(preRenderTenantSite(c.env.DB, c.env.KV, tenantId, subdomain));

  return c.json({ success: true });
});

// ─── POST /api/website/trigger-render ────────────────────────────────
// Manual re-render trigger (admin use)
websiteRoutes.post('/trigger-render', async (c) => {
  const tenantId = getTenantId(c);
  const subdomain = getSubdomain(c);

  c.executionCtx.waitUntil(preRenderTenantSite(c.env.DB, c.env.KV, tenantId, subdomain));

  return c.json({ success: true, message: 'Re-render triggered' });
});

// ─── GET /api/website/analytics ──────────────────────────────────────
// John's demand: pageview analytics for admin dashboard
websiteRoutes.get('/analytics', async (c) => {
  const tenantId = getTenantId(c);
  const days = Math.min(Math.max(parseInt(c.req.query('days') || '7'), 1), 90);
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Get subdomain for this tenant
  const tenant = await c.env.DB.prepare(
    'SELECT subdomain FROM tenants WHERE id = ?'
  ).bind(tenantId).first<{ subdomain: string }>();
  if (!tenant) throw new HTTPException(404, { message: 'Tenant not found' });

  // Total views in period (supports both tenant_id and subdomain columns)
  const totalResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM website_pageviews
     WHERE (tenant_id = ? OR subdomain = ?) AND viewed_at >= ?`
  ).bind(tenantId, tenant.subdomain, sinceDate).first();

  // Views per page
  const { results: perPage } = await c.env.DB.prepare(
    `SELECT page, COUNT(*) as views FROM website_pageviews
     WHERE (tenant_id = ? OR subdomain = ?) AND viewed_at >= ?
     GROUP BY page ORDER BY views DESC`
  ).bind(tenantId, tenant.subdomain, sinceDate).all();

  // Daily chart data
  const { results: daily } = await c.env.DB.prepare(
    `SELECT DATE(viewed_at) as date, COUNT(*) as views FROM website_pageviews
     WHERE (tenant_id = ? OR subdomain = ?) AND viewed_at >= ?
     GROUP BY DATE(viewed_at) ORDER BY date`
  ).bind(tenantId, tenant.subdomain, sinceDate).all();

  return c.json({
    data: {
      totalViews: (totalResult as any)?.total ?? 0,
      period: `${days}d`,
      perPage: perPage || [],
      daily: daily || [],
    },
  });
});

export default websiteRoutes;

