import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createMedicineSchema, updateMedicineSchema, createPurchaseSchema, createSupplierSchema, updateSupplierSchema, createSaleSchema } from '../../schemas/pharmacy';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';

const pharmacyRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── MEDICINES ────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/medicines', async (c) => {
  const tenantId = c.get('tenantId');
  const search = c.req.query('search') || '';

  try {
    let query = `
      SELECT m.*, COALESCE(SUM(b.quantity_available), 0) as stock_qty
      FROM medicines m
      LEFT JOIN medicine_stock_batches b ON m.id = b.medicine_id AND b.tenant_id = m.tenant_id
      WHERE m.tenant_id = ? AND m.is_active = 1`;
    const params: (string | number)[] = [tenantId!];

    if (search) { query += ' AND (m.name LIKE ? OR m.generic_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' GROUP BY m.id ORDER BY m.name';
    const medicines = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ medicines: medicines.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch medicines' });
  }
});

pharmacyRoutes.post('/medicines', zValidator('json', createMedicineSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO medicines (name, generic_name, company, unit, price, reorder_level, quantity, is_active, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    ).bind(data.name, data.genericName ?? null, data.company ?? null, data.unit ?? null, data.salePrice, data.reorderLevel, tenantId).run();
    return c.json({ message: 'Medicine added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add medicine' });
  }
});

pharmacyRoutes.put('/medicines/:id', zValidator('json', updateMedicineSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM medicines WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Medicine not found' });

    await c.env.DB.prepare(
      `UPDATE medicines SET name = ?, generic_name = ?, company = ?, unit = ?, price = ?, reorder_level = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.name         ?? existing['name'],
      data.genericName  !== undefined ? data.genericName  : existing['generic_name'],
      data.company      !== undefined ? data.company      : existing['company'],
      data.unit         !== undefined ? data.unit         : existing['unit'],
      data.salePrice    !== undefined ? data.salePrice    : existing['price'],
      data.reorderLevel !== undefined ? data.reorderLevel : existing['reorder_level'],
      id, tenantId,
    ).run();
    return c.json({ message: 'Medicine updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update medicine' });
  }
});

// GET /api/pharmacy/medicines/:id/stock — batch-wise stock for one medicine
pharmacyRoutes.get('/medicines/:id/stock', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const batches = await c.env.DB.prepare(
      `SELECT * FROM medicine_stock_batches WHERE medicine_id = ? AND tenant_id = ? ORDER BY expiry_date ASC`,
    ).bind(id, tenantId).all();
    return c.json({ batches: batches.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch stock batches' });
  }
});

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/suppliers', async (c) => {
  const tenantId = c.get('tenantId');
  try {
    const suppliers = await c.env.DB.prepare(
      'SELECT * FROM suppliers WHERE tenant_id = ? ORDER BY name',
    ).bind(tenantId).all();
    return c.json({ suppliers: suppliers.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch suppliers' });
  }
});

pharmacyRoutes.post('/suppliers', zValidator('json', createSupplierSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO suppliers (name, mobile_number, address, notes, tenant_id) VALUES (?, ?, ?, ?, ?)`,
    ).bind(data.name, data.mobileNumber ?? null, data.address ?? null, data.notes ?? null, tenantId).run();
    return c.json({ message: 'Supplier added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add supplier' });
  }
});

