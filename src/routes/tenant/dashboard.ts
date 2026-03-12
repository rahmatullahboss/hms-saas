import { Hono } from 'hono';

const dashboardRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string };
}>();

// Get dashboard stats
dashboardRoutes.get('/stats', async (c) => {
  const tenantId = c.get('tenantId');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // Build concurrent queries
    const [
      totalPatientsResult,
      todayPatientsResult,
      testStatsResult,
      billStatsResult,
      staffCountResult,
      lowStockResult,
      incomeResult,
      recentPatientsResult
    ] = await Promise.all([
      // Total patients
      c.env.DB.prepare('SELECT COUNT(*) as count FROM patients WHERE tenant_id = ?').bind(tenantId).first<{count: number}>(),
      // Today's patients
      c.env.DB.prepare('SELECT COUNT(*) as count FROM patients WHERE tenant_id = ? AND date(created_at) = ?').bind(tenantId, today).first<{count: number}>(),
      // Test stats (pending and completed)
      c.env.DB.prepare(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM tests WHERE tenant_id = ?
      `).bind(tenantId).first<{pending: number, completed: number}>(),
      // Bill stats (pending bills and total revenue)
      c.env.DB.prepare(`
        SELECT
          SUM(CASE WHEN due > 0 THEN 1 ELSE 0 END) as pending_bills,
          SUM(total) as total_revenue
        FROM bills WHERE tenant_id = ?
      `).bind(tenantId).first<{pending_bills: number, total_revenue: number}>(),
      // Staff count
      c.env.DB.prepare('SELECT COUNT(*) as count FROM staff WHERE tenant_id = ?').bind(tenantId).first<{count: number}>(),
      // Low stock medicines count
      c.env.DB.prepare('SELECT COUNT(*) as count FROM medicines WHERE tenant_id = ? AND quantity < 10').bind(tenantId).first<{count: number}>(),
      // Income for the last 7 days
      c.env.DB.prepare(`
        SELECT date, SUM(amount) as total FROM income
        WHERE tenant_id = ? AND date >= ?
        GROUP BY date ORDER BY date
      `).bind(tenantId, sevenDaysAgoStr).all<{date: string, total: number}>(),
      // Recent 5 patients
      c.env.DB.prepare('SELECT id, name, mobile, created_at FROM patients WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5').bind(tenantId).all()
    ]);
    
    // Format revenue data for chart
    const incomeList = incomeResult.results || [];
    const revenueData: { day: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      const found = incomeList.find((inc) => inc.date === dateStr);
      revenueData.push({
        day: dayName,
        revenue: found ? Number(found.total) : 0
      });
    }
    
    return c.json({
      stats: {
        totalPatients: totalPatientsResult?.count || 0,
        todayPatients: todayPatientsResult?.count || 0,
        pendingTests: testStatsResult?.pending || 0,
        completedTests: testStatsResult?.completed || 0,
        pendingBills: billStatsResult?.pending_bills || 0,
        totalRevenue: billStatsResult?.total_revenue || 0,
        staffCount: staffCountResult?.count || 0,
        lowStockItems: lowStockResult?.count || 0,
      },
      recentPatients: recentPatientsResult.results || [],
      revenueData,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return c.json({ error: 'Failed to fetch dashboard stats', details: String(error) }, 500);
  }
});

// Get daily income
dashboardRoutes.get('/daily-income', async (c) => {
  const tenantId = c.get('tenantId');
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  
  try {
    const income = await c.env.DB.prepare(
      `SELECT source, SUM(amount) as total FROM income 
       WHERE date = ? AND tenant_id = ? GROUP BY source`
    ).bind(date, tenantId).all();
    
    const totalResult = await c.env.DB.prepare(
      'SELECT SUM(amount) as total FROM income WHERE date = ? AND tenant_id = ?'
    ).bind(date, tenantId).first<{total: number}>();
    
    return c.json({
      date,
      bySource: income.results,
      total: totalResult?.total || 0
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch income' }, 500);
  }
});

// Get daily expenses
dashboardRoutes.get('/daily-expenses', async (c) => {
  const tenantId = c.get('tenantId');
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  
  try {
    const expenses = await c.env.DB.prepare(
      `SELECT category, SUM(amount) as total FROM expenses 
       WHERE date = ? AND tenant_id = ? GROUP BY category`
    ).bind(date, tenantId).all();
    
    const totalResult = await c.env.DB.prepare(
      'SELECT SUM(amount) as total FROM expenses WHERE date = ? AND tenant_id = ?'
    ).bind(date, tenantId).first<{total: number}>();
    
    return c.json({
      date,
      byCategory: expenses.results,
      total: totalResult?.total || 0
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch expenses' }, 500);
  }
});

// Get monthly summary
dashboardRoutes.get('/monthly-summary', async (c) => {
  const tenantId = c.get('tenantId');
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  
  try {
    const totalIncome = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM income 
       WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const totalExpenses = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM expenses 
       WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const income = totalIncome?.total || 0;
    const expenses = totalExpenses?.total || 0;
    const profit = income - expenses;
    
    return c.json({
      month,
      income,
      expenses,
      profit,
      margin: income > 0 ? ((profit / income) * 100).toFixed(2) : 0
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch summary' }, 500);
  }
});

export default dashboardRoutes;