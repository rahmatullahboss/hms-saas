import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireTenantId } from '../../lib/context-helpers';
import type { Env, Variables } from '../../types';
import { getDb } from '../../db';
import { requireRole } from '../../middleware/rbac';

const PHARM_READ = ['hospital_admin', 'pharmacist', 'doctor', 'md', 'nurse'] as const;

const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD').optional(),
});

const dateRangeWithLimitSchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const expirySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

const reportPharmacy = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Dispensing Summary ──────────────────────────────────────────────────────
// BUG FIX: Was referencing non-existent columns. Now queries pharmacy_sales correctly.

reportPharmacy.get('/dispensing-summary', requireRole(...PHARM_READ), zValidator('query', dateRangeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      date(s.created_at) as sale_date,
      COUNT(s.id) as sale_count,
      COALESCE(SUM(s.total_amount), 0) as revenue,
      COALESCE(SUM(s.discount), 0) as total_discount,
      COUNT(DISTINCT s.patient_id) as unique_patients
    FROM pharmacy_sales s
    WHERE s.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND date(s.created_at) >= ?'; params.push(startDate); }
  if (endDate)   { sql += ' AND date(s.created_at) <= ?'; params.push(endDate); }
  sql += ' GROUP BY sale_date ORDER BY sale_date DESC';

  try {
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    const totalRevenue = results.reduce((s: number, r: any) => s + (r.revenue || 0), 0);
    const totalSales   = results.reduce((s: number, r: any) => s + r.sale_count, 0);
    return c.json({ daily: results, totalRevenue, totalSales });
  } catch {
    return c.json({ daily: [], totalRevenue: 0, totalSales: 0 });
  }
});

// ─── Stock Value Report ──────────────────────────────────────────────────────
// BUG FIX: Was referencing m.unit_price and m.quantity which don't exist.
// Now queries pharmacy_stock (batch-level) with item joins.

reportPharmacy.get('/stock-value', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);

  try {
    // Try new pharmacy_items + pharmacy_stock tables first
    const { results: v2Results } = await db.$client.prepare(`
      SELECT
        i.name as medicine_name,
        g.name as generic_name,
        COALESCE(SUM(s.available_qty), 0) as stock_qty,
        COALESCE(AVG(s.cost_price), 0) as unit_cost,
        COALESCE(AVG(s.sale_price), 0) as unit_price,
        COALESCE(SUM(s.available_qty * s.cost_price), 0) as stock_cost_value,
        COALESCE(SUM(s.available_qty * s.sale_price), 0) as stock_sale_value
      FROM pharmacy_items i
      LEFT JOIN pharmacy_generics g ON i.generic_id = g.id
      LEFT JOIN pharmacy_stock s ON i.id = s.item_id AND s.tenant_id = i.tenant_id AND s.is_active = 1 AND s.available_qty > 0
      WHERE i.tenant_id = ? AND i.is_active = 1
      GROUP BY i.id
      HAVING stock_qty > 0
      ORDER BY stock_sale_value DESC
    `).bind(tenantId).all();

    if (v2Results.length > 0) {
      const totalCostValue = v2Results.reduce((s: number, r: any) => s + (r.stock_cost_value || 0), 0);
      const totalSaleValue = v2Results.reduce((s: number, r: any) => s + (r.stock_sale_value || 0), 0);
      return c.json({ items: v2Results, totalCostValue, totalSaleValue, totalItems: v2Results.length });
    }

    // Fallback to legacy medicine_stock_batches
    const { results } = await db.$client.prepare(`
      SELECT
        m.name as medicine_name,
        m.company,
        COALESCE(SUM(b.quantity_available), 0) as stock_qty,
        COALESCE(AVG(b.sale_price), 0) as unit_price,
        COALESCE(SUM(b.quantity_available * b.sale_price), 0) as stock_value
      FROM medicines m
      LEFT JOIN medicine_stock_batches b ON m.id = b.medicine_id AND b.tenant_id = m.tenant_id
      WHERE m.tenant_id = ?
      GROUP BY m.id
      HAVING stock_qty > 0
      ORDER BY stock_value DESC
    `).bind(tenantId).all();

    const totalValue = results.reduce((s: number, r: any) => s + (r.stock_value || 0), 0);
    return c.json({ items: results, totalCostValue: totalValue, totalSaleValue: totalValue, totalItems: results.length });
  } catch {
    return c.json({ items: [], totalCostValue: 0, totalSaleValue: 0, totalItems: 0 });
  }
});

// ─── Expiry Alert List ───────────────────────────────────────────────────────
// BUG FIX: Was querying m.expiry_date which doesn't exist on medicines table.
// Now queries medicine_stock_batches (legacy) or pharmacy_stock (v2).

