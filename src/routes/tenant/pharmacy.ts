import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import {
  createMedicineSchema, updateMedicineSchema, createPurchaseSchema,
  createSupplierSchema, updateSupplierSchema, createSaleSchema, createPharmacyBillSchema,
  createCategorySchema, updateCategorySchema, createGenericSchema, updateGenericSchema,
  createPharmacySupplierSchema, updatePharmacySupplierSchema,
  createUOMSchema, createPackingTypeSchema, createRackSchema,
  createPharmacyItemSchema, updatePharmacyItemSchema,
  createPurchaseOrderSchema, updatePurchaseOrderSchema, cancelPurchaseOrderSchema,
  createGoodsReceiptSchema, createSupplierReturnSchema,
  stockAdjustmentSchema,
  createInvoiceSchema, createInvoiceReturnSchema,
  createDepositSchema, createReturnDepositSchema, createSettlementSchema,
  createProvisionalInvoiceSchema, createPrescriptionSchema,
  createCounterSchema, createNarcoticRecordSchema, createWriteOffSchema,
  createRequisitionSchema, createDispatchSchema,
} from '../../schemas/pharmacy';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getPagination, paginationMeta } from '../../lib/pagination';
import { getDb } from '../../db';
import { requireRole } from '../../middleware/rbac';

const PHARM_READ  = ['hospital_admin', 'pharmacist', 'doctor', 'md', 'nurse'] as const;
const PHARM_WRITE = ['hospital_admin', 'pharmacist'] as const;


const pharmacyRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── MEDICINES ────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/medicines', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const search = c.req.query('search') || '';
  const { page, limit, offset } = getPagination(c);

  try {
    let whereClause = 'WHERE m.tenant_id = ? AND m.is_active = 1';
    const params: (string | number)[] = [tenantId];

    if (search) { whereClause += ' AND (m.name LIKE ? OR m.generic_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const countResult = await db.$client.prepare(
      `SELECT COUNT(*) as total FROM medicines m ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const medicines = await db.$client.prepare(`
      SELECT m.*, COALESCE(SUM(b.quantity_available), 0) as stock_qty
      FROM medicines m
      LEFT JOIN medicine_stock_batches b ON m.id = b.medicine_id AND b.tenant_id = m.tenant_id
      ${whereClause}
      GROUP BY m.id ORDER BY m.name LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return c.json({ medicines: medicines.results, meta: paginationMeta(page, limit, total) });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch medicines' });
  }
});

pharmacyRoutes.post('/medicines', requireRole(...PHARM_WRITE), zValidator('json', createMedicineSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    const result = await db.$client.prepare(
      `INSERT INTO medicines (name, generic_name, company, unit, price, reorder_level, quantity, is_active, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    ).bind(data.name, data.genericName ?? null, data.company ?? null, data.unit ?? null, data.salePrice, data.reorderLevel, tenantId).run();
    return c.json({ message: 'Medicine added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add medicine' });
  }
});

pharmacyRoutes.put('/medicines/:id', requireRole(...PHARM_WRITE), zValidator('json', updateMedicineSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await db.$client.prepare(
      'SELECT * FROM medicines WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Medicine not found' });

    await db.$client.prepare(
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
pharmacyRoutes.get('/medicines/:id/stock', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  try {
    const batches = await db.$client.prepare(
      `SELECT * FROM medicine_stock_batches WHERE medicine_id = ? AND tenant_id = ? ORDER BY expiry_date ASC`,
    ).bind(id, tenantId).all();
    return c.json({ batches: batches.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch stock batches' });
  }
});

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/suppliers', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const suppliers = await db.$client.prepare(
      'SELECT * FROM suppliers WHERE tenant_id = ? ORDER BY name',
    ).bind(tenantId).all();
    return c.json({ suppliers: suppliers.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch suppliers' });
  }
});

pharmacyRoutes.post('/suppliers', requireRole(...PHARM_WRITE), zValidator('json', createSupplierSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO suppliers (name, mobile_number, address, notes, tenant_id) VALUES (?, ?, ?, ?, ?)`,
    ).bind(data.name, data.mobileNumber ?? null, data.address ?? null, data.notes ?? null, tenantId).run();
    return c.json({ message: 'Supplier added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add supplier' });
  }
});