pharmacyRoutes.put('/suppliers/:id', zValidator('json', updateSupplierSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Supplier not found' });

    await c.env.DB.prepare(
      `UPDATE suppliers SET name = ?, mobile_number = ?, address = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.name         ?? existing['name'],
      data.mobileNumber !== undefined ? data.mobileNumber : existing['mobile_number'],
      data.address      !== undefined ? data.address      : existing['address'],
      data.notes        !== undefined ? data.notes        : existing['notes'],
      id, tenantId,
    ).run();
    return c.json({ message: 'Supplier updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update supplier' });
  }
});

// ─── PURCHASES ───────────────────────────────────────────────────────────────

pharmacyRoutes.get('/purchases', async (c) => {
  const tenantId = c.get('tenantId');
  const { supplierId, from, to } = c.req.query();

  try {
    let query = `
      SELECT mp.*, s.name as supplier_name, COUNT(mpi.id) as item_count
      FROM medicine_purchases mp
      LEFT JOIN suppliers s ON mp.supplier_id = s.id
      LEFT JOIN medicine_purchase_items mpi ON mp.id = mpi.purchase_id
      WHERE mp.tenant_id = ?`;
    const params: (string | number)[] = [tenantId!];

    if (supplierId) { query += ' AND mp.supplier_id = ?'; params.push(supplierId); }
    if (from)       { query += ' AND mp.purchase_date >= ?'; params.push(from); }
    if (to)         { query += ' AND mp.purchase_date <= ?'; params.push(to); }

    query += ' GROUP BY mp.id ORDER BY mp.purchase_date DESC';
    const purchases = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ purchases: purchases.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch purchases' });
  }
});

pharmacyRoutes.post('/purchases', zValidator('json', createPurchaseSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    const purchaseNo = await getNextSequence(c.env.DB, tenantId!, 'purchase', 'PUR');

    // Calculate totals
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);
    const total = subtotal - data.discount;

    const purchaseResult = await c.env.DB.prepare(`
      INSERT INTO medicine_purchases
        (purchase_no, supplier_id, purchase_date, subtotal, discount_total, total_amount, paid_amount, due_amount, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(purchaseNo, data.supplierId, data.purchaseDate, subtotal, data.discount, total, total, 0, tenantId, userId).run();

    const purchaseId = purchaseResult.meta.last_row_id;

    // Batch all item inserts + stock updates for atomicity
    const batchStmts: D1PreparedStatement[] = [];

    for (const item of data.items) {
      const lineTotal = item.quantity * item.purchasePrice;

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO medicine_purchase_items
            (purchase_id, medicine_id, batch_no, expiry_date, quantity, purchase_price, sale_price, line_total, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(purchaseId, item.medicineId, item.batchNo, item.expiryDate, item.quantity, item.purchasePrice, item.salePrice, lineTotal, tenantId),
      );

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO medicine_stock_batches
            (medicine_id, batch_no, expiry_date, quantity_received, quantity_available, purchase_price, sale_price, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(item.medicineId, item.batchNo, item.expiryDate, item.quantity, item.quantity, item.purchasePrice, item.salePrice, tenantId),
      );

      batchStmts.push(
        c.env.DB.prepare(
          `UPDATE medicines SET price = ?, quantity = quantity + ? WHERE id = ? AND tenant_id = ?`,
        ).bind(item.salePrice, item.quantity, item.medicineId, tenantId),
      );

      batchStmts.push(
        c.env.DB.prepare(`
          INSERT INTO medicine_stock_movements
            (medicine_id, movement_type, quantity, unit_cost, unit_price, reference_type, reference_id, movement_date, tenant_id, created_by)
          VALUES (?, 'purchase_in', ?, ?, ?, 'purchase', ?, ?, ?, ?)
        `).bind(item.medicineId, item.quantity, item.purchasePrice, item.salePrice, purchaseId, data.purchaseDate, tenantId, userId),
      );
    }

    await c.env.DB.batch(batchStmts);

    return c.json({ message: 'Purchase recorded', purchaseId, purchaseNo }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to record purchase' });
  }
});

// ─── SALES ────────────────────────────────────────────────────────────────────

pharmacyRoutes.post('/sales', zValidator('json', createSaleSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const saleDate = new Date().toISOString().split('T')[0];

  try {
    for (const item of data.items) {
      // FEFO: get batches ordered by earliest expiry first
      const batches = await c.env.DB.prepare(
        `SELECT * FROM medicine_stock_batches
         WHERE medicine_id = ? AND tenant_id = ? AND quantity_available > 0
         ORDER BY expiry_date ASC, id ASC`,
      ).bind(item.medicineId, tenantId).all<{
        id: number; quantity_available: number; sale_price: number; purchase_price: number;
      }>();

      const totalAvailable = (batches.results || []).reduce((s, b) => s + b.quantity_available, 0);
      if (totalAvailable < item.quantity) {
        throw new HTTPException(400, { message: `Insufficient stock for medicine ID ${item.medicineId}` });
      }

      let remaining = item.quantity;
      for (const batch of batches.results) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity_available);
        remaining -= deduct;

        await c.env.DB.prepare(
          `UPDATE medicine_stock_batches SET quantity_available = quantity_available - ? WHERE id = ? AND tenant_id = ?`,
        ).bind(deduct, batch.id, tenantId).run();

        await c.env.DB.prepare(`
          INSERT INTO medicine_stock_movements
            (medicine_id, batch_id, movement_type, quantity, unit_cost, unit_price, reference_type, movement_date, tenant_id, created_by)
          VALUES (?, ?, 'sale_out', ?, ?, ?, 'sale', ?, ?, ?)
        `).bind(item.medicineId, batch.id, deduct, batch.purchase_price, item.unitPrice, saleDate, tenantId, userId).run();
      }

      // Update aggregate quantity on medicine
      await c.env.DB.prepare(
        `UPDATE medicines SET quantity = quantity - ? WHERE id = ? AND tenant_id = ?`,
      ).bind(item.quantity, item.medicineId, tenantId).run();
    }

    return c.json({ message: 'Sale recorded' }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to record sale' });
  }
});

// ─── ALERTS ───────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/alerts/low-stock', async (c) => {
  const tenantId = c.get('tenantId');
  try {
    const medicines = await c.env.DB.prepare(`
      SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(b.quantity_available), 0) as stock_qty
      FROM medicines m
      LEFT JOIN medicine_stock_batches b ON m.id = b.medicine_id AND b.tenant_id = m.tenant_id
      WHERE m.tenant_id = ? AND m.is_active = 1
      GROUP BY m.id
      HAVING stock_qty <= m.reorder_level
      ORDER BY stock_qty ASC
    `).bind(tenantId).all();
    return c.json({ alerts: medicines.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch low stock alerts' });
  }
});

pharmacyRoutes.get('/alerts/expiring', async (c) => {
  const tenantId = c.get('tenantId');
  const days = Number(c.req.query('days') || 30);
  try {
    const batches = await c.env.DB.prepare(`
      SELECT b.*, m.name as medicine_name
      FROM medicine_stock_batches b
      JOIN medicines m ON b.medicine_id = m.id
      WHERE b.tenant_id = ? AND b.quantity_available > 0
        AND b.expiry_date IS NOT NULL
        AND julianday(b.expiry_date) - julianday('now') <= ?
      ORDER BY b.expiry_date ASC
    `).bind(tenantId, days).all();
    return c.json({ alerts: batches.results, daysWindow: days });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch expiring stock alerts' });
  }
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/summary', async (c) => {
  const tenantId = c.get('tenantId');
  try {
    const totalInvestment = await c.env.DB.prepare(`
      SELECT SUM(total_amount) as total FROM medicine_purchases WHERE tenant_id = ?
    `).bind(tenantId).first<{ total: number }>();

    const totalIncome = await c.env.DB.prepare(`
      SELECT SUM(unit_price * quantity) as total FROM medicine_stock_movements
      WHERE tenant_id = ? AND movement_type = 'sale_out'
    `).bind(tenantId).first<{ total: number }>();

    const totalCost = await c.env.DB.prepare(`
      SELECT SUM(unit_cost * quantity) as total FROM medicine_stock_movements
      WHERE tenant_id = ? AND movement_type = 'sale_out'
    `).bind(tenantId).first<{ total: number }>();

    const investment = totalInvestment?.total ?? 0;
    const income = totalIncome?.total ?? 0;
    const cost = totalCost?.total ?? 0;

    return c.json({
      totalInvestment: investment,
      totalIncome: income,
      totalCostOfGoodsSold: cost,
      grossProfit: income - cost,
    });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch pharmacy summary' });
  }
});

export default pharmacyRoutes;