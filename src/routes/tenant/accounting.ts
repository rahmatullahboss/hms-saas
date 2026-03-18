import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';
import { getDb } from '../../db';


const dashboardRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

dashboardRoutes.get('/summary', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  try {
    const incomeResult = await db.$client.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN date = ? THEN amount ELSE 0 END), 0) as today_income,
        COALESCE(SUM(CASE WHEN date >= ? THEN amount ELSE 0 END), 0) as mtd_income
      FROM income
      WHERE tenant_id = ?
    `).bind(today, monthStart, tenantId).first<{ today_income: number; mtd_income: number }>();

    const expenseResult = await db.$client.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN date = ? THEN amount ELSE 0 END), 0) as today_expense,
        COALESCE(SUM(CASE WHEN date >= ? THEN amount ELSE 0 END), 0) as mtd_expense
      FROM expenses
      WHERE tenant_id = ? AND status = 'approved'
    `).bind(today, monthStart, tenantId).first<{ today_expense: number; mtd_expense: number }>();

    const todayIncome = incomeResult?.today_income || 0;
    const todayExpense = expenseResult?.today_expense || 0;
    const mtdIncome = incomeResult?.mtd_income || 0;
    const mtdExpense = expenseResult?.mtd_expense || 0;

    return c.json({
      today: {
        income: todayIncome,
        expense: todayExpense,
        profit: todayIncome - todayExpense
      },
      mtd: {
        income: mtdIncome,
        expense: mtdExpense,
        profit: mtdIncome - mtdExpense
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return c.json({ error: 'Failed to fetch dashboard data' }, 500);
  }
});

dashboardRoutes.get('/mtd', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  try {
    const incomeResult = await db.$client.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM income
      WHERE tenant_id = ? AND date >= ?
    `).bind(tenantId, monthStart).first<{ total: number }>();

    const expenseResult = await db.$client.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE tenant_id = ? AND date >= ? AND status = 'approved'
    `).bind(tenantId, monthStart).first<{ total: number }>();

    const income = incomeResult?.total || 0;
    const expense = expenseResult?.total || 0;

    return c.json({
      income,
      expense,
      profit: income - expense,
      month: today.substring(0, 7)
    });
  } catch (error) {
    console.error('MTD error:', error);
    return c.json({ error: 'Failed to fetch MTD data' }, 500);
  }
});

dashboardRoutes.get('/trends', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);

  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

    const incomeTrends = await db.$client.prepare(`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
      FROM income
      WHERE tenant_id = ? AND date >= ?
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month
    `).bind(tenantId, startDate).all<{ month: string; total: number }>();

    const expenseTrends = await db.$client.prepare(`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
      FROM expenses
      WHERE tenant_id = ? AND date >= ? AND status = 'approved'
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month
    `).bind(tenantId, startDate).all<{ month: string; total: number }>();

    const months = [...new Set([
      ...incomeTrends.results.map(r => r.month),
      ...expenseTrends.results.map(r => r.month)
    ])].sort();

    const trends = months.map(month => {
      const income = incomeTrends.results.find(r => r.month === month)?.total || 0;
      const expense = expenseTrends.results.find(r => r.month === month)?.total || 0;
      return {
        month,
        income,
        expense,
        profit: income - expense
      };
    });

    return c.json({ trends });
  } catch (error) {
    console.error('Trends error:', error);
    return c.json({ error: 'Failed to fetch trends' }, 500);
  }
});

dashboardRoutes.get('/income-breakdown', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  try {
    const result = await db.$client.prepare(`
      SELECT source, SUM(amount) as total
      FROM income
      WHERE tenant_id = ? AND date >= ?
      GROUP BY source
      ORDER BY total DESC
    `).bind(tenantId, monthStart).all<{ source: string; total: number }>();

    const total = result.results.reduce((sum, r) => sum + r.total, 0);
    const breakdown = result.results.map(r => ({
      source: r.source,
      amount: r.total,
      percentage: total > 0 ? (r.total / total * 100).toFixed(1) : '0'
    }));

    return c.json({ breakdown, total });
  } catch (error) {
    console.error('Income breakdown error:', error);
    return c.json({ error: 'Failed to fetch income breakdown' }, 500);
  }
});

dashboardRoutes.get('/expense-breakdown', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  try {
    const result = await db.$client.prepare(`
      SELECT category, SUM(amount) as total
      FROM expenses
      WHERE tenant_id = ? AND date >= ? AND status = 'approved'
      GROUP BY category
      ORDER BY total DESC
    `).bind(tenantId, monthStart).all<{ category: string; total: number }>();

    const total = result.results.reduce((sum, r) => sum + r.total, 0);
    const breakdown = result.results.map(r => ({
      category: r.category,
      amount: r.total,
      percentage: total > 0 ? (r.total / total * 100).toFixed(1) : '0'
    }));

    return c.json({ breakdown, total });
  } catch (error) {
    console.error('Expense breakdown error:', error);
    return c.json({ error: 'Failed to fetch expense breakdown' }, 500);
  }
});

export default dashboardRoutes;
