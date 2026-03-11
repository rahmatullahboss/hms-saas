import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createPatientSchema, updatePatientSchema } from '../../schemas/patient';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';

const patientRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// GET /api/patients — list patients with search + cursor pagination
patientRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const search  = c.req.query('search') || '';
  const limit   = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const cursor  = c.req.query('cursor'); // last seen id for cursor pagination

  try {
    let query = 'SELECT * FROM patients WHERE tenant_id = ?';
    const params: (string | number)[] = [tenantId!];

    if (search) {
      query += ' AND (name LIKE ? OR mobile LIKE ? OR patient_code LIKE ? OR CAST(id AS TEXT) = ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, search);
    }

    if (cursor) {
      query += ' AND id < ?';
      params.push(parseInt(cursor, 10));
    }

    query += ' ORDER BY id DESC LIMIT ?';
    params.push(limit + 1); // fetch one extra to determine hasMore

    const patients = await c.env.DB.prepare(query).bind(...params).all();
    const results  = patients.results as Array<{ id: number }>;
    const hasMore  = results.length > limit;
    const items    = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? String(items[items.length - 1].id) : null;

    return c.json({ patients: items, nextCursor, hasMore });
  } catch (error) {
    console.error('patients fetch error:', error);
    throw new HTTPException(500, { message: 'Failed to fetch patients' });
  }
});

// GET /api/patients/:id — single patient
patientRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');

  try {
    const patient = await c.env.DB.prepare(
      'SELECT * FROM patients WHERE id = ? AND tenant_id = ?',
    )
      .bind(id, tenantId)
      .first();

    if (!patient) {
      throw new HTTPException(404, { message: 'Patient not found' });
    }

    return c.json({ patient });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch patient' });
  }
});

// POST /api/patients — create patient with Zod validation
patientRoutes.post('/', zValidator('json', createPatientSchema), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  try {
    // Generate unique patient code: P-000001
    const patientCode = await getNextSequence(c.env.DB, tenantId!, 'patient', 'P');

    const result = await c.env.DB.prepare(
      `INSERT INTO patients
         (name, father_husband, address, mobile, guardian_mobile, age, gender, blood_group, patient_code, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        data.name,
        data.fatherHusband,
        data.address,
        data.mobile,
        data.guardianMobile ?? null,
        data.age ?? null,
        data.gender ?? null,
        data.bloodGroup ?? null,
        patientCode,
        tenantId,
      )
      .run();

    // Generate daily serial for queue management
    const today = new Date().toISOString().split('T')[0];
    const serialCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM serials WHERE tenant_id = ? AND date = ?',
    )
      .bind(tenantId, today)
      .first<{ count: number }>();

    const serialNumber = `${today.replace(/-/g, '')}-${String((serialCount?.count ?? 0) + 1).padStart(3, '0')}`;

    await c.env.DB.prepare(
      'INSERT INTO serials (patient_id, serial_number, date, status, tenant_id) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(result.meta.last_row_id, serialNumber, today, 'waiting', tenantId)
      .run();

    // Audit log
    void createAuditLog(c.env, tenantId!, c.get('userId') ?? '', 'create', 'patients', result.meta.last_row_id, null, data);

    return c.json(
      {
        message: 'Patient registered',
        patientId: result.meta.last_row_id,
        patientCode,
        serial: serialNumber,
      },
      201,
    );
  } catch (error) {
    console.error('patient create error:', error);
    throw new HTTPException(500, { message: 'Failed to create patient' });
  }
});

// PUT /api/patients/:id — update patient with Zod validation
patientRoutes.put('/:id', zValidator('json', updatePatientSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM patients WHERE id = ? AND tenant_id = ?',
    )
      .bind(id, tenantId)
      .first<Record<string, unknown>>();

    if (!existing) {
      throw new HTTPException(404, { message: 'Patient not found' });
    }

    await c.env.DB.prepare(
      `UPDATE patients
       SET name = ?, father_husband = ?, address = ?, mobile = ?,
           guardian_mobile = ?, age = ?, gender = ?, blood_group = ?,
           updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
      .bind(
        data.name          ?? existing['name'],
        data.fatherHusband ?? existing['father_husband'],
        data.address       ?? existing['address'],
        data.mobile        ?? existing['mobile'],
        data.guardianMobile !== undefined ? data.guardianMobile : existing['guardian_mobile'],
        data.age           !== undefined ? data.age : existing['age'],
        data.gender        ?? existing['gender'],
        data.bloodGroup    ?? existing['blood_group'],
        id,
        tenantId,
      )
      .run();

    // Audit log
    void createAuditLog(c.env, tenantId!, c.get('userId') ?? '', 'update', 'patients', Number(id), existing, data);

    return c.json({ message: 'Patient updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update patient' });
  }
});

export default patientRoutes;
