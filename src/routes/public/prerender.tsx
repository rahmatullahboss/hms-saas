/** @jsxImportSource hono/jsx */
import type { Env } from '../../types';
import { SiteLayout } from './components/SiteLayout';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { DoctorList } from './components/DoctorCard';
import { ServiceList } from './components/ServiceCard';
import { Footer } from './components/Footer';
import { SEOHead } from './components/SEOHead';
import type { ThemeName } from './themes';

interface TenantData {
  tenant: Record<string, any>;
  config: Record<string, any>;
  doctors: any[];
  services: any[];
}

/**
 * Queries D1 for all data needed to render a tenant's website.
 */
async function fetchTenantData(db: D1Database, tenantId: number): Promise<TenantData | null> {
  const [tenant, config, doctorsResult, servicesResult] = await Promise.all([
    db.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first(),
    db.prepare('SELECT * FROM website_config WHERE tenant_id = ?').bind(tenantId).first(),
    db.prepare(
      'SELECT * FROM doctors WHERE tenant_id = ? AND is_public = 1 ORDER BY name'
    ).bind(tenantId).all(),
    db.prepare(
      'SELECT * FROM website_services WHERE tenant_id = ? AND is_active = 1 ORDER BY sort_order'
    ).bind(tenantId).all(),
  ]);

  if (!tenant || !config) return null;

  return {
    tenant: tenant as Record<string, any>,
    config: config as Record<string, any>,
    doctors: (doctorsResult.results || []) as any[],
    services: (servicesResult.results || []) as any[],
  };
}

/**
 * Renders all pages for a tenant and stores them in KV.
 * Called via waitUntil() after admin saves website config or doctor changes.
 *
 * URL pattern: /site/{slug}, /site/{slug}/doctors, etc.
 */
