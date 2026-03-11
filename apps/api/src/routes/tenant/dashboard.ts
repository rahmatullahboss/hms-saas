import { Hono } from 'hono';

const dashboardRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string };
}>();

// Get dashboard stats
dashboardRoutes.get('/stats', async (c) => {
  const tenantId = c.get('tenantId');
  
  try {
    // Get patients
    const patients = await c.env.DB.prepare(
      'SELECT id, name, mobile, created_at FROM patients WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(tenantId).all();
    
    // Get tests
    const tests = await c.env.DB.prepare(
      'SELECT id, patient_id, test_name, status, created_at FROM tests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(tenantId).all();
    
    // Get bills
    const bills = await c.env.DB.prepare(
      'SELECT id, patient_id, total, paid, due, created_at FROM bills WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(tenantId).all();
    
    // Get staff
    const staff = await c.env.DB.prepare(
      'SELECT id, name, position, salary FROM staff WHERE tenant_id = ?'
    ).bind(tenantId).all();
    
    // Get medicines for low stock
    const medicines = await c.env.DB.prepare(
      'SELECT id, name, quantity FROM medicines WHERE tenant_id = ? AND quantity < 10'
    ).bind(tenantId).all();
    
    // Get income for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    let incomeList: { date: string; total: number }[] = [];
    try {
      const incomeResult = await c.env.DB.prepare(
        `SELECT date, SUM(amount) as total FROM income 
         WHERE tenant_id = ? AND date >= ? 
         GROUP BY date ORDER BY date`
      ).bind(tenantId, sevenDaysAgoStr).all();
      incomeList = (incomeResult.results || []).map((inc: Record<string, unknown>) => ({
        date: String(inc.date || ''),
        total: Number(inc.total) || 0
      }));
    } catch {
      incomeList = [];
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const patientList = (patients.results || []) as { id: number; name: string; mobile: string; created_at: string }[];
    const testList = (tests.results || []) as { id: number; patient_id: number; test_name: string; status: string; created_at: string }[];
    const billList = (bills.results || []) as { id: number; patient_id: number; total: number; paid: number; due: number; created_at: string }[];
    const staffList = (staff.results || []) as { id: number; name: string; position: string; salary: number }[];
    const medicineList = (medicines.results || []) as { id: number; name: string; quantity: number }[];
    
    const todayPatients = patientList.filter((p) => 
      p.created_at && p.created_at.startsWith(today)
    ).length;
    
    // Calculate pending bills (where due > 0)
    const pendingBills = billList.filter((b) => b.due > 0).length;
    
    // Format revenue data for chart
    const revenueData: { day: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      const found = incomeList.find((inc) => inc.date === dateStr);
      revenueData.push({
        day: dayName,
        revenue: found ? found.total : 0
      });
    }
    
    return c.json({
      stats: {
        totalPatients: patientList.length,
        todayPatients,
        pendingTests: testList.filter((t) => t.status === 'pending').length,
        completedTests: testList.filter((t) => t.status === 'completed').length,
        pendingBills,
        totalRevenue: billList.reduce((sum, b) => sum + (b.total || 0), 0),
        staffCount: staffList.length,
        lowStockItems: medicineList.length,
      },
      recentPatients: patientList.slice(0, 5),
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