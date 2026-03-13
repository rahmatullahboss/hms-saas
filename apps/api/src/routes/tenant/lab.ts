import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import {
  createLabTestSchema,
  updateLabTestSchema,
  createLabOrderSchema,
  updateLabItemResultSchema,
  updateSampleStatusSchema,
} from '../../schemas/lab';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';

const labCatalogRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Helper: Auto-detect abnormal flag ────────────────────────────────────────

function detectAbnormalFlag(
  numericValue: number | undefined,
  normalRange: string | null | undefined,
  criticalLow?: number | null,
  criticalHigh?: number | null
): 'normal' | 'high' | 'low' | 'critical' | 'pending' {
  if (numericValue === undefined || numericValue === null || !normalRange) {
    return 'pending';
  }

  // Parse range: "70-100" or "M:4.5-5.5|F:4.0-5.0" → use first range
  const rangeStr = normalRange.includes('|')
    ? normalRange.split('|')[0].replace(/^[MF]:/, '')
    : normalRange;

  const match = rangeStr.match(/^([\d.]+)-([\d.]+)$/);
  if (!match) return 'pending';

  const low = parseFloat(match[1]);
  const high = parseFloat(match[2]);

  if (isNaN(low) || isNaN(high)) return 'pending';

  // Use per-test critical thresholds if available, otherwise fall back to 2x-range heuristic
  const cLow = (criticalLow != null && !isNaN(criticalLow)) ? criticalLow : low - (high - low);
  const cHigh = (criticalHigh != null && !isNaN(criticalHigh)) ? criticalHigh : high + (high - low);

  if (numericValue < cLow || numericValue > cHigh) return 'critical';
  if (numericValue < low) return 'low';
  if (numericValue > high) return 'high';
  return 'normal';
}

// ─── Lab Test Catalog CRUD ────────────────────────────────────────────────────

labCatalogRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const search = c.req.query('search') || '';

  try {
    let query = 'SELECT * FROM lab_test_catalog WHERE tenant_id = ? AND is_active = 1';
    const params: (string | number)[] = [tenantId!];

    if (search) {
      query += ' AND (name LIKE ? OR code LIKE ? OR category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY category, name';
    const tests = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ tests: tests.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch lab tests' });
  }
});

labCatalogRoutes.post('/', zValidator('json', createLabTestSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO lab_test_catalog (code, name, category, price, unit, normal_range, method, critical_low, critical_high, is_active, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      data.code, data.name, data.category ?? null, data.price,
      data.unit ?? null, data.normalRange ?? null, data.method ?? null,
      data.criticalLow ?? null, data.criticalHigh ?? null,
      tenantId
    ).run();
    return c.json({ message: 'Lab test added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add lab test' });
  }
});

labCatalogRoutes.put('/:id', zValidator('json', updateLabTestSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM lab_test_catalog WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Lab test not found' });

    await c.env.DB.prepare(
      `UPDATE lab_test_catalog SET code = ?, name = ?, category = ?, price = ?, unit = ?, normal_range = ?, method = ?, critical_low = ?, critical_high = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.code     ?? existing['code'],
      data.name     ?? existing['name'],
      data.category !== undefined ? data.category : existing['category'],
      data.price    !== undefined ? data.price    : existing['price'],
      data.unit     !== undefined ? data.unit     : existing['unit'],
      data.normalRange !== undefined ? data.normalRange : existing['normal_range'],
      data.method   !== undefined ? data.method   : existing['method'],
      data.criticalLow !== undefined ? data.criticalLow : existing['critical_low'],
      data.criticalHigh !== undefined ? data.criticalHigh : existing['critical_high'],
      id, tenantId,
    ).run();
    return c.json({ message: 'Lab test updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update lab test' });
  }
});

labCatalogRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM lab_test_catalog WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Lab test not found' });

    await c.env.DB.prepare(
      'UPDATE lab_test_catalog SET is_active = 0 WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).run();
    return c.json({ message: 'Lab test deactivated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to deactivate lab test' });
  }
});

// ─── Lab Orders ───────────────────────────────────────────────────────────────

// GET /api/lab/orders — list orders, with optional filters
labCatalogRoutes.get('/orders', async (c) => {
  const tenantId = c.get('tenantId');
  const { patientId, date } = c.req.query();

  try {
    let query = `
      SELECT lo.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile,
             COUNT(loi.id) as total_items,
             SUM(CASE WHEN loi.status = 'pending' THEN 1 ELSE 0 END) as pending_items
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN lab_order_items loi ON lo.id = loi.lab_order_id
      WHERE lo.tenant_id = ?
    `;
    const params: (string | number)[] = [tenantId!];

    if (patientId) { query += ' AND lo.patient_id = ?'; params.push(patientId); }
    if (date)      { query += ' AND lo.order_date = ?'; params.push(date); }

    query += ' GROUP BY lo.id ORDER BY lo.created_at DESC LIMIT 100';
    const orders = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ orders: orders.results, meta: { total: orders.results.length, limit: 100 } });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch lab orders' });
  }
});

// GET /api/lab/orders/queue/today — today's pending test queue (for lab portal)
labCatalogRoutes.get('/orders/queue/today', async (c) => {
  const tenantId = c.get('tenantId');
  const today = new Date().toISOString().split('T')[0];
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') ?? '50')));
  const offset = (page - 1) * limit;

  try {
    // Get total count
    const countRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      WHERE lo.tenant_id = ? AND lo.order_date = ? AND lo.status = 'sent'
    `).bind(tenantId, today).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const queue = await c.env.DB.prepare(`
      SELECT loi.id as item_id, loi.status, loi.result, loi.result_numeric,
             loi.abnormal_flag, loi.sample_status, loi.collected_at,
             lo.id as order_id, lo.order_no, lo.order_date, lo.specimen_type,
             p.name as patient_name, p.patient_code, p.mobile,
             ltc.name as test_name, ltc.category, ltc.code as test_code,
             ltc.unit, ltc.normal_range, ltc.method,
             loi.unit_price, loi.line_total, loi.priority
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
      WHERE lo.tenant_id = ? AND lo.order_date = ? AND lo.status = 'sent'
      ORDER BY
        CASE loi.priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
        CASE loi.sample_status WHEN 'ordered' THEN 0 WHEN 'collected' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END,
        lo.created_at ASC
      LIMIT ? OFFSET ?
    `).bind(tenantId, today, limit, offset).all();
    return c.json({
      queue: queue.results,
      date: today,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch today\'s queue' });
  }
});

