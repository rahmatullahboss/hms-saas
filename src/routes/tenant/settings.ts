import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireTenantId } from '../../lib/context-helpers';

const settingsRoutes = new Hono<{
  Bindings: { DB: D1Database; UPLOADS: R2Bucket };
  Variables: { tenantId?: string };
}>();

// ─── Get all settings ────────────────────────────────────────────────────────
settingsRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);

  try {
    const settings = await c.env.DB.prepare(
      'SELECT * FROM settings WHERE tenant_id = ?'
    ).bind(tenantId).all();

    // Convert to key-value object
    const settingsObj: Record<string, string> = {};
    for (const row of settings.results as any[]) {
      settingsObj[row.key] = row.value;
    }

    // Set defaults if not exist
    const defaults: Record<string, string> = {
      share_price: '100000',
      total_shares: '300',
      profit_percentage: '30',
      profit_partner_count: '100',
      owner_partner_count: '200',
      shares_per_profit_partner: '3',
      fire_service_charge: '50',
      ambulance_charge: '500',
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (!settingsObj[key]) {
        settingsObj[key] = value;
      }
    }

    // Add hospital logo URL if a logo key exists
    if (settingsObj['hospital_logo']) {
      settingsObj['hospital_logo_url'] = '/api/settings/logo';
    }

    return c.json({ settings: settingsObj });
  } catch (error) {
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

// ─── Upload hospital logo ────────────────────────────────────────────────────
// Accepts multipart/form-data with a "logo" file field.
// The image should be compressed client-side before uploading.
settingsRoutes.post('/logo', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Unauthorized' });

  const formData = await c.req.formData();
  const file = formData.get('logo');

  if (!file || typeof file === 'string') {
    throw new HTTPException(400, { message: 'No logo file provided' });
  }

  // At this point `file` is a File (Blob with name)
  const logoFile = file as unknown as File;

  // Validate file type
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowed.includes(logoFile.type)) {
    throw new HTTPException(400, { message: 'Invalid file type. Allowed: PNG, JPEG, WebP, SVG' });
  }

  // Max 2MB (client should compress, but enforce a server-side limit too)
  if (logoFile.size > 2 * 1024 * 1024) {
    throw new HTTPException(400, { message: 'File too large. Maximum 2MB.' });
  }

  const r2Key = `${tenantId}/hospital-logo`;

  try {
    // Upload to R2
    await c.env.UPLOADS.put(r2Key, logoFile.stream(), {
      httpMetadata: { contentType: logoFile.type },
    });

    // Save R2 key in D1
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value, tenant_id, updated_at) VALUES (?, ?, ?, datetime("now"))'
    ).bind('hospital_logo', r2Key, tenantId).run();

    return c.json({ message: 'Logo uploaded successfully', logo_url: '/api/settings/logo' });
  } catch (error) {
    console.error('[Settings] Logo upload failed:', error);
    return c.json({ error: 'Failed to upload logo' }, 500);
  }
});

// ─── Serve hospital logo ─────────────────────────────────────────────────────
settingsRoutes.get('/logo', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Unauthorized' });

  try {
    // Get R2 key from D1
    const row = await c.env.DB.prepare(
      'SELECT value FROM settings WHERE key = ? AND tenant_id = ?'
    ).bind('hospital_logo', tenantId).first<{ value: string }>();

    if (!row) {
      return c.json({ error: 'No logo set' }, 404);
    }

    const obj = await c.env.UPLOADS.get(row.value);
    if (!obj) {
      return c.json({ error: 'Logo file not found' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/png');
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(obj.body, { headers });
  } catch (error) {
    console.error('[Settings] Logo fetch failed:', error);
    return c.json({ error: 'Failed to fetch logo' }, 500);
  }
});

// ─── Delete hospital logo ────────────────────────────────────────────────────
settingsRoutes.delete('/logo', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Unauthorized' });

  try {
    // Get R2 key
    const row = await c.env.DB.prepare(
      'SELECT value FROM settings WHERE key = ? AND tenant_id = ?'
    ).bind('hospital_logo', tenantId).first<{ value: string }>();

    if (row) {
      // Delete from R2
      await c.env.UPLOADS.delete(row.value);
      // Delete from D1
      await c.env.DB.prepare(
        'DELETE FROM settings WHERE key = ? AND tenant_id = ?'
      ).bind('hospital_logo', tenantId).run();
    }

    return c.json({ message: 'Logo removed' });
  } catch (error) {
    console.error('[Settings] Logo delete failed:', error);
    return c.json({ error: 'Failed to delete logo' }, 500);
  }
});

// ─── Update setting ──────────────────────────────────────────────────────────
settingsRoutes.put('/:key', async (c) => {
  const key = c.req.param('key');
  const tenantId = requireTenantId(c);
  const { value } = await c.req.json();

  try {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value, tenant_id, updated_at) VALUES (?, ?, ?, datetime("now"))'
    ).bind(key, value, tenantId).run();

    return c.json({ message: 'Setting updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update setting' }, 500);
  }
});

// ─── Bulk update settings ────────────────────────────────────────────────────
settingsRoutes.put('/', async (c) => {
  const tenantId = requireTenantId(c);
  const settings = await c.req.json();

  try {
    for (const [key, value] of Object.entries(settings)) {
      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO settings (key, value, tenant_id, updated_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(key, String(value), tenantId).run();
    }

    return c.json({ message: 'Settings updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

export default settingsRoutes;