import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import {
  createSchemeSchema, updateSchemeSchema,
  createSubSchemeSchema,
  createPriceCategorySchema, updatePriceCategorySchema,
  createServiceDeptSchema, updateServiceDeptSchema,
  createServiceItemSchema, updateServiceItemSchema, listServiceItemsSchema,
  createCounterSchema,
  createFiscalYearSchema,
  createCreditOrgSchema, updateCreditOrgSchema,
  createPackageSchema, updatePackageSchema,
  createDepositHeadSchema,
  createMembershipTypeSchema, updateMembershipTypeSchema, assignMembershipSchema,
  schemePriceCategoryMapSchema,
  itemPriceCategoryMapSchema,
} from '../../schemas/billingMaster';
import { getDb } from '../../db';

const billingMaster = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Helper: validate numeric route param ────────────────────────────────────

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) throw new HTTPException(400, { message: 'Invalid ID' });
  return id;
}

// ═══════════════════════════════════════════════════════════════════
// BILLING SCHEMES
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/schemes', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_schemes WHERE tenant_id = ? AND is_active = 1 ORDER BY scheme_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/schemes', zValidator('json', createSchemeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const result = await db.$client.prepare(`
    INSERT INTO billing_schemes (scheme_name, scheme_code, scheme_type, description, default_discount_percent, tenant_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(data.scheme_name, data.scheme_code ?? null, data.scheme_type, data.description ?? null, data.default_discount_percent, tenantId, userId).run();

  return c.json({ id: result.meta.last_row_id, message: 'Scheme created' }, 201);
});

billingMaster.put('/schemes/:id', zValidator('json', updateSchemeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await db.$client.prepare(
    'SELECT id FROM billing_schemes WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Scheme not found' });

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.scheme_name !== undefined) { updates.push('scheme_name = ?'); values.push(data.scheme_name); }
  if (data.scheme_code !== undefined) { updates.push('scheme_code = ?'); values.push(data.scheme_code); }
  if (data.scheme_type !== undefined) { updates.push('scheme_type = ?'); values.push(data.scheme_type); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.default_discount_percent !== undefined) { updates.push('default_discount_percent = ?'); values.push(data.default_discount_percent); }

  if (updates.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, tenantId);

  await db.$client.prepare(
    `UPDATE billing_schemes SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...values).run();

  return c.json({ message: 'Scheme updated' });
});

billingMaster.delete('/schemes/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const result = await db.$client.prepare(
    'UPDATE billing_schemes SET is_active = 0 WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(id, tenantId).run();
  if (!result.meta.changes) throw new HTTPException(404, { message: 'Scheme not found' });
  return c.json({ message: 'Scheme deactivated' });
});

