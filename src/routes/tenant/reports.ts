import { Hono } from 'hono';
import { requireTenantId } from '../../lib/context-helpers';

const reportsRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    UPLOADS: R2Bucket;
    ENVIRONMENT: string;
  };
  Variables: {
    tenantId: string;
    userId: string;
    role: string;
  };
}>();

reportsRoutes.get('/pl', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.query();

  if (!startDate || !endDate) {
    return c.json({ error: 'startDate and endDate are required' }, 400);
  }

  try {
    const incomeResult = await c.env.DB.prepare(`
      SELECT source, SUM(amount) as total
      FROM income
      WHERE tenant_id = ? AND date >= ? AND date <= ?
      GROUP BY source
    `).bind(tenantId, startDate, endDate).all<{ source: string; total: number }>();

    const expenseResult = await c.env.DB.prepare(`
      SELECT category, SUM(amount) as total
      FROM expenses
      WHERE tenant_id = ? AND date >= ? AND date <= ? AND status = 'approved'
      GROUP BY category
    `).bind(tenantId, startDate, endDate).all<{ category: string; total: number }>();

    const totalIncome = incomeResult.results.reduce((sum, r) => sum + r.total, 0);
    const totalExpense = expenseResult.results.reduce((sum, r) => sum + r.total, 0);
    const netProfit = totalIncome - totalExpense;

    return c.json({
      period: { startDate, endDate },
      income: {
        items: incomeResult.results,
        total: totalIncome
      },
      expenses: {
        items: expenseResult.results,
        total: totalExpense
      },
      netProfit,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating P&L:', error);
    return c.json({ error: 'Failed to generate P&L report' }, 500);
  }
});

reportsRoutes.get('/income-by-source', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.query();

  let query = 'SELECT source, SUM(amount) as total, COUNT(*) as count FROM income WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (startDate) {
    query += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND date <= ?';
    params.push(endDate);
  }

  query += ' GROUP BY source ORDER BY total DESC';

  try {
    const result = await c.env.DB.prepare(query).bind(...params).all<{ source: string; total: number; count: number }>();

    const total = result.results.reduce((sum, r) => sum + r.total, 0);
    const breakdown = result.results.map(r => ({
      source: r.source,
      amount: r.total,
      count: r.count,
      percentage: total > 0 ? (r.total / total * 100).toFixed(1) : '0'
    }));

    return c.json({ breakdown, total });
  } catch (error) {
    console.error('Error generating income report:', error);
    return c.json({ error: 'Failed to generate income report' }, 500);
  }
});

reportsRoutes.get('/expense-by-category', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.query();

  let query = 'SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses WHERE tenant_id = ? AND status = \'approved\'';
  const params: any[] = [tenantId];

  if (startDate) {
    query += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND date <= ?';
    params.push(endDate);
  }

  query += ' GROUP BY category ORDER BY total DESC';

  try {
    const result = await c.env.DB.prepare(query).bind(...params).all<{ category: string; total: number; count: number }>();

    const total = result.results.reduce((sum, r) => sum + r.total, 0);
    const breakdown = result.results.map(r => ({
      category: r.category,
      amount: r.total,
      count: r.count,
      percentage: total > 0 ? (r.total / total * 100).toFixed(1) : '0'
    }));

    return c.json({ breakdown, total });
  } catch (error) {
    console.error('Error generating expense report:', error);
    return c.json({ error: 'Failed to generate expense report' }, 500);
  }
});

reportsRoutes.get('/monthly', async (c) => {
  const tenantId = requireTenantId(c);
  const { year } = c.req.query();
  const targetYear = year || new Date().getFullYear().toString();

  try {
    const monthlyData = [];

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${targetYear}-${month.toString().padStart(2, '0')}`;
      const monthStart = `${monthStr}-01`;
      const nextMonth = month === 12 ? `${parseInt(targetYear) + 1}-01-01` : `${targetYear}-${(month + 1).toString().padStart(2, '0')}-01`;

      const incomeResult = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM income
        WHERE tenant_id = ? AND date >= ? AND date < ?
      `).bind(tenantId, monthStart, nextMonth).first<{ total: number }>();

      const expenseResult = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE tenant_id = ? AND date >= ? AND date < ? AND status = 'approved'
      `).bind(tenantId, monthStart, nextMonth).first<{ total: number }>();

      const income = incomeResult?.total || 0;
      const expense = expenseResult?.total || 0;

      monthlyData.push({
        month: monthStr,
        income,
        expense,
        profit: income - expense
      });
    }

    const yearlyTotal = monthlyData.reduce((sum, m) => sum + m.income, 0);
    const yearlyExpense = monthlyData.reduce((sum, m) => sum + m.expense, 0);

    return c.json({
      year: targetYear,
      monthly: monthlyData,
      summary: {
        totalIncome: yearlyTotal,
        totalExpense: yearlyExpense,
        netProfit: yearlyTotal - yearlyExpense
      }
    });
  } catch (error) {
    console.error('Error generating monthly report:', error);
    return c.json({ error: 'Failed to generate monthly report' }, 500);
  }
});

export default reportsRoutes;
