import { Hono } from 'hono';

const patientRoutes = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { tenantId?: string; userId?: string };
}>();

// Get all patients
patientRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const search = c.req.query('search') || '';
  
  try {
    let query = 'SELECT * FROM patients WHERE tenant_id = ?';
    const params: string[] = [tenantId!];
    
    if (search) {
      query += ' AND (name LIKE ? OR mobile LIKE ? OR id = ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, search);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const patients = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ patients: patients.results });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to fetch patients' }, 500);
  }
});

// Get single patient
patientRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  
  try {
    const patient = await c.env.DB.prepare(
      'SELECT * FROM patients WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).first();
    
    if (!patient) {
      return c.json({ error: 'Patient not found' }, 404);
    }
    
    return c.json({ patient });
  } catch (error) {
    return c.json({ error: 'Failed to fetch patient' }, 500);
  }
});

// Create patient
patientRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { name, fatherHusband, address, mobile, guardianMobile, age, gender, bloodGroup } = await c.req.json();
  
  if (!name || !fatherHusband || !address || !mobile) {
    return c.json({ error: 'Required fields missing' }, 400);
  }
  
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO patients (name, father_husband, address, mobile, guardian_mobile, age, gender, blood_group, tenant_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))`
    ).bind(name, fatherHusband, address, mobile, guardianMobile, age, gender, bloodGroup, tenantId).run();
    
    // Generate serial for today
    const today = new Date().toISOString().split('T')[0];
    const serialResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM serials WHERE tenant_id = ? AND date = ?'
    ).bind(tenantId, today).first<{ count: number }>();
    
    const serialNumber = `${today.replace(/-/g, '')}-${String((serialResult?.count || 0) + 1).padStart(3, '0')}`;
    
    await c.env.DB.prepare(
      'INSERT INTO serials (patient_id, serial_number, date, status, tenant_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(result.meta.last_row_id, serialNumber, today, 'waiting', tenantId).run();
    
    return c.json({ 
      message: 'Patient registered',
      patientId: result.meta.last_row_id,
      serial: serialNumber
    }, 201);
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to create patient' }, 500);
  }
});

// Update patient
patientRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const { name, fatherHusband, address, mobile, guardianMobile, age, gender, bloodGroup } = await c.req.json();
  
  try {
    await c.env.DB.prepare(
      `UPDATE patients SET name = ?, father_husband = ?, address = ?, mobile = ?, guardian_mobile = ?, age = ?, gender = ?, blood_group = ?, updated_at = datetime("now") 
       WHERE id = ? AND tenant_id = ?`
    ).bind(name, fatherHusband, address, mobile, guardianMobile, age, gender, bloodGroup, id, tenantId);
    
    return c.json({ message: 'Patient updated' });
  } catch (error) {
    return c.json({ error: 'Failed to update patient' }, 500);
  }
});

export default patientRoutes;
