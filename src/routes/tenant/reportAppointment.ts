import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireTenantId } from '../../lib/context-helpers';
import type { Env, Variables } from '../../types';

const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD').optional(),
});

const trendSchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

const reportAppointment = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── No-Show Rate ────────────────────────────────────────────────────────────

reportAppointment.get('/no-show-rate', zValidator('query', dateRangeSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      COUNT(*) as total_appointments,
      SUM(CASE WHEN status = 'no_show' OR status = 'missed' THEN 1 ELSE 0 END) as no_shows,
      SUM(CASE WHEN status = 'completed' OR status = 'checked_in' THEN 1 ELSE 0 END) as attended,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM appointments
    WHERE tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND appointment_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND appointment_date <= ?'; params.push(endDate); }

  const result = await c.env.DB.prepare(sql).bind(...params).first<any>();

  const total = result?.total_appointments || 0;
  const noShows = result?.no_shows || 0;
  const rate = total > 0 ? parseFloat(((noShows / total) * 100).toFixed(1)) : 0;

  return c.json({
    totalAppointments: total,
    noShows,
    attended: result?.attended || 0,
    cancelled: result?.cancelled || 0,
    noShowRate: rate,
  });
});

// ─── Slot Utilization by Doctor ──────────────────────────────────────────────

reportAppointment.get('/slot-utilization', zValidator('query', dateRangeSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      d.id as doctor_id,
      d.name as doctor_name,
      d.specialty,
      COUNT(a.id) as total_appointments,
      SUM(CASE WHEN a.status IN ('completed', 'checked_in') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN a.status = 'no_show' OR a.status = 'missed' THEN 1 ELSE 0 END) as no_shows
    FROM doctors d
    LEFT JOIN appointments a ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id
  `;

  const conditions = ['d.tenant_id = ?'];
  const params: (string | number)[] = [tenantId];

  if (startDate) { conditions.push('a.appointment_date >= ?'); params.push(startDate); }
  if (endDate) { conditions.push('a.appointment_date <= ?'); params.push(endDate); }

  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' GROUP BY d.id ORDER BY total_appointments DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({
    doctors: results.map((r: any) => ({
      doctorId: r.doctor_id,
      doctorName: r.doctor_name,
      specialty: r.specialty,
      totalAppointments: r.total_appointments,
      completed: r.completed || 0,
      noShows: r.no_shows || 0,
      utilizationRate: r.total_appointments > 0
        ? parseFloat((((r.completed || 0) / r.total_appointments) * 100).toFixed(1))
        : 0,
    })),
  });
});

// ─── Peak Hours Analysis ─────────────────────────────────────────────────────

reportAppointment.get('/peak-hours', zValidator('query', dateRangeSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { startDate, endDate } = c.req.valid('query');

  let sql = `
    SELECT
      CASE
        WHEN appointment_time < '09:00' THEN 'Before 9 AM'
        WHEN appointment_time >= '09:00' AND appointment_time < '11:00' THEN '9 AM - 11 AM'
        WHEN appointment_time >= '11:00' AND appointment_time < '13:00' THEN '11 AM - 1 PM'
        WHEN appointment_time >= '13:00' AND appointment_time < '15:00' THEN '1 PM - 3 PM'
        WHEN appointment_time >= '15:00' AND appointment_time < '17:00' THEN '3 PM - 5 PM'
        WHEN appointment_time >= '17:00' AND appointment_time < '19:00' THEN '5 PM - 7 PM'
        ELSE 'After 7 PM'
      END as time_slot,
      COUNT(*) as count
    FROM appointments
    WHERE tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId];
  if (startDate) { sql += ' AND appointment_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND appointment_date <= ?'; params.push(endDate); }
  sql += ' GROUP BY time_slot ORDER BY count DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({
    slots: results.map((r: any) => ({
      timeSlot: r.time_slot,
      count: r.count,
    })),
    peakSlot: results.length > 0 ? (results[0] as any).time_slot : null,
  });
});

// ─── Daily Appointment Volume ────────────────────────────────────────────────

reportAppointment.get('/daily-volume', zValidator('query', trendSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const { days } = c.req.valid('query');

  const { results } = await c.env.DB.prepare(`
    SELECT
      appointment_date as date,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('completed', 'checked_in') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status IN ('no_show', 'missed') THEN 1 ELSE 0 END) as no_shows
    FROM appointments
    WHERE tenant_id = ? AND appointment_date >= date('now', '-' || ? || ' days')
    GROUP BY appointment_date ORDER BY appointment_date ASC
  `).bind(tenantId, days).all();

  return c.json({ daily: results });
});

export default reportAppointment;
