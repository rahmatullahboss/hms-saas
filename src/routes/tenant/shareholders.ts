import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import {
  createShareholderSchema,
  updateShareholderSchema,
  distributeMonthlyProfitSchema,
} from '../../schemas/shareholder';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

// ── Additional inline schemas (not in schema file to keep it simple) ──
import { z } from 'zod';
import { getDb } from '../../db';


// ── XSS sanitization helper ──
function stripHtml(input: string): string {
  return input.replace(/[<>]/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim();
}

// ── Bulk import schema ──
const bulkImportItemSchema = z.object({
  name: z.string().min(1, 'Name required').max(500).transform(stripHtml),
  nameEn: z.string().max(500).optional().transform(v => v ? stripHtml(v) : v),
  phone: z.string().max(20).optional().transform(v => v ? v.replace(/\D/g, '') : v),
  phone2: z.string().max(20).optional().transform(v => v ? v.replace(/\D/g, '') : v),
  email: z.string().email().max(255).optional().or(z.literal('')),
  nid: z.string().max(20).optional().transform(v => v ? v.replace(/\D/g, '') : v),
  shareCount: z.number().int().min(0).max(10000).default(0),
  shareValueBdt: z.number().int().positive().optional(),
  investment: z.number().nonnegative().optional(),
  address: z.string().max(1000).optional().transform(v => v ? stripHtml(v) : v),
  type: z.enum(['profit', 'owner', 'investor', 'doctor', 'shareholder']).default('investor'),
  bankName: z.string().max(200).optional().transform(v => v ? stripHtml(v) : v),
  bankAccountNo: z.string().max(50).optional(),
  bankBranch: z.string().max(200).optional().transform(v => v ? stripHtml(v) : v),
  routingNo: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  nomineeName: z.string().max(500).optional().transform(v => v ? stripHtml(v) : v),
  nomineeContact: z.string().max(20).optional().transform(v => v ? v.replace(/\D/g, '') : v),
  fatherName: z.string().max(500).optional().transform(v => v ? stripHtml(v) : v),
  motherName: z.string().max(500).optional().transform(v => v ? stripHtml(v) : v),
  religion: z.string().max(100).optional().transform(v => v ? stripHtml(v) : v),
  nationality: z.string().max(100).optional().transform(v => v ? stripHtml(v) : v),
  profession: z.string().max(200).optional().transform(v => v ? stripHtml(v) : v),
  annualIncome: z.string().max(100).optional(),
  dateOfBirth: z.string().max(20).optional(),
  birthCertificate: z.string().max(50).optional(),
  passportNo: z.string().max(50).optional(),
  serialNo: z.string().max(50).optional(),
});

const bulkImportSchema = z.object({
  shareholders: z.array(bulkImportItemSchema).min(1, 'At least one shareholder required').max(500, 'Maximum 500 shareholders per import'),
  skipDuplicates: z.boolean().default(true),
});

const listShareholderSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

const updateShareholderSettingsSchema = z.object({
  total_shares: z.number().int().min(1).max(100000).optional(),
  max_total_shares: z.number().int().min(1).optional(),
  max_investor_shares: z.number().int().min(0).optional(),
  max_owner_shares: z.number().int().min(0).optional(),
  share_value_per_share: z.number().int().positive().optional(),
  profit_percentage: z.number().min(0).max(100).optional(),
  retained_earnings_percent: z.number().min(0).max(100).optional(),
  tds_applicable: z.number().int().min(0).max(1).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
});

const calculateDividendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
});

const finalizeDividendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  notes: z.string().optional(),
  items: z.array(z.object({
    shareholderId: z.number().int().positive(),
    grossDividend: z.number().min(0),
    taxDeducted: z.number().min(0),
    netPayable: z.number().min(0),
  })).min(1, 'At least one distribution item is required'),
});

const shareholderRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================
// SHAREHOLDER SETTINGS
// ============================================================

/** GET /api/shareholders/settings — return shareholder-related settings */
shareholderRoutes.get('/settings', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);

  const SHAREHOLDER_KEYS = [
    'total_shares', 'max_total_shares', 'max_investor_shares', 'max_owner_shares',
    'share_value_per_share', 'profit_percentage', 'retained_earnings_percent',
    'tds_applicable', 'tax_rate',
  ];

  const { results } = await db.$client.prepare(
    `SELECT key, value FROM settings WHERE tenant_id = ? AND key IN (${SHAREHOLDER_KEYS.map(() => '?').join(',')})`,
  ).bind(tenantId, ...SHAREHOLDER_KEYS).all<{ key: string; value: string }>();

  const settings: Record<string, string | number> = {};
  for (const row of results) {
    const num = Number(row.value);
    settings[row.key] = row.value !== '' && !Number.isNaN(num) ? num : row.value;
  }

  return c.json({ settings });
});

