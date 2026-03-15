import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const ot = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createBookingSchema = z.object({
  patient_id: z.number().int().positive(),
  visit_id: z.number().int().positive().optional(),
  booked_for_date: z.string().min(1),
  surgery_type: z.string().optional(),
  diagnosis: z.string().optional(),
  procedure_type: z.string().optional(),
  anesthesia_type: z.string().optional(),
  remarks: z.string().optional(),
  consent_form_path: z.string().optional(),
  pac_form_path: z.string().optional(),
  team: z.array(z.object({
    staff_id: z.number().int().positive(),
    role_type: z.enum(['surgeon', 'anesthetist', 'anesthetist_assistant', 'scrub_nurse', 'ot_assistant']),
  })).optional(),
});

const updateBookingSchema = z.object({
  booked_for_date: z.string().optional(),
  surgery_type: z.string().optional(),
  diagnosis: z.string().optional(),
  procedure_type: z.string().optional(),
  anesthesia_type: z.string().optional(),
  remarks: z.string().optional(),
  consent_form_path: z.string().optional(),
  pac_form_path: z.string().optional(),
  team: z.array(z.object({
    staff_id: z.number().int().positive(),
    role_type: z.enum(['surgeon', 'anesthetist', 'anesthetist_assistant', 'scrub_nurse', 'ot_assistant']),
  })).optional(),
});

const cancelBookingSchema = z.object({
  cancellation_remarks: z.string().optional(),
});

const createTeamMemberSchema = z.object({
  booking_id: z.number().int().positive(),
  patient_id: z.number().int().positive(),
  visit_id: z.number().int().positive().optional(),
  staff_id: z.number().int().positive(),
  role_type: z.enum(['surgeon', 'anesthetist', 'anesthetist_assistant', 'scrub_nurse', 'ot_assistant']),
});

const createChecklistSchema = z.object({
  booking_id: z.number().int().positive(),
  item_name: z.string().min(1),
  item_value: z.boolean().default(false),
  item_details: z.string().optional(),
});

const updateChecklistSchema = z.object({
  item_name: z.string().optional(),
  item_value: z.boolean().optional(),
  item_details: z.string().optional(),
});

const bulkChecklistSchema = z.object({
  items: z.array(z.object({
    item_name: z.string().min(1),
    item_value: z.boolean().default(false),
    item_details: z.string().optional(),
  })),
});

const createSummarySchema = z.object({
  booking_id: z.number().int().positive(),
  team_member_id: z.number().int().positive().optional(),
  pre_op_diagnosis: z.string().optional(),
  post_op_diagnosis: z.string().optional(),
  anesthesia: z.string().optional(),
  ot_charge: z.number().default(0),
  ot_description: z.string().optional(),
  category: z.string().optional(),
  nurse_signature: z.string().optional(),
});

const updateSummarySchema = z.object({
  team_member_id: z.number().int().positive().optional(),
  pre_op_diagnosis: z.string().optional(),
  post_op_diagnosis: z.string().optional(),
  anesthesia: z.string().optional(),
  ot_charge: z.number().optional(),
  ot_description: z.string().optional(),
  category: z.string().optional(),
  nurse_signature: z.string().optional(),
});

// ─── OT Booking Endpoints ────────────────────────────────────────────────────