export async function preRenderTenantSite(
  db: D1Database,
  kv: KVNamespace,
  tenantId: number,
  subdomain: string
): Promise<void> {
  const data = await fetchTenantData(db, tenantId);
  if (!data || !data.config.is_enabled) return;

  const { tenant, config, doctors, services } = data;
  const theme = (config.theme as ThemeName) || 'arogyaseva';
  const hospitalName = tenant.name || 'Hospital';

  // Slug-based basePath: /site/{slug}
  const BASE_PATH = `/site/${subdomain}`;

  const commonProps = {
    theme,
    primaryColor: config.primary_color ?? undefined,
    secondaryColor: config.secondary_color ?? undefined,
    hospitalName,
    logoUrl: config.logo_key ? `/api/uploads/${config.logo_key}` : undefined,
  };

  // ── Render all 5 pages in parallel ──
  const [homeHtml, doctorsHtml, servicesHtml, aboutHtml, contactHtml] = await Promise.all([
    // Home page
    renderToString(
      <SiteLayout {...commonProps} title={config.seo_title || hospitalName}
        description={config.seo_description || `${hospitalName} — Your trusted healthcare partner`}>
        <SEOHead hospitalName={hospitalName} description={config.seo_description} doctors={doctors} />
        <Navbar hospitalName={hospitalName} logoUrl={commonProps.logoUrl} basePath={BASE_PATH} />
        <HeroSection hospitalName={hospitalName} tagline={config.tagline} basePath={BASE_PATH} />
        <section class="section section-alt">
          <div class="container">
            <h2 class="section-title text-center">Our Doctors</h2>
            <p class="section-subtitle text-center">Meet our experienced medical team</p>
            <DoctorList doctors={doctors.slice(0, 6)} basePath={BASE_PATH} />
            {doctors.length > 6 && (
              <div class="text-center" style="margin-top:2rem">
                <a href={`${BASE_PATH}/doctors`} class="btn btn-outline">View All Doctors →</a>
              </div>
            )}
          </div>
        </section>
        {services.length > 0 && (
          <section class="section">
            <div class="container">
              <h2 class="section-title text-center">Our Services</h2>
              <p class="section-subtitle text-center">Comprehensive healthcare services</p>
              <ServiceList services={services.slice(0, 6)} />
            </div>
          </section>
        )}
        <Footer hospitalName={hospitalName} address={tenant.address} phone={tenant.phone}
          email={tenant.email} whatsappNumber={config.whatsapp_number}
          facebookUrl={config.facebook_url} basePath={BASE_PATH} subdomain={subdomain} />
      </SiteLayout>
    ),

    // Doctors page
    renderToString(
      <SiteLayout {...commonProps} title={`Our Doctors — ${hospitalName}`}
        description={`Meet the experienced doctors at ${hospitalName}`}>
        <SEOHead hospitalName={hospitalName} doctors={doctors} />
        <Navbar hospitalName={hospitalName} logoUrl={commonProps.logoUrl} basePath={BASE_PATH} />
        <section class="section">
          <div class="container">
            <h1 class="section-title text-center">Our Doctors</h1>
            <p class="section-subtitle text-center">{doctors.length} experienced specialists</p>
            <DoctorList doctors={doctors} basePath={BASE_PATH} />
          </div>
        </section>
        <Footer hospitalName={hospitalName} address={tenant.address} phone={tenant.phone}
          email={tenant.email} basePath={BASE_PATH} subdomain={subdomain} />
      </SiteLayout>
    ),

    // Services page
    renderToString(
      <SiteLayout {...commonProps} title={`Services — ${hospitalName}`}
        description={`Healthcare services offered at ${hospitalName}`}>
        <Navbar hospitalName={hospitalName} logoUrl={commonProps.logoUrl} basePath={BASE_PATH} />
        <section class="section">
          <div class="container">
            <h1 class="section-title text-center">Our Services</h1>
            <p class="section-subtitle text-center">Comprehensive healthcare for you and your family</p>
            <ServiceList services={services} />
          </div>
        </section>
        <Footer hospitalName={hospitalName} address={tenant.address} phone={tenant.phone}
          email={tenant.email} basePath={BASE_PATH} subdomain={subdomain} />
      </SiteLayout>
    ),

    // About page
    renderToString(
      <SiteLayout {...commonProps} title={`About — ${hospitalName}`}
        description={config.about_text?.slice(0, 160) || `About ${hospitalName}`}>
        <Navbar hospitalName={hospitalName} logoUrl={commonProps.logoUrl} basePath={BASE_PATH} />
        <section class="section">
          <div class="container" style="max-width:800px">
            <h1 class="section-title text-center">About {hospitalName}</h1>
            {config.founded_year && (
              <p class="section-subtitle text-center">Serving since {config.founded_year}</p>
            )}
            {config.about_text && (
              <div style="font-size:1.1rem;line-height:1.8;opacity:0.85;margin-top:2rem">
                {config.about_text.split('\n').map((para: string) => <p style="margin-bottom:1rem">{para}</p>)}
              </div>
            )}
            {config.mission_text && (
              <div style="margin-top:3rem;padding:2rem;border-radius:1rem;background:var(--color-bg-alt,#f0f4f8)">
                <h2 style="font-size:1.25rem;font-weight:600;margin-bottom:1rem">Our Mission</h2>
                <p style="font-size:1.05rem;line-height:1.7;opacity:0.8">{config.mission_text}</p>
              </div>
            )}
            <div class="grid grid-3" style="margin-top:3rem;text-align:center">
              {config.bed_count && (
                <div class="card"><div class="card-body">
                  <div style="font-size:2rem;font-weight:800;color:var(--color-primary)">{config.bed_count}</div>
                  <p style="opacity:0.6">Beds</p>
                </div></div>
              )}
              <div class="card"><div class="card-body">
                <div style="font-size:2rem;font-weight:800;color:var(--color-primary)">{doctors.length}</div>
                <p style="opacity:0.6">Doctors</p>
              </div></div>
              {services.length > 0 && (
                <div class="card"><div class="card-body">
                  <div style="font-size:2rem;font-weight:800;color:var(--color-primary)">{services.length}</div>
                  <p style="opacity:0.6">Services</p>
                </div></div>
              )}
            </div>
          </div>
        </section>
        <Footer hospitalName={hospitalName} address={tenant.address} phone={tenant.phone}
          email={tenant.email} basePath={BASE_PATH} subdomain={subdomain} />
      </SiteLayout>
    ),

    // Contact page
    renderToString(
      <SiteLayout {...commonProps} title={`Contact — ${hospitalName}`}
        description={`Contact ${hospitalName} for appointments and inquiries`}>
        <Navbar hospitalName={hospitalName} logoUrl={commonProps.logoUrl} basePath={BASE_PATH} />
        <section class="section">
          <div class="container" style="max-width:800px">
            <h1 class="section-title text-center">Contact Us</h1>
            <p class="section-subtitle text-center">We'd love to hear from you</p>
            <div class="grid grid-2" style="margin-top:2rem">
              <div class="card"><div class="card-body">
                <h3 style="font-weight:600;margin-bottom:1rem">📍 Address</h3>
                <p style="opacity:0.7;line-height:1.6">{tenant.address || 'Contact us for address'}</p>
              </div></div>
              <div class="card"><div class="card-body">
                <h3 style="font-weight:600;margin-bottom:1rem">📞 Phone</h3>
                <p style="opacity:0.7">{tenant.phone || 'Contact us'}</p>
                {tenant.email && <p style="opacity:0.7;margin-top:0.5rem">✉️ {tenant.email}</p>}
              </div></div>
            </div>
            {config.operating_hours && (
              <div class="card" style="margin-top:1.5rem"><div class="card-body">
                <h3 style="font-weight:600;margin-bottom:1rem">🕐 Operating Hours</h3>
                <p style="opacity:0.7">{config.operating_hours}</p>
              </div></div>
            )}
            {config.google_maps_embed && (
              <div style="margin-top:2rem;border-radius:1rem;overflow:hidden;height:350px">
                <iframe src={config.google_maps_embed} width="100%" height="350"
                  sandbox="allow-scripts allow-same-origin"
                  style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                  title="Hospital Location" />
              </div>
            )}
            <div class="text-center" style="margin-top:2rem">
              <a href="/patient/login" class="btn btn-primary">🔐 Patient Portal Login</a>
            </div>
          </div>
        </section>
        <Footer hospitalName={hospitalName} address={tenant.address} phone={tenant.phone}
          email={tenant.email} whatsappNumber={config.whatsapp_number}
          facebookUrl={config.facebook_url} basePath={BASE_PATH} subdomain={subdomain} />
      </SiteLayout>
    ),
  ]);

  // Map rendered HTML to page paths (slug-based)
  const pages: Record<string, string> = {
    [`/site/${subdomain}`]: homeHtml,
    [`/site/${subdomain}/doctors`]: doctorsHtml,
    [`/site/${subdomain}/services`]: servicesHtml,
    [`/site/${subdomain}/about`]: aboutHtml,
    [`/site/${subdomain}/contact`]: contactHtml,
  };

  // Store all pages in KV with 24h TTL
  const kvPuts = Object.entries(pages).map(([path, html]) =>
    kv.put(`site:${subdomain}:${path}`, html, { expirationTtl: 86400 })
  );
  await Promise.all(kvPuts);

  // ── Purge CF Cache for instant updates ──
  try {
    const cache = caches.default;
    // Purge for all known host patterns
    const hosts = [
      `hms-${subdomain}.ozzyl.com`,  // future custom domain
    ];
    const purgePromises: Promise<boolean>[] = [];
    for (const host of hosts) {
      for (const path of Object.keys(pages)) {
        purgePromises.push(cache.delete(new Request(`https://${host}${path}`)));
      }
    }
    await Promise.all(purgePromises);
  } catch {
    // Cache purge failure is non-fatal — pages will still update after s-maxage expires
    console.warn(`[prerender] Cache purge failed for slug "${subdomain}"`);
  }
}

/**
 * Renders JSX to HTML string. Hono JSX .toString() returns Promise<string>.
 * Must be awaited to get actual HTML content.
 */
async function renderToString(jsx: any): Promise<string> {
  const html = await (jsx as any).toString();
  return `<!DOCTYPE html>${html}`;
}
