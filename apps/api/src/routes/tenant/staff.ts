import { Hono } from 'hono';

const staffRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string };
}>();

// Get all staff
staffRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  
  try {
    const staff = await c.env.DB.prepare(
      'SELECT * FROM staff WHERE tenant_id = ? AND status = ? ORDER BY position, name'
    ).bind(tenantId, 'active').all();
    
    return c.json({ staff: staff.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch staff' }, 500);
  }
});

// Add staff
staffRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { name, address, position, salary, bankAccount, mobile, joiningDate } = await c.req.json();
  
  if (!name || !position || !salary || !bankAccount || !mobile) {
    return c.json({ error: 'Required fields missing' }, 400);
  }
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO staff (name, address, position, salary, bank_account, mobile, joining_date, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, address, position, salary, bankAccount, mobile, joiningDate, tenantId).run();
    
    return c.json({ message: 'Staff added', id: result.meta.last_row_id }, 201);
  } catch (error) {
    return c.json({ error: 'Failed to add staff' }, 500);
  }
});

// Pay salary
staffRoutes.post('/:id/salary', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const { month } = await c.req.json();
  
  try {
    const staffMember = await c.env.DB.prepare(
      'SELECT * FROM staff WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).first<{id: number; name: string; salary: number}>();
    
    if (!staffMember) {
      return c.json({ error: 'Staff not found' }, 404);
    }
    
    // Record salary payment
    await c.env.DB.prepare(
      'INSERT INTO salary_payments (staff_id, amount, payment_date, month, tenant_id) VALUES (?, ?, date("now"), ?, ?)'
    ).bind(id, staffMember.salary, month, tenantId).run();
    
    // Add to expenses
    await c.env.DB.prepare(
      'INSERT INTO expenses (date, category, amount, description, tenant_id) VALUES (date("now"), ?, ?, ?, ?)'
    ).bind('Salary', staffMember.salary, `Salary for ${staffMember.name} - ${month}`, tenantId).run();
    
    return c.json({ message: 'Salary paid' });
  } catch (error) {
    return c.json({ error: 'Failed to pay salary' }, 500);
  }
});

// Get salary history
staffRoutes.get('/:id/salary', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  
  try {
    const payments = await c.env.DB.prepare(
      'SELECT * FROM salary_payments WHERE staff_id = ? AND tenant_id = ? ORDER BY payment_date DESC'
    ).bind(id, tenantId).all();
    
    return c.json({ payments: payments.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch salary history' }, 500);
  }
});

export default staffRoutes;