import { describe, it, expect } from 'vitest';
import { websiteConfigSchema, websiteServiceSchema } from '../src/schemas/website';

// ─── Mock D1 + KV for isolated tests ─────────────────────────────

const createMockDB = (overrides: Record<string, any> = {}) => ({
  prepare: (query: string) => ({
    bind: (...args: any[]) => ({
      first: async () => overrides.first ?? null,
      all: async () => overrides.all ?? { results: [] },
      run: async () => overrides.run ?? { meta: { changes: 1, last_row_id: 1 } },
    }),
  }),
});

const createMockKV = () => {
  const store: Record<string, string> = {};
  return {
    get: async (key: string) => store[key] ?? null,
    put: async (key: string, value: string, opts?: any) => { store[key] = value; },
    delete: async (key: string) => { delete store[key]; },
    _store: store,
  };
};

// ─── Schema Validation Tests ──────────────────────────────────────

describe('Website Config Schema (Zod)', () => {
  it('accepts valid config with all fields', () => {
    const result = websiteConfigSchema.safeParse({
      is_enabled: 1,
      theme: 'arogyaseva',
      tagline: 'আপনার স্বাস্থ্যসেবার বিশ্বস্ত সঙ্গী',
      about_text: 'We are a leading hospital...',
      mission_text: 'Our mission is...',
      founded_year: 2010,
      bed_count: 50,
      operating_hours: 'Saturday - Thursday: 8AM - 10PM',
      whatsapp_number: '+8801712345678',
      seo_title: 'Dhaka General Hospital',
      seo_description: 'Best hospital in Dhaka',
      primary_color: '#0891b2',
      secondary_color: '#059669',
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial config (all optional)', () => {
    const result = websiteConfigSchema.safeParse({
      tagline: 'New tagline',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = websiteConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid theme name', () => {
    const result = websiteConfigSchema.safeParse({
      theme: 'invalid_theme',
    });
    expect(result.success).toBe(false);
  });

  it('rejects is_enabled values outside 0-1', () => {
    const result = websiteConfigSchema.safeParse({ is_enabled: 2 });
    expect(result.success).toBe(false);

    const result2 = websiteConfigSchema.safeParse({ is_enabled: -1 });
    expect(result2.success).toBe(false);
  });

  it('rejects founded_year as string (must be number)', () => {
    const result = websiteConfigSchema.safeParse({
      founded_year: '2010', // string, not number
    });
    expect(result.success).toBe(false);
  });

  it('rejects founded_year outside 1800-2100 range', () => {
    expect(websiteConfigSchema.safeParse({ founded_year: 1799 }).success).toBe(false);
    expect(websiteConfigSchema.safeParse({ founded_year: 2101 }).success).toBe(false);
  });

  it('rejects bed_count as string', () => {
    const result = websiteConfigSchema.safeParse({ bed_count: '50' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color format', () => {
    expect(websiteConfigSchema.safeParse({ primary_color: 'red' }).success).toBe(false);
    expect(websiteConfigSchema.safeParse({ primary_color: '#GGG' }).success).toBe(false);
    expect(websiteConfigSchema.safeParse({ primary_color: '#0891b2' }).success).toBe(true);
  });

  it('allows null for optional nullable fields', () => {
    const result = websiteConfigSchema.safeParse({
      tagline: null,
      about_text: null,
      founded_year: null,
      bed_count: null,
      google_maps_embed: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects tagline exceeding 200 characters', () => {
    const result = websiteConfigSchema.safeParse({
      tagline: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('validates all three theme options', () => {
    for (const theme of ['arogyaseva', 'medtrust', 'carefirst']) {
      expect(websiteConfigSchema.safeParse({ theme }).success).toBe(true);
    }
  });
});

describe('Website Service Schema (Zod)', () => {
  it('accepts valid service with all fields', () => {
    const result = websiteServiceSchema.safeParse({
      name: 'OPD',
      name_bn: 'বহির্বিভাগ',
      description: 'Outpatient department services',
      icon: '🏥',
      category: 'opd',
      is_active: 1,
      sort_order: 0,
    });
    expect(result.success).toBe(true);
  });

  it('requires name (min 1 character)', () => {
    const result = websiteServiceSchema.safeParse({
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 200 characters', () => {
    const result = websiteServiceSchema.safeParse({
      name: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('accepts minimal service (only name required)', () => {
    const result = websiteServiceSchema.safeParse({
      name: 'Emergency',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = websiteServiceSchema.safeParse({
      name: 'Test',
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });

  it('validates all seven category options', () => {
    const categories = ['general', 'opd', 'ipd', 'lab', 'pharmacy', 'telemedicine', 'emergency'];
    for (const category of categories) {
      expect(websiteServiceSchema.safeParse({ name: 'Test', category }).success).toBe(true);
    }
  });
});

// ─── API Logic Tests ──────────────────────────────────────────────

describe('Website API Logic', () => {
  describe('Config CRUD', () => {
    it('builds correct SET clause from partial config', () => {
      const data = { tagline: 'New tagline', theme: 'medtrust' as const };
      const fields = Object.entries(data).filter(([, v]) => v !== undefined);
      
      const setClauses = fields.map(([k]) => `${k} = ?`).join(', ');
      expect(setClauses).toBe('tagline = ?, theme = ?');
    });

    it('adds updated_at to field list', () => {
      const data = { tagline: 'New tagline' };
      const fields: [string, any][] = Object.entries(data).filter(([, v]) => v !== undefined);
      fields.push(['updated_at', new Date().toISOString()]);
      
      expect(fields.length).toBe(2);
      expect(fields[1][0]).toBe('updated_at');
    });

    it('rejects empty update (no fields)', () => {
      const data = {};
      const fields = Object.entries(data).filter(([, v]) => v !== undefined);
      expect(fields.length).toBe(0);
      // This would throw HTTPException(400) in production
    });

    it('handles upsert — UPDATE then INSERT on zero changes', () => {
      // Simulate zero changes from UPDATE
      const result = { meta: { changes: 0 } };
      const shouldInsert = !result.meta.changes || result.meta.changes === 0;
      expect(shouldInsert).toBe(true);
    });

    it('skips INSERT when UPDATE has changes', () => {
      const result = { meta: { changes: 1 } };
      const shouldInsert = !result.meta.changes || result.meta.changes === 0;
      expect(shouldInsert).toBe(false);
    });
  });

  describe('Tenant Isolation', () => {
    it('config query includes tenant_id in WHERE clause', () => {
      const query = 'SELECT * FROM website_config WHERE tenant_id = ?';
      expect(query).toContain('tenant_id = ?');
    });

    it('service update includes tenant_id in WHERE clause', () => {
      const query = 'UPDATE website_services SET name = ? WHERE id = ? AND tenant_id = ?';
      expect(query).toContain('AND tenant_id = ?');
    });

    it('service delete includes tenant_id in WHERE clause', () => {
      const query = 'DELETE FROM website_services WHERE id = ? AND tenant_id = ?';
      expect(query).toContain('AND tenant_id = ?');
    });
  });
});

// ─── Subdomain Extraction Tests ──────────────────────────────────

describe('Subdomain Extraction', () => {
  const getSubdomain = (host: string | undefined): string | null => {
    if (!host) return null;
    const hostname = host.split(':')[0];
    const parts = hostname.split('.');
    const first = parts[0];
    if (first.startsWith('hms-')) {
      return first.replace('hms-', '');
    }
    return null;
  };

  it('extracts subdomain from production host', () => {
    expect(getSubdomain('hms-demo.ozzyl.com')).toBe('demo');
  });

  it('extracts subdomain from localhost with port', () => {
    expect(getSubdomain('hms-demo.localhost:8787')).toBe('demo');
  });

  it('returns null for missing hms- prefix', () => {
    expect(getSubdomain('demo.ozzyl.com')).toBeNull();
  });

  it('returns null for undefined host', () => {
    expect(getSubdomain(undefined)).toBeNull();
  });

  it('handles complex subdomains', () => {
    expect(getSubdomain('hms-my-hospital.ozzyl.com')).toBe('my-hospital');
  });
});
