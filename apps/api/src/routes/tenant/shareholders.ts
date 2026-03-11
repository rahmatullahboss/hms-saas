import { Hono } from 'hono';

const shareholderRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string; userId?: string };
}>();

// Get all shareholders
shareholderRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const type = c.req.query('type');
  
  try {
    let query = 'SELECT * FROM shareholders WHERE tenant_id = ?';
    const params: string[] = [tenantId!];
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const shareholders = await c.env.DB.prepare(query).bind(...params).all();
    
    // Get totals
    const totals = await c.env.DB.prepare(
      `SELECT type, SUM(share_count) as shares, SUM(investment) as investment 
       FROM shareholders WHERE tenant_id = ? GROUP BY type`
    ).bind(tenantId).all();
    
    return c.json({ shareholders: shareholders.results, totals: totals.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch shareholders' }, 500);
  }
});

// Add shareholder
shareholderRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { name, address, phone, shareCount, type, investment } = await c.req.json();
  
  if (!name || !shareCount || !type) {
    return c.json({ error: 'Required fields missing' }, 400);
  }
  
  try {
    // Check total shares limit
    const settings = await c.env.DB.prepare(
      'SELECT value FROM settings WHERE key = ? AND tenant_id = ?'
    ).bind('total_shares', tenantId).first<{value: string}>();
    
    const totalShares = parseInt(settings?.value || '300');
    
    const currentTotal = await c.env.DB.prepare(
      'SELECT SUM(share_count) as total FROM shareholders WHERE tenant_id = ?'
    ).bind(tenantId).first<{total: number}>();
    
    if ((currentTotal?.total || 0) + shareCount > totalShares) {
      return c.json({ error: 'Exceeds total shares limit' }, 400);
    }
    
    const result = await c.env.DB.prepare(
      'INSERT INTO shareholders (name, address, phone, share_count, type, investment, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, address, phone, shareCount, type, investment || 0, tenantId).run();
    
    return c.json({ message: 'Shareholder added', id: result.meta.last_row_id }, 201);
  } catch (error) {
    return c.json({ error: 'Failed to add shareholder' }, 500);
  }
});

// Calculate profit distribution
shareholderRoutes.get('/calculate', async (c) => {
  const tenantId = c.get('tenantId');
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  
  try {
    // Get settings
    const settings: Record<string, string> = {};
    const settingsResult = await c.env.DB.prepare(
      'SELECT key, value FROM settings WHERE tenant_id = ?'
    ).bind(tenantId).all();
    
    for (const row of settingsResult.results as any[]) {
      settings[row.key] = row.value;
    }
    
    const profitPercentage = parseFloat(settings.profit_percentage || '30');
    const profitPartnerCount = parseInt(settings.profit_partner_count || '100');
    
    // Get monthly profit
    const incomeResult = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM income WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const expenseResult = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const totalIncome = incomeResult?.total || 0;
    const totalExpenses = expenseResult?.total || 0;
    const profit = totalIncome - totalExpenses;
    const distributableProfit = profit * (profitPercentage / 100);
    const profitPerPartner = distributableProfit / profitPartnerCount;
    
    return c.json({
      month,
      totalIncome,
      totalExpenses,
      profit,
      profitPercentage,
      distributableProfit,
      profitPartnerCount,
      profitPerPartner: profitPerPartner.toFixed(2)
    });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to calculate' }, 500);
  }
});

// Approve profit distribution
shareholderRoutes.post('/approve', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { month } = await c.req.json();
  
  try {
    // Get settings
    const settings: Record<string, string> = {};
    const settingsResult = await c.env.DB.prepare(
      'SELECT key, value FROM settings WHERE tenant_id = ?'
    ).bind(tenantId).all();
    
    for (const row of settingsResult.results as any[]) {
      settings[row.key] = row.value;
    }
    
    const profitPercentage = parseFloat(settings.profit_percentage || '30');
    
    // Calculate profit
    const incomeResult = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM income WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const expenseResult = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`
    ).bind(month, tenantId).first<{total: number}>();
    
    const profit = (incomeResult?.total || 0) - (expenseResult?.total || 0);
    const distributable = profit * (profitPercentage / 100);
    
    // Record distribution
    await c.env.DB.prepare(
      'INSERT INTO profit_distributions (month, total_profit, distributable_profit, profit_percentage, approved_by, approved_at, tenant_id) VALUES (?, ?, ?, ?, ?, datetime("now"), ?)'
    ).bind(month, profit, distributable, profitPercentage, userId, tenantId).run();
    
    return c.json({ message: 'Distribution approved', distributable });
  } catch (error) {
    return c.json({ error: 'Failed to approve' }, 500);
  }
});

export default shareholderRoutes;