import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createDoctorSchema, updateDoctorSchema } from '../../schemas/doctor';
import type { Env, Variables } from '../../types';

const doctorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/doctors — list all active doctors
doctorRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const search = c.req.query('search') || '';

  try {
    let query = `SELECT id, name, specialty, mobile_number, consultation_fee, is_active, created_at
                 FROM doctors WHERE tenant_id = ? AND is_active = 1`;
    const params: (string | number)[] = [tenantId!];

    if (search) {
      query += ' AND (name LIKE ? OR specialty LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY name';
    const doctors = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ doctors: doctors.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch doctors' });
  }
});

// GET /api/doctors/:id
doctorRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const doctor = await c.env.DB.prepare(
      'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();

    if (!doctor) throw new HTTPException(404, { message: 'Doctor not found' });
    return c.json({ doctor });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch doctor' });
  }
});

// POST /api/doctors — create doctor
doctorRoutes.post('/', zValidator('json', createDoctorSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO doctors (name, specialty, mobile_number, consultation_fee, is_active, tenant_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).bind(data.name, data.specialty ?? null, data.mobileNumber ?? null, data.consultationFee, tenantId).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Doctor added', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to add doctor' });
  }
});

// PUT /api/doctors/:id — update doctor
doctorRoutes.put('/:id', zValidator('json', updateDoctorSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first<Record<string, unknown>>();
    if (!existing) throw new HTTPException(404, { message: 'Doctor not found' });

    await c.env.DB.prepare(
      `UPDATE doctors SET name = ?, specialty = ?, mobile_number = ?, consultation_fee = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    ).bind(
      data.name              ?? existing['name'],
      data.specialty         !== undefined ? data.specialty        : existing['specialty'],
      data.mobileNumber      !== undefined ? data.mobileNumber     : existing['mobile_number'],
      data.consultationFee   !== undefined ? data.consultationFee  : existing['consultation_fee'],
      id, tenantId,
    ).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Doctor updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update doctor' });
  }
});

// DELETE /api/doctors/:id — soft delete
doctorRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Doctor not found' });

    await c.env.DB.prepare(
      `UPDATE doctors SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
    ).bind(id, tenantId).run();

    // TODO: audit log when audit module is available
    return c.json({ message: 'Doctor deactivated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to deactivate doctor' });
  }
});

export default doctorRoutes;
