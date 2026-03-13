import { Hono } from 'hono';
import { requireTenantId } from '../../lib/context-helpers';

const testRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string; userId?: string };
}>();

// Get all tests
testRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = c.req.query('patient');
  const status = c.req.query('status');
  
  try {
    let query = 'SELECT t.*, p.name as patient_name FROM tests t JOIN patients p ON t.patient_id = p.id WHERE t.tenant_id = ?';
    const params: string[] = [tenantId!];
    
    if (patientId) {
      query += ' AND t.patient_id = ?';
      params.push(patientId);
    }
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY t.date DESC';
    
    const tests = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ tests: tests.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch tests' }, 500);
  }
});

// Create test for patient
testRoutes.post('/', async (c) => {
  const tenantId = requireTenantId(c);
  const { patientId, testName } = await c.req.json();
  
  if (!patientId || !testName) {
    return c.json({ error: 'Patient ID and test name required' }, 400);
  }
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO tests (patient_id, test_name, status, tenant_id, date) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(patientId, testName, 'pending', tenantId).run();
    
    return c.json({ 
      message: 'Test created',
      testId: result.meta.last_row_id
    }, 201);
  } catch (error) {
    return c.json({ error: 'Failed to create test' }, 500);
  }
});

// Update test result
testRoutes.put('/:id/result', async (c) => {
  const id = c.req.param('id');
  const tenantId = requireTenantId(c);
  const { result } = await c.req.json();
  
  try {
    // Use batch for atomicity — both UPDATE and INSERT succeed or fail together
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE tests SET result = ?, status = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?'
      ).bind(result, 'completed', id, tenantId),
      c.env.DB.prepare(
        'INSERT INTO income (date, source, amount, tenant_id) VALUES (date("now"), ?, ?, ?)'
      ).bind('test', result.includes('Normal') ? 200 : 300, tenantId),
    ]);
    
    return c.json({ message: 'Test result updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update test result' }, 500);
  }
});

export default testRoutes;