// GET /bookings — list OT bookings with team members (N+1 optimized)
ot.get('/bookings', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const dateFilter = c.req.query('date') || new Date().toISOString().split('T')[0];
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM ot_bookings WHERE tenant_id = ? AND is_active = 1 AND booked_for_date >= ?'
  ).bind(tenantId, dateFilter).first<{ total: number }>();

  const { results: bookings } = await c.env.DB.prepare(`
    SELECT b.*, p.name as patient_name, p.patient_code, p.gender, p.date_of_birth, p.mobile
    FROM ot_bookings b
    LEFT JOIN patients p ON b.patient_id = p.id AND b.tenant_id = p.tenant_id
    WHERE b.tenant_id = ? AND b.is_active = 1 AND b.booked_for_date >= ?
    ORDER BY b.booked_for_date DESC
    LIMIT ? OFFSET ?
  `).bind(tenantId, dateFilter, limit, offset).all();

  // Fetch all team members in one query (avoid N+1)
  if (bookings.length > 0) {
    const bookingIds = bookings.map((b: any) => b.id);
    const placeholders = bookingIds.map(() => '?').join(', ');

    const { results: allTeam } = await c.env.DB.prepare(`
      SELECT t.*, s.name as staff_name, s.position as designation
      FROM ot_team_members t
      LEFT JOIN staff s ON t.staff_id = s.id AND t.tenant_id = s.tenant_id
      WHERE t.tenant_id = ? AND t.booking_id IN (${placeholders})
    `).bind(tenantId, ...bookingIds).all();

    // Group team by booking
    const teamByBooking = new Map<number, any[]>();
    (allTeam as any[]).forEach(m => {
      if (!teamByBooking.has(m.booking_id)) teamByBooking.set(m.booking_id, []);
      teamByBooking.get(m.booking_id)!.push(m);
    });

    // Attach to bookings
    const enriched = bookings.map((b: any) => {
      const members = teamByBooking.get(b.id) || [];
      return {
        ...b,
        surgeons: members.filter((m: any) => m.role_type === 'surgeon'),
        anesthetist: members.find((m: any) => m.role_type === 'anesthetist') || null,
        anesthetist_assistant: members.find((m: any) => m.role_type === 'anesthetist_assistant') || null,
        scrub_nurse: members.find((m: any) => m.role_type === 'scrub_nurse') || null,
        ot_assistants: members.filter((m: any) => m.role_type === 'ot_assistant'),
      };
    });

    return c.json({ bookings: enriched, total: countResult?.total || 0, limit, offset });
  }

  return c.json({ bookings: [], total: 0, limit, offset });
});

// GET /stats — OT dashboard KPIs
ot.get('/stats', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const today = new Date().toISOString().split('T')[0];

  const [todayCount, weekCount, totalActive, cancelled] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ot_bookings WHERE tenant_id = ? AND is_active = 1 AND booked_for_date = ?`)
      .bind(tenantId, today).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ot_bookings WHERE tenant_id = ? AND is_active = 1 AND booked_for_date >= ? AND booked_for_date <= ?`)
      .bind(tenantId, today, new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ot_bookings WHERE tenant_id = ? AND is_active = 1 AND booked_for_date >= ?`)
      .bind(tenantId, today).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ot_bookings WHERE tenant_id = ? AND is_active = 0`)
      .bind(tenantId).first<{ cnt: number }>(),
  ]);

  return c.json({
    today_bookings: todayCount?.cnt ?? 0,
    this_week: weekCount?.cnt ?? 0,
    total_upcoming: totalActive?.cnt ?? 0,
    cancelled: cancelled?.cnt ?? 0,
  });
});

