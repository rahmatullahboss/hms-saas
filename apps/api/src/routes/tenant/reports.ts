import { Hono } from 'hono';

const reportsRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    UPLOADS: R2Bucket;
    DASHBOARD_DO: DurableObjectNamespace;
    ENVIRONMENT: string;
  };
  Variables: {
    tenantId: string;
    userId: string;
    role: string;
  };
}>();

reportsRoutes.get('/pl', async (c) => {
  const tenantId = c.get('tenantId');
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
  const tenantId = c.get('tenantId');
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
  const tenantId = c.get('tenantId');
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
  const tenantId = c.get('tenantId');
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

// ─── Bed Occupancy ───────────────────────────────────────────────────────────

reportsRoutes.get('/bed-occupancy', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    // Total beds & occupied beds
    const bedsResult = await c.env.DB.prepare(`
      SELECT ward_name,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied
      FROM beds
      WHERE tenant_id = ?
      GROUP BY ward_name
    `).bind(tenantId).all<{ ward_name: string; total: number; occupied: number }>();

    const byWard = bedsResult.results.map(w => ({
      ward: w.ward_name ?? 'General',
      total: w.total,
      occupied: w.occupied,
      available: w.total - w.occupied,
      rate: w.total > 0 ? Math.round((w.occupied / w.total) * 100) : 0,
    }));

    const totalBeds = byWard.reduce((s, w) => s + w.total, 0);
    const occupiedBeds = byWard.reduce((s, w) => s + w.occupied, 0);

    return c.json({
      totalBeds,
      occupiedBeds,
      availableBeds: totalBeds - occupiedBeds,
      occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      byWard,
    });
  } catch (error) {
    console.error('[reports] bed-occupancy error:', error);
    return c.json({ totalBeds: 0, occupiedBeds: 0, availableBeds: 0, occupancyRate: 0, byWard: [] });
  }
});

// ─── Department Revenue ──────────────────────────────────────────────────────

reportsRoutes.get('/department-revenue', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  if (!startDate || !endDate) {
    return c.json({ error: 'startDate and endDate are required' }, 400);
  }

  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        COALESCE(d.specialty, 'General') as department,
        COUNT(DISTINCT b.id) as bill_count,
        COUNT(DISTINCT b.patient_id) as patient_count,
        SUM(b.total_amount) as revenue
      FROM bills b
      LEFT JOIN visits v ON b.visit_id = v.id AND v.tenant_id = b.tenant_id
      LEFT JOIN doctors d ON v.doctor_id = d.id AND d.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND date(b.created_at) >= ? AND date(b.created_at) <= ?
      GROUP BY department
      ORDER BY revenue DESC
    `).bind(tenantId, startDate, endDate).all<{
      department: string; bill_count: number; patient_count: number; revenue: number;
    }>();

    const totalRevenue = result.results.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const byDepartment = result.results.map(r => ({
      department: r.department,
      revenue: r.revenue ?? 0,
      billCount: r.bill_count,
      patientCount: r.patient_count,
      percentage: totalRevenue > 0 ? Math.round(((r.revenue ?? 0) / totalRevenue) * 100) : 0,
    }));

    return c.json({ totalRevenue, byDepartment });
  } catch (error) {
    console.error('[reports] department-revenue error:', error);
    return c.json({ totalRevenue: 0, byDepartment: [] });
  }
});

// ─── Doctor Performance ──────────────────────────────────────────────────────

reportsRoutes.get('/doctor-performance', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  if (!startDate || !endDate) {
    return c.json({ error: 'startDate and endDate are required' }, 400);
  }

  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        d.id, d.name, d.specialty,
        COUNT(v.id) as visit_count,
        COUNT(DISTINCT v.patient_id) as unique_patients,
        COALESCE(SUM(b.total_amount), 0) as revenue
      FROM doctors d
      LEFT JOIN visits v ON v.doctor_id = d.id AND v.tenant_id = d.tenant_id
        AND date(v.created_at) >= ? AND date(v.created_at) <= ?
      LEFT JOIN bills b ON b.visit_id = v.id AND b.tenant_id = d.tenant_id
      WHERE d.tenant_id = ? AND d.is_active = 1
      GROUP BY d.id
      ORDER BY revenue DESC
      LIMIT 20
    `).bind(startDate, endDate, tenantId).all<{
      id: number; name: string; specialty: string;
      visit_count: number; unique_patients: number; revenue: number;
    }>();

    const doctors = result.results.map(d => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty ?? 'General',
      visitCount: d.visit_count,
      uniquePatients: d.unique_patients,
      revenue: d.revenue ?? 0,
      avgRevenuePerVisit: d.visit_count > 0 ? Math.round((d.revenue ?? 0) / d.visit_count) : 0,
    }));

    return c.json({ doctors });
  } catch (error) {
    console.error('[reports] doctor-performance error:', error);
    return c.json({ doctors: [] });
  }
});

export default reportsRoutes;
