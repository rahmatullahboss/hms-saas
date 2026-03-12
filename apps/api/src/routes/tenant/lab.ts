import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createLabTestSchema, updateLabTestSchema, createLabOrderSchema, updateLabItemResultSchema } from '../../schemas/lab';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';

const labCatalogRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

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
      `INSERT INTO lab_test_catalog (code, name, category, price, is_active, tenant_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).bind(data.code, data.name, data.category ?? null, data.price, tenantId).run();
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
      `UPDATE lab_test_catalog SET code = ?, name = ?, category = ?, price = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.code     ?? existing['code'],
      data.name     ?? existing['name'],
      data.category !== undefined ? data.category : existing['category'],
      data.price    !== undefined ? data.price    : existing['price'],
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
  const { patientId, date, status } = c.req.query();

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
    return c.json({ orders: orders.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch lab orders' });
  }
});

// GET /api/lab/orders/queue/today — today's pending test queue (for lab portal)
labCatalogRoutes.get('/orders/queue/today', async (c) => {
  const tenantId = c.get('tenantId');
  const today = new Date().toISOString().split('T')[0];

  try {
    const queue = await c.env.DB.prepare(`
      SELECT loi.id as item_id, loi.status, loi.result,
             lo.id as order_id, lo.order_no, lo.order_date,
             p.name as patient_name, p.patient_code, p.mobile,
             ltc.name as test_name, ltc.category, ltc.code as test_code,
             loi.unit_price, loi.line_total
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
      WHERE lo.tenant_id = ? AND lo.order_date = ? AND lo.status = 'sent'
      ORDER BY loi.status ASC, lo.created_at ASC
    `).bind(tenantId, today).all();
    return c.json({ queue: queue.results, date: today });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch today\'s queue' });
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
      SELECT loi.*, ltc.name as test_name, ltc.code, ltc.category
      FROM lab_order_items loi
      JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
      WHERE loi.lab_order_id = ?
    `).bind(id).all();

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

    // Insert each test item, fetching price from catalog
    for (const item of data.items) {
      const test = await c.env.DB.prepare(
        'SELECT id, price FROM lab_test_catalog WHERE id = ? AND tenant_id = ? AND is_active = 1',
      ).bind(item.labTestId, tenantId).first<{ id: number; price: number }>();
      if (!test) throw new HTTPException(400, { message: `Lab test ${item.labTestId} not found` });

      const discount = item.discount;
      const lineTotal = Math.max(0, test.price - discount);

      await c.env.DB.prepare(`
        INSERT INTO lab_order_items (lab_order_id, lab_test_id, unit_price, discount, line_total, status, priority, instructions, tenant_id)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).bind(orderId, item.labTestId, test.price, discount, lineTotal, item.priority ?? 'routine', item.instructions ?? null, tenantId).run();
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
    const item = await c.env.DB.prepare(
      'SELECT loi.*, lo.tenant_id FROM lab_order_items loi JOIN lab_orders lo ON loi.lab_order_id = lo.id WHERE loi.id = ? AND lo.tenant_id = ?',
    ).bind(itemId, tenantId).first();
    if (!item) throw new HTTPException(404, { message: 'Lab order item not found' });

    await c.env.DB.prepare(
      `UPDATE lab_order_items SET result = ?, status = 'completed', completed_at = datetime('now')
       WHERE id = ?`,
    ).bind(data.result, itemId).run();
    return c.json({ message: 'Result entered' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update result' });
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
