import { Hono } from 'hono';

const settingsRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string };
}>();

// Get all settings
settingsRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  
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
    
    return c.json({ settings: settingsObj });
  } catch (error) {
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

// Update setting
settingsRoutes.put('/:key', async (c) => {
  const key = c.req.param('key');
  const tenantId = c.get('tenantId');
  const { value } = await c.req.json();
  
  try {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value, tenant_id, updated_at) VALUES (?, ?, ?, datetime("now"))'
    ).bind(key, value, tenantId);
    
    return c.json({ message: 'Setting updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update setting' }, 500);
  }
});

// Bulk update settings
settingsRoutes.put('/', async (c) => {
  const tenantId = c.get('tenantId');
  const settings = await c.req.json();
  
  try {
    for (const [key, value] of Object.entries(settings)) {
      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO settings (key, value, tenant_id, updated_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(key, String(value), tenantId);
    }
    
    return c.json({ message: 'Settings updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

export default settingsRoutes;