// GET /api/lab/dashboard/stats — KPI stats for lab dashboard
labCatalogRoutes.get('/dashboard/stats', async (c) => {
  const tenantId = c.get('tenantId');
  const today = new Date().toISOString().split('T')[0];

  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_today,
        SUM(CASE WHEN loi.sample_status = 'ordered' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN loi.sample_status = 'collected' THEN 1 ELSE 0 END) as collected,
        SUM(CASE WHEN loi.sample_status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN loi.sample_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN loi.abnormal_flag = 'critical' THEN 1 ELSE 0 END) as critical_results,
        SUM(CASE WHEN loi.abnormal_flag IN ('high', 'low') THEN 1 ELSE 0 END) as abnormal_results
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      WHERE lo.tenant_id = ? AND lo.order_date = ?
    `).bind(tenantId, today).first();

    return c.json({
      stats: {
        totalToday: Number(stats?.total_today ?? 0),
        pending: Number(stats?.pending ?? 0),
        collected: Number(stats?.collected ?? 0),
        processing: Number(stats?.processing ?? 0),
        completed: Number(stats?.completed ?? 0),
        criticalResults: Number(stats?.critical_results ?? 0),
        abnormalResults: Number(stats?.abnormal_results ?? 0),
      },
      date: today,
    });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/lab/orders/:id — order detail with items
labCatalogRoutes.get('/orders/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const order = await c.env.DB.prepare(`
      SELECT lo.*, p.name as patient_name, p.patient_code, p.mobile
      FROM lab_orders lo JOIN patients p ON lo.patient_id = p.id
      WHERE lo.id = ? AND lo.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!order) throw new HTTPException(404, { message: 'Lab order not found' });

    const items = await c.env.DB.prepare(`
      SELECT loi.*, ltc.name as test_name, ltc.code, ltc.category,
             ltc.unit, ltc.normal_range, ltc.method
      FROM lab_order_items loi
      JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
      WHERE loi.lab_order_id = ? AND loi.tenant_id = ?
    `).bind(id, tenantId).all();

    return c.json({ order, items: items.results });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch lab order' });
  }
});

