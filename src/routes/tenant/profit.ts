import { Hono } from 'hono';
import { createAuditLog } from '../../lib/accounting-helpers';

const profitRoutes = new Hono<{
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

profitRoutes.get('/calculate', async (c) => {
  const tenantId = c.get('tenantId');
  const { month } = c.req.query();

  const targetMonth = month || new Date().toISOString().substring(0, 7);
  const monthStart = `${targetMonth}-01`;
  const nextMonth = targetMonth === '12' 
    ? `${parseInt(targetMonth.substring(0, 4)) + 1}-01-01`
    : `${targetMonth.substring(0, 4)}-${(parseInt(targetMonth.substring(5)) + 1).toString().padStart(2, '0')}-01`;

  try {
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

    const settingsResult = await c.env.DB.prepare(`
      SELECT value FROM settings WHERE key = 'profit_percentage' AND tenant_id = ?
    `).bind(tenantId).first<{ value: string }>();

    const totalIncome = incomeResult?.total || 0;
    const totalExpense = expenseResult?.total || 0;
    const totalProfit = totalIncome - totalExpense;
    const profitPercentage = parseFloat(settingsResult?.value || '30');
    const distributableProfit = totalProfit > 0 ? totalProfit * (profitPercentage / 100) : 0;

    return c.json({
      month: targetMonth,
      totalIncome,
      totalExpense,
      totalProfit,
      profitPercentage,
      distributableProfit,
      calculatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error calculating profit:', error);
    return c.json({ error: 'Failed to calculate profit' }, 500);
  }
});

profitRoutes.post('/distribute', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const role = c.get('role');
  const { month } = await c.req.json();

  if (role !== 'director') {
    return c.json({ error: 'Unauthorized. Director access required.' }, 403);
  }

  const targetMonth = month || new Date().toISOString().substring(0, 7);
  const monthStart = `${targetMonth}-01`;
  const nextMonth = targetMonth === '12'
    ? `${parseInt(targetMonth.substring(0, 4)) + 1}-01-01`
    : `${targetMonth.substring(0, 4)}-${(parseInt(targetMonth.substring(5)) + 1).toString().padStart(2, '0')}-01`;

  try {
    const existing = await c.env.DB.prepare(`
      SELECT id FROM profit_distributions WHERE month = ? AND tenant_id = ?
    `).bind(targetMonth, tenantId).first();

    if (existing) {
      return c.json({ error: 'Profit already distributed for this month' }, 400);
    }

    const incomeResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM income WHERE tenant_id = ? AND date >= ? AND date < ?
    `).bind(tenantId, monthStart, nextMonth).first<{ total: number }>();

    const expenseResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE tenant_id = ? AND date >= ? AND date < ? AND status = 'approved'
    `).bind(tenantId, monthStart, nextMonth).first<{ total: number }>();

    const settingsResult = await c.env.DB.prepare(`
      SELECT value FROM settings WHERE key = 'profit_percentage' AND tenant_id = ?
    `).bind(tenantId).first<{ value: string }>();

    const totalIncome = incomeResult?.total || 0;
    const totalExpense = expenseResult?.total || 0;
    const totalProfit = totalIncome - totalExpense;
    const profitPercentage = parseFloat(settingsResult?.value || '30');
    const distributableProfit = totalProfit > 0 ? totalProfit * (profitPercentage / 100) : 0;

    const result = await c.env.DB.prepare(`
      INSERT INTO profit_distributions (month, total_profit, distributable_profit, profit_percentage, approved_by, approved_at, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      targetMonth,
      totalProfit,
      distributableProfit,
      profitPercentage,
      userId,
      new Date().toISOString(),
      tenantId
    ).run();

    const distributionId = result.meta.last_row_id;

    await createAuditLog(
      c.env,
      tenantId,
      userId,
      'APPROVE',
      'profit_distributions',
      distributionId,
      null,
      { month: targetMonth, totalProfit, distributableProfit, profitPercentage }
    );

    return c.json({
      success: true,
      id: distributionId,
      month: targetMonth,
      totalProfit,
      distributableProfit,
      profitPercentage,
      message: 'Profit distributed successfully'
    }, 201);
  } catch (error) {
    console.error('Error distributing profit:', error);
    return c.json({ error: 'Failed to distribute profit' }, 500);
  }
});

profitRoutes.get('/history', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const result = await c.env.DB.prepare(`
      SELECT pd.*, u.name as approved_by_name
      FROM profit_distributions pd
      LEFT JOIN users u ON pd.approved_by = u.id
      WHERE pd.tenant_id = ?
      ORDER BY pd.month DESC
    `).bind(tenantId).all();

    return c.json({ distributions: result.results });
  } catch (error) {
    console.error('Error fetching profit history:', error);
    return c.json({ error: 'Failed to fetch profit history' }, 500);
  }
});

export default profitRoutes;
