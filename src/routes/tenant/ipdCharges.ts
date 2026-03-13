import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';

const ipdChargeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const postChargeSchema = z.object({
  admission_id: z.number(),
  patient_id:   z.number(),
  charge_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  charge_type:  z.enum(['room', 'nursing', 'other']).default('room'),
  description:  z.string().optional(),
  amount:       z.number().min(0),
});

// ─── GET /api/ipd-charges?admission_id=X ──────────────────────────────────────

ipdChargeRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const admissionId = c.req.query('admission_id');

  if (!admissionId) {
    throw new HTTPException(400, { message: 'admission_id query param required' });
  }

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM ipd_charges
    WHERE admission_id = ? AND tenant_id = ?
    ORDER BY charge_date DESC
  `).bind(Number(admissionId), tenantId).all();

  const total = (results as { amount: number }[]).reduce((sum, r) => sum + (r.amount || 0), 0);

  return c.json({ charges: results, total });
});

// ─── POST /api/ipd-charges ────────────────────────────────────────────────────

ipdChargeRoutes.post('/', zValidator('json', postChargeSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = c.get('userId');
  const data = c.req.valid('json');

  // Verify admission belongs to tenant
  const admission = await c.env.DB.prepare(
    `SELECT id FROM admissions WHERE id = ? AND tenant_id = ?`
  ).bind(data.admission_id, tenantId).first();

  if (!admission) {
    throw new HTTPException(404, { message: 'Admission not found' });
  }

  // Check for duplicate charge on same date+type
  const existing = await c.env.DB.prepare(`
    SELECT id FROM ipd_charges
    WHERE admission_id = ? AND tenant_id = ? AND charge_date = ? AND charge_type = ?
  `).bind(data.admission_id, tenantId, data.charge_date, data.charge_type).first();

  if (existing) {
    throw new HTTPException(409, { message: `${data.charge_type} charge already posted for ${data.charge_date}` });
  }

  const safeUserId = userId ? Number(userId) : null;

  await c.env.DB.prepare(`
    INSERT INTO ipd_charges (tenant_id, admission_id, patient_id, charge_date, charge_type, description, amount, posted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.admission_id, data.patient_id, data.charge_date, data.charge_type,
          data.description ?? null, data.amount, safeUserId).run();

  return c.json({ success: true }, 201);
});

// ─── DELETE /api/ipd-charges/:id ──────────────────────────────────────────────

ipdChargeRoutes.delete('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    `DELETE FROM ipd_charges WHERE id = ? AND tenant_id = ?`
  ).bind(id, tenantId).run();

  if (!result.meta.changes) {
    throw new HTTPException(404, { message: 'Charge not found' });
  }

  return c.json({ success: true });
});

export default ipdChargeRoutes;
