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
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getPagination, paginationMeta } from '../../lib/pagination';
import { getDb } from '../../db';


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

/**
 * GET /api/lab
 * Retrieves a list of active lab tests from the catalog for the current tenant.
 * Supports searching by test name, code, or category.
 *
 * @param {string} [search] - Optional search query to filter lab tests.
 * @returns {Object} JSON response containing:
 *   - tests: Array of active lab test records.
 *
 * @example
 * // GET /api/lab?search=blood
 */
labCatalogRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const search = c.req.query('search') || '';

  try {
    let query = 'SELECT * FROM lab_test_catalog WHERE tenant_id = ? AND is_active = 1';
    const params: (string | number)[] = [tenantId!];

    if (search) {
      query += ' AND (name LIKE ? OR code LIKE ? OR category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY category, name';
    const tests = await db.$client.prepare(query).bind(...params).all();
    return c.json({ tests: tests.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch lab tests' });
  }
});

/**
 * POST /api/lab
 * Adds a new lab test to the catalog for the current tenant.
 * Validates the request body against `createLabTestSchema`.
 *
 * @param {Object} body - Validated lab test data (code, name, category, price).
 * @returns {Object} JSON response containing:
 *   - message: Success message.
 *   - id: The ID of the newly created lab test.
 * @throws {HTTPException} 500 if the creation fails.
 *
 * @example
 * // POST /api/lab
 * // Body: { "code": "CBC", "name": "Complete Blood Count", "price": 50 }
 */
labCatalogRoutes.post('/', zValidator('json', createLabTestSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    const result = await db.$client.prepare(
      `INSERT INTO lab_test_catalog (code, name, category, price, is_active, tenant_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).bind(data.code, data.name, data.category ?? null, data.price, tenantId).run();
    return c.json({ message: 'Lab test added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add lab test' });
  }
});

/**
 * PUT /api/lab/:id
 * Updates an existing lab test in the catalog for the current tenant.
 * Validates the request body against `updateLabTestSchema`.
 * Only provided fields are updated; missing fields retain their current values.
 *
 * @param {string} id - The ID of the lab test to update.
 * @param {Object} body - Partial lab test data to update.
 * @returns {Object} JSON response indicating success.
 * @throws {HTTPException} 404 if the lab test is not found.
 * @throws {HTTPException} 500 if the update fails.
 *
 * @example
 * // PUT /api/lab/123
 * // Body: { "price": 55 }
 */
labCatalogRoutes.put('/:id', zValidator('json', updateLabTestSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await db.$client.prepare(
      'SELECT * FROM lab_test_catalog WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Lab test not found' });

    await db.$client.prepare(
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

/**
 * DELETE /api/lab/:id
 * Performs a logical deletion (deactivation) of a lab test in the catalog.
 * Sets `is_active` to 0.
 *
 * @param {string} id - The ID of the lab test to deactivate.
 * @returns {Object} JSON response indicating success.
 * @throws {HTTPException} 404 if the lab test is not found.
 * @throws {HTTPException} 500 if the deactivation fails.
 *
 * @example
 * // DELETE /api/lab/123
 */
labCatalogRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const existing = await db.$client.prepare(
      'SELECT id FROM lab_test_catalog WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Lab test not found' });

    await db.$client.prepare(
      'UPDATE lab_test_catalog SET is_active = 0 WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).run();
    return c.json({ message: 'Lab test deactivated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to deactivate lab test' });
  }
});

// ─── Lab Orders ───────────────────────────────────────────────────────────────

/**
 * GET /api/lab/orders
 * Retrieves a paginated list of lab orders for the current tenant.
 * Supports filtering by patient ID and order date.
 * Includes aggregates for total items and pending items per order.
 *
 * @param {string} [patientId] - Optional patient ID to filter orders.
 * @param {string} [date] - Optional date (YYYY-MM-DD) to filter orders.
 * @param {string} [page=1] - Pagination: current page number.
 * @param {string} [limit=10] - Pagination: number of records per page.
 * @returns {Object} JSON response containing:
 *   - orders: Array of lab order records with patient details and item counts.
 *   - meta: Pagination metadata.
 *
 * @example
 * // GET /api/lab/orders?date=2024-03-14&page=1
 */
labCatalogRoutes.get('/orders', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { patientId, date, status } = c.req.query();
  const { page, limit, offset } = getPagination(c);

  try {
    let whereClause = 'WHERE lo.tenant_id = ?';
    const params: (string | number)[] = [tenantId];

    if (patientId) { whereClause += ' AND lo.patient_id = ?'; params.push(patientId); }
    if (date)      { whereClause += ' AND lo.order_date = ?'; params.push(date); }

    const countResult = await db.$client.prepare(
      `SELECT COUNT(*) as total FROM lab_orders lo ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const orders = await db.$client.prepare(`
      SELECT lo.*, p.name as patient_name, p.patient_code, p.mobile as patient_mobile,
             COUNT(loi.id) as total_items,
             SUM(CASE WHEN loi.status = 'pending' THEN 1 ELSE 0 END) as pending_items
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN lab_order_items loi ON lo.id = loi.lab_order_id
      ${whereClause}
      GROUP BY lo.id ORDER BY lo.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return c.json({ orders: orders.results, meta: paginationMeta(page, limit, total) });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch lab orders' });
  }
});

/**
 * GET /api/lab/orders/queue/today
 * Retrieves today's queue of lab test items (for the lab portal) for the current tenant.
 * Includes details about the test, patient, and order, sorted by status and creation time.
 *
 * @returns {Object} JSON response containing:
 *   - queue: Array of lab order items scheduled for today.
 *   - date: Today's date (YYYY-MM-DD).
 *
 * @example
 * // GET /api/lab/orders/queue/today
 */
labCatalogRoutes.get('/orders/queue/today', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const today = new Date().toISOString().split('T')[0];

  try {
    const queue = await db.$client.prepare(`
      SELECT loi.id as item_id, loi.status, loi.result,
             lo.id as order_id, lo.order_no, lo.order_date,
             p.name as patient_name, p.patient_code, p.mobile,
             ltc.name as test_name, ltc.category, ltc.code as test_code,
             loi.unit_price, loi.line_total
      FROM lab_order_items loi
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN lab_test_catalog ltc ON loi.lab_test_id = ltc.id
      WHERE lo.tenant_id = ? AND lo.order_date = ?
      ORDER BY loi.status ASC, lo.created_at ASC
    `).bind(tenantId, today).all();
    return c.json({ queue: queue.results, date: today });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch today\'s queue' });
  }
});

/**
 * GET /api/lab/orders/:id
 * Retrieves the details of a single lab order by its ID, along with its associated test items.
 *
 * @param {string} id - The ID of the lab order.
 * @returns {Object} JSON response containing:
 *   - order: The main lab order record with patient details.
 *   - items: Array of `lab_order_items` associated with the order.
 * @throws {HTTPException} 404 if the lab order is not found.
 *
 * @example
 * // GET /api/lab/orders/456
 */
labCatalogRoutes.get('/orders/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const order = await db.$client.prepare(`
      SELECT lo.*, p.name as patient_name, p.patient_code, p.mobile
      FROM lab_orders lo JOIN patients p ON lo.patient_id = p.id
      WHERE lo.id = ? AND lo.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!order) throw new HTTPException(404, { message: 'Lab order not found' });

    const items = await db.$client.prepare(`
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

/**
 * POST /api/lab/orders
 * Creates a new lab order and its associated test items for the current tenant.
 * Generates a unique order number. For each requested item, fetches the current price
 * from the active lab test catalog to compute the line total.
 *
 * @param {Object} body - Validated lab order data (patientId, visitId, items).
 * @returns {Object} JSON response containing:
 *   - message: Success message.
 *   - orderId: The ID of the newly created lab order.
 *   - orderNo: The unique lab order number (e.g., LO-000001).
 * @throws {HTTPException} 400 if a requested lab test is not found or inactive.
 * @throws {HTTPException} 500 if the order creation fails.
 *
 * @example
 * // POST /api/lab/orders
 * // Body: { "patientId": 1, "items": [{ "labTestId": 10, "discount": 0 }] }
 */
labCatalogRoutes.post('/orders', zValidator('json', createLabOrderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const orderDate = data.orderDate ?? new Date().toISOString().split('T')[0];

  try {
    const orderNo = await getNextSequence(c.env.DB, tenantId!, 'lab_order', 'LO');

    const orderResult = await db.$client.prepare(`
      INSERT INTO lab_orders (order_no, patient_id, visit_id, ordered_by, order_date, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(orderNo, data.patientId, data.visitId ?? null, userId, orderDate, tenantId).run();

    const orderId = orderResult.meta.last_row_id;

    // Ensure accurate billing by dynamically fetching the current price of each lab test
    // directly from the catalog at the time the order is placed.
    for (const item of data.items) {
      const test = await db.$client.prepare(
        'SELECT id, price FROM lab_test_catalog WHERE id = ? AND tenant_id = ? AND is_active = 1',
      ).bind(item.labTestId, tenantId).first<{ id: number; price: number }>();
      if (!test) throw new HTTPException(400, { message: `Lab test ${item.labTestId} not found` });

      // Apply item-specific discounts while ensuring the line total does not become negative
      const discount = item.discount;
      const lineTotal = Math.max(0, test.price - discount);

      await db.$client.prepare(`
        INSERT INTO lab_order_items (lab_order_id, lab_test_id, unit_price, discount, line_total, status, tenant_id)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).bind(orderId, item.labTestId, test.price, discount, lineTotal, tenantId).run();
    }

    return c.json({ message: 'Lab order created', orderId, orderNo }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to create lab order' });
  }
});

/**
 * PUT /api/lab/items/:itemId/result
 * Records or updates the result for a single lab test item.
 * Marks the item status as 'completed' and sets the completion timestamp.
 *
 * @param {string} itemId - The ID of the lab order item.
 * @param {Object} body - Validated data containing the test result.
 * @returns {Object} JSON response indicating success.
 * @throws {HTTPException} 404 if the lab order item is not found.
 * @throws {HTTPException} 500 if the result update fails.
 *
 * @example
 * // PUT /api/lab/items/789/result
 * // Body: { "result": "Normal" }
 */
labCatalogRoutes.put('/items/:itemId/result', zValidator('json', updateLabItemResultSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const itemId = c.req.param('itemId');
  const data = c.req.valid('json');

  try {
    const item = await db.$client.prepare(
      'SELECT loi.*, lo.tenant_id FROM lab_order_items loi JOIN lab_orders lo ON loi.lab_order_id = lo.id WHERE loi.id = ? AND lo.tenant_id = ?',
    ).bind(itemId, tenantId).first();
    if (!item) throw new HTTPException(404, { message: 'Lab order item not found' });

    await db.$client.prepare(
      `UPDATE lab_order_items SET result = ?, status = 'completed', completed_at = datetime('now')
       WHERE id = ? AND lab_order_id IN (SELECT id FROM lab_orders WHERE tenant_id = ?)`,
    ).bind(data.result, itemId, tenantId).run();
    return c.json({ message: 'Result entered' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update result' });
  }
});

/**
 * POST /api/lab/orders/:id/print
 * Increments the print count for a specific lab order and updates the last printed timestamp.
 *
 * @param {string} id - The ID of the lab order.
 * @returns {Object} JSON response indicating success.
 * @throws {HTTPException} 500 if the print count update fails.
 *
 * @example
 * // POST /api/lab/orders/456/print
 */
labCatalogRoutes.post('/orders/:id/print', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    await db.$client.prepare(
      `UPDATE lab_orders SET print_count = print_count + 1, last_printed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).run();
    return c.json({ message: 'Print count updated' });
  } catch {
    throw new HTTPException(500, { message: 'Failed to update print count' });
  }
});

// ─── PATCH /api/lab/items/:itemId/sample-status ──────────────────────────────

labCatalogRoutes.patch('/items/:itemId/sample-status', zValidator('json', updateSampleStatusSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const itemId = c.req.param('itemId');
  const data = c.req.valid('json');

  try {
    const item = await db.$client.prepare(
      `SELECT loi.*, lo.tenant_id FROM lab_order_items loi
       JOIN lab_orders lo ON loi.lab_order_id = lo.id
       WHERE loi.id = ? AND lo.tenant_id = ?`
    ).bind(itemId, tenantId).first();
    if (!item) throw new HTTPException(404, { message: 'Lab order item not found' });

    await db.$client.prepare(
      `UPDATE lab_order_items SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
       WHERE id = ? AND lab_order_id IN (SELECT id FROM lab_orders WHERE tenant_id = ?)`
    ).bind(data.status, data.notes ?? null, itemId, tenantId).run();
    return c.json({ message: `Sample status updated to ${data.status}` });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update sample status' });
  }
});

export default labCatalogRoutes;