// Sub-schemes
billingMaster.get('/schemes/:schemeId/sub-schemes', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const schemeId = c.req.param('schemeId');
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_sub_schemes WHERE scheme_id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(schemeId, tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/sub-schemes', zValidator('json', createSubSchemeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_sub_schemes (scheme_id, sub_scheme_name, sub_scheme_code, discount_percent, tenant_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(data.scheme_id, data.sub_scheme_name, data.sub_scheme_code ?? null, data.discount_percent, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Sub-scheme created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// PRICE CATEGORIES
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/price-categories', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_price_categories WHERE tenant_id = ? AND is_active = 1 ORDER BY category_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/price-categories', zValidator('json', createPriceCategorySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_price_categories (category_name, category_code, description, is_default, tenant_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(data.category_name, data.category_code ?? null, data.description ?? null, data.is_default ? 1 : 0, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Price category created' }, 201);
});

billingMaster.put('/price-categories/:id', zValidator('json', updatePriceCategorySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.category_name !== undefined) { updates.push('category_name = ?'); values.push(data.category_name); }
  if (data.category_code !== undefined) { updates.push('category_code = ?'); values.push(data.category_code); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.is_default !== undefined) { updates.push('is_default = ?'); values.push(data.is_default ? 1 : 0); }
  if (updates.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, tenantId);

  await db.$client.prepare(
    `UPDATE billing_price_categories SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...values).run();
  return c.json({ message: 'Price category updated' });
});

// Scheme ↔ Price Category mapping
billingMaster.post('/scheme-price-category-map', zValidator('json', schemePriceCategoryMapSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_scheme_price_category_map (scheme_id, price_category_id, tenant_id) VALUES (?, ?, ?)
  `).bind(data.scheme_id, data.price_category_id, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Mapping created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// SERVICE DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/service-departments', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_service_departments WHERE tenant_id = ? AND is_active = 1 ORDER BY department_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/service-departments', zValidator('json', createServiceDeptSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_service_departments (department_name, department_code, parent_id, tenant_id, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).bind(data.department_name, data.department_code ?? null, data.parent_id ?? null, tenantId, userId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Service department created' }, 201);
});

billingMaster.put('/service-departments/:id', zValidator('json', updateServiceDeptSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.department_name !== undefined) { updates.push('department_name = ?'); values.push(data.department_name); }
  if (data.department_code !== undefined) { updates.push('department_code = ?'); values.push(data.department_code); }
  if (data.parent_id !== undefined) { updates.push('parent_id = ?'); values.push(data.parent_id); }
  if (updates.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, tenantId);

  await db.$client.prepare(
    `UPDATE billing_service_departments SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...values).run();
  return c.json({ message: 'Service department updated' });
});

// ═══════════════════════════════════════════════════════════════════
// SERVICE ITEMS
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/service-items', zValidator('query', listServiceItemsSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { search, department_id, page, per_page } = c.req.valid('query');
  const offset = (page - 1) * per_page;

  let sql = `
    SELECT si.*, sd.department_name
    FROM billing_service_items si
    LEFT JOIN billing_service_departments sd ON si.service_department_id = sd.id
    WHERE si.tenant_id = ? AND si.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];

  if (search) {
    sql += ' AND (si.item_name LIKE ? OR si.item_code LIKE ?)';
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }
  if (department_id) {
    sql += ' AND si.service_department_id = ?';
    params.push(department_id);
  }

  sql += ` ORDER BY si.display_order, si.item_name LIMIT ? OFFSET ?`;
  params.push(per_page, offset);

  const { results } = await db.$client.prepare(sql).bind(...params).all();

  // Count total
  let countSql = 'SELECT COUNT(*) as total FROM billing_service_items WHERE tenant_id = ? AND is_active = 1';
  const countParams: (string | number)[] = [tenantId];
  if (search) { countSql += ' AND (item_name LIKE ? OR item_code LIKE ?)'; const p = `%${search}%`; countParams.push(p, p); }
  if (department_id) { countSql += ' AND service_department_id = ?'; countParams.push(department_id); }
  const total = await db.$client.prepare(countSql).bind(...countParams).first<{ total: number }>();

  return c.json({ data: results, pagination: { page, per_page, total: total?.total ?? 0 } });
});

billingMaster.get('/service-items/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const item = await db.$client.prepare(
    'SELECT si.*, sd.department_name FROM billing_service_items si LEFT JOIN billing_service_departments sd ON si.service_department_id = sd.id WHERE si.id = ? AND si.tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!item) throw new HTTPException(404, { message: 'Service item not found' });
  return c.json({ data: item });
});

billingMaster.post('/service-items', zValidator('json', createServiceItemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const result = await db.$client.prepare(`
    INSERT INTO billing_service_items (item_name, item_code, service_department_id, price, tax_applicable, tax_percent,
      allow_discount, allow_multiple_qty, description, display_order, tenant_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.item_name, data.item_code ?? null, data.service_department_id ?? null,
    data.price, data.tax_applicable ? 1 : 0, data.tax_percent,
    data.allow_discount ? 1 : 0, data.allow_multiple_qty ? 1 : 0,
    data.description ?? null, data.display_order, tenantId, userId
  ).run();

  return c.json({ id: result.meta.last_row_id, message: 'Service item created' }, 201);
});

billingMaster.put('/service-items/:id', zValidator('json', updateServiceItemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.item_name !== undefined) { updates.push('item_name = ?'); values.push(data.item_name); }
  if (data.item_code !== undefined) { updates.push('item_code = ?'); values.push(data.item_code); }
  if (data.service_department_id !== undefined) { updates.push('service_department_id = ?'); values.push(data.service_department_id); }
  if (data.price !== undefined) { updates.push('price = ?'); values.push(data.price); }
  if (data.tax_applicable !== undefined) { updates.push('tax_applicable = ?'); values.push(data.tax_applicable ? 1 : 0); }
  if (data.tax_percent !== undefined) { updates.push('tax_percent = ?'); values.push(data.tax_percent); }
  if (data.allow_discount !== undefined) { updates.push('allow_discount = ?'); values.push(data.allow_discount ? 1 : 0); }
  if (data.allow_multiple_qty !== undefined) { updates.push('allow_multiple_qty = ?'); values.push(data.allow_multiple_qty ? 1 : 0); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.display_order !== undefined) { updates.push('display_order = ?'); values.push(data.display_order); }

  if (updates.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, tenantId);

  await db.$client.prepare(
    `UPDATE billing_service_items SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...values).run();
  return c.json({ message: 'Service item updated' });
});

billingMaster.delete('/service-items/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const result = await db.$client.prepare(
    'UPDATE billing_service_items SET is_active = 0 WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(id, tenantId).run();
  if (!result.meta.changes) throw new HTTPException(404, { message: 'Service item not found' });
  return c.json({ message: 'Service item deactivated' });
});

