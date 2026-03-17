import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireTenantId } from '../../lib/context-helpers';
import type { Env, Variables } from '../../types';

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

reportPharmacy.get('/dispensing-summary', zValidator('query', dateRangeSchema), async (c) => {
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
  if (endDate) { sql += ' AND date(s.created_at) <= ?'; params.push(endDate); }
  sql += ' GROUP BY sale_date ORDER BY sale_date DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  const totalRevenue = results.reduce((s: number, r: any) => s + (r.revenue || 0), 0);
  const totalSales = results.reduce((s: number, r: any) => s + r.sale_count, 0);

  return c.json({ daily: results, totalRevenue, totalSales });
});

// ─── Stock Value Report ──────────────────────────────────────────────────────

reportPharmacy.get('/stock-value', async (c) => {
  const tenantId = requireTenantId(c);

  const { results } = await c.env.DB.prepare(`
    SELECT
      m.name as medicine_name,
      m.company,
      m.quantity as stock_qty,
      m.unit_price,
      (m.quantity * m.unit_price) as stock_value
    FROM medicines m
    WHERE m.tenant_id = ? AND m.quantity > 0
    ORDER BY stock_value DESC
  `).bind(tenantId).all();

  const totalValue = results.reduce((s: number, r: any) => s + (r.stock_value || 0), 0);
  const totalItems = results.length;

  return c.json({ items: results, totalValue, totalItems });
});

// ─── Expiry Alert List ───────────────────────────────────────────────────────

reportPharmacy.get('/expiry-alerts', zValidator('query', expirySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { days } = c.req.valid('query');

  // Check if expiry_date column exists (it may not in all setups)
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        m.name as medicine_name,
        m.company,
        m.quantity as stock_qty,
        m.expiry_date,
        julianday(m.expiry_date) - julianday('now') as days_until_expiry
      FROM medicines m
      WHERE m.tenant_id = ? AND m.expiry_date IS NOT NULL
        AND julianday(m.expiry_date) <= julianday('now', '+' || ? || ' days')
        AND m.quantity > 0
      ORDER BY m.expiry_date ASC
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
    // Graceful fallback if expiry_date column doesn't exist
    return c.json({ alerts: [], withinDays: days, note: 'Expiry tracking not configured' });
  }
});

// ─── Top Dispensed Medicines ─────────────────────────────────────────────────

reportPharmacy.get('/top-dispensed', zValidator('query', dateRangeWithLimitSchema), async (c) => {
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
  if (endDate) { sql += ' AND date(s.created_at) <= ?'; params.push(endDate); }
  sql += ` GROUP BY si.medicine_name ORDER BY total_qty DESC LIMIT ?`;
  params.push(limit);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ medicines: results });
});

export default reportPharmacy;