// GET /bookings/:id — single booking with team, checklist, summary
ot.get('/bookings/:id', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));

  const booking = await c.env.DB.prepare(`
    SELECT b.*, p.name as patient_name, p.patient_code, p.gender, p.date_of_birth, p.mobile
    FROM ot_bookings b
    LEFT JOIN patients p ON b.patient_id = p.id AND b.tenant_id = p.tenant_id
    WHERE b.id = ? AND b.tenant_id = ?
  `).bind(id, tenantId).first();

  if (!booking) throw new HTTPException(404, { message: 'OT booking not found' });

  const [teamResult, checklistResult, summary] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.*, s.name as staff_name, s.position as designation
      FROM ot_team_members t
      LEFT JOIN staff s ON t.staff_id = s.id AND t.tenant_id = s.tenant_id
      WHERE t.booking_id = ? AND t.tenant_id = ?
      ORDER BY CASE t.role_type
        WHEN 'surgeon' THEN 1 WHEN 'anesthetist' THEN 2
        WHEN 'anesthetist_assistant' THEN 3 WHEN 'scrub_nurse' THEN 4
        WHEN 'ot_assistant' THEN 5 END
    `).bind(id, tenantId).all(),
    c.env.DB.prepare('SELECT * FROM ot_checklist_items WHERE booking_id = ? AND tenant_id = ? ORDER BY id')
      .bind(id, tenantId).all(),
    c.env.DB.prepare('SELECT * FROM ot_summaries WHERE booking_id = ? AND tenant_id = ?')
      .bind(id, tenantId).first(),
  ]);

  return c.json({
    booking: {
      ...booking,
      team: teamResult.results,
      checklist: checklistResult.results,
      summary: summary || null,
    },
  });
});

// POST /bookings — create OT booking with team (atomic with compensation)
ot.post('/bookings', zValidator('json', createBookingSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  // Verify patient exists
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(data.patient_id, tenantId).first();
  if (!patient) throw new HTTPException(400, { message: 'Patient not found' });

  // Create booking
  const bookingResult = await c.env.DB.prepare(`
    INSERT INTO ot_bookings (
      tenant_id, patient_id, visit_id, booked_for_date,
      surgery_type, diagnosis, procedure_type, anesthesia_type,
      remarks, consent_form_path, pac_form_path, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.patient_id, data.visit_id || null,
    data.booked_for_date, data.surgery_type || null,
    data.diagnosis || null, data.procedure_type || null,
    data.anesthesia_type || null, data.remarks || null,
    data.consent_form_path || null, data.pac_form_path || null,
    userId
  ).run();

  const bookingId = bookingResult.meta.last_row_id as number;

  // Add team members if provided (batch for performance)
  if (data.team && data.team.length > 0) {
    try {
      const stmts = data.team.map(m =>
        c.env.DB.prepare(`
          INSERT INTO ot_team_members (tenant_id, booking_id, patient_id, visit_id, staff_id, role_type, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(tenantId, bookingId, data.patient_id, data.visit_id || null, m.staff_id, m.role_type, userId)
      );
      await c.env.DB.batch(stmts);
    } catch {
      // Compensate: delete the booking
      await c.env.DB.prepare('DELETE FROM ot_bookings WHERE id = ? AND tenant_id = ?').bind(bookingId, tenantId).run();
      throw new HTTPException(500, { message: 'Failed to add team members' });
    }
  }

  return c.json({ id: bookingId, message: 'OT booking created' }, 201);
});

// PUT /bookings/:id — update booking + team
ot.put('/bookings/:id', zValidator('json', updateBookingSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id, patient_id, visit_id FROM ot_bookings WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<{ id: number; patient_id: number; visit_id: number | null }>();
  if (!existing) throw new HTTPException(404, { message: 'OT booking not found' });

  const batchOps: D1PreparedStatement[] = [];

  // Build update sets
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  const fields: Record<string, keyof typeof data> = {
    booked_for_date: 'booked_for_date', surgery_type: 'surgery_type',
    diagnosis: 'diagnosis', procedure_type: 'procedure_type',
    anesthesia_type: 'anesthesia_type', remarks: 'remarks',
    consent_form_path: 'consent_form_path', pac_form_path: 'pac_form_path',
  };

  for (const [col, key] of Object.entries(fields)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(data[key] as string | null);
    }
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    batchOps.push(
      c.env.DB.prepare(`UPDATE ot_bookings SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals)
    );
  }

  // Update team if provided (delete + re-insert)
  if (data.team && data.team.length > 0) {
    batchOps.push(
      c.env.DB.prepare('DELETE FROM ot_team_members WHERE booking_id = ? AND tenant_id = ?').bind(id, tenantId)
    );
    data.team.forEach(m => {
      batchOps.push(
        c.env.DB.prepare(`
          INSERT INTO ot_team_members (tenant_id, booking_id, patient_id, visit_id, staff_id, role_type, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(tenantId, id, existing.patient_id, existing.visit_id || null, m.staff_id, m.role_type, userId)
      );
    });
  }

  if (batchOps.length === 0) throw new HTTPException(400, { message: 'No fields to update' });

  await c.env.DB.batch(batchOps);
  return c.json({ success: true, message: 'OT booking updated' });
});

// PUT /bookings/:id/cancel — cancel booking
ot.put('/bookings/:id/cancel', zValidator('json', cancelBookingSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const id = parseInt(c.req.param('id'));
  const { cancellation_remarks } = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id, is_active FROM ot_bookings WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<{ id: number; is_active: number }>();

  if (!existing) throw new HTTPException(404, { message: 'OT booking not found' });
  if (existing.is_active === 0) throw new HTTPException(400, { message: 'Booking already cancelled' });

  await c.env.DB.prepare(`
    UPDATE ot_bookings SET
      is_active = 0, cancelled_by = ?, cancelled_on = datetime('now'),
      cancellation_remarks = ?, updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).bind(userId, cancellation_remarks || null, id, tenantId).run();

  return c.json({ success: true, message: 'OT booking cancelled' });
});

// ─── Team Endpoints ──────────────────────────────────────────────────────────

// GET /bookings/:bookingId/team
ot.get('/bookings/:bookingId/team', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const bookingId = parseInt(c.req.param('bookingId'));

  const { results } = await c.env.DB.prepare(`
    SELECT t.*, s.name as staff_name, s.position as designation
    FROM ot_team_members t
    LEFT JOIN staff s ON t.staff_id = s.id AND t.tenant_id = s.tenant_id
    WHERE t.booking_id = ? AND t.tenant_id = ?
    ORDER BY CASE t.role_type
      WHEN 'surgeon' THEN 1 WHEN 'anesthetist' THEN 2
      WHEN 'anesthetist_assistant' THEN 3 WHEN 'scrub_nurse' THEN 4
      WHEN 'ot_assistant' THEN 5 END
  `).bind(bookingId, tenantId).all();

  return c.json({ team: results, total: results.length });
});

// POST /team — add team member
ot.post('/team', zValidator('json', createTeamMemberSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  const booking = await c.env.DB.prepare(
    'SELECT id FROM ot_bookings WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(data.booking_id, tenantId).first();
  if (!booking) throw new HTTPException(400, { message: 'OT booking not found' });

  const staff = await c.env.DB.prepare(
    'SELECT id FROM staff WHERE id = ? AND tenant_id = ?'
  ).bind(data.staff_id, tenantId).first();
  if (!staff) throw new HTTPException(400, { message: 'Staff member not found' });

  const result = await c.env.DB.prepare(`
    INSERT INTO ot_team_members (tenant_id, booking_id, patient_id, visit_id, staff_id, role_type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.booking_id, data.patient_id, data.visit_id || null, data.staff_id, data.role_type, userId).run();

  return c.json({ id: result.meta.last_row_id, message: 'Team member added' }, 201);
});

// DELETE /team/:id — remove team member
ot.delete('/team/:id', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));

  const existing = await c.env.DB.prepare(
    'SELECT id FROM ot_team_members WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Team member not found' });

  await c.env.DB.prepare('DELETE FROM ot_team_members WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ success: true, message: 'Team member removed' });
});

// ─── Checklist Endpoints ─────────────────────────────────────────────────────

// GET /bookings/:bookingId/checklist
ot.get('/bookings/:bookingId/checklist', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const bookingId = parseInt(c.req.param('bookingId'));

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ot_checklist_items WHERE booking_id = ? AND tenant_id = ? ORDER BY id'
  ).bind(bookingId, tenantId).all();

  return c.json({ checklist: results, total: results.length });
});

// POST /checklist — add checklist item
ot.post('/checklist', zValidator('json', createChecklistSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  const booking = await c.env.DB.prepare(
    'SELECT id FROM ot_bookings WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(data.booking_id, tenantId).first();
  if (!booking) throw new HTTPException(400, { message: 'OT booking not found' });

  const result = await c.env.DB.prepare(`
    INSERT INTO ot_checklist_items (tenant_id, booking_id, item_name, item_value, item_details, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.booking_id, data.item_name, data.item_value ? 1 : 0, data.item_details || null, userId).run();

  return c.json({ id: result.meta.last_row_id, message: 'Checklist item added' }, 201);
});

// PUT /checklist/:id — update checklist item
ot.put('/checklist/:id', zValidator('json', updateChecklistSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM ot_checklist_items WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Checklist item not found' });

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (data.item_name !== undefined) { sets.push('item_name = ?'); vals.push(data.item_name); }
  if (data.item_value !== undefined) { sets.push('item_value = ?'); vals.push(data.item_value ? 1 : 0); }
  if (data.item_details !== undefined) { sets.push('item_details = ?'); vals.push(data.item_details); }

  if (sets.length === 0) throw new HTTPException(400, { message: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  vals.push(id, tenantId);

  await c.env.DB.prepare(
    `UPDATE ot_checklist_items SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ success: true, message: 'Checklist item updated' });
});

// PUT /bookings/:bookingId/checklist/bulk — bulk update
ot.put('/bookings/:bookingId/checklist/bulk', zValidator('json', bulkChecklistSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const bookingId = parseInt(c.req.param('bookingId'));
  const { items } = c.req.valid('json');

  const booking = await c.env.DB.prepare(
    'SELECT id FROM ot_bookings WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(bookingId, tenantId).first();
  if (!booking) throw new HTTPException(400, { message: 'OT booking not found' });

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM ot_checklist_items WHERE booking_id = ? AND tenant_id = ?').bind(bookingId, tenantId),
  ];

  items.forEach(item => {
    stmts.push(
      c.env.DB.prepare(`
        INSERT INTO ot_checklist_items (tenant_id, booking_id, item_name, item_value, item_details, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(tenantId, bookingId, item.item_name, item.item_value ? 1 : 0, item.item_details || null, userId)
    );
  });

  await c.env.DB.batch(stmts);
  return c.json({ success: true, message: 'Checklist updated' });
});

// ─── Summary Endpoints ───────────────────────────────────────────────────────

// GET /bookings/:bookingId/summary
ot.get('/bookings/:bookingId/summary', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const bookingId = parseInt(c.req.param('bookingId'));

  const summary = await c.env.DB.prepare(
    'SELECT * FROM ot_summaries WHERE booking_id = ? AND tenant_id = ?'
  ).bind(bookingId, tenantId).first();

  if (!summary) throw new HTTPException(404, { message: 'OT summary not found' });
  return c.json({ summary });
});

// POST /summary — create OT summary
ot.post('/summary', zValidator('json', createSummarySchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');

  const booking = await c.env.DB.prepare(
    'SELECT id FROM ot_bookings WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(data.booking_id, tenantId).first();
  if (!booking) throw new HTTPException(400, { message: 'OT booking not found' });

  const existingSummary = await c.env.DB.prepare(
    'SELECT id FROM ot_summaries WHERE booking_id = ? AND tenant_id = ?'
  ).bind(data.booking_id, tenantId).first();
  if (existingSummary) throw new HTTPException(400, { message: 'Summary already exists for this booking' });

  const result = await c.env.DB.prepare(`
    INSERT INTO ot_summaries (
      tenant_id, booking_id, team_member_id, pre_op_diagnosis, post_op_diagnosis,
      anesthesia, ot_charge, ot_description, category, nurse_signature, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.booking_id, data.team_member_id || null,
    data.pre_op_diagnosis || null, data.post_op_diagnosis || null,
    data.anesthesia || null, data.ot_charge,
    data.ot_description || null, data.category || null,
    data.nurse_signature || null, userId
  ).run();

  return c.json({ id: result.meta.last_row_id, message: 'OT summary created' }, 201);
});

// PUT /summary/:id — update OT summary
ot.put('/summary/:id', zValidator('json', updateSummarySchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM ot_summaries WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'OT summary not found' });

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  const fields: Record<string, keyof typeof data> = {
    team_member_id: 'team_member_id', pre_op_diagnosis: 'pre_op_diagnosis',
    post_op_diagnosis: 'post_op_diagnosis', anesthesia: 'anesthesia',
    ot_charge: 'ot_charge', ot_description: 'ot_description',
    category: 'category', nurse_signature: 'nurse_signature',
  };

  for (const [col, key] of Object.entries(fields)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(data[key] as string | number | null);
    }
  }

  if (sets.length === 0) throw new HTTPException(400, { message: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  vals.push(id, tenantId);

  await c.env.DB.prepare(
    `UPDATE ot_summaries SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ success: true, message: 'OT summary updated' });
});

export default ot;
