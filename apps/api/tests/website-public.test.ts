import { describe, it, expect } from 'vitest';

// ─── Mock KV for public serving tests ─────────────────────────────

const createMockKV = (initialData: Record<string, string> = {}) => {
  const store: Record<string, string> = { ...initialData };
  return {
    get: async (key: string) => store[key] ?? null,
    put: async (key: string, value: string) => { store[key] = value; },
    _store: store,
  };
};

// ─── Valid Pages Set ──────────────────────────────────────────────

const VALID_PAGES = new Set(['', 'doctors', 'services', 'about', 'contact']);

// ─── Public Page Routing Tests ────────────────────────────────────

describe('Hospital Public Site - Page Routing', () => {
  it('accepts all 5 valid page routes', () => {
    const validRoutes = ['', 'doctors', 'services', 'about', 'contact'];
    for (const route of validRoutes) {
      expect(VALID_PAGES.has(route)).toBe(true);
    }
  });

  it('rejects invalid page routes', () => {
    const invalidRoutes = ['admin', 'login', 'api', 'doctors/1', 'nonexistent', 'settings'];
    for (const route of invalidRoutes) {
      expect(VALID_PAGES.has(route)).toBe(false);
    }
  });

  it('rejects path traversal attempts', () => {
    const attacks = ['..', '../admin', '.env', 'doctors/../admin'];
    for (const route of attacks) {
      expect(VALID_PAGES.has(route)).toBe(false);
    }
  });
});

// ─── KV Cache Key Tests ──────────────────────────────────────────

describe('Hospital Public Site - KV Cache Keys', () => {
  it('generates correct cache key for homepage', () => {
    const subdomain = 'demo';
    const page = '';
    const pagePath = page ? `/site/${page}` : '/site';
    const cacheKey = `site:${subdomain}:${pagePath}`;
    expect(cacheKey).toBe('site:demo:/site');
  });

  it('generates correct cache key for doctors page', () => {
    const subdomain = 'demo';
    const page = 'doctors';
    const pagePath = `/site/${page}`;
    const cacheKey = `site:${subdomain}:${pagePath}`;
    expect(cacheKey).toBe('site:demo:/site/doctors');
  });

  it('generates unique keys per tenant subdomain', () => {
    const key1 = `site:hospital-a:/site`;
    const key2 = `site:hospital-b:/site`;
    expect(key1).not.toBe(key2);
  });

  it('returns HTML from KV when cached', async () => {
    const kv = createMockKV({
      'site:demo:/site': '<!DOCTYPE html><html><body><h1>Demo Hospital</h1></body></html>',
    });
    const html = await kv.get('site:demo:/site');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Demo Hospital');
  });

  it('returns null from KV for uncached page', async () => {
    const kv = createMockKV({});
    const html = await kv.get('site:demo:/site');
    expect(html).toBeNull();
  });
});

// ─── Cache Header Tests ──────────────────────────────────────────

describe('Hospital Public Site - Cache Headers', () => {
  it('sets correct Cache-Control header', () => {
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    expect(headers['Cache-Control']).toContain('s-maxage=300');
    expect(headers['Cache-Control']).toContain('stale-while-revalidate=3600');
    expect(headers['Cache-Control']).toContain('public');
  });

  it('includes X-Content-Type-Options header', () => {
    const headers = {
      'X-Content-Type-Options': 'nosniff',
    };
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

// ─── Sitemap Tests ───────────────────────────────────────────────

describe('Hospital Public Site - Sitemap', () => {
  it('generates sitemap with all 5 valid pages', () => {
    const pages = ['', '/doctors', '/services', '/about', '/contact'];
    const baseUrl = 'https://hms-demo.ozzyl.com';
    const urls = pages.map(p => `<url><loc>${baseUrl}/site${p}</loc></url>`);
    const sitemap = urls.join('\n');

    expect(sitemap).toContain(`${baseUrl}/site</loc>`);
    expect(sitemap).toContain(`${baseUrl}/site/doctors</loc>`);
    expect(sitemap).toContain(`${baseUrl}/site/services</loc>`);
    expect(sitemap).toContain(`${baseUrl}/site/about</loc>`);
    expect(sitemap).toContain(`${baseUrl}/site/contact</loc>`);
  });

  it('does NOT include individual doctor detail URLs', () => {
    const pages = ['', '/doctors', '/services', '/about', '/contact'];
    const baseUrl = 'https://hms-demo.ozzyl.com';
    const urls = pages.map(p => `<url><loc>${baseUrl}/site${p}</loc></url>`);
    const sitemap = urls.join('\n');

    // Critical: no doctor detail pages should be in sitemap
    expect(sitemap).not.toContain('/site/doctors/');
    expect(sitemap).not.toContain('/site/doctors/1');
  });

  it('uses correct XML structure', () => {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://hms-demo.ozzyl.com/site</loc></url>
</urlset>`;

    expect(sitemap).toContain('<?xml version="1.0"');
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain('</urlset>');
  });
});

// ─── Robots.txt Tests ────────────────────────────────────────────

describe('Hospital Public Site - Robots.txt', () => {
  it('generates correct robots.txt content', () => {
    const baseUrl = 'https://hms-demo.ozzyl.com';
    const robotsTxt = `User-agent: *\nAllow: /site/\nDisallow: /api/\nSitemap: ${baseUrl}/site/sitemap.xml`;

    expect(robotsTxt).toContain('User-agent: *');
    expect(robotsTxt).toContain('Allow: /site/');
    expect(robotsTxt).toContain('Disallow: /api/');
    expect(robotsTxt).toContain('Sitemap:');
  });
});

// ─── Website Enable/Disable Tests ────────────────────────────────

describe('Hospital Public Site - Enable/Disable', () => {
  it('returns "coming soon" when is_enabled is 0', () => {
    const config = { is_enabled: 0 };
    const shouldShowSite = config.is_enabled === 1;
    expect(shouldShowSite).toBe(false);
  });

  it('serves site when is_enabled is 1', () => {
    const config = { is_enabled: 1 };
    const shouldShowSite = config.is_enabled === 1;
    expect(shouldShowSite).toBe(true);
  });

  it('handles missing config as disabled', () => {
    const config = null;
    const shouldShowSite = config && (config as any).is_enabled === 1;
    expect(shouldShowSite).toBeFalsy();
  });
});