reportPharmacy.get('/expiry-alerts', requireRole(...PHARM_READ), zValidator('query', expirySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { days } = c.req.valid('query');

  try {
    // Try new pharmacy_stock first
    const { results: v2Results } = await db.$client.prepare(`
      SELECT
        i.name as medicine_name,
        s.batch_no,
        s.available_qty as stock_qty,
        s.expiry_date,
        julianday(s.expiry_date) - julianday('now') as days_until_expiry
      FROM pharmacy_stock s
      JOIN pharmacy_items i ON s.item_id = i.id
      WHERE s.tenant_id = ? AND s.expiry_date IS NOT NULL
        AND julianday(s.expiry_date) <= julianday('now', '+' || ? || ' days')
        AND s.available_qty > 0 AND s.is_active = 1
      ORDER BY s.expiry_date ASC
    `).bind(tenantId, days).all();

    if (v2Results.length > 0) {
      return c.json({
        alerts: v2Results.map((r: any) => ({
          ...r,
          days_until_expiry: Math.round(r.days_until_expiry || 0),
          is_expired: (r.days_until_expiry || 0) <= 0,
        })),
        withinDays: days,
      });
    }

    // Fallback: use legacy medicine_stock_batches
    const { results } = await db.$client.prepare(`
      SELECT
        m.name as medicine_name,
        b.batch_no,
        b.quantity_available as stock_qty,
        b.expiry_date,
        julianday(b.expiry_date) - julianday('now') as days_until_expiry
      FROM medicine_stock_batches b
      JOIN medicines m ON b.medicine_id = m.id
      WHERE b.tenant_id = ? AND b.expiry_date IS NOT NULL
        AND julianday(b.expiry_date) <= julianday('now', '+' || ? || ' days')
        AND b.quantity_available > 0
      ORDER BY b.expiry_date ASC
    `).bind(tenantId, days).all();

    return c.json({
      alerts: results.map((r: any) => ({
        ...r,
        days_until_expiry: Math.round(r.days_until_expiry || 0),
        is_expired: (r.days_until_expiry || 0) <= 0,
      })),
      withinDays: days,
    });
  } catch {
    return c.json({ alerts: [], withinDays: days, note: 'Expiry tracking not configured' });
  }
});

// ─── Top Dispensed Medicines ─────────────────────────────────────────────────

reportPharmacy.get('/top-dispensed', requireRole(...PHARM_READ), zValidator('query', dateRangeWithLimitSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate, limit } = c.req.valid('query');

  let sql = `
    SELECT
      si.medicine_name,
      SUM(si.quantity) as total_qty,
      SUM(si.line_total) as total_revenue,
      COUNT(DISTINCT si.sale_id) as sale_count
    FROM pharmacy_sale_items si
    JOIN pharmacy_sales s ON si.sale_id = s.id
    WHERE s.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND date(s.created_at) >= ?'; params.push(startDate); }
  if (endDate)   { sql += ' AND date(s.created_at) <= ?'; params.push(endDate); }
  sql += ` GROUP BY si.medicine_name ORDER BY total_qty DESC LIMIT ?`;
  params.push(limit);

  try {
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ medicines: results });
  } catch {
    return c.json({ medicines: [] });
  }
});

// ─── Purchase Report ─────────────────────────────────────────────────────────

reportPharmacy.get('/purchase-summary', requireRole(...PHARM_READ), zValidator('query', dateRangeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      date(g.grn_date) as receipt_date,
      COUNT(g.id) as grn_count,
      COALESCE(SUM(g.total_amount), 0) as total_purchase,
      COALESCE(SUM(g.discount_amount), 0) as total_discount,
      COALESCE(SUM(g.vat_amount), 0) as total_vat
    FROM pharmacy_goods_receipts g
    WHERE g.tenant_id = ? AND g.is_cancelled = 0
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND g.grn_date >= ?'; params.push(startDate); }
  if (endDate)   { sql += ' AND g.grn_date <= ?'; params.push(endDate); }
  sql += ' GROUP BY receipt_date ORDER BY receipt_date DESC';

  try {
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    const totalPurchase = results.reduce((s: number, r: any) => s + (r.total_purchase || 0), 0);
    return c.json({ daily: results, totalPurchase });
  } catch {
    return c.json({ daily: [], totalPurchase: 0 });
  }
});

// ─── Stock Movement History ───────────────────────────────────────────────────

reportPharmacy.get('/stock-movements', requireRole(...PHARM_READ), zValidator('query', dateRangeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');
  const itemId = c.req.query('itemId');

  let sql = `
    SELECT t.*, i.name as item_name
    FROM pharmacy_stock_transactions t
    JOIN pharmacy_items i ON t.item_id = i.id
    WHERE t.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (itemId)    { sql += ' AND t.item_id = ?';             params.push(itemId); }
  if (startDate) { sql += ' AND date(t.created_at) >= ?';  params.push(startDate); }
  if (endDate)   { sql += ' AND date(t.created_at) <= ?';  params.push(endDate); }
  sql += ' ORDER BY t.created_at DESC LIMIT 500';

  try {
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ movements: results });
  } catch {
    return c.json({ movements: [] });
  }
});

export default reportPharmacy;
