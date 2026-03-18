import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createCommissionSchema, markCommissionPaidSchema } from '../../schemas/commission';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getDb } from '../../db';


const commissionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/commissions — list commissions with filters
commissionRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const { status, person } = c.req.query();

  try {
    let query = `
      SELECT c.*, p.name as patient_name, p.patient_code
      FROM commissions c
      LEFT JOIN patients p ON c.patient_id = p.id
      WHERE c.tenant_id = ?`;
    const params: (string | number)[] = [tenantId!];

    if (status) { query += ' AND c.paid_status = ?'; params.push(status); }
    if (person) { query += ' AND c.marketing_person LIKE ?'; params.push(`%${person}%`); }

    query += ' ORDER BY c.created_at DESC';
    const commissions = await db.$client.prepare(query).bind(...params).all();
    return c.json({ commissions: commissions.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch commissions' });
  }
});

// GET /api/commissions/summary — totals for unpaid vs paid
commissionRoutes.get('/summary', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);

  try {
    const summary = await db.$client.prepare(`
      SELECT paid_status,
             COUNT(*) as count,
             SUM(commission_amount) as total
      FROM commissions
      WHERE tenant_id = ?
      GROUP BY paid_status
    `).bind(tenantId).all();
    return c.json({ summary: summary.results });
  } catch {
    throw new HTTPException(500, { message: 'Failed to fetch commission summary' });
  }
});

// POST /api/commissions — record new commission
commissionRoutes.post('/', zValidator('json', createCommissionSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  try {
    const result = await db.$client.prepare(`
      INSERT INTO commissions
        (marketing_person, mobile, patient_id, bill_id, commission_amount, paid_status, notes, tenant_id, created_by)
      VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)
    `).bind(
      data.marketingPerson,
      data.mobile ?? null,
      data.patientId ?? null,
      data.billId ?? null,
      data.commissionAmount,
      data.notes ?? null,
      tenantId,
      userId,
    ).run();

    return c.json({ message: 'Commission recorded', id: result.meta.last_row_id }, 201);
  } catch {
    throw new HTTPException(500, { message: 'Failed to record commission' });
  }
});

// POST /api/commissions/:id/pay — mark commission as paid
commissionRoutes.post('/:id/pay', zValidator('json', markCommissionPaidSchema), async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const id = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const existing = await db.$client.prepare(
      'SELECT id FROM commissions WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId).first();
    if (!existing) throw new HTTPException(404, { message: 'Commission not found' });

    const paidDate = data.paidDate ?? new Date().toISOString().split('T')[0];
    await db.$client.prepare(
      `UPDATE commissions SET paid_status = 'paid', paid_date = ?, notes = COALESCE(?, notes)
       WHERE id = ? AND tenant_id = ?`,
    ).bind(paidDate, data.notes ?? null, id, tenantId).run();

    return c.json({ message: 'Commission marked as paid', paidDate });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to update commission' });
  }
});

export default commissionRoutes;
