import { Hono } from 'hono';
import { requireTenantId } from '../../lib/context-helpers';
import { getDb } from '../../db';


const dashboardRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string };
}>();

// GET / — aggregated overview (backward compat)
dashboardRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const today = new Date().toISOString().split('T')[0];
    const [patients, revenue, appointments] = await Promise.all([
      db.$client.prepare('SELECT COUNT(*) as cnt FROM patients WHERE tenant_id = ?')
        .bind(tenantId).first<{ cnt: number }>(),
      db.$client.prepare('SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(due),0) as due FROM bills WHERE tenant_id = ?')
        .bind(tenantId).first<{ total: number; due: number }>(),
      db.$client.prepare('SELECT COUNT(*) as cnt FROM appointments WHERE tenant_id = ? AND DATE(created_at) = ?')
        .bind(tenantId, today).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    ]);
    return c.json({
      totalPatients: patients?.cnt ?? 0,
      todayAppointments: appointments?.cnt ?? 0,
      totalRevenue: revenue?.total ?? 0,
      pendingDue: revenue?.due ?? 0,
    });
  } catch {
    return c.json({ totalPatients: 0, todayAppointments: 0, totalRevenue: 0, pendingDue: 0 });
  }
});

// Get dashboard stats
dashboardRoutes.get('/stats', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // ⚡ BOLT OPTIMIZATION:
    // Replaced Promise.all() with db.$client.batch() for dashboard stats.
    // Why: Promise.all() sends 8 separate HTTP network requests to Cloudflare D1.
    //      DB.batch() sends a single network request containing all 8 statements.
    // Impact: Eliminates 7 network round-trips, significantly reducing latency and
    //         making the dashboard load much faster, especially for users far from
    //         the database region.
    const batchResults = await db.$client.batch([
      // Total patients
      db.$client.prepare('SELECT COUNT(*) as count FROM patients WHERE tenant_id = ?').bind(tenantId),
      // Today's patients
      db.$client.prepare('SELECT COUNT(*) as count FROM patients WHERE tenant_id = ? AND date(created_at) = ?').bind(tenantId, today),
      // Test stats (pending and completed)
      db.$client.prepare(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM tests WHERE tenant_id = ?
      `).bind(tenantId),
      // Bill stats (pending bills and total revenue)
      db.$client.prepare(`
        SELECT
          SUM(CASE WHEN due > 0 THEN 1 ELSE 0 END) as pending_bills,
          SUM(total) as total_revenue
        FROM bills WHERE tenant_id = ?
      `).bind(tenantId),
      // Staff count
      db.$client.prepare('SELECT COUNT(*) as count FROM staff WHERE tenant_id = ?').bind(tenantId),
      // Low stock medicines count
      db.$client.prepare('SELECT COUNT(*) as count FROM medicines WHERE tenant_id = ? AND quantity < 10').bind(tenantId),
      // Income for the last 7 days
      db.$client.prepare(`
        SELECT date, SUM(amount) as total FROM income
        WHERE tenant_id = ? AND date >= ?
        GROUP BY date ORDER BY date
      `).bind(tenantId, sevenDaysAgoStr),
      // Recent 5 patients
      db.$client.prepare('SELECT id, name, mobile, created_at FROM patients WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5').bind(tenantId)
    ]);

    const [
      totalPatientsBatch,
      todayPatientsBatch,
      testStatsBatch,
      billStatsBatch,
      staffCountBatch,
      lowStockBatch,
      incomeBatch,
      recentPatientsBatch
    ] = batchResults;

    const totalPatientsResult = totalPatientsBatch.results[0] as {count: number} | undefined;
    const todayPatientsResult = todayPatientsBatch.results[0] as {count: number} | undefined;
    const testStatsResult = testStatsBatch.results[0] as {pending: number, completed: number} | undefined;
    const billStatsResult = billStatsBatch.results[0] as {pending_bills: number, total_revenue: number} | undefined;
    const staffCountResult = staffCountBatch.results[0] as {count: number} | undefined;
    const lowStockResult = lowStockBatch.results[0] as {count: number} | undefined;
    const incomeResult = incomeBatch;
    const recentPatientsResult = recentPatientsBatch;
    
    // Format revenue data for chart
    const incomeList = (incomeResult.results || []) as { date: string; total: number }[];
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
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  
  try {
    const income = await db.$client.prepare(
      `SELECT source, SUM(amount) as total FROM income 
       WHERE date = ? AND tenant_id = ? GROUP BY source`
    ).bind(date, tenantId).all();
    
    const totalResult = await db.$client.prepare(
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
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  
  try {
    const expenses = await db.$client.prepare(
      `SELECT category, SUM(amount) as total FROM expenses 
       WHERE date = ? AND tenant_id = ? GROUP BY category`
    ).bind(date, tenantId).all();
    
    const totalResult = await db.$client.prepare(
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
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  
  try {
    const totalIncome = await db.$client.prepare(
      `SELECT SUM(amount) as total FROM income 
       WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const totalExpenses = await db.$client.prepare(
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