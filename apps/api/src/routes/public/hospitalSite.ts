import { Hono } from 'hono';
import type { Env, Variables } from '../../types';

/**
 * Public hospital website routes — serves pre-rendered HTML from KV + CF Cache API.
 *
 * Cache strategy (3 layers):
 *  1. CF Cache API (caches.default) — CDN edge, no Worker invocation on HIT
 *  2. KV — pre-rendered HTML, Worker reads (fast, no D1)
 *  3. D1 fallback — only if KV miss (rare, triggers re-render)
 */
const hospitalSite = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Valid public pages that can be served */
const VALID_PAGES = new Set(['', 'doctors', 'services', 'about', 'contact']);

/**
 * Extracts tenant subdomain from Host header.
 * e.g. "hms-demo.ozzyl.com" → "demo"
 * e.g. "hms-demo.localhost:8787" → "demo"
 */
function getSubdomain(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0]; // strip port
  const parts = hostname.split('.');
  const first = parts[0];
  if (first.startsWith('hms-')) {
    return first.slice(4); // exact prefix strip, avoids replace edge case
  }
  return null;
}

hospitalSite.get('/:page?', async (c) => {
  const page = c.req.param('page') || '';

  // Only serve known pages
  if (!VALID_PAGES.has(page)) {
    return c.notFound();
  }

  const subdomain = getSubdomain(c.req.header('host'));
  if (!subdomain) {
    return c.json({ error: 'Invalid subdomain' }, 400);
  }

  const pagePath = page ? `/site/${page}` : '/site';
  const cacheKey = `site:${subdomain}:${pagePath}`;

  // ── Layer 1: CF Cache API (CDN edge) ──
  // On custom domains (ozzyl.com), this prevents Worker invocation entirely.
  // On workers.dev, it still works within the same PoP.
  const cache = caches.default;
  const cacheRequest = new Request(c.req.url);
  const cachedResponse = await cache.match(cacheRequest);
  if (cachedResponse) {
    return cachedResponse;
  }

  // ── Layer 2: KV pre-rendered HTML ──
  const html = await c.env.KV.get(cacheKey);

  if (!html) {
    // KV miss — could be disabled or never rendered
    // Check if website is enabled
    const config = await c.env.DB.prepare(
      'SELECT is_enabled FROM website_config wc JOIN tenants t ON wc.tenant_id = t.id WHERE t.subdomain = ?'
    ).bind(subdomain).first();

    if (!config || !config.is_enabled) {
      return c.html(
        '<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><h1>Website coming soon</h1></body></html>',
        404
      );
    }

    // Trigger async re-render (KV will be populated for next request)
    // For now, return a "loading" state — this should be very rare
    return c.html(
      '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><p>Loading website... please wait.</p></body></html>',
      200
    );
  }

  // Build response with cache headers
  const response = new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });

  // Store in CF Cache API (non-blocking)
  c.executionCtx.waitUntil(cache.put(cacheRequest, response.clone()));

  // ── Track pageview (non-blocking) — stores subdomain directly (no D1 lookup) ──
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `INSERT INTO website_pageviews (subdomain, page, referrer, user_agent, viewed_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(
      subdomain,
      pagePath,
      c.req.header('referer') || null,
      (c.req.header('user-agent') || '').slice(0, 200)
    ).run().catch(() => { /* pageview tracking failure is non-fatal */ })
  );

  return response;
});

/**
 * Sitemap.xml generation
 */
hospitalSite.get('/sitemap.xml', async (c) => {
  const subdomain = getSubdomain(c.req.header('host'));
  if (!subdomain) return c.text('', 404);

  const host = c.req.header('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  const pages = ['', '/doctors', '/services', '/about', '/contact'];
  const urls = pages.map(p => `
    <url>
      <loc>${baseUrl}/site${p}</loc>
      <changefreq>weekly</changefreq>
      <priority>${p === '' ? '1.0' : '0.8'}</priority>
    </url>`
  ).join('');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400',
    },
  });
});

/**
 * Robots.txt
 */
hospitalSite.get('/robots.txt', async (c) => {
  const host = c.req.header('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const robots = `User-agent: *
Allow: /site/
Disallow: /api/
Disallow: /dashboard/
Disallow: /login
Sitemap: ${protocol}://${host}/site/sitemap.xml
`;
  return new Response(robots, {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, s-maxage=86400' },
  });
});

export default hospitalSite;
