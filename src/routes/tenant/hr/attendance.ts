import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../../types';
import { requireTenantId, requireUserId } from '../../../lib/context-helpers';
import {
  createShiftSchema,
  updateShiftSchema,
  checkInSchema,
  checkOutSchema,
  attendanceReportQuerySchema,
} from '../../../schemas/hr';

const attendanceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Shift Management ──────────────────────────────────────────────────────────

// GET /api/hr/attendance/shifts
attendanceRoutes.get('/shifts', async (c) => {
  const tenantId = requireTenantId(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM hr_shifts WHERE tenant_id = ? AND is_active = 1 ORDER BY shift_name'
  ).bind(tenantId).all();

  return c.json({ data: results });
});

// POST /api/hr/attendance/shifts
attendanceRoutes.post('/shifts', zValidator('json', createShiftSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    INSERT INTO hr_shifts (tenant_id, shift_name, start_time, end_time, grace_period)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tenantId, data.shiftName, data.startTime, data.endTime, data.gracePeriod).run();

  return c.json({ message: 'Shift created', id: result.meta.last_row_id }, 201);
});

// PUT /api/hr/attendance/shifts/:id
attendanceRoutes.put('/shifts/:id', zValidator('json', updateShiftSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM hr_shifts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Shift not found' });

  await c.env.DB.prepare(`
    UPDATE hr_shifts
    SET shift_name = ?, start_time = ?, end_time = ?, grace_period = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(
    data.shiftName ?? existing.shift_name,
    data.startTime ?? existing.start_time,
    data.endTime ?? existing.end_time,
    data.gracePeriod ?? existing.grace_period,
    id,
    tenantId,
  ).run();

  return c.json({ message: 'Shift updated' });
});

// DELETE /api/hr/attendance/shifts/:id (soft delete)
attendanceRoutes.delete('/shifts/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = Number(c.req.param('id'));

  const result = await c.env.DB.prepare(
    'UPDATE hr_shifts SET is_active = 0 WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();
  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Shift not found' });

  return c.json({ message: 'Shift deactivated' });
});

// ─── Check-in / Check-out ──────────────────────────────────────────────────────

// POST /api/hr/attendance/check-in
attendanceRoutes.post('/check-in', zValidator('json', checkInSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { staffId, shiftId } = c.req.valid('json');
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString().split('T')[1].substring(0, 5); // HH:mm

  // Check duplicate
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM hr_attendance WHERE tenant_id = ? AND staff_id = ? AND date = ?'
  ).bind(tenantId, staffId, today).first();

  if (existing) throw new HTTPException(400, { message: 'Already checked in for today' });

  // Determine status (late if past grace period)
  let status = 'present';
  if (shiftId) {
    const shift = await c.env.DB.prepare(
      'SELECT start_time, grace_period FROM hr_shifts WHERE id = ? AND tenant_id = ?'
    ).bind(shiftId, tenantId).first<{ start_time: string; grace_period: number }>();

    if (shift) {
      const [shiftH, shiftM] = shift.start_time.split(':').map(Number);
      const [nowH, nowM] = now.split(':').map(Number);
      const shiftMinutes = shiftH * 60 + shiftM + (shift.grace_period || 0);
      const nowMinutes = nowH * 60 + nowM;
      if (nowMinutes > shiftMinutes) status = 'late';
    }
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO hr_attendance (tenant_id, staff_id, date, check_in, shift_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(tenantId, staffId, today, now, shiftId ?? null, status).run();

  return c.json({ message: 'Checked in successfully', id: result.meta.last_row_id, status });
});

// POST /api/hr/attendance/check-out
attendanceRoutes.post('/check-out', zValidator('json', checkOutSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { staffId } = c.req.valid('json');
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString().split('T')[1].substring(0, 5);

  const result = await c.env.DB.prepare(`
    UPDATE hr_attendance SET check_out = ?
    WHERE tenant_id = ? AND staff_id = ? AND date = ?
  `).bind(now, tenantId, staffId, today).run();

  if (result.meta.changes === 0) {
    throw new HTTPException(404, { message: 'No check-in record found for today' });
  }

  return c.json({ message: 'Checked out successfully' });
});

// ─── Attendance Report ─────────────────────────────────────────────────────────

// GET /api/hr/attendance/report?from=&to=&staffId=&page=&limit=
attendanceRoutes.get('/report', zValidator('query', attendanceReportQuerySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const query = c.req.valid('query');

  const conditions: string[] = ['a.tenant_id = ?'];
  const params: (string | number)[] = [Number(tenantId)];

  if (query.from) {
    conditions.push('a.date >= ?');
    params.push(query.from);
  }
  if (query.to) {
    conditions.push('a.date <= ?');
    params.push(query.to);
  }
  if (query.staffId) {
    conditions.push('a.staff_id = ?');
    params.push(query.staffId);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (query.page - 1) * query.limit;

  const { results } = await c.env.DB.prepare(`
    SELECT
      a.id, a.staff_id, s.name as staff_name, s.position,
      a.date, a.check_in, a.check_out, a.status,
      sh.shift_name, a.remarks
    FROM hr_attendance a
    JOIN staff s ON a.staff_id = s.id
    LEFT JOIN hr_shifts sh ON a.shift_id = sh.id
    WHERE ${whereClause}
    ORDER BY a.date DESC, s.name ASC
    LIMIT ? OFFSET ?
  `).bind(...params, query.limit, offset).all();

  const countRow = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM hr_attendance a
    WHERE ${whereClause}
  `).bind(...params).first<{ total: number }>();

  return c.json({
    data: results,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: countRow?.total ?? 0,
    },
  });
});

// GET /api/hr/attendance/summary?month=YYYY-MM — Monthly summary per staff
attendanceRoutes.get('/summary', async (c) => {
  const tenantId = requireTenantId(c);
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);

  const { results } = await c.env.DB.prepare(`
    SELECT
      s.id as staff_id, s.name as staff_name, s.position,
      COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days,
      COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_days,
      COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days,
      COUNT(CASE WHEN a.status = 'leave' THEN 1 END) as leave_days,
      COUNT(CASE WHEN a.status = 'half_day' THEN 1 END) as half_days,
      COUNT(a.id) as total_records
    FROM staff s
    LEFT JOIN hr_attendance a ON s.id = a.staff_id AND a.tenant_id = ? AND a.date LIKE ?
    WHERE s.tenant_id = ? AND s.status = 'active'
    GROUP BY s.id
    ORDER BY s.name
  `).bind(tenantId, `${month}%`, tenantId).all();

  return c.json({ data: results, month });
});

export default attendanceRoutes;