pharmacyRoutes.put('/suppliers/:id', requireRole(...PHARM_WRITE), zValidator('json', updateSupplierSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const existing = await db.$client.prepare(
      'SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Supplier not found' });

    await db.$client.prepare(
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

pharmacyRoutes.get('/purchases', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
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
    const purchases = await db.$client.prepare(query).bind(...params).all();
    return c.json({ purchases: purchases.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch purchases' });
  }
});

pharmacyRoutes.post('/purchases', requireRole(...PHARM_WRITE), zValidator('json', createPurchaseSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  try {
    const purchaseNo = await getNextSequence(c.env.DB, tenantId!, 'purchase', 'PUR');

    // Calculate totals
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);
    const total = subtotal - data.discount;

    const purchaseResult = await db.$client.prepare(`
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
        db.$client.prepare(`
          INSERT INTO medicine_purchase_items
            (purchase_id, medicine_id, batch_no, expiry_date, quantity, purchase_price, sale_price, line_total, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(purchaseId, item.medicineId, item.batchNo, item.expiryDate, item.quantity, item.purchasePrice, item.salePrice, lineTotal, tenantId),
      );

      batchStmts.push(
        db.$client.prepare(`
          INSERT INTO medicine_stock_batches
            (medicine_id, batch_no, expiry_date, quantity_received, quantity_available, purchase_price, sale_price, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(item.medicineId, item.batchNo, item.expiryDate, item.quantity, item.quantity, item.purchasePrice, item.salePrice, tenantId),
      );

      batchStmts.push(
        db.$client.prepare(
          `UPDATE medicines SET price = ?, quantity = quantity + ? WHERE id = ? AND tenant_id = ?`,
        ).bind(item.salePrice, item.quantity, item.medicineId, tenantId),
      );

      batchStmts.push(
        db.$client.prepare(`
          INSERT INTO medicine_stock_movements
            (medicine_id, movement_type, quantity, unit_cost, unit_price, reference_type, reference_id, movement_date, tenant_id, created_by)
          VALUES (?, 'purchase_in', ?, ?, ?, 'purchase', ?, ?, ?, ?)
        `).bind(item.medicineId, item.quantity, item.purchasePrice, item.salePrice, purchaseId, data.purchaseDate, tenantId, userId),
      );
    }

    await db.$client.batch(batchStmts);

    return c.json({ message: 'Purchase recorded', purchaseId, purchaseNo }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to record purchase' });
  }
});

// ─── SALES ────────────────────────────────────────────────────────────────────

pharmacyRoutes.post('/sales', requireRole(...PHARM_WRITE), zValidator('json', createSaleSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  const saleDate = new Date().toISOString().split('T')[0];

  try {
    const batchStmts: D1PreparedStatement[] = [];

    // Calculate overall totals for pharmacy_sales header
    let subtotal = 0;
    const saleItemsData: Array<{ medicineId: number; quantity: number; unitPrice: number; lineTotal: number; medicineName: string | null }> = [];

    for (const item of data.items) {
      // FEFO: get batches ordered by earliest expiry first
      const batches = await db.$client.prepare(
        `SELECT b.*, m.name as medicine_name FROM medicine_stock_batches b
         JOIN medicines m ON b.medicine_id = m.id
         WHERE b.medicine_id = ? AND b.tenant_id = ? AND b.quantity_available > 0
         ORDER BY b.expiry_date ASC, b.id ASC`,
      ).bind(item.medicineId, tenantId).all<{
        id: number; quantity_available: number; sale_price: number; purchase_price: number; medicine_name: string;
      }>();

      const totalAvailable = (batches.results || []).reduce((s, b) => s + b.quantity_available, 0);
      if (totalAvailable < item.quantity) {
        throw new HTTPException(400, { message: `Insufficient stock for medicine ID ${item.medicineId}` });
      }

      const lineTotal = item.quantity * item.unitPrice;
      subtotal += lineTotal;
      saleItemsData.push({
        medicineId: item.medicineId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
        medicineName: batches.results[0]?.medicine_name ?? null,
      });

      let remaining = item.quantity;
      for (const batch of batches.results) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity_available);
        remaining -= deduct;

        batchStmts.push(
          db.$client.prepare(
            `UPDATE medicine_stock_batches SET quantity_available = quantity_available - ? WHERE id = ? AND tenant_id = ?`,
          ).bind(deduct, batch.id, tenantId)
        );

        batchStmts.push(
          db.$client.prepare(`
            INSERT INTO medicine_stock_movements
              (medicine_id, batch_id, movement_type, quantity, unit_cost, unit_price, reference_type, movement_date, tenant_id, created_by)
            VALUES (?, ?, 'sale_out', ?, ?, ?, 'sale', ?, ?, ?)
          `).bind(item.medicineId, batch.id, deduct, batch.purchase_price, item.unitPrice, saleDate, tenantId, userId)
        );
      }

      batchStmts.push(
        db.$client.prepare(
          `UPDATE medicines SET quantity = quantity - ? WHERE id = ? AND tenant_id = ?`,
        ).bind(item.quantity, item.medicineId, tenantId)
      );
    }

    const totalAmount = subtotal - (data.discount ?? 0);

    // ✅ BUG FIX: Insert into pharmacy_sales (was missing entirely)
    const saleResult = await db.$client.prepare(`
      INSERT INTO pharmacy_sales
        (patient_id, total_amount, discount, status, payment_mode, tenant_id, created_by)
      VALUES (?, ?, ?, 'paid', 'cash', ?, ?)
    `).bind(data.patientId ?? null, totalAmount, data.discount ?? 0, tenantId, userId).run();

    const saleId = saleResult.meta.last_row_id;

    // Insert sale items into pharmacy_sale_items
    for (const si of saleItemsData) {
      batchStmts.push(
        db.$client.prepare(`
          INSERT INTO pharmacy_sale_items
            (sale_id, medicine_id, medicine_name, quantity, unit_price, line_total, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(saleId, si.medicineId, si.medicineName, si.quantity, si.unitPrice, si.lineTotal, tenantId)
      );
    }

    if (batchStmts.length > 0) {
      await db.$client.batch(batchStmts);
    }

    return c.json({ message: 'Sale recorded', saleId }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to record sale' });
  }
});

// POST /api/pharmacy/billing — create a pharmacy bill (Zod validated + sequence)
pharmacyRoutes.post('/billing', requireRole(...PHARM_WRITE), zValidator('json', createPharmacyBillSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  try {
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const totalAmount = subtotal - data.discount;

    // ✅ Use sequence-based bill number (no more COUNT(*) race condition)
    const billNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_bill', 'PB');

    // Create bill
    const billResult = await db.$client.prepare(`
      INSERT INTO bills (bill_no, patient_id, total, discount, paid, due, status, bill_type, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pharmacy', ?, ?)
    `).bind(
      billNo,
      data.patientId ?? null,
      totalAmount,
      data.discount,
      totalAmount,
      0,
      'paid',
      tenantId,
      userId
    ).run();

    // Record income
    const today = new Date().toISOString().split('T')[0];
    await db.$client.prepare(`
      INSERT INTO income (date, source, amount, description, tenant_id, created_by)
      VALUES (?, 'pharmacy', ?, ?, ?, ?)
    `).bind(today, totalAmount, `Pharmacy bill ${billNo}`, tenantId, userId).run();

    return c.json({
      message: 'Pharmacy bill created',
      billId: billResult.meta.last_row_id,
      billNo,
      total: totalAmount,
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to create pharmacy bill' });
  }
});

// ─── ALERTS ───────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/alerts/low-stock', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const medicines = await db.$client.prepare(`
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

pharmacyRoutes.get('/alerts/expiring', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const days = Math.max(0, Math.min(365, Number(c.req.query('days') || 30)));
  try {
    const batches = await db.$client.prepare(`
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

pharmacyRoutes.get('/summary', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const totalInvestment = await db.$client.prepare(`
      SELECT SUM(total_amount) as total FROM medicine_purchases WHERE tenant_id = ?
    `).bind(tenantId).first<{ total: number }>();

    const totalIncome = await db.$client.prepare(`
      SELECT SUM(unit_price * quantity) as total FROM medicine_stock_movements
      WHERE tenant_id = ? AND movement_type = 'sale_out'
    `).bind(tenantId).first<{ total: number }>();

    const totalCost = await db.$client.prepare(`
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


// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — MASTER DATA (Categories, Generics, Items, UOM, Packing, Racks)
// Suppliers use the enhanced pharmacy_suppliers table
// ══════════════════════════════════════════════════════════════════════════════

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

pharmacyRoutes.get('/categories', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(
      `SELECT * FROM pharmacy_categories WHERE tenant_id = ? AND is_active = 1 ORDER BY name`,
    ).bind(tenantId).all();
    return c.json({ categories: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch categories' }); }
});

pharmacyRoutes.post('/categories', requireRole(...PHARM_WRITE), zValidator('json', createCategorySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO pharmacy_categories (name, description, tenant_id, created_by) VALUES (?, ?, ?, ?)`,
    ).bind(data.name, data.description ?? null, tenantId, userId).run();
    return c.json({ message: 'Category created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create category' }); }
});

pharmacyRoutes.put('/categories/:id', requireRole(...PHARM_WRITE), zValidator('json', updateCategorySchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const existing = await db.$client.prepare(
      `SELECT * FROM pharmacy_categories WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Category not found' });
    await db.$client.prepare(
      `UPDATE pharmacy_categories SET name = ?, description = ? WHERE id = ? AND tenant_id = ?`,
    ).bind(data.name ?? existing['name'], data.description ?? existing['description'], id, tenantId).run();
    return c.json({ message: 'Category updated' });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to update category' }); }
});

// ─── GENERICS ────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/generics', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const categoryId = c.req.query('categoryId');
  try {
    let sql = `SELECT g.*, c.name as category_name FROM pharmacy_generics g
               LEFT JOIN pharmacy_categories c ON g.category_id = c.id
               WHERE g.tenant_id = ? AND g.is_active = 1`;
    const params: (string | number)[] = [tenantId];
    if (categoryId) { sql += ' AND g.category_id = ?'; params.push(categoryId); }
    sql += ' ORDER BY g.name';
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ generics: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch generics' }); }
});

pharmacyRoutes.post('/generics', requireRole(...PHARM_WRITE), zValidator('json', createGenericSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO pharmacy_generics (name, category_id, description, tenant_id, created_by) VALUES (?, ?, ?, ?, ?)`,
    ).bind(data.name, data.categoryId ?? null, data.description ?? null, tenantId, userId).run();
    return c.json({ message: 'Generic created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create generic' }); }
});

pharmacyRoutes.put('/generics/:id', requireRole(...PHARM_WRITE), zValidator('json', updateGenericSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const existing = await db.$client.prepare(
      `SELECT * FROM pharmacy_generics WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Generic not found' });
    await db.$client.prepare(
      `UPDATE pharmacy_generics SET name = ?, category_id = ?, description = ? WHERE id = ? AND tenant_id = ?`,
    ).bind(data.name ?? existing['name'], data.categoryId ?? existing['category_id'], data.description ?? existing['description'], id, tenantId).run();
    return c.json({ message: 'Generic updated' });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to update generic' }); }
});

// ─── ENHANCED PHARMACY SUPPLIERS ─────────────────────────────────────────────

pharmacyRoutes.get('/pharmacy-suppliers', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(
      `SELECT * FROM pharmacy_suppliers WHERE tenant_id = ? AND is_active = 1 ORDER BY name`,
    ).bind(tenantId).all();
    return c.json({ suppliers: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch pharmacy suppliers' }); }
});

pharmacyRoutes.post('/pharmacy-suppliers', requireRole(...PHARM_WRITE), zValidator('json', createPharmacySupplierSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO pharmacy_suppliers (name, contact_no, address, city, email, pan_no, credit_period, notes, tenant_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(data.name, data.contactNo ?? null, data.address ?? null, data.city ?? null, data.email ?? null, data.panNo ?? null, data.creditPeriod ?? 0, data.notes ?? null, tenantId, userId).run();
    return c.json({ message: 'Supplier created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create pharmacy supplier' }); }
});

pharmacyRoutes.put('/pharmacy-suppliers/:id', requireRole(...PHARM_WRITE), zValidator('json', updatePharmacySupplierSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const existing = await db.$client.prepare(
      `SELECT * FROM pharmacy_suppliers WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Supplier not found' });
    await db.$client.prepare(
      `UPDATE pharmacy_suppliers SET name=?, contact_no=?, address=?, city=?, email=?, pan_no=?, credit_period=?, notes=?, updated_at=datetime('now')
       WHERE id=? AND tenant_id=?`,
    ).bind(
      data.name ?? existing['name'], data.contactNo ?? existing['contact_no'],
      data.address ?? existing['address'], data.city ?? existing['city'],
      data.email ?? existing['email'], data.panNo ?? existing['pan_no'],
      data.creditPeriod ?? existing['credit_period'], data.notes ?? existing['notes'],
      id, tenantId,
    ).run();
    return c.json({ message: 'Supplier updated' });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to update supplier' }); }
});

// ─── UOM ─────────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/uom', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(
      `SELECT * FROM pharmacy_uom WHERE tenant_id = ? AND is_active = 1 ORDER BY name`,
    ).bind(tenantId).all();
    return c.json({ uom: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch UOM' }); }
});

pharmacyRoutes.post('/uom', requireRole(...PHARM_WRITE), zValidator('json', createUOMSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO pharmacy_uom (name, description, tenant_id, created_by) VALUES (?, ?, ?, ?)`,
    ).bind(data.name, data.description ?? null, tenantId, userId).run();
    return c.json({ message: 'UOM created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create UOM' }); }
});

// ─── PACKING TYPES ───────────────────────────────────────────────────────────

pharmacyRoutes.get('/packing-types', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(
      `SELECT * FROM pharmacy_packing_types WHERE tenant_id = ? AND is_active = 1 ORDER BY name`,
    ).bind(tenantId).all();
    return c.json({ packingTypes: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch packing types' }); }
});

pharmacyRoutes.post('/packing-types', requireRole(...PHARM_WRITE), zValidator('json', createPackingTypeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO pharmacy_packing_types (name, quantity, tenant_id, created_by) VALUES (?, ?, ?, ?)`,
    ).bind(data.name, data.quantity ?? 1, tenantId, userId).run();
    return c.json({ message: 'Packing type created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create packing type' }); }
});

// ─── RACKS ────────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/racks', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(
      `SELECT r.*, p.rack_no as parent_rack_no FROM pharmacy_racks r
       LEFT JOIN pharmacy_racks p ON r.parent_id = p.id
       WHERE r.tenant_id = ? AND r.is_active = 1 ORDER BY r.rack_no`,
    ).bind(tenantId).all();
    return c.json({ racks: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch racks' }); }
});

pharmacyRoutes.post('/racks', requireRole(...PHARM_WRITE), zValidator('json', createRackSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(
      `INSERT INTO pharmacy_racks (rack_no, description, parent_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?)`,
    ).bind(data.rackNo, data.description ?? null, data.parentId ?? null, tenantId, userId).run();
    return c.json({ message: 'Rack created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create rack' }); }
});

// ─── PHARMACY ITEMS (Enhanced medicine master) ────────────────────────────────

pharmacyRoutes.get('/items', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { search, genericId, categoryId } = c.req.query();
  const { page, limit, offset } = getPagination(c);
  try {
    let where = 'WHERE i.tenant_id = ? AND i.is_active = 1';
    const params: (string | number)[] = [tenantId];
    if (search)     { where += ' AND i.name LIKE ?';       params.push(`%${search}%`); }
    if (genericId)  { where += ' AND i.generic_id = ?';    params.push(genericId); }
    if (categoryId) { where += ' AND i.category_id = ?';   params.push(categoryId); }

    const countResult = await db.$client.prepare(
      `SELECT COUNT(*) as total FROM pharmacy_items i ${where}`,
    ).bind(...params).first<{ total: number }>();

    const { results } = await db.$client.prepare(`
      SELECT i.*, g.name as generic_name, cat.name as category_name,
             u.name as uom_name, pt.name as packing_name,
             COALESCE(SUM(s.available_qty), 0) as stock_qty
      FROM pharmacy_items i
      LEFT JOIN pharmacy_generics g ON i.generic_id = g.id
      LEFT JOIN pharmacy_categories cat ON i.category_id = cat.id
      LEFT JOIN pharmacy_uom u ON i.uom_id = u.id
      LEFT JOIN pharmacy_packing_types pt ON i.packing_type_id = pt.id
      LEFT JOIN pharmacy_stock s ON i.id = s.item_id AND s.tenant_id = i.tenant_id AND s.is_active = 1
      ${where}
      GROUP BY i.id ORDER BY i.name LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return c.json({
      items: results,
      meta: paginationMeta(page, limit, countResult?.total ?? 0),
    });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch pharmacy items' }); }
});

pharmacyRoutes.get('/items/:id', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  try {
    const item = await db.$client.prepare(`
      SELECT i.*, g.name as generic_name, cat.name as category_name
      FROM pharmacy_items i
      LEFT JOIN pharmacy_generics g ON i.generic_id = g.id
      LEFT JOIN pharmacy_categories cat ON i.category_id = cat.id
      WHERE i.id = ? AND i.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!item) throw new HTTPException(404, { message: 'Item not found' });

    const { results: stock } = await db.$client.prepare(
      `SELECT * FROM pharmacy_stock WHERE item_id = ? AND tenant_id = ? AND is_active = 1 ORDER BY expiry_date ASC`,
    ).bind(id, tenantId).all();

    return c.json({ item, stock });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to fetch item' }); }
});

pharmacyRoutes.post('/items', requireRole(...PHARM_WRITE), zValidator('json', createPharmacyItemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(`
      INSERT INTO pharmacy_items
        (name, item_code, generic_id, category_id, uom_id, packing_type_id,
         reorder_level, min_stock_qty, purchase_vat_pct, sales_vat_pct,
         is_vat_applicable, is_narcotic, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.name, data.itemCode ?? null, data.genericId ?? null, data.categoryId ?? null,
      data.uomId ?? null, data.packingTypeId ?? null,
      data.reorderLevel ?? 0, data.minStockQty ?? 0,
      data.purchaseVatPct ?? 0, data.salesVatPct ?? 0,
      data.isVatApplicable ? 1 : 0, data.isNarcotic ? 1 : 0,
      tenantId, userId,
    ).run();
    return c.json({ message: 'Item created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create pharmacy item' }); }
});

pharmacyRoutes.put('/items/:id', requireRole(...PHARM_WRITE), zValidator('json', updatePharmacyItemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const existing = await db.$client.prepare(
      `SELECT * FROM pharmacy_items WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Item not found' });
    await db.$client.prepare(`
      UPDATE pharmacy_items SET name=?, item_code=?, generic_id=?, category_id=?,
        uom_id=?, packing_type_id=?, reorder_level=?, min_stock_qty=?,
        purchase_vat_pct=?, sales_vat_pct=?, is_vat_applicable=?, is_narcotic=?,
        updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).bind(
      data.name ?? existing['name'], data.itemCode ?? existing['item_code'],
      data.genericId ?? existing['generic_id'], data.categoryId ?? existing['category_id'],
      data.uomId ?? existing['uom_id'], data.packingTypeId ?? existing['packing_type_id'],
      data.reorderLevel ?? existing['reorder_level'], data.minStockQty ?? existing['min_stock_qty'],
      data.purchaseVatPct ?? existing['purchase_vat_pct'], data.salesVatPct ?? existing['sales_vat_pct'],
      data.isVatApplicable !== undefined ? (data.isVatApplicable ? 1 : 0) : existing['is_vat_applicable'],
      data.isNarcotic !== undefined ? (data.isNarcotic ? 1 : 0) : existing['is_narcotic'],
      id, tenantId,
    ).run();
    return c.json({ message: 'Item updated' });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to update item' }); }
});

// ─── STOCK MANAGEMENT ─────────────────────────────────────────────────────────

pharmacyRoutes.get('/stock', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { itemId, expireBefore, expireAfter } = c.req.query();
  try {
    let where = 'WHERE s.tenant_id = ? AND s.is_active = 1 AND s.available_qty > 0';
    const params: (string | number)[] = [tenantId];
    if (itemId)      { where += ' AND s.item_id = ?';                          params.push(itemId); }
    if (expireBefore){ where += ' AND s.expiry_date <= ?';                     params.push(expireBefore); }
    if (expireAfter) { where += ' AND (s.expiry_date >= ? OR s.expiry_date IS NULL)'; params.push(expireAfter); }

    const { results } = await db.$client.prepare(`
      SELECT s.*, i.name as item_name, g.name as generic_name
      FROM pharmacy_stock s
      JOIN pharmacy_items i ON s.item_id = i.id
      LEFT JOIN pharmacy_generics g ON i.generic_id = g.id
      ${where}
      ORDER BY s.expiry_date ASC, i.name ASC
    `).bind(...params).all();
    return c.json({ stock: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch stock' }); }
});

pharmacyRoutes.post('/stock/adjustment', requireRole(...PHARM_WRITE), zValidator('json', stockAdjustmentSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const stock = await db.$client.prepare(
      `SELECT * FROM pharmacy_stock WHERE id = ? AND tenant_id = ?`,
    ).bind(data.stockId, tenantId).first<{ available_qty: number; item_id: number; batch_no: string; cost_price: number }>();
    if (!stock) throw new HTTPException(404, { message: 'Stock record not found' });

    if (data.adjustmentType === 'out' && stock.available_qty < data.quantity) {
      throw new HTTPException(400, { message: 'Insufficient stock for adjustment' });
    }

    const newQty = data.adjustmentType === 'in'
      ? stock.available_qty + data.quantity
      : stock.available_qty - data.quantity;

    await db.$client.batch([
      db.$client.prepare(
        `UPDATE pharmacy_stock SET available_qty = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      ).bind(newQty, data.stockId, tenantId),
      db.$client.prepare(`
        INSERT INTO pharmacy_stock_transactions
          (stock_id, item_id, transaction_type, reference_type, batch_no,
           in_qty, out_qty, price, remarks, tenant_id, created_by)
        VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.stockId, data.itemId,
        data.adjustmentType === 'in' ? 'adjustment_in' : 'adjustment_out',
        stock.batch_no,
        data.adjustmentType === 'in' ? data.quantity : 0,
        data.adjustmentType === 'out' ? data.quantity : 0,
        stock.cost_price, data.remarks, tenantId, userId,
      ),
    ]);
    return c.json({ message: `Stock adjusted. New qty: ${newQty}`, newQty });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to adjust stock' }); }
});

pharmacyRoutes.get('/stock/transactions', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { itemId, type, from, to } = c.req.query();
  const { limit, offset } = getPagination(c);
  try {
    let where = 'WHERE t.tenant_id = ?';
    const params: (string | number)[] = [tenantId];
    if (itemId) { where += ' AND t.item_id = ?'; params.push(itemId); }
    if (type)   { where += ' AND t.transaction_type = ?'; params.push(type); }
    if (from)   { where += ' AND date(t.created_at) >= ?'; params.push(from); }
    if (to)     { where += ' AND date(t.created_at) <= ?'; params.push(to); }

    const { results } = await db.$client.prepare(`
      SELECT t.*, i.name as item_name FROM pharmacy_stock_transactions t
      JOIN pharmacy_items i ON t.item_id = i.id
      ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
    return c.json({ transactions: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch stock transactions' }); }
});

// ─── PURCHASE ORDERS (Phase 2) ────────────────────────────────────────────────

pharmacyRoutes.get('/purchase-orders', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { supplierId, status, from, to } = c.req.query();
  const { page, limit, offset } = getPagination(c);
  try {
    let where = 'WHERE po.tenant_id = ? AND po.is_active = 1';
    const params: (string | number)[] = [tenantId];
    if (supplierId) { where += ' AND po.supplier_id = ?'; params.push(supplierId); }
    if (status)     { where += ' AND po.status = ?';      params.push(status); }
    if (from)       { where += ' AND po.po_date >= ?';    params.push(from); }
    if (to)         { where += ' AND po.po_date <= ?';    params.push(to); }

    const countResult = await db.$client.prepare(
      `SELECT COUNT(*) as total FROM pharmacy_purchase_orders po ${where}`,
    ).bind(...params).first<{ total: number }>();

    const { results } = await db.$client.prepare(`
      SELECT po.*, s.name as supplier_name, COUNT(poi.id) as item_count
      FROM pharmacy_purchase_orders po
      LEFT JOIN pharmacy_suppliers s ON po.supplier_id = s.id
      LEFT JOIN pharmacy_po_items poi ON po.id = poi.po_id
      ${where} GROUP BY po.id ORDER BY po.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
    return c.json({ purchaseOrders: results, meta: paginationMeta(page, limit, countResult?.total ?? 0) });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch purchase orders' }); }
});

pharmacyRoutes.get('/purchase-orders/:id', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  try {
    const po = await db.$client.prepare(`
      SELECT po.*, s.name as supplier_name FROM pharmacy_purchase_orders po
      LEFT JOIN pharmacy_suppliers s ON po.supplier_id = s.id
      WHERE po.id = ? AND po.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!po) throw new HTTPException(404, { message: 'Purchase order not found' });
    const { results: items } = await db.$client.prepare(`
      SELECT poi.*, i.name as item_name FROM pharmacy_po_items poi
      JOIN pharmacy_items i ON poi.item_id = i.id
      WHERE poi.po_id = ? AND poi.tenant_id = ?
    `).bind(id, tenantId).all();
    return c.json({ purchaseOrder: po, items });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to fetch purchase order' }); }
});

pharmacyRoutes.post('/purchase-orders', requireRole(...PHARM_WRITE), zValidator('json', createPurchaseOrderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const poNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_po', 'PO');
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.standardRate, 0);
    const totalAmount = subtotal - data.discountAmount + data.vatAmount + data.adjustment;

    const poResult = await db.$client.prepare(`
      INSERT INTO pharmacy_purchase_orders
        (po_no, supplier_id, po_date, reference_no, subtotal, discount_amount, discount_pct,
         vat_amount, total_amount, adjustment, delivery_address, delivery_days, delivery_date,
         remarks, terms_conditions, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      poNo, data.supplierId, data.poDate, data.referenceNo ?? null,
      subtotal, data.discountAmount, data.discountPct, data.vatAmount, totalAmount, data.adjustment,
      data.deliveryAddress ?? null, data.deliveryDays ?? 0, data.deliveryDate ?? null,
      data.remarks ?? null, data.termsConditions ?? null, tenantId, userId,
    ).run();

    const poId = poResult.meta.last_row_id;
    const batchStmts = data.items.map((item) => {
      const itemSubtotal = item.quantity * item.standardRate;
      return db.$client.prepare(`
        INSERT INTO pharmacy_po_items
          (po_id, item_id, quantity, standard_rate, pending_qty, subtotal, vat_amount, total_amount, remarks, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(poId, item.itemId, item.quantity, item.standardRate, item.quantity, itemSubtotal, item.vatAmount ?? 0, itemSubtotal + (item.vatAmount ?? 0), item.remarks ?? null, tenantId);
    });

    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Purchase order created', id: poId, poNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create purchase order' }); }
});

pharmacyRoutes.put('/purchase-orders/:id/cancel', requireRole(...PHARM_WRITE), zValidator('json', cancelPurchaseOrderSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const po = await db.$client.prepare(
      `SELECT * FROM pharmacy_purchase_orders WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).first<{ status: string }>();
    if (!po) throw new HTTPException(404, { message: 'PO not found' });
    if (po.status === 'complete' || po.status === 'cancelled') {
      throw new HTTPException(400, { message: `Cannot cancel a ${po.status} PO` });
    }
    await db.$client.prepare(`
      UPDATE pharmacy_purchase_orders SET status='cancelled', cancel_remarks=?, cancelled_by=?, cancelled_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).bind(data.cancelRemarks, userId, id, tenantId).run();
    return c.json({ message: 'Purchase order cancelled' });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to cancel PO' }); }
});

// ─── GOODS RECEIPTS (Phase 2) ─────────────────────────────────────────────────

pharmacyRoutes.get('/goods-receipts', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { supplierId, from, to } = c.req.query();
  const { page, limit, offset } = getPagination(c);
  try {
    let where = 'WHERE g.tenant_id = ? AND g.is_cancelled = 0';
    const params: (string | number)[] = [tenantId];
    if (supplierId) { where += ' AND g.supplier_id = ?'; params.push(supplierId); }
    if (from)   { where += ' AND g.grn_date >= ?'; params.push(from); }
    if (to)     { where += ' AND g.grn_date <= ?'; params.push(to); }

    const countResult = await db.$client.prepare(
      `SELECT COUNT(*) as total FROM pharmacy_goods_receipts g ${where}`,
    ).bind(...params).first<{ total: number }>();

    const { results } = await db.$client.prepare(`
      SELECT g.*, s.name as supplier_name FROM pharmacy_goods_receipts g
      LEFT JOIN pharmacy_suppliers s ON g.supplier_id = s.id
      ${where} ORDER BY g.grn_date DESC LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
    return c.json({ goodsReceipts: results, meta: paginationMeta(page, limit, countResult?.total ?? 0) });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch goods receipts' }); }
});

pharmacyRoutes.get('/goods-receipts/:id', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  try {
    const grn = await db.$client.prepare(`
      SELECT g.*, s.name as supplier_name FROM pharmacy_goods_receipts g
      LEFT JOIN pharmacy_suppliers s ON g.supplier_id = s.id
      WHERE g.id = ? AND g.tenant_id = ?
    `).bind(id, tenantId).first();
    if (!grn) throw new HTTPException(404, { message: 'GRN not found' });

    const { results: items } = await db.$client.prepare(`
      SELECT gi.*, i.name as item_name FROM pharmacy_grn_items gi
      JOIN pharmacy_items i ON gi.item_id = i.id
      WHERE gi.grn_id = ? AND gi.tenant_id = ?
    `).bind(id, tenantId).all();
    return c.json({ grn, items });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to fetch GRN' }); }
});

pharmacyRoutes.post('/goods-receipts', requireRole(...PHARM_WRITE), zValidator('json', createGoodsReceiptSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // Calculate totals
    let subtotal = 0;
    const processedItems = data.items.map((item) => {
      const lineSubtotal = item.receivedQty * item.itemRate;
      const discountAmt = Math.round(lineSubtotal * (item.discountPct / 100));
      const afterDiscount = lineSubtotal - discountAmt;
      const vatAmt = Math.round(afterDiscount * (item.vatPct / 100));
      const total = afterDiscount + vatAmt;
      const margin = item.salePrice > 0 ? ((item.salePrice - item.itemRate) / item.salePrice) * 100 : 0;
      subtotal += total;
      return { ...item, lineSubtotal, discountAmt, vatAmt, total, costPrice: item.itemRate, margin };
    });

    const headerVatAmount = Math.round(subtotal * ((data.vatPct ?? 0) / 100));
    const totalAmount = subtotal - data.discountAmount + headerVatAmount + data.adjustment;
    const grnPrintId = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_grn', 'GRN');

    const grnResult = await db.$client.prepare(`
      INSERT INTO pharmacy_goods_receipts
        (grn_print_id, po_id, invoice_no, supplier_id, grn_date, supplier_bill_date,
         subtotal, discount_amount, discount_pct, vat_amount, vat_pct, total_amount, adjustment,
         credit_period, is_item_discount_applicable, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      grnPrintId, data.poId ?? null, data.invoiceNo ?? null, data.supplierId,
      data.grnDate, data.supplierBillDate ?? null,
      subtotal, data.discountAmount, data.discountPct, headerVatAmount, data.vatPct,
      totalAmount, data.adjustment, data.creditPeriod,
      data.isItemDiscountApplicable ? 1 : 0, data.remarks ?? null,
      tenantId, userId,
    ).run();

    const grnId = grnResult.meta.last_row_id;
    const batchStmts: D1PreparedStatement[] = [];

    for (const item of processedItems) {
      // Insert GRN item
      const grnItemResult = await db.$client.prepare(`
        INSERT INTO pharmacy_grn_items
          (grn_id, item_id, batch_no, expiry_date, received_qty, free_qty, rejected_qty,
           item_rate, mrp, discount_pct, discount_amount, vat_pct, vat_amount,
           subtotal, total_amount, cost_price, sale_price, margin, manufacture_date, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        grnId, item.itemId, item.batchNo, item.expiryDate ?? null,
        item.receivedQty, item.freeQty ?? 0, item.rejectedQty ?? 0,
        item.itemRate, item.mrp, item.discountPct, item.discountAmt,
        item.vatPct, item.vatAmt, item.lineSubtotal, item.total,
        item.costPrice, item.salePrice, item.margin,
        item.manufactureDate ?? null, tenantId, userId,
      ).run();

      const grnItemId = grnItemResult.meta.last_row_id;

      // Create stock entry
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_stock
          (item_id, grn_item_id, batch_no, expiry_date, available_qty, mrp,
           cost_price, sale_price, margin, vat_pct, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.itemId, grnItemId, item.batchNo, item.expiryDate ?? null,
        item.receivedQty + item.freeQty,
        item.mrp, item.costPrice, item.salePrice, item.margin, item.vatPct,
        tenantId, userId,
      ));

      // Stock transaction entry
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_stock_transactions
          (item_id, transaction_type, reference_type, reference_id, batch_no, expiry_date,
           in_qty, price, remarks, tenant_id, created_by)
        VALUES (?, 'purchase', 'grn', ?, ?, ?, ?, ?, 'GRN receipt', ?, ?)
      `).bind(item.itemId, grnId, item.batchNo, item.expiryDate ?? null, item.receivedQty + item.freeQty, item.costPrice, tenantId, userId));
    }

    // Update PO received quantities if linked
    if (data.poId) {
      for (const item of data.items) {
        batchStmts.push(db.$client.prepare(`
          UPDATE pharmacy_po_items SET received_qty = received_qty + ?, pending_qty = pending_qty - ?
          WHERE po_id = ? AND item_id = ? AND tenant_id = ?
        `).bind(item.receivedQty, item.receivedQty, data.poId, item.itemId, tenantId));
      }
      // F9 fix: Calculate PO status in JS rather than subquery inside batch
      const { results: poItems } = await db.$client.prepare(
        `SELECT pending_qty, item_id FROM pharmacy_po_items WHERE po_id = ? AND tenant_id = ?`
      ).bind(data.poId, tenantId).all<{ pending_qty: number; item_id: number }>();
      const receivedMap = new Map(data.items.map(i => [i.itemId, i.receivedQty]));
      let totalPendingAfter = 0;
      for (const poItem of poItems) {
        const received = receivedMap.get(poItem.item_id) ?? 0;
        totalPendingAfter += Math.max(0, poItem.pending_qty - received);
      }
      const newStatus = totalPendingAfter <= 0 ? 'complete' : 'partial';
      batchStmts.push(db.$client.prepare(`
        UPDATE pharmacy_purchase_orders SET status=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?
      `).bind(newStatus, data.poId, tenantId));
    }

    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Goods receipt created', id: grnId, grnPrintId }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create goods receipt' }); }
});

// ─── SUPPLIER RETURNS (Phase 2) ───────────────────────────────────────────────

pharmacyRoutes.get('/returns/supplier', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(`
      SELECT r.*, s.name as supplier_name FROM pharmacy_supplier_returns r
      LEFT JOIN pharmacy_suppliers s ON r.supplier_id = s.id
      WHERE r.tenant_id = ? AND r.is_active = 1 ORDER BY r.return_date DESC
    `).bind(tenantId).all();
    return c.json({ returns: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch supplier returns' }); }
});

pharmacyRoutes.post('/returns/supplier', requireRole(...PHARM_WRITE), zValidator('json', createSupplierReturnSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    let totalAmount = 0;
    const processedItems = data.items.map((item) => {
      const subtotal = item.quantity * item.itemRate;
      const discount = Math.round(subtotal * (item.discountPct / 100));
      const vat = Math.round((subtotal - discount) * (item.vatPct / 100));
      const total = subtotal - discount + vat;
      totalAmount += total;
      return { ...item, subtotal, discountAmt: discount, vatAmt: vat, total };
    });

    // F5 fix: Validate stock availability before supplier return deduction
    for (const item of processedItems) {
      if (item.stockId) {
        const stock = await db.$client.prepare(
          `SELECT available_qty FROM pharmacy_stock WHERE id = ? AND tenant_id = ? AND is_active = 1`
        ).bind(item.stockId, tenantId).first<{ available_qty: number }>();
        if (!stock) throw new HTTPException(400, { message: `Stock record ${item.stockId} not found` });
        if (stock.available_qty < item.quantity) {
          throw new HTTPException(400, { message: `Insufficient stock for return. Available: ${stock.available_qty}, Requested: ${item.quantity}` });
        }
      }
    }

    const returnNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_return_supplier', 'RS');
    const returnResult = await db.$client.prepare(`
      INSERT INTO pharmacy_supplier_returns
        (return_no, supplier_id, grn_id, return_date, total_amount, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(returnNo, data.supplierId, data.grnId ?? null, data.returnDate, totalAmount, data.remarks ?? null, tenantId, userId).run();

    const returnId = returnResult.meta.last_row_id;
    const batchStmts: D1PreparedStatement[] = [];

    for (const item of processedItems) {
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_supplier_return_items
          (return_id, item_id, stock_id, batch_no, quantity, item_rate, subtotal, discount_pct, vat_amount, total_amount, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(returnId, item.itemId, item.stockId ?? null, item.batchNo ?? null, item.quantity, item.itemRate, item.subtotal, item.discountPct, item.vatAmt, item.total, tenantId, userId));

      // Deduct stock
      if (item.stockId) {
        batchStmts.push(db.$client.prepare(
          `UPDATE pharmacy_stock SET available_qty = available_qty - ?, updated_at=datetime('now') WHERE id = ? AND tenant_id = ?`,
        ).bind(item.quantity, item.stockId, tenantId));
        batchStmts.push(db.$client.prepare(`
          INSERT INTO pharmacy_stock_transactions
            (item_id, transaction_type, reference_type, reference_id, batch_no, out_qty, price, remarks, tenant_id, created_by)
          VALUES (?, 'return_out', 'supplier_return', ?, ?, ?, ?, 'Return to supplier', ?, ?)
        `).bind(item.itemId, returnId, item.batchNo ?? null, item.quantity, item.itemRate, tenantId, userId));
      }
    }

    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Supplier return created', id: returnId, returnNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create supplier return' }); }
});


// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — INVOICES & RETURNS
// ══════════════════════════════════════════════════════════════════════════════

pharmacyRoutes.get('/invoices', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { patientId, status, from, to } = c.req.query();
  const { page, limit, offset } = getPagination(c);
  try {
    let where = 'WHERE inv.tenant_id = ? AND inv.is_active = 1';
    const params: (string | number)[] = [tenantId];
    if (patientId) { where += ' AND inv.patient_id = ?'; params.push(patientId); }
    if (status)    { where += ' AND inv.is_return = ?';   params.push(status === 'returned' ? 1 : 0); }
    if (from)      { where += ' AND date(inv.created_at) >= ?'; params.push(from); }
    if (to)        { where += ' AND date(inv.created_at) <= ?'; params.push(to); }
    const countResult = await db.$client.prepare(`SELECT COUNT(*) as total FROM pharmacy_invoices inv ${where}`).bind(...params).first<{ total: number }>();
    const { results } = await db.$client.prepare(`
      SELECT inv.* FROM pharmacy_invoices inv ${where} ORDER BY inv.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
    return c.json({ invoices: results, meta: paginationMeta(page, limit, countResult?.total ?? 0) });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch invoices' }); }
});

pharmacyRoutes.get('/invoices/:id', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  try {
    const inv = await db.$client.prepare(`SELECT * FROM pharmacy_invoices WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first();
    if (!inv) throw new HTTPException(404, { message: 'Invoice not found' });
    const { results: items } = await db.$client.prepare(`
      SELECT ii.*, i.name as item_name FROM pharmacy_invoice_items ii
      JOIN pharmacy_items i ON ii.item_id = i.id WHERE ii.invoice_id = ? AND ii.tenant_id = ?
    `).bind(id, tenantId).all();
    return c.json({ invoice: inv, items });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to fetch invoice' }); }
});

pharmacyRoutes.post('/invoices', requireRole(...PHARM_WRITE), zValidator('json', createInvoiceSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // F1 fix: Validate stock availability for each item before proceeding
    for (const item of data.items) {
      const stock = await db.$client.prepare(
        `SELECT available_qty FROM pharmacy_stock WHERE id = ? AND tenant_id = ? AND is_active = 1`
      ).bind(item.stockId, tenantId).first<{ available_qty: number }>();
      if (!stock) throw new HTTPException(400, { message: `Stock record ${item.stockId} not found` });
      if (stock.available_qty < item.quantity) {
        throw new HTTPException(400, { message: `Insufficient stock for stock ID ${item.stockId}. Available: ${stock.available_qty}, Requested: ${item.quantity}` });
      }
    }

    let subtotal = 0;
    const processedItems = data.items.map((item) => {
      const lineSubtotal = item.quantity * item.price;
      const discountAmt = Math.round(lineSubtotal * (item.discountPct / 100));
      const vatAmt = Math.round((lineSubtotal - discountAmt) * (item.vatPct / 100));
      const total = lineSubtotal - discountAmt + vatAmt;
      subtotal += total;
      return { ...item, lineSubtotal, discountAmt, vatAmt, total };
    });
    const totalAmount = subtotal - data.discountAmount + data.vatAmount;
    const change = data.tender - data.paidAmount;

    // F12 fix: Validate payment balance
    if (data.paidAmount + data.creditAmount + data.depositDeductAmount < totalAmount) {
      throw new HTTPException(400, { message: 'Payment (paid + credit + deposit) does not cover total amount' });
    }

    const invoiceNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_invoice', 'INV');

    const invResult = await db.$client.prepare(`
      INSERT INTO pharmacy_invoices
        (invoice_no, patient_id, patient_visit_id, counter_id, is_outdoor_patient, visit_type,
         prescriber_id, subtotal, discount_amount, discount_pct, vat_amount, total_amount,
         paid_amount, credit_amount, tender, change_amount, payment_mode, deposit_deduct_amount,
         remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoiceNo, data.patientId ?? null, data.patientVisitId ?? null, data.counterId ?? null,
      data.isOutdoorPatient ? 1 : 0, data.visitType ?? null, data.prescriberId ?? null,
      subtotal, data.discountAmount, data.discountPct, data.vatAmount, totalAmount,
      data.paidAmount, data.creditAmount, data.tender, change > 0 ? change : 0,
      data.paymentMode, data.depositDeductAmount, data.remarks ?? null, tenantId, userId,
    ).run();
    const invoiceId = invResult.meta.last_row_id;
    const batchStmts: D1PreparedStatement[] = [];

    for (const item of processedItems) {
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_invoice_items
          (invoice_id, item_id, stock_id, batch_no, expiry_date, quantity, mrp, price,
           subtotal, discount_pct, discount_amount, vat_pct, vat_amount, total_amount, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(invoiceId, item.itemId, item.stockId, item.batchNo, item.expiryDate ?? null,
        item.quantity, item.mrp, item.price, item.lineSubtotal, item.discountPct, item.discountAmt,
        item.vatPct, item.vatAmt, item.total, tenantId, userId));
      // FEFO deduct stock
      batchStmts.push(db.$client.prepare(
        `UPDATE pharmacy_stock SET available_qty = available_qty - ?, updated_at=datetime('now') WHERE id = ? AND tenant_id = ?`
      ).bind(item.quantity, item.stockId, tenantId));
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_stock_transactions (item_id, stock_id, transaction_type, reference_type, reference_id, batch_no, out_qty, price, tenant_id, created_by)
        VALUES (?, ?, 'sale_out', 'invoice', ?, ?, ?, ?, ?, ?)
      `).bind(item.itemId, item.stockId, invoiceId, item.batchNo, item.quantity, item.price, tenantId, userId));
    }

    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Invoice created', id: invoiceId, invoiceNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create invoice' }); }
});

// ─── Invoice Returns ──────────────────────────────────────────────────────────

pharmacyRoutes.get('/invoice-returns', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(`
      SELECT r.*, inv.invoice_no FROM pharmacy_invoice_returns r
      JOIN pharmacy_invoices inv ON r.invoice_id = inv.id
      WHERE r.tenant_id = ? AND r.is_active = 1 ORDER BY r.return_date DESC
    `).bind(tenantId).all();
    return c.json({ returns: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch invoice returns' }); }
});

pharmacyRoutes.post('/invoice-returns', requireRole(...PHARM_WRITE), zValidator('json', createInvoiceReturnSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // F4 fix: Validate invoice exists and belongs to tenant
    const invoice = await db.$client.prepare(
      `SELECT id, is_return FROM pharmacy_invoices WHERE id = ? AND tenant_id = ? AND is_active = 1`
    ).bind(data.invoiceId, tenantId).first<{ id: number; is_return: number }>();
    if (!invoice) throw new HTTPException(404, { message: 'Original invoice not found' });

    // F4 fix: Validate return quantities don't exceed original sold quantities
    const { results: origItems } = await db.$client.prepare(
      `SELECT id, item_id, quantity FROM pharmacy_invoice_items WHERE invoice_id = ? AND tenant_id = ?`
    ).bind(data.invoiceId, tenantId).all<{ id: number; item_id: number; quantity: number }>();
    const origItemMap = new Map(origItems.map(i => [i.id, i]));

    for (const returnItem of data.items) {
      const orig = origItemMap.get(returnItem.invoiceItemId);
      if (!orig) throw new HTTPException(400, { message: `Invoice item ${returnItem.invoiceItemId} not found in original invoice` });
      if (returnItem.quantity > orig.quantity) {
        throw new HTTPException(400, { message: `Return qty (${returnItem.quantity}) exceeds sold qty (${orig.quantity}) for item ${returnItem.invoiceItemId}` });
      }
    }

    let totalReturn = 0;
    const processedItems = data.items.map((item) => {
      const sub = item.quantity * item.price;
      const disc = Math.round(sub * (item.discountPct / 100));
      const vat = Math.round((sub - disc) * (item.vatPct / 100));
      const total = sub - disc + vat;
      totalReturn += total;
      return { ...item, sub, disc, vat, total };
    });
    const creditNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_credit_note', 'CN');
    const retResult = await db.$client.prepare(`
      INSERT INTO pharmacy_invoice_returns (invoice_id, credit_note_no, return_date, total_amount, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(data.invoiceId, creditNo, data.returnDate, totalReturn, data.remarks ?? null, tenantId, userId).run();
    const returnId = retResult.meta.last_row_id;
    const batchStmts: D1PreparedStatement[] = [];
    for (const item of processedItems) {
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_invoice_return_items
          (return_id, invoice_item_id, item_id, stock_id, batch_no, quantity, price, subtotal, discount_pct, vat_amount, total_amount, remarks, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(returnId, item.invoiceItemId, item.itemId, item.stockId ?? null, item.batchNo ?? null, item.quantity, item.price, item.sub, item.discountPct, item.vat, item.total, item.remarks ?? null, tenantId, userId));
      if (item.stockId) {
        batchStmts.push(db.$client.prepare(`UPDATE pharmacy_stock SET available_qty = available_qty + ?, updated_at=datetime('now') WHERE id = ? AND tenant_id = ?`).bind(item.quantity, item.stockId, tenantId));
        batchStmts.push(db.$client.prepare(`
          INSERT INTO pharmacy_stock_transactions (item_id, stock_id, transaction_type, reference_type, reference_id, batch_no, in_qty, price, remarks, tenant_id, created_by)
          VALUES (?, ?, 'return_in', 'invoice_return', ?, ?, ?, ?, 'Customer return', ?, ?)
        `).bind(item.itemId, item.stockId, returnId, item.batchNo ?? null, item.quantity, item.price, tenantId, userId));
      }
    }
    batchStmts.push(db.$client.prepare(`UPDATE pharmacy_invoices SET is_return = 1, updated_at=datetime('now') WHERE id = ? AND tenant_id = ?`).bind(data.invoiceId, tenantId));
    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Invoice return created', id: returnId, creditNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create invoice return' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — DEPOSITS & SETTLEMENTS
// ══════════════════════════════════════════════════════════════════════════════

pharmacyRoutes.get('/deposits', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patientId');
  try {
    let sql = `SELECT * FROM pharmacy_deposits WHERE tenant_id = ? AND is_active = 1`;
    const params: (string | number)[] = [tenantId];
    if (patientId) { sql += ' AND patient_id = ?'; params.push(patientId); }
    sql += ' ORDER BY created_at DESC';
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ deposits: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch deposits' }); }
});

pharmacyRoutes.get('/deposits/balance/:patientId', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.param('patientId');
  try {
    const result = await db.$client.prepare(`
      SELECT COALESCE(SUM(CASE WHEN deposit_type = 'deposit' THEN amount ELSE -amount END), 0) as balance
      FROM pharmacy_deposits WHERE patient_id = ? AND tenant_id = ? AND is_active = 1
    `).bind(patientId, tenantId).first<{ balance: number }>();
    return c.json({ balance: result?.balance ?? 0 });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch deposit balance' }); }
});

pharmacyRoutes.post('/deposits', requireRole(...PHARM_WRITE), zValidator('json', createDepositSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const depositNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_deposit', 'DEP');
    const result = await db.$client.prepare(`
      INSERT INTO pharmacy_deposits (deposit_no, patient_id, deposit_type, amount, payment_mode, remarks, tenant_id, created_by)
      VALUES (?, ?, 'deposit', ?, ?, ?, ?, ?)
    `).bind(depositNo, data.patientId, data.amount, data.paymentMode, data.remarks ?? null, tenantId, userId).run();
    return c.json({ message: 'Deposit recorded', id: result.meta.last_row_id, depositNo }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create deposit' }); }
});

pharmacyRoutes.post('/deposits/return', requireRole(...PHARM_WRITE), zValidator('json', createReturnDepositSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // F7 fix: Atomic balance check + insert to prevent TOCTOU race
    // First calculate current balance
    const balance = await db.$client.prepare(`
      SELECT COALESCE(SUM(CASE WHEN deposit_type = 'deposit' THEN amount ELSE -amount END), 0) as balance
      FROM pharmacy_deposits WHERE patient_id = ? AND tenant_id = ? AND is_active = 1
    `).bind(data.patientId, tenantId).first<{ balance: number }>();
    if ((balance?.balance ?? 0) < data.amount) throw new HTTPException(400, { message: 'Insufficient deposit balance' });
    const returnNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_deposit_return', 'DR');
    // Use batch to make the check+insert as tight as possible
    const stmts: D1PreparedStatement[] = [
      db.$client.prepare(`
        INSERT INTO pharmacy_deposits (deposit_no, patient_id, deposit_type, amount, payment_mode, remarks, tenant_id, created_by)
        SELECT ?, ?, 'return', ?, ?, ?, ?, ?
        WHERE (SELECT COALESCE(SUM(CASE WHEN deposit_type='deposit' THEN amount ELSE -amount END),0)
               FROM pharmacy_deposits WHERE patient_id=? AND tenant_id=? AND is_active=1) >= ?
      `).bind(returnNo, data.patientId, data.amount, data.paymentMode, data.remarks ?? null, tenantId, userId, data.patientId, tenantId, data.amount),
    ];
    const results = await db.$client.batch(stmts);
    const rowsWritten = results[0]?.meta?.rows_written ?? 0;
    if (rowsWritten === 0) throw new HTTPException(400, { message: 'Insufficient deposit balance (concurrent withdrawal)' });
    return c.json({ message: 'Deposit return recorded', returnNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to return deposit' }); }
});

pharmacyRoutes.get('/settlements', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patientId');
  try {
    let sql = `SELECT * FROM pharmacy_settlements WHERE tenant_id = ? AND is_active = 1`;
    const params: (string | number)[] = [tenantId];
    if (patientId) { sql += ' AND patient_id = ?'; params.push(patientId); }
    sql += ' ORDER BY settlement_date DESC';
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ settlements: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch settlements' }); }
});

pharmacyRoutes.post('/settlements', requireRole(...PHARM_WRITE), zValidator('json', createSettlementSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // F11 fix: Validate patient has outstanding credit before settlement
    const outstandingCredit = await db.$client.prepare(`
      SELECT COALESCE(SUM(credit_amount), 0) as total_credit
      FROM pharmacy_invoices WHERE patient_id = ? AND tenant_id = ? AND is_active = 1 AND credit_amount > 0
    `).bind(data.patientId, tenantId).first<{ total_credit: number }>();
    if ((outstandingCredit?.total_credit ?? 0) <= 0) {
      throw new HTTPException(400, { message: 'Patient has no outstanding credit to settle' });
    }
    const settlementNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_settlement', 'STL');
    const result = await db.$client.prepare(`
      INSERT INTO pharmacy_settlements
        (settlement_no, patient_id, settlement_date, total_amount, paid_amount, refund_amount,
         deposit_deducted, payment_mode, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(settlementNo, data.patientId, data.settlementDate, data.totalAmount, data.paidAmount, data.refundAmount, data.depositDeducted, data.paymentMode, data.remarks ?? null, tenantId, userId).run();
    return c.json({ message: 'Settlement created', id: result.meta.last_row_id, settlementNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create settlement' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — ADVANCED: Provisionals, Prescriptions, Counters, Narcotics, Write-offs, Requisitions
// ══════════════════════════════════════════════════════════════════════════════

// ─── Counters ─────────────────────────────────────────────────────────────────

pharmacyRoutes.get('/counters', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(`SELECT * FROM pharmacy_counters WHERE tenant_id = ? AND is_active = 1 ORDER BY name`).bind(tenantId).all();
    return c.json({ counters: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch counters' }); }
});

pharmacyRoutes.post('/counters', requireRole(...PHARM_WRITE), zValidator('json', createCounterSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(`INSERT INTO pharmacy_counters (name, counter_type, tenant_id, created_by) VALUES (?, ?, ?, ?)`).bind(data.name, data.counterType, tenantId, userId).run();
    return c.json({ message: 'Counter created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create counter' }); }
});

// ─── Provisional Invoices ─────────────────────────────────────────────────────

pharmacyRoutes.get('/provisional-invoices', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patientId');
  try {
    let sql = `SELECT * FROM pharmacy_provisional_invoices WHERE tenant_id = ? AND is_active = 1`;
    const params: (string | number)[] = [tenantId];
    if (patientId) { sql += ' AND patient_id = ?'; params.push(patientId); }
    sql += ' ORDER BY created_at DESC';
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ provisionalInvoices: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch provisional invoices' }); }
});

pharmacyRoutes.post('/provisional-invoices', requireRole(...PHARM_WRITE), zValidator('json', createProvisionalInvoiceSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    let subtotal = 0;
    const processedItems = data.items.map((item) => {
      const lineSub = item.quantity * item.price;
      const disc = Math.round(lineSub * (item.discountPct / 100));
      const vat = Math.round((lineSub - disc) * (item.vatPct / 100));
      const total = lineSub - disc + vat;
      subtotal += total;
      return { ...item, lineSub, disc, vat, total };
    });
    const discountAmount = Math.round(subtotal * (data.discountPct / 100));
    const totalAmount = subtotal - discountAmount;
    const provNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_provisional', 'PROV');

    const provResult = await db.$client.prepare(`
      INSERT INTO pharmacy_provisional_invoices
        (provisional_no, patient_id, patient_visit_id, counter_id, prescriber_id, visit_type,
         subtotal, discount_pct, discount_amount, total_amount, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(provNo, data.patientId, data.patientVisitId ?? null, data.counterId ?? null, data.prescriberId ?? null, data.visitType ?? null, subtotal, data.discountPct, discountAmount, totalAmount, data.remarks ?? null, tenantId, userId).run();
    const provId = provResult.meta.last_row_id;
    const batchStmts = processedItems.map((item) => db.$client.prepare(`
      INSERT INTO pharmacy_provisional_items
        (provisional_id, item_id, stock_id, batch_no, expiry_date, quantity, free_qty,
         price, sale_price, subtotal, discount_pct, discount_amount, vat_pct, vat_amount,
         total_amount, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(provId, item.itemId, item.stockId ?? null, item.batchNo ?? null, item.expiryDate ?? null, item.quantity, item.freeQty, item.price, item.salePrice, item.lineSub, item.discountPct, item.disc, item.vatPct, item.vat, item.total, item.remarks ?? null, tenantId, userId));
    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Provisional invoice created', id: provId, provNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create provisional invoice' }); }
});

// ─── Prescriptions ────────────────────────────────────────────────────────────

pharmacyRoutes.get('/prescriptions', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { patientId, status } = c.req.query();
  try {
    let sql = `SELECT * FROM pharmacy_prescriptions WHERE tenant_id = ? AND is_active = 1`;
    const params: (string | number)[] = [tenantId];
    if (patientId) { sql += ' AND patient_id = ?'; params.push(patientId); }
    if (status)    { sql += ' AND status = ?';      params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ prescriptions: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch prescriptions' }); }
});

pharmacyRoutes.get('/prescriptions/:id', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  try {
    const rx = await db.$client.prepare(`SELECT * FROM pharmacy_prescriptions WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first();
    if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });
    const { results: items } = await db.$client.prepare(`
      SELECT pi.*, i.name as item_name FROM pharmacy_prescription_items pi
      LEFT JOIN pharmacy_items i ON pi.item_id = i.id WHERE pi.prescription_id = ? AND pi.tenant_id = ?
    `).bind(id, tenantId).all();
    return c.json({ prescription: rx, items });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to fetch prescription' }); }
});

pharmacyRoutes.post('/prescriptions', requireRole(...PHARM_WRITE), zValidator('json', createPrescriptionSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const rxNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_rx', 'RX');
    const rxResult = await db.$client.prepare(`
      INSERT INTO pharmacy_prescriptions (prescription_no, patient_id, patient_visit_id, prescriber_id, prescriber_name, notes, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(rxNo, data.patientId, data.patientVisitId ?? null, data.prescriberId ?? null, data.prescriberName ?? null, data.notes ?? null, tenantId, userId).run();
    const rxId = rxResult.meta.last_row_id;
    const batchStmts = data.items.map((item) => db.$client.prepare(`
      INSERT INTO pharmacy_prescription_items (prescription_id, item_id, item_name, generic_name, dosage, frequency, duration, quantity, route, instructions, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(rxId, item.itemId, item.itemName ?? null, item.genericName ?? null, item.dosage ?? null, item.frequency ?? null, item.duration ?? null, item.quantity, item.route ?? null, item.instructions ?? null, tenantId, userId));
    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Prescription created', id: rxId, rxNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create prescription' }); }
});

pharmacyRoutes.put('/prescriptions/:id/dispense', requireRole(...PHARM_WRITE), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  try {
    // F10 fix: Validate prescription exists and status
    const rx = await db.$client.prepare(`SELECT status FROM pharmacy_prescriptions WHERE id=? AND tenant_id=?`).bind(id, tenantId).first<{ status: string }>();
    if (!rx) throw new HTTPException(404, { message: 'Prescription not found' });
    if (rx.status === 'dispensed') throw new HTTPException(400, { message: 'Prescription already dispensed' });
    if (rx.status === 'cancelled') throw new HTTPException(400, { message: 'Cannot dispense a cancelled prescription' });
    await db.$client.prepare(`UPDATE pharmacy_prescriptions SET status='dispensed', updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(id, tenantId).run();
    return c.json({ message: 'Prescription marked as dispensed' });
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to update prescription' }); }
});

// ─── Narcotic Records ─────────────────────────────────────────────────────────

pharmacyRoutes.get('/narcotics', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const itemId = c.req.query('itemId');
  try {
    let sql = `SELECT n.*, i.name as item_name FROM pharmacy_narcotic_records n
               JOIN pharmacy_items i ON n.item_id = i.id WHERE n.tenant_id = ?`;
    const params: (string | number)[] = [tenantId];
    if (itemId) { sql += ' AND n.item_id = ?'; params.push(itemId); }
    sql += ' ORDER BY n.created_at DESC';
    const { results } = await db.$client.prepare(sql).bind(...params).all();
    return c.json({ narcoticRecords: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch narcotic records' }); }
});

pharmacyRoutes.post('/narcotics', requireRole(...PHARM_WRITE), zValidator('json', createNarcoticRecordSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const result = await db.$client.prepare(`
      INSERT INTO pharmacy_narcotic_records
        (item_id, invoice_id, patient_id, batch_no, quantity, buyer_name, doctor_name, nmc_number, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(data.itemId, data.invoiceId ?? null, data.patientId ?? null, data.batchNo ?? null, data.quantity, data.buyerName ?? null, data.doctorName ?? null, data.nmcNumber ?? null, data.remarks ?? null, tenantId, userId).run();
    return c.json({ message: 'Narcotic record created', id: result.meta.last_row_id }, 201);
  } catch { throw new HTTPException(500, { message: 'Failed to create narcotic record' }); }
});

// ─── Write-offs ───────────────────────────────────────────────────────────────

pharmacyRoutes.get('/write-offs', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(`SELECT * FROM pharmacy_write_offs WHERE tenant_id = ? AND is_active = 1 ORDER BY write_off_date DESC`).bind(tenantId).all();
    return c.json({ writeOffs: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch write-offs' }); }
});

pharmacyRoutes.post('/write-offs', requireRole(...PHARM_WRITE), zValidator('json', createWriteOffSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // F2 fix: Validate stock availability before write-off
    for (const item of data.items) {
      const stock = await db.$client.prepare(
        `SELECT available_qty FROM pharmacy_stock WHERE id = ? AND tenant_id = ? AND is_active = 1`
      ).bind(item.stockId, tenantId).first<{ available_qty: number }>();
      if (!stock) throw new HTTPException(400, { message: `Stock record ${item.stockId} not found` });
      if (stock.available_qty < item.quantity) {
        throw new HTTPException(400, { message: `Insufficient stock for write-off on stock ${item.stockId}. Available: ${stock.available_qty}` });
      }
    }
    let totalAmount = 0;
    const processedItems = data.items.map((item) => {
      const total = item.quantity * item.itemRate;
      totalAmount += total;
      return { ...item, total };
    });
    const writeOffNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_writeoff', 'WO');
    const woResult = await db.$client.prepare(`
      INSERT INTO pharmacy_write_offs (write_off_no, write_off_date, total_amount, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(writeOffNo, data.writeOffDate, totalAmount, data.remarks ?? null, tenantId, userId).run();
    const woId = woResult.meta.last_row_id;
    const batchStmts: D1PreparedStatement[] = [];
    for (const item of processedItems) {
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_write_off_items (write_off_id, stock_id, item_id, batch_no, quantity, item_rate, total_amount, remarks, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(woId, item.stockId, item.itemId, item.batchNo ?? null, item.quantity, item.itemRate, item.total, item.remarks ?? null, tenantId, userId));
      batchStmts.push(db.$client.prepare(`UPDATE pharmacy_stock SET available_qty = available_qty - ?, updated_at=datetime('now') WHERE id = ? AND tenant_id = ?`).bind(item.quantity, item.stockId, tenantId));
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_stock_transactions (item_id, stock_id, transaction_type, reference_type, reference_id, batch_no, out_qty, price, remarks, tenant_id, created_by)
        VALUES (?, ?, 'write_off', 'write_off', ?, ?, ?, ?, 'Write-off', ?, ?)
      `).bind(item.itemId, item.stockId, woId, item.batchNo ?? null, item.quantity, item.itemRate, tenantId, userId));
    }
    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Write-off created', id: woId, writeOffNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create write-off' }); }
});

// ─── Requisitions ─────────────────────────────────────────────────────────────

pharmacyRoutes.get('/requisitions', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(`SELECT * FROM pharmacy_requisitions WHERE tenant_id = ? AND is_active = 1 ORDER BY requisition_date DESC`).bind(tenantId).all();
    return c.json({ requisitions: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch requisitions' }); }
});

pharmacyRoutes.post('/requisitions', requireRole(...PHARM_WRITE), zValidator('json', createRequisitionSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    const reqNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_requisition', 'REQ');
    const reqResult = await db.$client.prepare(`
      INSERT INTO pharmacy_requisitions (requisition_no, requesting_store, requisition_date, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(reqNo, data.requestingStore ?? null, data.requisitionDate, data.remarks ?? null, tenantId, userId).run();
    const reqId = reqResult.meta.last_row_id;
    const batchStmts = data.items.map((item) => db.$client.prepare(`
      INSERT INTO pharmacy_requisition_items (requisition_id, item_id, requested_qty, remarks, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(reqId, item.itemId, item.requestedQty, item.remarks ?? null, tenantId));
    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Requisition created', id: reqId, reqNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create requisition' }); }
});

// ─── Dispatches ───────────────────────────────────────────────────────────────

pharmacyRoutes.get('/dispatches', requireRole(...PHARM_READ), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  try {
    const { results } = await db.$client.prepare(`SELECT * FROM pharmacy_dispatches WHERE tenant_id = ? AND is_active = 1 ORDER BY dispatch_date DESC`).bind(tenantId).all();
    return c.json({ dispatches: results });
  } catch { throw new HTTPException(500, { message: 'Failed to fetch dispatches' }); }
});

pharmacyRoutes.post('/dispatches', requireRole(...PHARM_WRITE), zValidator('json', createDispatchSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');
  try {
    // F3 fix: Validate stock availability before dispatch
    for (const item of data.items) {
      if (item.stockId) {
        const stock = await db.$client.prepare(
          `SELECT available_qty FROM pharmacy_stock WHERE id = ? AND tenant_id = ? AND is_active = 1`
        ).bind(item.stockId, tenantId).first<{ available_qty: number }>();
        if (!stock) throw new HTTPException(400, { message: `Stock record ${item.stockId} not found` });
        if (stock.available_qty < item.dispatchedQty) {
          throw new HTTPException(400, { message: `Insufficient stock for dispatch on stock ${item.stockId}. Available: ${stock.available_qty}` });
        }
      }
    }
    const dispNo = await getNextSequence(c.env.DB, tenantId!, 'pharmacy_dispatch', 'DISP');
    const dispResult = await db.$client.prepare(`
      INSERT INTO pharmacy_dispatches (dispatch_no, requisition_id, source_store, target_store, dispatch_date, received_by, remarks, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(dispNo, data.requisitionId ?? null, data.sourceStore ?? null, data.targetStore ?? null, data.dispatchDate, data.receivedBy ?? null, data.remarks ?? null, tenantId, userId).run();
    const dispId = dispResult.meta.last_row_id;
    const batchStmts: D1PreparedStatement[] = [];
    for (const item of data.items) {
      batchStmts.push(db.$client.prepare(`
        INSERT INTO pharmacy_dispatch_items
          (dispatch_id, requisition_item_id, item_id, stock_id, batch_no, expiry_date, dispatched_qty, cost_price, sale_price, remarks, tenant_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(dispId, item.requisitionItemId ?? null, item.itemId, item.stockId ?? null, item.batchNo, item.expiryDate ?? null, item.dispatchedQty, item.costPrice, item.salePrice, item.remarks ?? null, tenantId, userId));
      if (item.stockId) {
        batchStmts.push(db.$client.prepare(`UPDATE pharmacy_stock SET available_qty = available_qty - ?, updated_at=datetime('now') WHERE id = ? AND tenant_id = ?`).bind(item.dispatchedQty, item.stockId, tenantId));
        batchStmts.push(db.$client.prepare(`
          INSERT INTO pharmacy_stock_transactions (item_id, stock_id, transaction_type, reference_type, reference_id, batch_no, out_qty, price, remarks, tenant_id, created_by)
          VALUES (?, ?, 'dispatch_out', 'dispatch', ?, ?, ?, ?, 'Dispatched to store', ?, ?)
        `).bind(item.itemId, item.stockId, dispId, item.batchNo, item.dispatchedQty, item.costPrice, tenantId, userId));
      }
    }
    // Update requisition status if linked
    if (data.requisitionId) {
      batchStmts.push(db.$client.prepare(`UPDATE pharmacy_requisitions SET status='dispatched', updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(data.requisitionId, tenantId));
    }
    if (batchStmts.length > 0) await db.$client.batch(batchStmts);
    return c.json({ message: 'Dispatch created', id: dispId, dispNo }, 201);
  } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: 'Failed to create dispatch' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// F15 FIX — SOFT-DELETE (DEACTIVATE) ENDPOINTS FOR MASTER DATA
// ══════════════════════════════════════════════════════════════════════════════

const DEACTIVATABLE_TABLES: Record<string, string> = {
  categories: 'pharmacy_categories',
  generics: 'pharmacy_generics',
  'pharmacy-suppliers': 'pharmacy_suppliers',
  uom: 'pharmacy_uom',
  'packing-types': 'pharmacy_packing_types',
  racks: 'pharmacy_racks',
  items: 'pharmacy_items',
  counters: 'pharmacy_counters',
};

for (const [resource, table] of Object.entries(DEACTIVATABLE_TABLES)) {
  pharmacyRoutes.put(`/${resource}/:id/deactivate`, requireRole(...PHARM_WRITE), async (c) => {
    const db = getDb(c.env.DB);
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');
    try {
      const existing = await db.$client.prepare(
        `SELECT id FROM ${table} WHERE id = ? AND tenant_id = ?`
      ).bind(id, tenantId).first();
      if (!existing) throw new HTTPException(404, { message: `${resource} not found` });
      await db.$client.prepare(
        `UPDATE ${table} SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
      ).bind(id, tenantId).run();
      return c.json({ message: `${resource} deactivated` });
    } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: `Failed to deactivate ${resource}` }); }
  });

  pharmacyRoutes.put(`/${resource}/:id/activate`, requireRole(...PHARM_WRITE), async (c) => {
    const db = getDb(c.env.DB);
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');
    try {
      const existing = await db.$client.prepare(
        `SELECT id FROM ${table} WHERE id = ? AND tenant_id = ?`
      ).bind(id, tenantId).first();
      if (!existing) throw new HTTPException(404, { message: `${resource} not found` });
      await db.$client.prepare(
        `UPDATE ${table} SET is_active = 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
      ).bind(id, tenantId).run();
      return c.json({ message: `${resource} activated` });
    } catch (e) { if (e instanceof HTTPException) throw e; throw new HTTPException(500, { message: `Failed to activate ${resource}` }); }
  });
}

export default pharmacyRoutes;