// POST /api/lab/orders — create lab order
labCatalogRoutes.post('/orders', zValidator('json', createLabOrderSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const orderDate = data.orderDate ?? new Date().toISOString().split('T')[0];

  try {
    const orderNo = await getNextSequence(c.env.DB, tenantId!, 'lab_order', 'LO');

    const orderResult = await c.env.DB.prepare(`
      INSERT INTO lab_orders (order_no, patient_id, visit_id, ordered_by, order_date, status, diagnosis, relevant_history, fasting_required, specimen_type, collection_notes, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderNo, data.patientId, data.visitId ?? null, userId, orderDate,
      data.status ?? 'sent',
      data.diagnosis ?? null,
      data.relevantHistory ?? null,
      data.fastingRequired ? 1 : 0,
      data.specimenType ?? 'Blood',
      data.collectionNotes ?? null,
      tenantId
    ).run();

    const orderId = orderResult.meta.last_row_id;

    // Insert each test item using D1 batch for efficiency
    const insertStmts = [];
    for (const item of data.items) {
      const test = await c.env.DB.prepare(
        'SELECT id, price FROM lab_test_catalog WHERE id = ? AND tenant_id = ? AND is_active = 1',
      ).bind(item.labTestId, tenantId).first<{ id: number; price: number }>();
      if (!test) throw new HTTPException(400, { message: `Lab test ${item.labTestId} not found` });

      const discount = item.discount;
      const lineTotal = Math.max(0, test.price - discount);

      insertStmts.push(
        c.env.DB.prepare(`
          INSERT INTO lab_order_items (lab_order_id, lab_test_id, unit_price, discount, line_total, status, priority, instructions, sample_status, abnormal_flag, tenant_id)
          VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 'ordered', 'pending', ?)
        `).bind(orderId, item.labTestId, test.price, discount, lineTotal, item.priority ?? 'routine', item.instructions ?? null, tenantId)
      );
    }

    if (insertStmts.length > 0) {
      await c.env.DB.batch(insertStmts);
    }

    return c.json({ message: 'Lab order created', orderId, orderNo }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to create lab order' });
  }
});

// PUT /api/lab/items/:itemId/result — set result for a single test item
labCatalogRoutes.put('/items/:itemId/result', zValidator('json', updateLabItemResultSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const itemId = c.req.param('itemId');
  const data = c.req.valid('json');

  try {
    // Fetch item + catalog info for auto-abnormal detection
    const item = await c.env.DB.prepare(`
      SELECT loi.*, lo.tenant_id, ltc.normal_range, ltc.unit, ltc.critical_low, ltc.critical_high
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
      WHERE loi.id = ? AND lo.tenant_id = ?
    `).bind(itemId, tenantId).first<Record<string, unknown>>();
    if (!item) throw new HTTPException(404, { message: 'Lab order item not found' });

    // Auto-detect abnormal flag if not provided
    const abnormalFlag = data.abnormalFlag
      ?? detectAbnormalFlag(
        data.resultNumeric,
        item['normal_range'] as string | null,
        item['critical_low'] as number | null | undefined,
        item['critical_high'] as number | null | undefined
      );

    await c.env.DB.prepare(
      `UPDATE lab_order_items
       SET result = ?, result_numeric = ?, abnormal_flag = ?,
           status = 'completed', sample_status = 'completed',
           completed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    ).bind(data.result, data.resultNumeric ?? null, abnormalFlag, itemId, tenantId).run();

    return c.json({ message: 'Result entered', abnormalFlag });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update result' });
  }
});

// PUT /api/lab/items/:itemId/sample-status — update sample collection status
labCatalogRoutes.put('/items/:itemId/sample-status', zValidator('json', updateSampleStatusSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const data = c.req.valid('json');

  try {
    const item = await c.env.DB.prepare(`
      SELECT loi.id, loi.sample_status, lo.tenant_id
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      WHERE loi.id = ? AND lo.tenant_id = ?
    `).bind(itemId, tenantId).first<{ id: number; sample_status: string }>();
    if (!item) throw new HTTPException(404, { message: 'Lab order item not found' });

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      ordered: ['collected', 'rejected'],
      collected: ['processing', 'rejected'],
      processing: ['completed', 'rejected'],
    };

    const allowed = validTransitions[item.sample_status] ?? [];
    if (!allowed.includes(data.sampleStatus)) {
      throw new HTTPException(400, {
        message: `Cannot transition from '${item.sample_status}' to '${data.sampleStatus}'`,
      });
    }

    const updates: string[] = [`sample_status = ?`];
    const binds: (string | number | null)[] = [data.sampleStatus];

    if (data.sampleStatus === 'collected') {
      updates.push(`collected_at = datetime('now')`);
    }
    if (data.sampleStatus === 'processing') {
      updates.push(`processed_by = ?`);
      binds.push(userId ?? null);
    }

    binds.push(itemId, tenantId!);

    await c.env.DB.prepare(
      `UPDATE lab_order_items SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
    ).bind(...binds).run();

    return c.json({ message: `Sample status updated to '${data.sampleStatus}'` });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update sample status' });
  }
});

// POST /api/lab/orders/:id/print — increment print count
labCatalogRoutes.post('/orders/:id/print', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare(
      `UPDATE lab_orders SET print_count = print_count + 1, last_printed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).run();
    return c.json({ message: 'Print count updated' });
  } catch {
    throw new HTTPException(500, { message: 'Failed to update print count' });
  }
});

export default labCatalogRoutes;
