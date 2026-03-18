import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireTenantId } from '../../lib/context-helpers';
import type { Env, Variables } from '../../types';
import { getDb } from '../../db';


const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD').optional(),
});

const dateRangeWithLimitSchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const trendSchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

const reportLab = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Tests by Category ───────────────────────────────────────────────────────

reportLab.get('/by-category', zValidator('query', dateRangeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      COALESCE(ltc.category, 'Uncategorized') as category,
      COUNT(loi.id) as test_count,
      SUM(loi.line_total) as revenue,
      SUM(CASE WHEN loi.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN loi.status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM lab_order_items loi
    JOIN lab_orders lo ON loi.lab_order_id = lo.id
    JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
    WHERE lo.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];

  if (startDate) { sql += ' AND lo.order_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND lo.order_date <= ?'; params.push(endDate); }

  sql += ' GROUP BY category ORDER BY test_count DESC';
  const { results } = await db.$client.prepare(sql).bind(...params).all();

  const totalTests = results.reduce((s: number, r: any) => s + r.test_count, 0);
  const totalRevenue = results.reduce((s: number, r: any) => s + (r.revenue || 0), 0);

  return c.json({
    categories: results.map((r: any) => ({
      category: r.category,
      testCount: r.test_count,
      revenue: r.revenue || 0,
      completed: r.completed || 0,
      pending: r.pending || 0,
      percentage: totalTests > 0 ? parseFloat(((r.test_count / totalTests) * 100).toFixed(1)) : 0,
    })),
    totalTests,
    totalRevenue,
  });
});

// ─── Turn-Around Time (TAT) ──────────────────────────────────────────────────

reportLab.get('/tat', zValidator('query', dateRangeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      ltc.name as test_name,
      ltc.category,
      COUNT(loi.id) as test_count,
      AVG(
        CASE WHEN loi.completed_at IS NOT NULL
          THEN (julianday(loi.completed_at) - julianday(lo.created_at)) * 24
          ELSE NULL
        END
      ) as avg_hours
    FROM lab_order_items loi
    JOIN lab_orders lo ON loi.lab_order_id = lo.id
    JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
    WHERE lo.tenant_id = ? AND loi.status = 'completed'
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND lo.order_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND lo.order_date <= ?'; params.push(endDate); }
  sql += ' GROUP BY ltc.id ORDER BY avg_hours DESC';

  const { results } = await db.$client.prepare(sql).bind(...params).all();

  return c.json({
    tests: results.map((r: any) => ({
      testName: r.test_name,
      category: r.category,
      testCount: r.test_count,
      avgHours: r.avg_hours ? parseFloat(r.avg_hours.toFixed(1)) : null,
    })),
  });
});

// ─── Top Ordered Tests ───────────────────────────────────────────────────────

reportLab.get('/top-tests', zValidator('query', dateRangeWithLimitSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { startDate, endDate, limit } = c.req.valid('query');

  let sql = `
    SELECT
      ltc.name as test_name,
      ltc.code as test_code,
      ltc.category,
      COUNT(loi.id) as order_count,
      SUM(loi.line_total) as revenue
    FROM lab_order_items loi
    JOIN lab_orders lo ON loi.lab_order_id = lo.id
    JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
    WHERE lo.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND lo.order_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND lo.order_date <= ?'; params.push(endDate); }
  sql += ` GROUP BY ltc.id ORDER BY order_count DESC LIMIT ?`;
  params.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...params).all();

  return c.json({
    tests: results.map((r: any) => ({
      testName: r.test_name,
      testCode: r.test_code,
      category: r.category,
      orderCount: r.order_count,
      revenue: r.revenue || 0,
    })),
  });
});

// ─── Pending vs Completed Trend ──────────────────────────────────────────────

reportLab.get('/trend', zValidator('query', trendSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { days } = c.req.valid('query');

  const sql = `
    SELECT
      lo.order_date as date,
      COUNT(loi.id) as total,
      SUM(CASE WHEN loi.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN loi.status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM lab_order_items loi
    JOIN lab_orders lo ON loi.lab_order_id = lo.id
    WHERE lo.tenant_id = ? AND lo.order_date >= date('now', '-' || ? || ' days')
    GROUP BY lo.order_date ORDER BY lo.order_date ASC
  `;

  const { results } = await db.$client.prepare(sql).bind(tenantId, days).all();

  return c.json({
    trend: results.map((r: any) => ({
      date: r.date,
      total: r.total,
      completed: r.completed || 0,
      pending: r.pending || 0,
    })),
  });
});

export default reportLab;
