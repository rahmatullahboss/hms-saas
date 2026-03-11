import { Hono } from 'hono';
import { notifyDashboard } from '../../lib/accounting-helpers';

const pharmacyRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    UPLOADS: R2Bucket;
    DASHBOARD_DO: DurableObjectNamespace;
    ENVIRONMENT: string;
  };
  Variables: {
    tenantId?: string;
    userId?: string;
  };
}>();

// Get all medicines
pharmacyRoutes.get('/medicines', async (c) => {
  const tenantId = c.get('tenantId');
  const search = c.req.query('search');
  
  try {
    let query = 'SELECT * FROM medicines WHERE tenant_id = ?';
    const params: string[] = [tenantId!];
    
    if (search) {
      query += ' AND (name LIKE ? OR company LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY name';
    
    const medicines = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ medicines: medicines.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch medicines' }, 500);
  }
});

// Add medicine
pharmacyRoutes.post('/medicines', async (c) => {
  const tenantId = c.get('tenantId');
  const { name, company, unitPrice, quantity } = await c.req.json();
  
  if (!name || !unitPrice) {
    return c.json({ error: 'Name and price required' }, 400);
  }
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO medicines (name, company, unit_price, quantity, tenant_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, company, unitPrice, quantity || 0, tenantId).run();
    
    return c.json({ message: 'Medicine added', id: result.meta.last_row_id }, 201);
  } catch (error) {
    return c.json({ error: 'Failed to add medicine' }, 500);
  }
});

// Update stock
pharmacyRoutes.put('/medicines/:id/stock', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const { quantity } = await c.req.json();
  
  try {
    await c.env.DB.prepare(
      'UPDATE medicines SET quantity = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?'
    ).bind(quantity, id, tenantId);
    
    return c.json({ message: 'Stock updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update stock' }, 500);
  }
});

// Update medicine details
pharmacyRoutes.put('/medicines/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const { name, company, unitPrice, quantity } = await c.req.json();
  
  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM medicines WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).first();
    
    if (!existing) {
      return c.json({ error: 'Medicine not found' }, 404);
    }
    
    await c.env.DB.prepare(
      'UPDATE medicines SET name = ?, company = ?, unit_price = ?, quantity = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?'
    ).bind(
      name || (existing as any).name,
      company || (existing as any).company,
      unitPrice || (existing as any).unit_price,
      quantity !== undefined ? quantity : (existing as any).quantity,
      id,
      tenantId
    );
    
    return c.json({ message: 'Medicine updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update medicine' }, 500);
  }
});

// Record pharmacy income
pharmacyRoutes.post('/income', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { amount, description, bill_id } = await c.req.json();
  
  if (!amount) {
    return c.json({ error: 'Amount required' }, 400);
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await c.env.DB.prepare(
      'INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(today, 'pharmacy', amount, description || 'Pharmacy sale', bill_id || null, tenantId, userId).run();
    
    await notifyDashboard(c.env, tenantId!, 'income', amount);
    
    return c.json({ message: 'Income recorded', id: result.meta.last_row_id });
  } catch (error) {
    return c.json({ error: 'Failed to record income' }, 500);
  }
});

export default pharmacyRoutes;