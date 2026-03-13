import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createShareholderSchema, updateShareholderSchema, distributeMonthlyProfitSchema } from '../../schemas/shareholder';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const shareholderRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/shareholders — list shareholders with totals
shareholderRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const type = c.req.query('type');

  try {
    let query = 'SELECT * FROM shareholders WHERE tenant_id = ?';
    const params: (string | number)[] = [tenantId!];

    if (type) { query += ' AND type = ?'; params.push(type); }
    query += ' ORDER BY type, name';

    const shareholders = await c.env.DB.prepare(query).bind(...params).all();
    const totals = await c.env.DB.prepare(
      `SELECT type, SUM(share_count) as shares, SUM(investment) as investment
       FROM shareholders WHERE tenant_id = ? GROUP BY type`,
    ).bind(tenantId).all();

    return c.json({ shareholders: shareholders.results, totals: totals.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch shareholders' });
  }
});

// POST /api/shareholders — add shareholder with Zod validation
shareholderRoutes.post('/', zValidator('json', createShareholderSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    const settings = await c.env.DB.prepare(
      'SELECT value FROM settings WHERE key = ? AND tenant_id = ?',
    ).bind('total_shares', tenantId).first<{ value: string }>();
    const maxShares = parseInt(settings?.value || '300');

    const currentTotal = await c.env.DB.prepare(
      'SELECT SUM(share_count) as total FROM shareholders WHERE tenant_id = ?',
    ).bind(tenantId).first<{ total: number }>();

    if ((currentTotal?.total || 0) + data.shareCount > maxShares) {
      throw new HTTPException(400, { message: `Exceeds total shares limit of ${maxShares}` });
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO shareholders (name, address, phone, share_count, type, investment, start_date, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      data.name, data.address ?? null, data.phone ?? null,
      data.shareCount, data.type, data.investment ?? 0,
      data.startDate ?? null, tenantId,
    ).run();
    return c.json({ message: 'Shareholder added', id: result.meta.last_row_id }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to add shareholder' });
  }
});

// PUT /api/shareholders/:id
shareholderRoutes.put('/:id', zValidator('json', updateShareholderSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM shareholders WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Shareholder not found' });

    await c.env.DB.prepare(
      `UPDATE shareholders SET name = ?, address = ?, phone = ?, share_count = ?, investment = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.name       ?? existing['name'],
      data.address    !== undefined ? data.address    : existing['address'],
      data.phone      !== undefined ? data.phone      : existing['phone'],
      data.shareCount !== undefined ? data.shareCount : existing['share_count'],
      data.investment !== undefined ? data.investment : existing['investment'],
      id, tenantId,
    ).run();
    return c.json({ message: 'Shareholder updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update shareholder' });
  }
});

// GET /api/shareholders/calculate?month=YYYY-MM
shareholderRoutes.get('/calculate', async (c) => {
  const tenantId = requireTenantId(c);
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);

  try {
    const settings: Record<string, string> = {};
    const sResult = await c.env.DB.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').bind(tenantId).all();
    for (const row of sResult.results as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value;
    }

    const profitPct = parseFloat(settings['profit_percentage'] || '30');

    const income = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM income WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`,
    ).bind(month, tenantId).first<{ total: number }>();

    const expenses = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`,
    ).bind(month, tenantId).first<{ total: number }>();

    const totalIncome = income?.total || 0;
    const totalExpenses = expenses?.total || 0;
    const profit = totalIncome - totalExpenses;
    const distributable = Math.max(0, Math.round(profit * (profitPct / 100)));

    // Calculate per-shareholder breakdown
    const shareholders = await c.env.DB.prepare(
      'SELECT id, name, share_count, type FROM shareholders WHERE tenant_id = ? ORDER BY type, name',
    ).bind(tenantId).all<{ id: number; name: string; share_count: number; type: string }>();

    const totalShares = shareholders.results.reduce((s, sh) => s + sh.share_count, 0);
    const perShare = totalShares > 0 ? Math.round(distributable / totalShares) : 0;

    const breakdown = shareholders.results.map((sh) => ({
      id: sh.id,
      name: sh.name,
      type: sh.type,
      shareCount: sh.share_count,
      amount: sh.share_count * perShare,
    }));

    return c.json({ month, totalIncome, totalExpenses, profit, profitPct, distributable, perShare, totalShares, breakdown });
  } catch {
    throw new HTTPException(500, { message: 'Failed to calculate profit distribution' });
  }
});

// POST /api/shareholders/distribute — approve + create per-person distribution records
shareholderRoutes.post('/distribute', zValidator('json', distributeMonthlyProfitSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const month = data.month;

  try {
    // Prevent double distribution for same month
    const existing = await c.env.DB.prepare(
      'SELECT id FROM profit_distributions WHERE month = ? AND tenant_id = ?',
    ).bind(month, tenantId).first();
    if (existing) throw new HTTPException(409, { message: `Profit already distributed for ${month}` });

    const settings: Record<string, string> = {};
    const sResult = await c.env.DB.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').bind(tenantId).all();
    for (const row of sResult.results as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value;
    }
    const profitPct = parseFloat(settings['profit_percentage'] || '30');

    const income = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM income WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`,
    ).bind(month, tenantId).first<{ total: number }>();
    const expenses = await c.env.DB.prepare(
      `SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`,
    ).bind(month, tenantId).first<{ total: number }>();

    const profit = (income?.total || 0) - (expenses?.total || 0);
    const distributable = Math.max(0, Math.round(profit * (profitPct / 100)));

    // Create distribution header
    const distResult = await c.env.DB.prepare(
      `INSERT INTO profit_distributions (month, total_profit, distributable_profit, profit_percentage, approved_by, approved_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    ).bind(month, profit, distributable, profitPct, userId, tenantId).run();
    const distributionId = distResult.meta.last_row_id;

    // Create per-shareholder distribution records
    const shareholders = await c.env.DB.prepare(
      'SELECT id, name, share_count FROM shareholders WHERE tenant_id = ?',
    ).bind(tenantId).all<{ id: number; name: string; share_count: number }>();

    const totalShares = shareholders.results.reduce((s, sh) => s + sh.share_count, 0);
    const perShare = totalShares > 0 ? Math.round(distributable / totalShares) : 0;

    for (const sh of shareholders.results) {
      const amount = sh.share_count * perShare;
      await c.env.DB.prepare(
        `INSERT INTO shareholder_distributions
           (distribution_id, shareholder_id, share_count, per_share_amount, distribution_amount, paid_status, tenant_id)
         VALUES (?, ?, ?, ?, ?, 'unpaid', ?)`,
      ).bind(distributionId, sh.id, sh.share_count, perShare, amount, tenantId).run();
    }

    return c.json({
      message: 'Profit distributed',
      distributionId,
      distributable,
      perShare,
      shareholderCount: shareholders.results.length,
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to distribute profit' });
  }
});

// GET /api/shareholders/distributions — list all distribution periods
shareholderRoutes.get('/distributions', async (c) => {
  const tenantId = requireTenantId(c);
  try {
    const distributions = await c.env.DB.prepare(
      'SELECT * FROM profit_distributions WHERE tenant_id = ? ORDER BY month DESC',
    ).bind(tenantId).all();
    return c.json({ distributions: distributions.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch distributions' });
  }
});

// GET /api/shareholders/distributions/:id — per-person breakdown for one distribution
shareholderRoutes.get('/distributions/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const distribution = await c.env.DB.prepare(
      'SELECT * FROM profit_distributions WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!distribution) throw new HTTPException(404, { message: 'Distribution not found' });

    const details = await c.env.DB.prepare(
      `SELECT sd.*, s.name as shareholder_name, s.type
       FROM shareholder_distributions sd
       JOIN shareholders s ON sd.shareholder_id = s.id
       WHERE sd.distribution_id = ? AND sd.tenant_id = ?
       ORDER BY s.type, s.name`,
    ).bind(id, tenantId).all();

    return c.json({ distribution, details: details.results });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch distribution details' });
  }
});

// POST /api/shareholders/distributions/:id/pay/:shareholderId
shareholderRoutes.post('/distributions/:id/pay/:shareholderId', async (c) => {
  const tenantId = requireTenantId(c);
  const { id, shareholderId } = c.req.param();

  try {
    const record = await c.env.DB.prepare(
      `SELECT sd.* FROM shareholder_distributions sd
       JOIN profit_distributions pd ON sd.distribution_id = pd.id
       WHERE sd.distribution_id = ? AND sd.shareholder_id = ? AND pd.tenant_id = ?`,
    ).bind(id, shareholderId, tenantId).first();
    if (!record) throw new HTTPException(404, { message: 'Distribution record not found' });

    await c.env.DB.prepare(
      `UPDATE shareholder_distributions SET paid_status = 'paid', paid_date = date('now')
       WHERE distribution_id = ? AND shareholder_id = ? AND tenant_id = ?`,
    ).bind(id, shareholderId, tenantId).run();

    return c.json({ message: 'Marked as paid' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to mark as paid' });
  }
});

export default shareholderRoutes;