import { Hono } from 'hono';
import type { Env, Variables } from '../../types';

const branchRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/branches/analytics — branch overview with aggregated stats
branchRoutes.get('/analytics', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const { results: branchRows } = await c.env.DB.prepare(`
      SELECT id, name, address, phone, is_active FROM branches WHERE tenant_id = ?
    `).bind(tenantId).all<{
      id: number; name: string; address: string; phone: string; is_active: number;
    }>();

    if (!branchRows.length) {
      return c.json({ branches: [] });
    }

    // Build stats for each branch
    const branches = await Promise.all(
      branchRows.map(async (b) => {
        // Patient count
        const patientRow = await c.env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM patients WHERE tenant_id = ? AND branch_id = ?'
        ).bind(tenantId, b.id).first<{ cnt: number }>();

        // Revenue (sum of total_amount from bills)
        const revenueRow = await c.env.DB.prepare(
          'SELECT COALESCE(SUM(total_amount), 0) as total FROM bills WHERE tenant_id = ? AND branch_id = ?'
        ).bind(tenantId, b.id).first<{ total: number }>();

        // Staff count
        const staffRow = await c.env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND branch_id = ?'
        ).bind(tenantId, b.id).first<{ cnt: number }>();

        // Bed stats
        const bedRow = await c.env.DB.prepare(`
          SELECT COUNT(*) as total,
                 SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied
          FROM beds WHERE tenant_id = ? AND branch_id = ?
        `).bind(tenantId, b.id).first<{ total: number; occupied: number }>();

        const bedsTotal = bedRow?.total ?? 0;
        const bedsOccupied = bedRow?.occupied ?? 0;

        return {
          id: b.id,
          name: b.name,
          location: b.address ?? '',
          status: b.is_active ? 'active' as const : 'inactive' as const,
          stats: {
            patients: patientRow?.cnt ?? 0,
            revenue: revenueRow?.total ?? 0,
            beds_total: bedsTotal,
            beds_occupied: bedsOccupied,
            staff: staffRow?.cnt ?? 0,
            occupancy_pct: bedsTotal > 0 ? Math.round((bedsOccupied / bedsTotal) * 100) : 0,
          },
          trend: 0, // Requires historical data comparison — not yet implemented
        };
      }),
    );

    return c.json({ branches });
  } catch (error) {
    console.error('[branches] analytics error:', error);
    return c.json({ branches: [] });
  }
});

export default branchRoutes;