/** PUT /api/shareholders/settings — upsert shareholder settings */
shareholderRoutes.put('/settings', zValidator('json', updateShareholderSettingsSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const body = c.req.valid('json');

  const entries = Object.entries(body).filter(([, v]) => v !== undefined) as [string, string | number][];
  if (entries.length === 0) {
    throw new HTTPException(400, { message: 'No settings provided' });
  }

  const statements = entries.map(([key, value]) =>
    db.$client.prepare(
      `INSERT INTO settings (key, value, tenant_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key, tenant_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(key, String(value), tenantId),
  );

  await db.$client.batch(statements);
  return c.json({ message: 'Settings updated successfully' });
});

// ============================================================
// SHAREHOLDER CRUD
// ============================================================

/** GET /api/shareholders — list with search, pagination, filters */
shareholderRoutes.get('/', zValidator('query', listShareholderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { page, limit, search, type, isActive } = c.req.valid('query');
  const offset = (page - 1) * limit;

  let query = `SELECT id, name, address, phone, email, nid, share_count, type, investment,
    bank_name, bank_account_no, bank_branch, routing_no, share_value_bdt,
    is_active, user_id, nominee_name, nominee_contact,
    created_at, updated_at
    FROM shareholders WHERE tenant_id = ?`;
  const params: (string | number)[] = [tenantId!];

  if (search) {
    query += ' AND (name LIKE ? OR phone LIKE ? OR nid LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }
  if (isActive !== undefined) {
    query += ' AND is_active = ?';
    params.push(isActive === 'true' ? 1 : 0);
  }

  const countQuery = query.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM');

  query += ' ORDER BY type, name LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const countParams = params.slice(0, -2);

  const [shareholders, totalResult, totals] = await Promise.all([
    db.$client.prepare(query).bind(...params).all(),
    db.$client.prepare(countQuery).bind(...countParams).first<{ total: number }>(),
    db.$client.prepare(
      `SELECT type, SUM(share_count) as shares, SUM(investment) as investment, COUNT(*) as count
       FROM shareholders WHERE tenant_id = ? AND is_active = 1 GROUP BY type`,
    ).bind(tenantId).all(),
  ]);

  return c.json({
    shareholders: shareholders.results,
    pagination: { page, limit, total: totalResult?.total || 0 },
    totals: totals.results,
  });
});

/** POST /api/shareholders — create with share cap enforcement */
shareholderRoutes.post('/', zValidator('json', createShareholderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    // 1. Fetch settings + live share counts in parallel
    const [maxTotalRow, maxInvestorRow, maxOwnerRow, currentTotalRow, investorRow, ownerRow] = await Promise.all([
      db.$client.prepare("SELECT value FROM settings WHERE key = 'max_total_shares' AND tenant_id = ?").bind(tenantId).first<{ value: string }>(),
      db.$client.prepare("SELECT value FROM settings WHERE key = 'max_investor_shares' AND tenant_id = ?").bind(tenantId).first<{ value: string }>(),
      db.$client.prepare("SELECT value FROM settings WHERE key = 'max_owner_shares' AND tenant_id = ?").bind(tenantId).first<{ value: string }>(),
      db.$client.prepare('SELECT COALESCE(SUM(share_count), 0) as total FROM shareholders WHERE tenant_id = ? AND is_active = 1').bind(tenantId).first<{ total: number }>(),
      db.$client.prepare("SELECT COALESCE(SUM(share_count), 0) as total FROM shareholders WHERE tenant_id = ? AND is_active = 1 AND type IN ('investor', 'profit')").bind(tenantId).first<{ total: number }>(),
      db.$client.prepare("SELECT COALESCE(SUM(share_count), 0) as total FROM shareholders WHERE tenant_id = ? AND is_active = 1 AND type = 'owner'").bind(tenantId).first<{ total: number }>(),
    ]);

    const maxTotal = parseInt(maxTotalRow?.value ?? '300');
    const maxInvestor = parseInt(maxInvestorRow?.value ?? '100');
    const maxOwner = parseInt(maxOwnerRow?.value ?? '200');
    const currentTotal = currentTotalRow?.total ?? 0;
    const currentInvestor = investorRow?.total ?? 0;
    const currentOwner = ownerRow?.total ?? 0;
    const newShares = data.shareCount;

    // 2. Per-type cap enforcement
    if (['investor', 'profit', 'doctor', 'shareholder'].includes(data.type)) {
      if (currentInvestor + newShares > maxInvestor) {
        throw new HTTPException(400, {
          message: `Investor/profit share cap exceeded. Max: ${maxInvestor}, allocated: ${currentInvestor}, requested: ${newShares}. Remaining: ${maxInvestor - currentInvestor}.`,
        });
      }
    }
    if (data.type === 'owner') {
      if (currentOwner + newShares > maxOwner) {
        throw new HTTPException(400, {
          message: `Owner share cap exceeded. Max: ${maxOwner}, allocated: ${currentOwner}, requested: ${newShares}. Remaining: ${maxOwner - currentOwner}.`,
        });
      }
    }

    // 3. Global total cap
    if (currentTotal + newShares > maxTotal) {
      throw new HTTPException(400, {
        message: `Total share cap exceeded. Max: ${maxTotal}, allocated: ${currentTotal}, requested: ${newShares}. Remaining: ${maxTotal - currentTotal}.`,
      });
    }

    // 4. Insert
    const result = await db.$client.prepare(
      `INSERT INTO shareholders (name, address, phone, email, nid, share_count, type, investment,
        bank_name, bank_account_no, bank_branch, routing_no,
        share_value_bdt, is_active, user_id, nominee_name, nominee_contact, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      data.name,
      data.address ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.nid ?? null,
      data.shareCount,
      data.type,
      data.investment ?? 0,
      data.bankName ?? null,
      data.bankAccountNo ?? null,
      data.bankBranch ?? null,
      data.routingNo ?? null,
      data.shareValueBdt ?? null,
      data.isActive ? 1 : 0,
      null, // userId — optional, set via admin
      data.nomineeName ?? null,
      data.nomineeContact ?? null,
      tenantId,
    ).run();

    return c.json({ message: 'Shareholder added', id: result.meta.last_row_id }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to add shareholder' });
  }
});

// ============================================================
// BULK IMPORT (PDF Import)
// ============================================================

/** POST /api/shareholders/bulk-import — import multiple shareholders from PDF data */
shareholderRoutes.post('/bulk-import', zValidator('json', bulkImportSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { shareholders: items, skipDuplicates } = c.req.valid('json');

  // ── Default share caps (DRY) ──
  const DEFAULT_CAPS = { total: 300, investor: 100, owner: 200 } as const;

  try {
    // 1. Fetch settings + current share counts (single query for atomicity)
    const [settingsRows, currentShares] = await Promise.all([
      db.$client.prepare(
        "SELECT key, value FROM settings WHERE key IN ('max_total_shares','max_investor_shares','max_owner_shares') AND tenant_id = ?"
      ).bind(tenantId).all<{ key: string; value: string }>(),
      db.$client.prepare(
        `SELECT 
          COALESCE(SUM(share_count), 0) as total,
          COALESCE(SUM(CASE WHEN type IN ('investor','profit','doctor','shareholder') THEN share_count ELSE 0 END), 0) as investor,
          COALESCE(SUM(CASE WHEN type = 'owner' THEN share_count ELSE 0 END), 0) as owner
         FROM shareholders WHERE tenant_id = ? AND is_active = 1`
      ).bind(tenantId).first<{ total: number; investor: number; owner: number }>(),
    ]);

    const settingsMap = new Map(settingsRows.results.map(r => [r.key, r.value]));
    const maxTotal = parseInt(settingsMap.get('max_total_shares') ?? String(DEFAULT_CAPS.total));
    const maxInvestor = parseInt(settingsMap.get('max_investor_shares') ?? String(DEFAULT_CAPS.investor));
    const maxOwner = parseInt(settingsMap.get('max_owner_shares') ?? String(DEFAULT_CAPS.owner));
    let runningTotal = currentShares?.total ?? 0;
    let runningInvestor = currentShares?.investor ?? 0;
    let runningOwner = currentShares?.owner ?? 0;

    // 2. Pre-validate ALL items before inserting anything (fail-fast)
    const validatedItems: typeof items = [];
    const preCheckResults: Array<{ row: number; status: 'skipped' | 'failed'; message: string; name: string }> = [];

    // Check duplicates in-batch (not just against DB)
    const batchNids = new Set<string>();
    const batchPhones = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      // In-batch duplicate check
      if (item.nid && batchNids.has(item.nid)) {
        preCheckResults.push({ row: rowNum, status: 'skipped', message: `Duplicate NID in batch: ${item.nid}`, name: item.name });
        continue;
      }
      if (item.phone && batchPhones.has(item.phone)) {
        preCheckResults.push({ row: rowNum, status: 'skipped', message: `Duplicate phone in batch: ${item.phone}`, name: item.name });
        continue;
      }
      if (item.nid) batchNids.add(item.nid);
      if (item.phone) batchPhones.add(item.phone);

      validatedItems.push(item);
    }

    // 3. Check DB duplicates if skipDuplicates is true
    const dbDuplicates = new Set<string>();
    if (skipDuplicates && validatedItems.length > 0) {
      const nidsToCheck = validatedItems.filter(i => i.nid).map(i => i.nid!);
      const phonesToCheck = validatedItems.filter(i => i.phone).map(i => i.phone!);

      if (nidsToCheck.length > 0) {
        const placeholders = nidsToCheck.map(() => '?').join(',');
        const existing = await db.$client.prepare(
          `SELECT nid FROM shareholders WHERE tenant_id = ? AND nid IN (${placeholders})`
        ).bind(tenantId, ...nidsToCheck).all<{ nid: string }>();
        for (const row of existing.results) dbDuplicates.add(`nid:${row.nid}`);
      }
      if (phonesToCheck.length > 0) {
        const placeholders = phonesToCheck.map(() => '?').join(',');
        const existing = await db.$client.prepare(
          `SELECT phone FROM shareholders WHERE tenant_id = ? AND phone IN (${placeholders})`
        ).bind(tenantId, ...phonesToCheck).all<{ phone: string }>();
        for (const row of existing.results) dbDuplicates.add(`phone:${row.phone}`);
      }
    }

    // 4. Process validated items with cap checks
    const statements: ReturnType<typeof c.env.DB.prepare>[] = [];
    const finalResults: Array<{ row: number; status: 'imported' | 'skipped' | 'failed'; message: string; id?: number; name: string }> = [...preCheckResults];

    for (let i = 0; i < validatedItems.length; i++) {
      const item = validatedItems[i];
      const rowNum = items.indexOf(item) + 1;

      // DB duplicate check
      if (skipDuplicates) {
        if (item.nid && dbDuplicates.has(`nid:${item.nid}`)) {
          finalResults.push({ row: rowNum, status: 'skipped', message: `Duplicate NID: ${item.nid}`, name: item.name });
          continue;
        }
        if (item.phone && dbDuplicates.has(`phone:${item.phone}`)) {
          finalResults.push({ row: rowNum, status: 'skipped', message: `Duplicate phone: ${item.phone}`, name: item.name });
          continue;
        }
      }

      // Share cap checks (with running totals)
      if (['investor', 'profit', 'doctor', 'shareholder'].includes(item.type)) {
        if (runningInvestor + item.shareCount > maxInvestor) {
          finalResults.push({ row: rowNum, status: 'failed', message: `Investor cap exceeded (max: ${maxInvestor})`, name: item.name });
          continue;
        }
      }
      if (item.type === 'owner') {
        if (runningOwner + item.shareCount > maxOwner) {
          finalResults.push({ row: rowNum, status: 'failed', message: `Owner cap exceeded (max: ${maxOwner})`, name: item.name });
          continue;
        }
      }
      if (runningTotal + item.shareCount > maxTotal) {
        finalResults.push({ row: rowNum, status: 'failed', message: `Total cap exceeded (max: ${maxTotal})`, name: item.name });
        continue;
      }

      const investment = item.investment ?? (item.shareValueBdt ? item.shareCount * item.shareValueBdt : 0);

      statements.push(
        db.$client.prepare(
          `INSERT OR IGNORE INTO shareholders (name, address, phone, email, nid, share_count, type, investment,
            bank_name, bank_account_no, bank_branch, routing_no,
            share_value_bdt, is_active, user_id, nominee_name, nominee_contact, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          item.name.substring(0, 500), // Truncate to prevent abuse
          (item.address ?? '').substring(0, 1000),
          item.phone?.substring(0, 20) ?? null,
          item.email ?? null,
          item.nid?.substring(0, 20) ?? null,
          item.shareCount,
          item.type,
          investment,
          item.bankName ?? null,
          item.bankAccountNo ?? null,
          item.bankBranch ?? null,
          item.routingNo ?? null,
          item.shareValueBdt ?? null,
          item.isActive ? 1 : 0,
          userId ?? null,
          item.nomineeName ?? null,
          item.nomineeContact ?? null,
          tenantId,
        ),
      );

      runningTotal += item.shareCount;
      if (['investor', 'profit', 'doctor', 'shareholder'].includes(item.type)) runningInvestor += item.shareCount;
      if (item.type === 'owner') runningOwner += item.shareCount;

      finalResults.push({ row: rowNum, status: 'imported', message: 'Success', name: item.name });
    }

    // 5. Execute batch insert (atomic via D1 batch)
    if (statements.length > 0) {
      await db.$client.batch(statements);
    }

    const successCount = finalResults.filter(r => r.status === 'imported').length;
    const skippedCount = finalResults.filter(r => r.status === 'skipped').length;
    const failedCount = finalResults.filter(r => r.status === 'failed').length;

    return c.json({
      message: `Import complete: ${successCount} imported, ${skippedCount} skipped, ${failedCount} failed`,
      summary: { total: items.length, imported: successCount, skipped: skippedCount, failed: failedCount },
      results: finalResults,
    }, 201);
  } catch (error) {
    console.error('[shareholders/bulk-import]', error);
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to import shareholders' });
  }
});

/** PUT /api/shareholders/:id — dynamic update with cap re-validation */
shareholderRoutes.put('/:id', zValidator('json', updateShareholderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await db.$client.prepare(
      'SELECT * FROM shareholders WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Shareholder not found' });

    // If updating shares, validate against cap
    if (data.shareCount !== undefined) {
      const [maxTotalRow, otherSharesRow] = await Promise.all([
        db.$client.prepare("SELECT value FROM settings WHERE key = 'max_total_shares' AND tenant_id = ?").bind(tenantId).first<{ value: string }>(),
        db.$client.prepare('SELECT COALESCE(SUM(share_count), 0) as total FROM shareholders WHERE tenant_id = ? AND is_active = 1 AND id != ?').bind(tenantId, id).first<{ total: number }>(),
      ]);
      const maxShares = parseInt(maxTotalRow?.value ?? '300');
      const otherTotal = otherSharesRow?.total ?? 0;

      if (otherTotal + data.shareCount > maxShares) {
        throw new HTTPException(400, {
          message: `Share limit exceeded. Max total: ${maxShares}, others hold: ${otherTotal}, requested: ${data.shareCount}.`,
        });
      }
    }

    // Dynamic column whitelist update
    const ALLOWED_COLUMNS: Record<string, string> = {
      name: 'name', address: 'address', phone: 'phone', email: 'email', nid: 'nid',
      shareCount: 'share_count', type: 'type', investment: 'investment',
      bankName: 'bank_name', bankAccountNo: 'bank_account_no', bankBranch: 'bank_branch',
      routingNo: 'routing_no', shareValueBdt: 'share_value_bdt', isActive: 'is_active',
      userId: 'user_id', nomineeName: 'nominee_name', nomineeContact: 'nominee_contact',
    };

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    for (const [jsKey, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const dbCol = ALLOWED_COLUMNS[jsKey];
      if (!dbCol) continue;

      updates.push(`${dbCol} = ?`);
      if (jsKey === 'isActive') {
        params.push(value ? 1 : 0);
      } else {
        params.push(value as string | number | null);
      }
    }

    if (updates.length === 0) return c.json({ message: 'No updates provided' });

    updates.push("updated_at = datetime('now')");
    params.push(id, tenantId!);

    await db.$client.prepare(
      `UPDATE shareholders SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
    ).bind(...params).run();

    return c.json({ message: 'Shareholder updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update shareholder' });
  }
});

// ============================================================
// PROFIT DISTRIBUTION (Enhanced with TDS + Retained Earnings)
// ============================================================

/** GET /api/shareholders/calculate?month=YYYY-MM — preview dividend calculation */
shareholderRoutes.get('/calculate', zValidator('query', calculateDividendSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const month = c.req.valid('query').month;

  try {
    // Settings
    const settingsResult = await db.$client.prepare(
      'SELECT key, value FROM settings WHERE tenant_id = ?',
    ).bind(tenantId).all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of settingsResult.results) settings[row.key] = row.value;

    const profitPct = parseFloat(settings['profit_percentage'] || '30');
    const retainedPct = parseFloat(settings['retained_earnings_percent'] || '0');
    const tdsApplicable = parseInt(settings['tds_applicable'] || '0') === 1;
    const taxRate = parseFloat(settings['tax_rate'] || '5');
    const globalShareValue = parseInt(settings['share_value_per_share'] || '100000');

    // Revenue & Expenses
    const [incomeRow, expenseRow] = await Promise.all([
      db.$client.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM income WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`,
      ).bind(month, tenantId).first<{ total: number }>(),
      db.$client.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`,
      ).bind(month, tenantId).first<{ total: number }>(),
    ]);

    const totalIncome = incomeRow?.total || 0;
    const totalExpenses = expenseRow?.total || 0;
    const netProfit = totalIncome - totalExpenses;

    // Retained earnings
    const retainedAmount = netProfit > 0 ? Math.round(netProfit * (retainedPct / 100)) : 0;
    const afterRetained = netProfit - retainedAmount;
    const distributable = Math.max(0, Math.round(afterRetained * (profitPct / 100)));

    // TDS
    const tdsRate = tdsApplicable ? taxRate / 100 : 0;

    // Per-shareholder breakdown
    const shareholders = await db.$client.prepare(
      'SELECT id, name, share_count, type, share_value_bdt FROM shareholders WHERE tenant_id = ? AND is_active = 1 ORDER BY type, name',
    ).bind(tenantId).all<{ id: number; name: string; share_count: number; type: string; share_value_bdt: number | null }>();

    const totalShares = shareholders.results.reduce((s, sh) => s + sh.share_count, 0);
    const grossPerShare = totalShares > 0 ? distributable / totalShares : 0;

    const breakdown = shareholders.results.map((sh) => {
      const effectiveShareValue = sh.share_value_bdt ?? globalShareValue;
      const grossDividend = sh.share_count * grossPerShare;
      const taxDeducted = grossDividend * tdsRate;
      const netPayable = grossDividend - taxDeducted;
      return {
        id: sh.id, name: sh.name, type: sh.type, shareCount: sh.share_count,
        shareValueBdt: effectiveShareValue,
        shareValueTotal: sh.share_count * effectiveShareValue,
        grossDividend: Math.round(grossDividend),
        taxDeducted: Math.round(taxDeducted),
        netPayable: Math.round(netPayable),
      };
    });

    return c.json({
      month,
      financials: { totalIncome, totalExpenses, netProfit, retainedAmount, retainedPct, distributable },
      taxConfig: { tdsApplicable, taxRate, tdsRate },
      metrics: { totalShares, globalShareValue, grossPerShare: Math.round(grossPerShare) },
      profitPct,
      breakdown,
    });
  } catch (error) {
    console.error('[shareholders/calculate]', error);
    throw new HTTPException(500, { message: 'Failed to calculate profit distribution' });
  }
});

/** POST /api/shareholders/distribute — finalize + create per-person distribution records */
shareholderRoutes.post('/distribute', zValidator('json', finalizeDividendSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const { month, notes, items } = c.req.valid('json');

  try {
    // Prevent double distribution
    const existing = await db.$client.prepare(
      'SELECT id FROM profit_distributions WHERE month = ? AND tenant_id = ?',
    ).bind(month, tenantId).first();
    if (existing) throw new HTTPException(409, { message: `Profit already distributed for ${month}` });

    // Fetch settings
    const settingsResult = await db.$client.prepare(
      'SELECT key, value FROM settings WHERE tenant_id = ?',
    ).bind(tenantId).all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of settingsResult.results) settings[row.key] = row.value;

    const profitPct = parseFloat(settings['profit_percentage'] || '30');
    const retainedPct = parseFloat(settings['retained_earnings_percent'] || '0');
    const tdsApplicable = parseInt(settings['tds_applicable'] || '0') === 1;
    const taxRate = parseFloat(settings['tax_rate'] || '5');

    // Calculate from income/expenses
    const [incomeRow, expenseRow] = await Promise.all([
      db.$client.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM income WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`).bind(month, tenantId).first<{ total: number }>(),
      db.$client.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ? AND tenant_id = ?`).bind(month, tenantId).first<{ total: number }>(),
    ]);

    const profit = (incomeRow?.total || 0) - (expenseRow?.total || 0);
    const retainedAmount = profit > 0 ? Math.round(profit * (retainedPct / 100)) : 0;
    const distributable = Math.max(0, Math.round((profit - retainedAmount) * (profitPct / 100)));

    // Create distribution header
    const distResult = await db.$client.prepare(
      `INSERT INTO profit_distributions (month, total_profit, distributable_profit, profit_percentage,
        retained_amount, retained_percent, tds_applicable, tax_rate, notes, status,
        approved_by, approved_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'finalized', ?, datetime('now'), ?)`,
    ).bind(month, profit, distributable, profitPct, retainedAmount, retainedPct,
      tdsApplicable ? 1 : 0, taxRate, notes ?? null, userId ?? null, tenantId,
    ).run();
    const distributionId = distResult.meta.last_row_id;

    // Create per-shareholder payout records via batch for atomicity & D1 performance
    const totalDistributed = items.reduce((sum, item) => sum + item.netPayable, 0);
    const payoutStmts = items.map(item =>
      db.$client.prepare(
        `INSERT INTO shareholder_distributions
           (distribution_id, shareholder_id, share_count, per_share_amount, distribution_amount,
            gross_dividend, tax_deducted, net_payable, paid_status, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
      ).bind(
        distributionId, item.shareholderId, 0, 0, item.netPayable,
        item.grossDividend, item.taxDeducted, item.netPayable, tenantId,
      ),
    );
    if (payoutStmts.length > 0) {
      await db.$client.batch(payoutStmts);
    }

    return c.json({
      message: 'Profit distributed',
      distributionId,
      distributable,
      totalDistributed,
      shareholderCount: items.length,
    }, 201);
  } catch (error) {
    console.error('[shareholders/distribute]', error);
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to distribute profit' });
  }
});

// ============================================================
// DISTRIBUTION HISTORY
// ============================================================

/** GET /api/shareholders/distributions — list all distribution periods */
shareholderRoutes.get('/distributions', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const distributions = await db.$client.prepare(
      'SELECT * FROM profit_distributions WHERE tenant_id = ? ORDER BY month DESC',
    ).bind(tenantId).all();
    return c.json({ distributions: distributions.results });
  } catch (error) {
    console.error('[shareholders/distributions]', error);
    throw new HTTPException(500, { message: 'Failed to fetch distributions' });
  }
});

/** GET /api/shareholders/distributions/:id — per-person breakdown */
shareholderRoutes.get('/distributions/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const distribution = await db.$client.prepare(
      'SELECT * FROM profit_distributions WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!distribution) throw new HTTPException(404, { message: 'Distribution not found' });

    const details = await db.$client.prepare(
      `SELECT sd.*, s.name as shareholder_name, s.type, s.bank_name, s.bank_account_no
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

/** POST /api/shareholders/distributions/:id/pay/:shareholderId — mark as paid */
shareholderRoutes.post('/distributions/:id/pay/:shareholderId', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { id, shareholderId } = c.req.param();

  try {
    const record = await db.$client.prepare(
      `SELECT sd.* FROM shareholder_distributions sd
       JOIN profit_distributions pd ON sd.distribution_id = pd.id
       WHERE sd.distribution_id = ? AND sd.shareholder_id = ? AND pd.tenant_id = ?`,
    ).bind(id, shareholderId, tenantId).first();
    if (!record) throw new HTTPException(404, { message: 'Distribution record not found' });

    await db.$client.prepare(
      `UPDATE shareholder_distributions SET paid_status = 'paid', paid_date = date('now')
       WHERE distribution_id = ? AND shareholder_id = ? AND tenant_id = ?`,
    ).bind(id, shareholderId, tenantId).run();

    return c.json({ message: 'Marked as paid' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to mark as paid' });
  }
});

// ============================================================
// SELF-SERVICE PORTAL
// ============================================================

/** GET /api/shareholders/my-profile — shareholder sees their own profile */
shareholderRoutes.get('/my-profile', async (c) => {
  const db = getDb(c.env.DB);
  const userId = requireUserId(c);
  const tenantId = requireTenantId(c);

  const shareholder = await db.$client.prepare(
    'SELECT * FROM shareholders WHERE user_id = ? AND tenant_id = ? AND is_active = 1',
  ).bind(userId, tenantId).first();

  if (!shareholder) {
    throw new HTTPException(404, { message: 'No shareholder profile linked to your account' });
  }
  return c.json({ data: shareholder });
});

/** GET /api/shareholders/my-dividends — shareholder sees their dividend history */
shareholderRoutes.get('/my-dividends', async (c) => {
  const db = getDb(c.env.DB);
  const userId = requireUserId(c);
  const tenantId = requireTenantId(c);

  const shareholder = await db.$client.prepare(
    'SELECT id FROM shareholders WHERE user_id = ? AND tenant_id = ?',
  ).bind(userId, tenantId).first<{ id: number }>();

  if (!shareholder) {
    throw new HTTPException(404, { message: 'No shareholder profile linked' });
  }

  const { results } = await db.$client.prepare(
    `SELECT sd.id, sd.distribution_id, sd.shareholder_id,
       sd.gross_dividend, sd.tax_deducted, sd.net_payable,
       sd.paid_status as status, sd.paid_date,
       pd.month, pd.total_profit, pd.distributable_profit, pd.status as distribution_status
     FROM shareholder_distributions sd
     JOIN profit_distributions pd ON sd.distribution_id = pd.id
     WHERE sd.shareholder_id = ? AND sd.tenant_id = ?
     ORDER BY pd.month DESC
     LIMIT 50`,
  ).bind(shareholder.id, tenantId).all();

  return c.json({ data: results });
});

// ============================================================
// OCR PDF — Gemini Flash extracts shareholder data from scanned PDFs
// ============================================================

/**
 * POST /api/shareholders/ocr-pdf
 * Accepts multipart/form-data with a PDF file (max 10MB).
 * Sends it to Gemini Flash as base64 and returns structured shareholder JSON.
 */
shareholderRoutes.post('/ocr-pdf', async (c) => {
  if (!c.env.GEMINI_API_KEY) {
    throw new HTTPException(503, {
      message: 'OCR service not configured. Contact your administrator to set GEMINI_API_KEY.',
    });
  }

  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Unauthorized' });

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new HTTPException(400, { message: 'Invalid multipart form data' });
  }

  const file = formData.get('file');
  // Cloudflare Workers FormData returns Blob (with .name property)
  if (!file || typeof file !== 'object' || !('size' in file)) {
    throw new HTTPException(400, { message: 'file field is required' });
  }
  const uploadedFile = file as Blob & { name?: string };

  const MAX_SIZE = 10 * 1024 * 1024;
  if (uploadedFile.size > MAX_SIZE) {
    throw new HTTPException(413, { message: 'File too large (max 10MB)' });
  }
  const fileName = (uploadedFile.name ?? 'upload').toLowerCase();
  if (!fileName.endsWith('.pdf')) {
    throw new HTTPException(400, { message: 'Only PDF files are accepted' });
  }

  // Convert PDF to base64 for Gemini inline_data
  const arrayBuffer = await uploadedFile.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  const prompt = `You are an expert at extracting data from Bengali hospital shareholder registration forms (শেয়ার ফরম).

Extract ALL shareholders from this PDF. For each person return a JSON object with these exact fields:
- name: string (Bengali name, required)
- nameEn: string (English name if present)
- phone: string (Bangladeshi mobile: 01XXXXXXXXX)
- phone2: string (second phone if any)
- nid: string (10, 13 or 17-digit NID number, digits only)
- shareCount: number (integer, default 0)
- shareValueBdt: number (value per share in BDT, integer)
- investment: number (total investment = shareCount × shareValueBdt)
- address: string
- type: one of ["profit","owner","investor","doctor","shareholder"]
- nomineeName: string
- nomineeContact: string
- fatherName: string
- motherName: string
- religion: string
- nationality: string
- profession: string
- dateOfBirth: string
- bankName: string
- bankAccountNo: string
- bankBranch: string

Return ONLY valid JSON in this exact format, no prose:
{"shareholders": [...]}

If no shareholders found return: {"shareholders": []}`;

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${c.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64Data,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );
  } catch (err) {
    console.error('[ocr-pdf] Gemini fetch error:', err);
    throw new HTTPException(502, { message: 'OCR service unreachable. Try again later.' });
  }

  if (!geminiResponse.ok) {
    const errBody = await geminiResponse.text().catch(() => '');
    console.error('[ocr-pdf] Gemini error:', geminiResponse.status, errBody);
    throw new HTTPException(502, { message: `OCR service error (HTTP ${geminiResponse.status})` });
  }

  const geminiData = await geminiResponse.json<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  }>();

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Extract JSON from response (Gemini may wrap it in markdown code fences)
  const jsonMatch = rawText.match(/\{[\s\S]*"shareholders"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[ocr-pdf] No JSON found in Gemini response:', rawText.substring(0, 500));
    return c.json({ shareholders: [] });
  }

  let parsed: { shareholders: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { shareholders: unknown[] };
  } catch {
    console.error('[ocr-pdf] JSON parse error:', jsonMatch[0].substring(0, 200));
    return c.json({ shareholders: [] });
  }

  // Sanitize & validate each item
  const typeValues = ['profit', 'owner', 'investor', 'doctor', 'shareholder'] as const;
  type ShareholderType = typeof typeValues[number];

  const shareholders = (Array.isArray(parsed.shareholders) ? parsed.shareholders : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const rawType = String(item.type ?? 'investor');
      const type: ShareholderType = (typeValues as readonly string[]).includes(rawType)
        ? (rawType as ShareholderType)
        : 'investor';

      return {
        name:           String(item.name ?? '').replace(/[<>]/g, '').trim(),
        nameEn:         item.nameEn  ? String(item.nameEn).trim()  : undefined,
        phone:          item.phone   ? String(item.phone).replace(/\D/g, '') : undefined,
        phone2:         item.phone2  ? String(item.phone2).replace(/\D/g, '') : undefined,
        nid:            item.nid     ? String(item.nid).replace(/\D/g, '')   : undefined,
        shareCount:     Math.max(0, Math.floor(Number(item.shareCount ?? 0))),
        shareValueBdt:  item.shareValueBdt ? Math.floor(Number(item.shareValueBdt)) : undefined,
        investment:     item.investment    ? Math.floor(Number(item.investment))    : undefined,
        address:        item.address   ? String(item.address).replace(/[<>]/g, '').trim()   : undefined,
        type,
        nomineeName:    item.nomineeName  ? String(item.nomineeName).replace(/[<>]/g, '').trim()  : undefined,
        nomineeContact: item.nomineeContact ? String(item.nomineeContact).replace(/\D/g, '') : undefined,
        fatherName:     item.fatherName  ? String(item.fatherName).replace(/[<>]/g, '').trim()  : undefined,
        motherName:     item.motherName  ? String(item.motherName).replace(/[<>]/g, '').trim()  : undefined,
        religion:       item.religion    ? String(item.religion).trim()    : undefined,
        nationality:    item.nationality ? String(item.nationality).trim() : undefined,
        profession:     item.profession  ? String(item.profession).trim()  : undefined,
        dateOfBirth:    item.dateOfBirth ? String(item.dateOfBirth).trim() : undefined,
        bankName:       item.bankName        ? String(item.bankName).trim()        : undefined,
        bankAccountNo:  item.bankAccountNo   ? String(item.bankAccountNo).trim()   : undefined,
        bankBranch:     item.bankBranch      ? String(item.bankBranch).trim()      : undefined,
      };
    })
    .filter(sh => sh.name.length >= 2); // drop nameless rows

  return c.json({ shareholders });
});

export default shareholderRoutes;