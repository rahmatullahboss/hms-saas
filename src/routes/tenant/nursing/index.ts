import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../../types';
import { requireTenantId } from '../../../lib/context-helpers';
import { requireRole, NURSING_ROLES, OPD_ROLES } from '../../../middleware/rbac';

// Sub-routes
import { carePlanRoutes } from './care-plan';
import { nursingNotesRoutes } from './notes';
import { marRoutes } from './mar';
import { ioChartsRoutes } from './io-charts';
import { monitoringRoutes } from './monitoring';
import { ivDrugRoutes } from './iv-drugs';
import { woundCareRoutes } from './wound-care';
import { handoverRoutes } from './handover';
import { opdRoutes } from './opd';
import wardsRoutes from './wards';

type NursingEnv = { Bindings: Env; Variables: Variables };

const nursing = new Hono<NursingEnv>();

// ─── RBAC: Restrict write operations to nursing staff ───────────────────────
// GETs = open to all authenticated users (viewing patient data)
// POST/PUT/DELETE = restricted to nursing roles
nursing.use('/*', async (c, next) => {
  const method = c.req.method;
  if (method === 'GET') return next();

  // OPD check-in/out can be done by receptionists too
  if (c.req.path.includes('/opd/')) {
    return requireRole(...OPD_ROLES)(c, next);
  }

  return requireRole(...NURSING_ROLES)(c, next);
});

// GET /nursing/patients — admitted patients for nursing dashboard
nursing.get(
  '/patients',
  zValidator('query', z.object({ ward_id: z.coerce.number().int().positive().optional() })),
  async (c) => {
    const tenantId = requireTenantId(c);
    const { ward_id } = c.req.valid('query');

    let sql = `
      SELECT
        p.id AS patient_id,
        p.patient_code,
        p.name,
        p.gender,
        p.mobile,
        a.id AS admission_id,
        a.admission_date,
        a.status AS admission_status,
        a.visit_id,
        d.name AS doctor_name
      FROM admissions a
      JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
      LEFT JOIN doctors d ON d.id = a.admitting_doctor_id
      WHERE a.tenant_id = ? AND a.status = 'admitted' AND a.is_active = 1
    `;
    const params: (string | number)[] = [tenantId];

    if (ward_id) { sql += ' AND a.ward_id = ?'; params.push(ward_id); }
    sql += ' ORDER BY a.admission_date DESC LIMIT 100';

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ Results: results, TotalCount: results.length });
  }
);

// Mount sub-routes
nursing.route('/care-plan', carePlanRoutes);
nursing.route('/notes', nursingNotesRoutes);
nursing.route('/mar', marRoutes);
nursing.route('/io', ioChartsRoutes);
nursing.route('/monitoring', monitoringRoutes);
nursing.route('/iv-drugs', ivDrugRoutes);
nursing.route('/wound-care', woundCareRoutes);
nursing.route('/handover', handoverRoutes);
nursing.route('/opd', opdRoutes);
nursing.route('/wards', wardsRoutes);

export default nursing;
