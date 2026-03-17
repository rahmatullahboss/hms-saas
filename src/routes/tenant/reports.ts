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

// ─── Advanced Reporting Endpoints ─────────────────────────────────────────────

reportsRoutes.get('/bed-occupancy', async (c) => {
  const tenantId = requireTenantId(c);
  try {
    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM beds WHERE tenant_id = ?`
    ).bind(tenantId).first<{ total: number }>();

    const occupied = await c.env.DB.prepare(
      `SELECT COUNT(*) as occupied FROM beds WHERE tenant_id = ? AND status = 'occupied'`
    ).bind(tenantId).first<{ occupied: number }>();

    const byWard = await c.env.DB.prepare(`
      SELECT ward_name as ward, COUNT(*) as total,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied
      FROM beds WHERE tenant_id = ?
      GROUP BY ward_name ORDER BY ward_name
    `).bind(tenantId).all<{ ward: string; total: number; occupied: number }>();

    const totalBeds = total?.total ?? 0;
    const occupiedBeds = occupied?.occupied ?? 0;
    const rate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : '0';

    return c.json({
      totalBeds,
      occupiedBeds,
      availableBeds: totalBeds - occupiedBeds,
      occupancyRate: parseFloat(rate),
      byWard: byWard.results.map(w => ({
        ward: w.ward,
        total: w.total,
        occupied: w.occupied,
        available: w.total - w.occupied,
        rate: w.total > 0 ? parseFloat(((w.occupied / w.total) * 100).toFixed(1)) : 0,
      })),
    });
  } catch (error) {
    console.error('Error generating bed occupancy:', error);
    return c.json({ error: 'Failed to generate bed occupancy report' }, 500);
  }
});

reportsRoutes.get('/avg-length-of-stay', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.query();
  try {
    let query = `
      SELECT
        'General' as department,
        COUNT(*) as total_admissions,
        AVG(julianday(COALESCE(a.discharge_date, date('now'))) - julianday(a.admission_date)) as avg_days
      FROM admissions a
      WHERE a.tenant_id = ?
    `;
    const params: (string | number)[] = [tenantId];

    if (startDate) { query += ' AND a.admission_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND a.admission_date <= ?'; params.push(endDate); }

    query += ' GROUP BY department ORDER BY avg_days DESC';

    const result = await c.env.DB.prepare(query).bind(...params)
      .all<{ department: string; total_admissions: number; avg_days: number }>();

    const overall = result.results.reduce((acc, r) => ({
      admissions: acc.admissions + r.total_admissions,
      totalDays: acc.totalDays + r.avg_days * r.total_admissions,
    }), { admissions: 0, totalDays: 0 });

    return c.json({
      overallAvgDays: overall.admissions > 0
        ? parseFloat((overall.totalDays / overall.admissions).toFixed(1))
        : 0,
      totalAdmissions: overall.admissions,
      byDepartment: result.results.map(r => ({
        department: r.department,
        totalAdmissions: r.total_admissions,
        avgDays: parseFloat((r.avg_days ?? 0).toFixed(1)),
      })),
    });
  } catch (error) {
    console.error('Error generating ALOS:', error);
    return c.json({ error: 'Failed to generate average length of stay report' }, 500);
  }
});

reportsRoutes.get('/department-revenue', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.query();
  try {
    let query = `
      SELECT
        COALESCE(v.visit_type, 'General') as department,
        COUNT(DISTINCT b.id) as bill_count,
        COALESCE(SUM(b.total), 0) as revenue,
        COUNT(DISTINCT v.patient_id) as patient_count
      FROM visits v
      LEFT JOIN bills b ON b.visit_id = v.id AND b.tenant_id = v.tenant_id
      WHERE v.tenant_id = ?
    `;
    const params: (string | number)[] = [tenantId];

    if (startDate) { query += ' AND v.visit_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND v.visit_date <= ?'; params.push(endDate); }

    query += ' GROUP BY department ORDER BY revenue DESC';

    const result = await c.env.DB.prepare(query).bind(...params)
      .all<{ department: string; bill_count: number; revenue: number; patient_count: number }>();

    const totalRevenue = result.results.reduce((s, r) => s + r.revenue, 0);

    return c.json({
      totalRevenue,
      byDepartment: result.results.map(r => ({
        department: r.department,
        revenue: r.revenue,
        billCount: r.bill_count,
        patientCount: r.patient_count,
        percentage: totalRevenue > 0 ? parseFloat(((r.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      })),
    });
  } catch (error) {
    console.error('Error generating department revenue:', error);
    return c.json({ error: 'Failed to generate department revenue report' }, 500);
  }
});

reportsRoutes.get('/doctor-performance', async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.query();
  try {
    let query = `
      SELECT
        d.id as doctor_id,
        d.name as doctor_name,
        d.specialty,
        COUNT(DISTINCT v.id) as visit_count,
        COUNT(DISTINCT v.patient_id) as unique_patients,
        COALESCE(SUM(b.total), 0) as revenue
      FROM doctors d
      LEFT JOIN visits v ON v.doctor_id = d.id AND v.tenant_id = d.tenant_id
      LEFT JOIN bills b ON b.visit_id = v.id AND b.tenant_id = d.tenant_id
      WHERE d.tenant_id = ? AND d.is_active = 1
    `;
    const params: (string | number)[] = [tenantId];

    if (startDate) { query += ' AND v.visit_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND v.visit_date <= ?'; params.push(endDate); }

    query += ' GROUP BY d.id ORDER BY revenue DESC';

    const result = await c.env.DB.prepare(query).bind(...params)
      .all<{
        doctor_id: number; doctor_name: string; specialty: string;
        visit_count: number; unique_patients: number; revenue: number;
      }>();

    return c.json({
      doctors: result.results.map(d => ({
        id: d.doctor_id,
        name: d.doctor_name,
        specialty: d.specialty,
        visitCount: d.visit_count,
        uniquePatients: d.unique_patients,
        revenue: d.revenue,
        avgRevenuePerVisit: d.visit_count > 0
          ? parseFloat((d.revenue / d.visit_count).toFixed(0))
          : 0,
      })),
    });
  } catch (error) {
    console.error('Error generating doctor performance:', error);
    return c.json({ error: 'Failed to generate doctor performance report' }, 500);
  }
});

reportsRoutes.get('/monthly-summary', async (c) => {
  const tenantId = requireTenantId(c);
  const { month } = c.req.query(); // format: YYYY-MM
  const targetMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const monthStart = `${targetMonth}-01`;
  const nextMonth = (() => {
    const [y, m] = targetMonth.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  })();

  try {
    // ⚡ BOLT OPTIMIZATION:
    // Replaced Promise.all() with c.env.DB.batch() for monthly summary reports.
    // Why: Promise.all() sends 6 separate HTTP network requests to Cloudflare D1.
    //      DB.batch() sends a single network request containing all 6 statements.
    // Impact: Eliminates 5 network round-trips, significantly reducing latency and
    //         making the reports dashboard load much faster.
    const batchResults = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM income WHERE tenant_id = ? AND date >= ? AND date < ?`)
        .bind(tenantId, monthStart, nextMonth),

      c.env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE tenant_id = ? AND date >= ? AND date < ? AND status = 'approved'`)
        .bind(tenantId, monthStart, nextMonth),

      c.env.DB.prepare(`SELECT COUNT(*) as new_patients FROM patients WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`)
        .bind(tenantId, monthStart, nextMonth),

      c.env.DB.prepare(`SELECT COUNT(*) as total FROM visits WHERE tenant_id = ? AND visit_date >= ? AND visit_date < ?`)
        .bind(tenantId, monthStart, nextMonth),

      c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'discharged' THEN 1 ELSE 0 END) as discharged FROM admissions WHERE tenant_id = ? AND admission_date >= ? AND admission_date < ?`)
        .bind(tenantId, monthStart, nextMonth),

      c.env.DB.prepare(`SELECT COALESCE(icd10_description, visit_type) as diagnosis, COUNT(*) as cnt FROM visits WHERE tenant_id = ? AND visit_date >= ? AND visit_date < ? AND (icd10_description IS NOT NULL OR visit_type IS NOT NULL) GROUP BY diagnosis ORDER BY cnt DESC LIMIT 10`)
        .bind(tenantId, monthStart, nextMonth),
    ]);

    const [
      revenueBatch,
      expensesBatch,
      patientsBatch,
      visitsBatch,
      admissionsBatch,
      diagnosesBatch
    ] = batchResults;

    const revenue = revenueBatch.results[0] as { total: number } | undefined;
    const expenses = expensesBatch.results[0] as { total: number } | undefined;
    const patients = patientsBatch.results[0] as { new_patients: number } | undefined;
    const visits = visitsBatch.results[0] as { total: number } | undefined;
    const admissions = admissionsBatch.results[0] as { total: number; discharged: number } | undefined;
    const diagnoses = diagnosesBatch as { results: { diagnosis: string; cnt: number }[] };

    const totalRevenue = revenue?.total ?? 0;
    const totalExpenses = expenses?.total ?? 0;

    return c.json({
      month: targetMonth,
      financial: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        profitMargin: totalRevenue > 0 ? parseFloat(((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1)) : 0,
      },
      operations: {
        newPatients: patients?.new_patients ?? 0,
        totalVisits: visits?.total ?? 0,
        newAdmissions: admissions?.total ?? 0,
        discharges: admissions?.discharged ?? 0,
      },
      topDiagnoses: diagnoses.results.map(d => ({
        diagnosis: d.diagnosis,
        count: d.cnt,
      })),
    });
  } catch (error) {
    console.error('Error generating monthly summary:', error);
    return c.json({ error: 'Failed to generate monthly summary' }, 500);
  }
});

export default reportsRoutes;
