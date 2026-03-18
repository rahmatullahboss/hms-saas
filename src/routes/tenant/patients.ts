import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { eq, and, like, or, lt, sql, desc } from 'drizzle-orm';
import { createPatientSchema, updatePatientSchema } from '../../schemas/patient';
import { getNextSequence } from '../../lib/sequence';
import { createAuditLog } from '../../lib/accounting-helpers';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getDb } from '../../db';
import { patients, serials } from '../../db/schema';

const patientRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /api/patients
 * Retrieves a list of patients for the current tenant.
 * Supports searching by name, mobile, patient code, or ID, and uses cursor-based pagination.
 */
patientRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const search = c.req.query('search') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const cursor = c.req.query('cursor');

  try {
    const db = getDb(c.env.DB);

    // Build conditions
    const conditions = [eq(patients.tenantId, Number(tenantId))];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          like(patients.name, searchPattern),
          like(patients.mobile, searchPattern),
          eq(sql`CAST(${patients.id} AS TEXT)`, search),
        )!,
      );
    }

    if (cursor) {
      conditions.push(lt(patients.id, parseInt(cursor, 10)));
    }

    const results = await db
      .select()
      .from(patients)
      .where(and(...conditions))
      .orderBy(desc(patients.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? String(items[items.length - 1].id) : null;

    return c.json({ patients: items, nextCursor, hasMore });
  } catch (error) {
    console.error('patients fetch error:', error);
    throw new HTTPException(500, { message: 'Failed to fetch patients' });
  }
});

/**
 * GET /api/patients/:id
 * Retrieves a single patient by their ID for the current tenant.
 */
patientRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = requireTenantId(c);

  try {
    const db = getDb(c.env.DB);

    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, Number(id)), eq(patients.tenantId, Number(tenantId))))
      .limit(1);

    if (!patient) {
      throw new HTTPException(404, { message: 'Patient not found' });
    }

    return c.json({ patient });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to fetch patient' });
  }
});

/**
 * POST /api/patients
 * Creates a new patient record for the current tenant.
 */
patientRoutes.post('/', zValidator('json', createPatientSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    const db = getDb(c.env.DB);

    // Generate unique patient code: P-000001 (raw D1 for sequence_counters)
    const patientCode = await getNextSequence(c.env.DB, tenantId!, 'patient', 'P');

    const [inserted] = await db
      .insert(patients)
      .values({
        name: data.name,
        fatherHusband: data.fatherHusband,
        address: data.address,
        mobile: data.mobile,
        guardianMobile: data.guardianMobile ?? null,
        age: data.age ?? null,
        gender: data.gender ?? null,
        bloodGroup: data.bloodGroup ?? null,
        tenantId: Number(tenantId),
        createdAt: sql`datetime('now')`,
      })
      .returning({ id: patients.id });

    const patientId = inserted.id;

    // Generate daily serial for queue management
    const today = new Date().toISOString().split('T')[0];

    const [serialCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(serials)
      .where(and(eq(serials.tenantId, Number(tenantId)), eq(serials.date, today)));

    const serialNumber = `${today.replace(/-/g, '')}-${String((serialCount?.count ?? 0) + 1).padStart(3, '0')}`;

    await db.insert(serials).values({
      patientId,
      serialNumber,
      date: today,
      status: 'waiting',
      tenantId: Number(tenantId),
    });

    // Audit log
    void createAuditLog(c.env, tenantId!, requireUserId(c), 'create', 'patients', patientId, null, data);

    return c.json(
      {
        message: 'Patient registered',
        patientId,
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

/**
 * PUT /api/patients/:id
 * Updates an existing patient record for the current tenant.
 */
patientRoutes.put('/:id', zValidator('json', updatePatientSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  try {
    const db = getDb(c.env.DB);

    const [existing] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, Number(id)), eq(patients.tenantId, Number(tenantId))))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'Patient not found' });
    }

    await db
      .update(patients)
      .set({
        name: data.name ?? existing.name,
        fatherHusband: data.fatherHusband ?? existing.fatherHusband,
        address: data.address ?? existing.address,
        mobile: data.mobile ?? existing.mobile,
        guardianMobile: data.guardianMobile !== undefined ? data.guardianMobile : existing.guardianMobile,
        age: data.age !== undefined ? data.age : existing.age,
        gender: data.gender ?? existing.gender,
        bloodGroup: data.bloodGroup ?? existing.bloodGroup,
        updatedAt: sql`datetime('now')`,
      })
      .where(and(eq(patients.id, Number(id)), eq(patients.tenantId, Number(tenantId))));

    // Audit log
    void createAuditLog(c.env, tenantId!, requireUserId(c), 'update', 'patients', Number(id), existing, data);

    return c.json({ message: 'Patient updated' });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update patient' });
  }
});

export default patientRoutes;
