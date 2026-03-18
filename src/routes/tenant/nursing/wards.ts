import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../../types';
import { requireTenantId } from '../../../lib/context-helpers';

type NursingEnv = { Bindings: Env; Variables: Variables };

const wardsRoutes = new Hono<NursingEnv>();

// GET /wards — list all wards with bed count
wardsRoutes.get('/', async (c) => {
  const tenantId = requireTenantId(c);
  const { results } = await c.env.DB.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.tenant_id = w.tenant_id) AS total_beds,
      (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.tenant_id = w.tenant_id AND b.status = 'occupied') AS occupied_beds
    FROM wards w
    WHERE w.tenant_id = ? AND w.is_active = 1
    ORDER BY w.name
  `).bind(tenantId).all();
  return c.json({ Results: results });
});

// GET /wards/:id — ward details with beds and patients
wardsRoutes.get('/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) throw new HTTPException(400, { message: 'Invalid ward ID' });

  const ward = await c.env.DB.prepare(
    'SELECT * FROM wards WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(id, tenantId).first();
  if (!ward) throw new HTTPException(404, { message: 'Ward not found' });

  const { results: beds } = await c.env.DB.prepare(`
    SELECT b.*,
      p.name AS patient_name,
      p.patient_code,
      a.admission_date,
      a.id AS admission_id
    FROM beds b
    LEFT JOIN admissions a ON a.bed_id = b.id AND a.tenant_id = b.tenant_id AND a.status = 'admitted'
    LEFT JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE b.ward_id = ? AND b.tenant_id = ?
    ORDER BY b.bed_number
  `).bind(id, tenantId).all();

  return c.json({ Results: { ...ward, beds } });
});

export default wardsRoutes;