// Item ↔ Price Category mapping
billingMaster.post('/item-price-category-map', zValidator('json', itemPriceCategoryMapSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_item_price_category_map (service_item_id, price_category_id, price, discount_percent, tenant_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(data.service_item_id, data.price_category_id, data.price, data.discount_percent, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Price mapping created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// COUNTERS
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/counters', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_counters WHERE tenant_id = ? AND is_active = 1 ORDER BY counter_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/counters', zValidator('json', createCounterSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_counters (counter_name, counter_code, description, tenant_id) VALUES (?, ?, ?, ?)
  `).bind(data.counter_name, data.counter_code ?? null, data.description ?? null, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Counter created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// FISCAL YEARS
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/fiscal-years', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_fiscal_years WHERE tenant_id = ? AND is_active = 1 ORDER BY start_date DESC'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/fiscal-years', zValidator('json', createFiscalYearSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  // Atomic: unset existing current + insert new — both in one batch
  const stmts: D1PreparedStatement[] = [];

  if (data.is_current) {
    stmts.push(
      db.$client.prepare(
        'UPDATE billing_fiscal_years SET is_current = 0 WHERE tenant_id = ? AND is_current = 1'
      ).bind(tenantId)
    );
  }

  stmts.push(
    db.$client.prepare(`
      INSERT INTO billing_fiscal_years (fiscal_year_name, start_date, end_date, is_current, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.fiscal_year_name, data.start_date, data.end_date, data.is_current ? 1 : 0, tenantId)
  );

  const results = await db.$client.batch(stmts);
  const insertResult = results[results.length - 1];
  return c.json({ id: insertResult.meta.last_row_id, message: 'Fiscal year created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/credit-organizations', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_credit_organizations WHERE tenant_id = ? AND is_active = 1 ORDER BY organization_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/credit-organizations', zValidator('json', createCreditOrgSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_credit_organizations (organization_name, organization_code, contact_person, contact_no, email, address, credit_limit, tenant_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(data.organization_name, data.organization_code ?? null, data.contact_person ?? null,
    data.contact_no ?? null, data.email ?? null, data.address ?? null, data.credit_limit, tenantId, userId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Credit organization created' }, 201);
});

billingMaster.put('/credit-organizations/:id', zValidator('json', updateCreditOrgSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.organization_name !== undefined) { updates.push('organization_name = ?'); values.push(data.organization_name); }
  if (data.organization_code !== undefined) { updates.push('organization_code = ?'); values.push(data.organization_code); }
  if (data.contact_person !== undefined) { updates.push('contact_person = ?'); values.push(data.contact_person); }
  if (data.contact_no !== undefined) { updates.push('contact_no = ?'); values.push(data.contact_no); }
  if (data.email !== undefined) { updates.push('email = ?'); values.push(data.email); }
  if (data.address !== undefined) { updates.push('address = ?'); values.push(data.address); }
  if (data.credit_limit !== undefined) { updates.push('credit_limit = ?'); values.push(data.credit_limit); }
  if (updates.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, tenantId);

  await db.$client.prepare(
    `UPDATE billing_credit_organizations SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...values).run();
  return c.json({ message: 'Credit organization updated' });
});

// ═══════════════════════════════════════════════════════════════════
// PACKAGES
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/packages', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_packages WHERE tenant_id = ? AND is_active = 1 ORDER BY package_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.get('/packages/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));

  const pkg = await db.$client.prepare(
    'SELECT * FROM billing_packages WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!pkg) throw new HTTPException(404, { message: 'Package not found' });

  const { results: items } = await db.$client.prepare(
    'SELECT * FROM billing_package_items WHERE package_id = ? AND tenant_id = ?'
  ).bind(id, tenantId).all();

  return c.json({ data: { ...pkg, items } });
});

billingMaster.post('/packages', zValidator('json', createPackageSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Atomic: create package header + items in single batch
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db.$client.prepare(`
      INSERT INTO billing_packages (package_name, package_code, description, total_price, discount_percent, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(data.package_name, data.package_code ?? null, data.description ?? null, data.total_price, data.discount_percent, tenantId, userId)
  );

  // Package items use sub-select to find the header (by unique package_code or name+tenant)
  if (data.items && data.items.length > 0) {
    for (const item of data.items) {
      stmts.push(
        db.$client.prepare(`
          INSERT INTO billing_package_items (package_id, service_item_id, item_name, quantity, price, tenant_id)
          VALUES (
            (SELECT id FROM billing_packages WHERE package_name = ? AND tenant_id = ? ORDER BY id DESC LIMIT 1),
            ?, ?, ?, ?, ?
          )
        `).bind(data.package_name, tenantId, item.service_item_id ?? null, item.item_name, item.quantity, item.price, tenantId)
      );
    }
  }

  const results = await db.$client.batch(stmts);
  const pkgId = results[0].meta.last_row_id;

  return c.json({ id: pkgId, message: 'Package created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// DEPOSIT HEADS
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/deposit-heads', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_deposit_heads WHERE tenant_id = ? AND is_active = 1 ORDER BY head_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/deposit-heads', zValidator('json', createDepositHeadSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_deposit_heads (head_name, head_code, description, tenant_id) VALUES (?, ?, ?, ?)
  `).bind(data.head_name, data.head_code ?? null, data.description ?? null, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Deposit head created' }, 201);
});

// ═══════════════════════════════════════════════════════════════════
// MEMBERSHIP TYPES
// ═══════════════════════════════════════════════════════════════════

billingMaster.get('/membership-types', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { results } = await db.$client.prepare(
    'SELECT * FROM billing_membership_types WHERE tenant_id = ? AND is_active = 1 ORDER BY membership_name'
  ).bind(tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/membership-types', zValidator('json', createMembershipTypeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO billing_membership_types (membership_name, membership_code, community_name, discount_percent, description, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(data.membership_name, data.membership_code ?? null, data.community_name ?? null, data.discount_percent, data.description ?? null, tenantId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Membership type created' }, 201);
});

billingMaster.put('/membership-types/:id', zValidator('json', updateMembershipTypeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  const data = c.req.valid('json');

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.membership_name !== undefined) { updates.push('membership_name = ?'); values.push(data.membership_name); }
  if (data.membership_code !== undefined) { updates.push('membership_code = ?'); values.push(data.membership_code); }
  if (data.community_name !== undefined) { updates.push('community_name = ?'); values.push(data.community_name ?? null); }
  if (data.discount_percent !== undefined) { updates.push('discount_percent = ?'); values.push(data.discount_percent); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (updates.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, tenantId);

  await db.$client.prepare(
    `UPDATE billing_membership_types SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...values).run();
  return c.json({ message: 'Membership type updated' });
});

billingMaster.delete('/membership-types/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'));
  await db.$client.prepare(
    'UPDATE billing_membership_types SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();
  return c.json({ message: 'Membership type deactivated' });
});

// Patient membership assignment
billingMaster.get('/patient-memberships/:patientId', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.param('patientId');
  const { results } = await db.$client.prepare(`
    SELECT pm.*, mt.membership_name, mt.discount_percent
    FROM patient_memberships pm
    JOIN billing_membership_types mt ON pm.membership_type_id = mt.id
    WHERE pm.patient_id = ? AND pm.tenant_id = ? AND pm.is_active = 1
  `).bind(patientId, tenantId).all();
  return c.json({ data: results });
});

billingMaster.post('/patient-memberships', zValidator('json', assignMembershipSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const result = await db.$client.prepare(`
    INSERT INTO patient_memberships (patient_id, membership_type_id, start_date, end_date, tenant_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(data.patient_id, data.membership_type_id, data.start_date, data.end_date ?? null, tenantId, userId).run();
  return c.json({ id: result.meta.last_row_id, message: 'Membership assigned' }, 201);
});

export default billingMaster;
