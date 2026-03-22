import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requestOtpSchema, verifyOtpSchema } from '../../schemas/patientPortal';
import { generateToken } from '../../middleware/auth';
import { getNextSequence } from '../../lib/sequence';
import type { Env, Variables } from '../../types';
import { getDb } from '../../db';


const patientPortalRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables & { patientId?: string };
}>();

// ─── Helpers ────────────────────────────────────────────────────────────

function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, '0');
}

/** Parse pagination query params with defaults */
function parsePagination(c: { req: { query: (key: string) => string | undefined } }): { page: number; limit: number; offset: number } {
  const rawPage = Number(c.req.query('page') ?? '1');
  const rawLimit = Number(c.req.query('limit') ?? '20');
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));
  return { page, limit, offset: (page - 1) * limit };
}

/** Build paginated JSON response */
function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/** Audit logging helper — fire-and-forget */
async function auditLog(
  db: D1Database,
  patientId: string | undefined,
  action: string,
  tenantId: string | undefined,
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO patient_portal_audit (patient_id, action, tenant_id)
       VALUES (?, ?, ?)`
    ).bind(patientId, action, tenantId).run();
  } catch {
    // Non-critical — don't fail the request
    console.error(`[AUDIT] Failed to log action="${action}" for patient=${patientId}`);
  }
}

/** Compute patient-friendly lab explanation and severity */
function labExplanation(
  abnormalFlag: string | null | undefined,
  testName: string | undefined,
): { severity: string; explanation: string } {
  if (!abnormalFlag || abnormalFlag === 'normal') {
    return { severity: 'normal', explanation: 'Your result is within the normal range.' };
  }
  if (abnormalFlag === 'slightly_high' || abnormalFlag === 'borderline_high') {
    return { severity: 'borderline', explanation: `Your ${testName ?? 'test'} result is slightly above the normal range. Monitor and consult your doctor if needed.` };
  }
  if (abnormalFlag === 'slightly_low' || abnormalFlag === 'borderline_low') {
    return { severity: 'borderline', explanation: `Your ${testName ?? 'test'} result is slightly below the normal range. Monitor and consult your doctor if needed.` };
  }
  if (abnormalFlag === 'high') {
    return { severity: 'attention', explanation: `Your ${testName ?? 'test'} result is above the normal range. Please consult your doctor.` };
  }
  if (abnormalFlag === 'low') {
    return { severity: 'attention', explanation: `Your ${testName ?? 'test'} result is below the normal range. Please consult your doctor.` };
  }
  if (abnormalFlag === 'critical_high' || abnormalFlag === 'critical_low' || abnormalFlag === 'critical') {
    return { severity: 'critical', explanation: `Your ${testName ?? 'test'} result is outside the safe range. Please contact your doctor immediately.` };
  }
  // Fallback for any other flag
  return { severity: 'attention', explanation: `Your ${testName ?? 'test'} result may require attention. Please consult your doctor.` };
}

// ─── Patient auth middleware ────────────────────────────────────────────

async function patientAuthMiddleware(c: any, next: () => Promise<void>): Promise<Response | void> {
  const role = c.get('role');
  const userId = c.get('userId');

  if (role !== 'patient') {
    throw new HTTPException(403, { message: 'Patient portal access only' });
  }

  c.set('patientId', userId);
  await next();
}

// ==========================================================================
// AUTH ROUTES (no auth middleware needed)
// ==========================================================================

/**
 * POST /request-otp — KV-based rate limiting with exponential backoff
 */
patientPortalRoutes.post(
  '/request-otp',
  zValidator('json', requestOtpSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const { email } = c.req.valid('json');
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      throw new HTTPException(400, { message: 'Tenant not identified' });
    }

    // Check if patient exists with this email
    const patient = await db.$client.prepare(
      'SELECT id, name FROM patients WHERE email = ? AND tenant_id = ?'
    ).bind(email, tenantId).first<{ id: number; name: string }>();

    if (!patient) {
      return c.json({ message: 'If this email is registered, you will receive an OTP.' });
    }

    // KV-based rate limiting: max 3 requests per 15 minutes
    const rateLimitKey = `otp_rate:${tenantId}:${email}`;
    try {
      const currentCount = await c.env.KV.get(rateLimitKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= 3) {
        throw new HTTPException(429, { message: 'Too many OTP requests. Please wait 15 minutes.' });
      }

      await c.env.KV.put(rateLimitKey, String(count + 1), { expirationTtl: 900 }); // 15 min TTL
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      // KV unavailable in local dev — fallback to DB
      const recentCount = await db.$client.prepare(
        `SELECT COUNT(*) as cnt FROM patient_otp_codes
         WHERE email = ? AND tenant_id = ?
         AND created_at > datetime('now', '-15 minutes')`
      ).bind(email, tenantId).first<{ cnt: number }>();

      if (recentCount && recentCount.cnt >= 3) {
        throw new HTTPException(429, { message: 'Too many OTP requests. Please wait 15 minutes.' });
      }
    }

    // Exponential backoff: track failed attempts
    const failKey = `otp_fail:${tenantId}:${email}`;
    try {
      const failCount = await c.env.KV.get(failKey);
      const fails = failCount ? parseInt(failCount, 10) : 0;
      if (fails >= 5) {
        throw new HTTPException(429, { message: 'Account temporarily locked. Please try again later.' });
      }
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      // KV unavailable — skip
    }

    // Generate OTP and store
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db.$client.prepare(
      `INSERT INTO patient_otp_codes (email, otp_code, tenant_id, expires_at)
       VALUES (?, ?, ?, ?)`
    ).bind(email, otp, tenantId, expiresAt).run();

    // Ensure patient_credentials record exists
    const existingCred = await db.$client.prepare(
      'SELECT id FROM patient_credentials WHERE patient_id = ? AND tenant_id = ?'
    ).bind(patient.id, tenantId).first();

    if (!existingCred) {
      await db.$client.prepare(
        `INSERT INTO patient_credentials (patient_id, email, tenant_id, is_active)
         VALUES (?, ?, ?, 1)`
      ).bind(patient.id, email, tenantId).run();
    }

    const isDev = c.env.ENVIRONMENT === 'development';
    return c.json({
      message: 'OTP sent to your email.',
      ...(isDev && { otp, debug: 'Dev mode — OTP returned in response' }),
    });
  }
);

/**
 * POST /verify-otp — Verify OTP, track failed attempts, return 2h JWT
 */
patientPortalRoutes.post(
  '/verify-otp',
  zValidator('json', verifyOtpSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const { email, otp } = c.req.valid('json');
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      throw new HTTPException(400, { message: 'Tenant not identified' });
    }

    const otpRecord = await db.$client.prepare(
      `SELECT id, otp_code, expires_at FROM patient_otp_codes
       WHERE email = ? AND tenant_id = ? AND used = 0
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email, tenantId).first<{ id: number; otp_code: string; expires_at: string }>();

    if (!otpRecord) {
      throw new HTTPException(401, { message: 'Invalid or expired OTP' });
    }

    // D1's datetime() stores UTC but without 'Z' suffix — append it to avoid timezone ambiguity
    const expiresUtc = otpRecord.expires_at.endsWith('Z') ? otpRecord.expires_at : otpRecord.expires_at + 'Z';
    if (new Date(expiresUtc) < new Date()) {
      throw new HTTPException(401, { message: 'OTP has expired. Please request a new one.' });
    }

    if (otpRecord.otp_code !== otp) {
      // Track failed OTP attempts in KV
      const failKey = `otp_fail:${tenantId}:${email}`;
      try {
        const current = await c.env.KV.get(failKey);
        const fails = current ? parseInt(current, 10) + 1 : 1;
        await c.env.KV.put(failKey, String(fails), { expirationTtl: 1800 }); // 30 min lockout
      } catch {
        // KV unavailable
      }
      throw new HTTPException(401, { message: 'Invalid OTP' });
    }

    // Mark OTP as used
    await db.$client.prepare(
      'UPDATE patient_otp_codes SET used = 1 WHERE id = ?'
    ).bind(otpRecord.id).run();

    // Clear failed attempt counter
    try {
      await c.env.KV.delete(`otp_fail:${tenantId}:${email}`);
    } catch {
      // KV unavailable
    }

    const patient = await db.$client.prepare(
      'SELECT id, name, email, mobile, gender, blood_group, age FROM patients WHERE email = ? AND tenant_id = ?'
    ).bind(email, tenantId).first<{
      id: number; name: string; email: string; mobile: string;
      gender: string; blood_group: string; age: number;
    }>();

    if (!patient) {
      throw new HTTPException(404, { message: 'Patient not found' });
    }

    // Update last login
    await db.$client.prepare(
      `UPDATE patient_credentials SET last_login_at = datetime('now')
       WHERE patient_id = ? AND tenant_id = ?`
    ).bind(patient.id, tenantId).run();

    // Audit log
    await auditLog(c.env.DB, String(patient.id), 'login', tenantId);

    // Generate JWT — 2h expiry (shorter for security)
    const token = await generateToken(
      {
        userId: String(patient.id),
        role: 'patient',
        tenantId,
        permissions: ['portal:read'],
      },
      c.env.JWT_SECRET,
      2
    );

    return c.json({
      token,
      user: {
        id: patient.id,
        name: patient.name,
        email: patient.email,
        role: 'patient',
      },
    });
  }
);

/**
 * POST /refresh-token — Refresh patient JWT before expiry
 */
patientPortalRoutes.use('/refresh-token', patientAuthMiddleware);
patientPortalRoutes.post('/refresh-token', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');

  const patient = await db.$client.prepare(
    'SELECT id, name, email FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first<{ id: number; name: string; email: string }>();

  if (!patient) {
    throw new HTTPException(404, { message: 'Patient not found' });
  }

  if (!tenantId) {
    throw new HTTPException(400, { message: 'Tenant not identified' });
  }

  const token = await generateToken(
    {
      userId: String(patient.id),
      role: 'patient',
      tenantId,
      permissions: ['portal:read'],
    },
    c.env.JWT_SECRET,
    2
  );

  return c.json({ token });
});

// ==========================================================================
// PROTECTED PORTAL ROUTES (require patient JWT)
// ==========================================================================

patientPortalRoutes.use('/me', patientAuthMiddleware);
patientPortalRoutes.use('/dashboard', patientAuthMiddleware);
patientPortalRoutes.use('/appointments', patientAuthMiddleware);
patientPortalRoutes.use('/available-doctors', patientAuthMiddleware);
patientPortalRoutes.use('/available-slots/*', patientAuthMiddleware);
patientPortalRoutes.use('/book-appointment', patientAuthMiddleware);
patientPortalRoutes.use('/cancel-appointment/*', patientAuthMiddleware);
patientPortalRoutes.use('/prescriptions', patientAuthMiddleware);
patientPortalRoutes.use('/prescriptions/*', patientAuthMiddleware);
patientPortalRoutes.use('/lab-results', patientAuthMiddleware);
patientPortalRoutes.use('/bills', patientAuthMiddleware);
patientPortalRoutes.use('/vitals', patientAuthMiddleware);
patientPortalRoutes.use('/visits', patientAuthMiddleware);
patientPortalRoutes.use('/messages', patientAuthMiddleware);
patientPortalRoutes.use('/messages/*', patientAuthMiddleware);
patientPortalRoutes.use('/refill-requests', patientAuthMiddleware);
patientPortalRoutes.use('/timeline', patientAuthMiddleware);
patientPortalRoutes.use('/family', patientAuthMiddleware);
patientPortalRoutes.use('/family/*', patientAuthMiddleware);

// ─── Profile ────────────────────────────────────────────────────────────

/**
 * GET /me — Patient profile
 */
patientPortalRoutes.get('/me', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');

  const patient = await db.$client.prepare(
    `SELECT id, name, patient_code, email, mobile, guardian_mobile,
            father_husband, age, gender, blood_group, address, date_of_birth,
            created_at
     FROM patients WHERE id = ? AND tenant_id = ?`
  ).bind(patientId, tenantId).first();

  if (!patient) {
    throw new HTTPException(404, { message: 'Patient not found' });
  }

  await auditLog(c.env.DB, patientId, 'view_profile', tenantId);
  return c.json(patient);
});

const updateProfileSchema = z.object({
  mobile: z.string().min(1).max(20).optional(),
  guardian_mobile: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  email: z.string().email().optional(),
});

/**
 * PATCH /me — Update profile (limited fields)
 */
patientPortalRoutes.patch(
  '/me',
  zValidator('json', updateProfileSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const patientId = c.get('patientId');
    const tenantId = c.get('tenantId');
    const data = c.req.valid('json');

    const sets: string[] = [];
    const values: (string | number | undefined)[] = [];

    if (data.mobile !== undefined) { sets.push('mobile = ?'); values.push(data.mobile); }
    if (data.guardian_mobile !== undefined) { sets.push('guardian_mobile = ?'); values.push(data.guardian_mobile); }
    if (data.address !== undefined) { sets.push('address = ?'); values.push(data.address); }
    if (data.email !== undefined) { sets.push('email = ?'); values.push(data.email); }

    if (sets.length === 0) {
      throw new HTTPException(400, { message: 'No fields to update' });
    }

    sets.push("updated_at = datetime('now')");
    values.push(patientId, tenantId);

    await db.$client.prepare(
      `UPDATE patients SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
    ).bind(...values).run();

    await auditLog(c.env.DB, patientId, 'edit_profile', tenantId);
    return c.json({ message: 'Profile updated successfully' });
  }
);

// ─── Dashboard ──────────────────────────────────────────────────────────

/**
 * GET /dashboard — Aggregated summary
 */
patientPortalRoutes.get('/dashboard', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');

  const nextAppointment = await db.$client.prepare(
    `SELECT a.*, d.name as doctor_name
     FROM appointments a
     LEFT JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = ? AND a.tenant_id = ?
       AND a.status = 'scheduled' AND a.appt_date >= date('now')
     ORDER BY a.appt_date ASC, a.appt_time ASC
     LIMIT 1`
  ).bind(patientId, tenantId).first();

  const latestLabResult = await db.$client.prepare(
    `SELECT lo.id, lo.order_no, lo.created_at, lo.status,
            GROUP_CONCAT(ltc.name, ', ') as test_names
     FROM lab_orders lo
     JOIN lab_order_items loi ON loi.lab_order_id = lo.id
     LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
     WHERE lo.patient_id = ? AND lo.tenant_id = ?
     GROUP BY lo.id
     ORDER BY lo.created_at DESC LIMIT 1`
  ).bind(patientId, tenantId).first();

  const rxCount = await db.$client.prepare(
    `SELECT COUNT(*) as cnt FROM prescriptions
     WHERE patient_id = ? AND tenant_id = ? AND status = 'final'`
  ).bind(patientId, tenantId).first<{ cnt: number }>();

  const balance = await db.$client.prepare(
    `SELECT COALESCE(SUM(total - paid), 0) as total_due,
            COALESCE(SUM(paid), 0) as total_paid,
            COALESCE(SUM(total), 0) as total_billed
     FROM bills WHERE patient_id = ? AND tenant_id = ?`
  ).bind(patientId, tenantId).first<{ total_due: number; total_paid: number; total_billed: number }>();

  const visitCount = await db.$client.prepare(
    `SELECT COUNT(*) as cnt FROM appointments
     WHERE patient_id = ? AND tenant_id = ? AND status = 'completed'`
  ).bind(patientId, tenantId).first<{ cnt: number }>();

  await auditLog(c.env.DB, patientId, 'view_dashboard', tenantId);

  return c.json({
    nextAppointment,
    latestLabResult,
    activePrescriptions: rxCount?.cnt ?? 0,
    billing: {
      totalDue: balance?.total_due ?? 0,
      totalPaid: balance?.total_paid ?? 0,
      totalBilled: balance?.total_billed ?? 0,
    },
    totalVisits: visitCount?.cnt ?? 0,
  });
});

// ─── Appointments (paginated) ───────────────────────────────────────────

patientPortalRoutes.get('/appointments', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    'SELECT COUNT(*) as total FROM appointments WHERE patient_id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT a.id, a.appt_no, a.token_no, a.appt_date, a.appt_time,
            a.visit_type, a.status, a.chief_complaint, a.fee,
            d.name as doctor_name, d.specialty as doctor_specialization
     FROM appointments a
     LEFT JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = ? AND a.tenant_id = ?
     ORDER BY a.appt_date DESC, a.appt_time DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  await auditLog(c.env.DB, patientId, 'view_appointments', tenantId);
  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

// ─── Prescriptions (paginated) ──────────────────────────────────────────

patientPortalRoutes.get('/prescriptions', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    `SELECT COUNT(*) as total FROM prescriptions WHERE patient_id = ? AND tenant_id = ? AND status = 'final'`
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT p.id, p.rx_no, p.diagnosis, p.chief_complaint, p.advice,
            p.follow_up_date, p.bp, p.temperature, p.weight, p.spo2,
            p.created_at, p.status,
            d.name as doctor_name, d.specialty as doctor_specialization
     FROM prescriptions p
     LEFT JOIN doctors d ON d.id = p.doctor_id
     WHERE p.patient_id = ? AND p.tenant_id = ? AND p.status = 'final'
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  await auditLog(c.env.DB, patientId, 'view_prescriptions', tenantId);
  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

/**
 * GET /prescriptions/:id/items — Prescription medicine items
 */
patientPortalRoutes.get('/prescriptions/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const prescriptionId = c.req.param('id');

  const rx = await db.$client.prepare(
    `SELECT id FROM prescriptions
     WHERE id = ? AND patient_id = ? AND tenant_id = ?`
  ).bind(prescriptionId, patientId, tenantId).first();

  if (!rx) {
    throw new HTTPException(404, { message: 'Prescription not found' });
  }

  const { results } = await db.$client.prepare(
    `SELECT pi.id, pi.medicine_name, pi.dosage, pi.frequency, pi.duration, pi.instructions, pi.sort_order
     FROM prescription_items pi
     JOIN prescriptions p ON pi.prescription_id = p.id AND p.tenant_id = ?
     WHERE pi.prescription_id = ? ORDER BY pi.sort_order`
  ).bind(tenantId, prescriptionId).all();

  return c.json({ items: results ?? [] });
});

// ─── Lab Results (paginated + explanations) ─────────────────────────────

patientPortalRoutes.get('/lab-results', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    `SELECT COUNT(*) as total FROM lab_orders lo
     JOIN lab_order_items loi ON loi.lab_order_id = lo.id
     WHERE lo.patient_id = ? AND lo.tenant_id = ?`
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT lo.id, lo.order_no, lo.created_at, lo.status,
            ltc.name as test_name, loi.result, loi.result_numeric, loi.abnormal_flag,
            loi.sample_status,
            ltc.unit, ltc.normal_range
     FROM lab_orders lo
     JOIN lab_order_items loi ON loi.lab_order_id = lo.id
     LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
     WHERE lo.patient_id = ? AND lo.tenant_id = ?
     ORDER BY lo.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  // Enrich with patient-friendly explanations
  const enriched = (results ?? []).map((row: any) => {
    const { severity, explanation } = labExplanation(row.abnormal_flag, row.test_name);
    return { ...row, severity, explanation };
  });

  await auditLog(c.env.DB, patientId, 'view_lab_results', tenantId);
  return c.json(paginatedResponse(enriched, countResult?.total ?? 0, page, limit));
});

// ─── Bills (paginated) ──────────────────────────────────────────────────

patientPortalRoutes.get('/bills', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    'SELECT COUNT(*) as total FROM bills WHERE patient_id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT id, invoice_no, total, paid,
            (total - paid) as due, discount, status,
            created_at
     FROM bills WHERE patient_id = ? AND tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  await auditLog(c.env.DB, patientId, 'view_bills', tenantId);
  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

// ─── Vitals (paginated) ─────────────────────────────────────────────────

patientPortalRoutes.get('/vitals', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    'SELECT COUNT(*) as total FROM patient_vitals WHERE patient_id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT id, systolic, diastolic, temperature, heart_rate, spo2,
            respiratory_rate, weight, notes, recorded_at
     FROM patient_vitals
     WHERE patient_id = ? AND tenant_id = ?
     ORDER BY recorded_at DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  await auditLog(c.env.DB, patientId, 'view_vitals', tenantId);
  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

// ─── Visits (paginated) ─────────────────────────────────────────────────

patientPortalRoutes.get('/visits', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    'SELECT COUNT(*) as total FROM visits WHERE patient_id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT v.id, v.created_at as visit_date, v.visit_type, v.visit_no,
            v.notes,
            d.name as doctor_name
     FROM visits v
     LEFT JOIN doctors d ON d.id = v.doctor_id
     WHERE v.patient_id = ? AND v.tenant_id = ?
     ORDER BY v.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  await auditLog(c.env.DB, patientId, 'view_visits', tenantId);
  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

// ─── Available Doctors ──────────────────────────────────────────────────

/**
 * GET /available-doctors — List active doctors with specialties & fees
 */
patientPortalRoutes.get('/available-doctors', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = c.get('tenantId');

  const { results } = await db.$client.prepare(
    `SELECT id, name, specialty, consultation_fee
     FROM doctors
     WHERE tenant_id = ? AND is_active = 1
     ORDER BY name ASC`
  ).bind(tenantId).all();

  return c.json({ doctors: results ?? [] });
});

/**
 * GET /available-slots/:doctorId?date=YYYY-MM-DD — Show booked slots for a doctor on a date
 */
patientPortalRoutes.get('/available-slots/:doctorId', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = c.get('tenantId');
  const doctorId = c.req.param('doctorId');
  const date = c.req.query('date');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HTTPException(400, { message: 'Valid date required (YYYY-MM-DD)' });
  }

  // Get booked slots count
  const countResult = await db.$client.prepare(
    `SELECT COUNT(*) as booked_count
     FROM appointments
     WHERE doctor_id = ? AND tenant_id = ? AND appt_date = ? AND status != 'cancelled'`
  ).bind(doctorId, tenantId, date).first<{ booked_count: number }>();

  // Get already booked times
  const { results: bookedSlots } = await db.$client.prepare(
    `SELECT appt_time, token_no FROM appointments
     WHERE doctor_id = ? AND tenant_id = ? AND appt_date = ? AND status != 'cancelled'
     ORDER BY token_no ASC`
  ).bind(doctorId, tenantId, date).all();

  return c.json({
    doctorId: Number(doctorId),
    date,
    bookedCount: countResult?.booked_count ?? 0,
    bookedSlots: bookedSlots ?? [],
  });
});

// ─── Appointment Booking ────────────────────────────────────────────────

const bookAppointmentSchema = z.object({
  doctorId: z.number().int().positive(),
  apptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  apptTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  visitType: z.enum(['opd', 'followup']).default('opd'),
  chiefComplaint: z.string().max(500).optional(),
});

/**
 * POST /book-appointment — Patient self-books an appointment
 */
patientPortalRoutes.post(
  '/book-appointment',
  zValidator('json', bookAppointmentSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const patientId = c.get('patientId');
    const tenantId = c.get('tenantId');
    const data = c.req.valid('json');

    if (!tenantId) {
      throw new HTTPException(400, { message: 'Tenant not identified' });
    }

    // Verify doctor exists and is active
    const doctor = await db.$client.prepare(
      'SELECT id, name, consultation_fee FROM doctors WHERE id = ? AND tenant_id = ? AND is_active = 1'
    ).bind(data.doctorId, tenantId).first<{ id: number; name: string; consultation_fee: number }>();

    if (!doctor) {
      throw new HTTPException(404, { message: 'Doctor not found or unavailable' });
    }

    // Prevent booking in the past
    const today = new Date().toISOString().split('T')[0];
    if (data.apptDate < today) {
      throw new HTTPException(400, { message: 'Cannot book appointments in the past' });
    }

    // Check for duplicate booking (same patient + doctor + date)
    const existing = await db.$client.prepare(
      `SELECT id FROM appointments
       WHERE patient_id = ? AND doctor_id = ? AND appt_date = ? AND tenant_id = ?
         AND status != 'cancelled'`
    ).bind(patientId, data.doctorId, data.apptDate, tenantId).first();

    if (existing) {
      throw new HTTPException(409, { message: 'You already have an appointment with this doctor on this date' });
    }

    // Book with token generation + retry for concurrency
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tokenRow = await db.$client.prepare(
          `SELECT COALESCE(MAX(token_no), 0) + 1 AS next_token
           FROM appointments
           WHERE tenant_id = ? AND appt_date = ? AND doctor_id = ?`
        ).bind(tenantId, data.apptDate, data.doctorId).first<{ next_token: number }>();

        const tokenNo = tokenRow?.next_token ?? 1;
        const apptNo = await getNextSequence(c.env.DB, tenantId, 'appointment', 'APT');

        const result = await db.$client.prepare(
          `INSERT INTO appointments
            (appt_no, token_no, patient_id, doctor_id, appt_date, appt_time,
             visit_type, status, chief_complaint, fee, created_by, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`
        ).bind(
          apptNo,
          tokenNo,
          patientId,
          data.doctorId,
          data.apptDate,
          data.apptTime ?? null,
          data.visitType,
          data.chiefComplaint ?? null,
          doctor.consultation_fee,
          patientId,
          tenantId,
        ).run();

        await auditLog(c.env.DB, patientId, 'book_appointment', tenantId);

        return c.json({
          message: 'Appointment booked successfully',
          appointment: {
            id: result.meta.last_row_id,
            apptNo,
            tokenNo,
            doctorName: doctor.name,
            date: data.apptDate,
            time: data.apptTime,
            fee: doctor.consultation_fee,
          },
        }, 201);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('UNIQUE constraint') && attempt < maxRetries - 1) continue;
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(500, { message: 'Failed to book appointment' });
      }
    }
    throw new HTTPException(500, { message: 'Failed to book appointment after retries' });
  }
);

/**
 * POST /cancel-appointment/:id — Patient cancels their own scheduled appointment
 */
patientPortalRoutes.post('/cancel-appointment/:id', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const appointmentId = c.req.param('id');

  const appt = await db.$client.prepare(
    `SELECT id, status, appt_date FROM appointments
     WHERE id = ? AND patient_id = ? AND tenant_id = ?`
  ).bind(appointmentId, patientId, tenantId).first<{ id: number; status: string; appt_date: string }>();

  if (!appt) {
    throw new HTTPException(404, { message: 'Appointment not found' });
  }

  if (appt.status !== 'scheduled') {
    throw new HTTPException(400, { message: `Cannot cancel appointment with status '${appt.status}'` });
  }

  await db.$client.prepare(
    `UPDATE appointments SET status = 'cancelled', updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ?`
  ).bind(appointmentId, tenantId).run();

  await auditLog(c.env.DB, patientId, 'cancel_appointment', tenantId);
  return c.json({ message: 'Appointment cancelled successfully' });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 3: ADVANCED FEATURES
// ═══════════════════════════════════════════════════════════════════════════

// ─── Secure Messaging ───────────────────────────────────────────────────

/**
 * GET /messages — List conversations (grouped by doctor)
 */
patientPortalRoutes.get('/messages', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');

  const { results } = await db.$client.prepare(
    `SELECT d.id as doctor_id, d.name as doctor_name, d.specialty,
            MAX(pm.created_at) as last_message_at,
            SUM(CASE WHEN pm.is_read = 0 AND pm.sender_type = 'doctor' THEN 1 ELSE 0 END) as unread_count,
            (SELECT message FROM patient_messages pm2
             WHERE pm2.patient_id = pm.patient_id AND pm2.doctor_id = pm.doctor_id AND pm2.tenant_id = pm.tenant_id
             ORDER BY pm2.created_at DESC LIMIT 1) as last_message
     FROM patient_messages pm
     JOIN doctors d ON d.id = pm.doctor_id
     WHERE pm.patient_id = ? AND pm.tenant_id = ?
     GROUP BY pm.doctor_id
     ORDER BY last_message_at DESC`
  ).bind(patientId, tenantId).all();

  await auditLog(c.env.DB, patientId, 'view_messages', tenantId);
  return c.json({ conversations: results ?? [] });
});

/**
 * GET /messages/:doctorId — Get message thread with a doctor
 */
patientPortalRoutes.get('/messages/:doctorId', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const doctorId = Number(c.req.param('doctorId'));
  if (!Number.isFinite(doctorId) || doctorId < 1) {
    throw new HTTPException(400, { message: 'Invalid doctor ID' });
  }
  const { page, limit, offset } = parsePagination(c);

  // Mark unread messages from doctor as read
  await db.$client.prepare(
    `UPDATE patient_messages SET is_read = 1
     WHERE patient_id = ? AND doctor_id = ? AND tenant_id = ? AND sender_type = 'doctor' AND is_read = 0`
  ).bind(patientId, doctorId, tenantId).run();

  const countResult = await db.$client.prepare(
    'SELECT COUNT(*) as total FROM patient_messages WHERE patient_id = ? AND doctor_id = ? AND tenant_id = ?'
  ).bind(patientId, doctorId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT id, sender_type, message, is_read, created_at
     FROM patient_messages
     WHERE patient_id = ? AND doctor_id = ? AND tenant_id = ?
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`
  ).bind(patientId, doctorId, tenantId, limit, offset).all();

  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

const sendMessageSchema = z.object({
  doctorId: z.number().int().positive(),
  message: z.string().min(1).max(2000),
});

/**
 * POST /messages — Send a message to a doctor
 */
patientPortalRoutes.post(
  '/messages',
  zValidator('json', sendMessageSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const patientId = c.get('patientId');
    const tenantId = c.get('tenantId');
    const { doctorId, message } = c.req.valid('json');

    // Verify doctor exists
    const doctor = await db.$client.prepare(
      'SELECT id FROM doctors WHERE id = ? AND tenant_id = ? AND is_active = 1'
    ).bind(doctorId, tenantId).first();

    if (!doctor) {
      throw new HTTPException(404, { message: 'Doctor not found' });
    }

    // Rate limit: max 1 message per 30 seconds
    const lastMsg = await db.$client.prepare(
      `SELECT created_at FROM patient_messages
       WHERE patient_id = ? AND doctor_id = ? AND tenant_id = ? AND sender_type = 'patient'
       ORDER BY created_at DESC LIMIT 1`
    ).bind(patientId, doctorId, tenantId).first<{ created_at: string }>();

    if (lastMsg) {
      const elapsed = Date.now() - new Date(lastMsg.created_at + 'Z').getTime();
      if (elapsed < 30_000) {
        throw new HTTPException(429, { message: 'Please wait before sending another message' });
      }
    }

    await db.$client.prepare(
      `INSERT INTO patient_messages (patient_id, doctor_id, sender_type, message, tenant_id)
       VALUES (?, ?, 'patient', ?, ?)`
    ).bind(patientId, doctorId, message, tenantId).run();

    await auditLog(c.env.DB, patientId, 'send_message', tenantId);
    return c.json({ message: 'Message sent' }, 201);
  }
);

// ─── Prescription Refill Requests ───────────────────────────────────────

/**
 * POST /prescriptions/:id/refill — Request a refill
 */
patientPortalRoutes.post('/prescriptions/:id/refill', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const prescriptionId = c.req.param('id');

  // Verify prescription belongs to patient
  const rx = await db.$client.prepare(
    `SELECT id FROM prescriptions WHERE id = ? AND patient_id = ? AND tenant_id = ? AND status = 'final'`
  ).bind(prescriptionId, patientId, tenantId).first();

  if (!rx) {
    throw new HTTPException(404, { message: 'Prescription not found' });
  }

  // Check for existing pending refill
  const existing = await db.$client.prepare(
    `SELECT id FROM prescription_refill_requests
     WHERE prescription_id = ? AND patient_id = ? AND tenant_id = ? AND status = 'pending'`
  ).bind(prescriptionId, patientId, tenantId).first();

  if (existing) {
    throw new HTTPException(409, { message: 'A refill request is already pending for this prescription' });
  }

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

  await db.$client.prepare(
    `INSERT INTO prescription_refill_requests (prescription_id, patient_id, notes, tenant_id)
     VALUES (?, ?, ?, ?)`
  ).bind(prescriptionId, patientId, notes, tenantId).run();

  await auditLog(c.env.DB, patientId, 'request_refill', tenantId);
  return c.json({ message: 'Refill request submitted' }, 201);
});

/**
 * GET /refill-requests — List patient's refill requests
 */
patientPortalRoutes.get('/refill-requests', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  const countResult = await db.$client.prepare(
    'SELECT COUNT(*) as total FROM prescription_refill_requests WHERE patient_id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT rr.id, rr.status, rr.notes, rr.response_notes, rr.created_at, rr.responded_at,
            p.rx_no, p.diagnosis,
            d.name as doctor_name
     FROM prescription_refill_requests rr
     JOIN prescriptions p ON p.id = rr.prescription_id
     LEFT JOIN doctors d ON d.id = p.doctor_id
     WHERE rr.patient_id = ? AND rr.tenant_id = ?
     ORDER BY rr.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(patientId, tenantId, limit, offset).all();

  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

// ─── Health Timeline ────────────────────────────────────────────────────

/**
 * GET /timeline — Unified chronological health timeline
 */
patientPortalRoutes.get('/timeline', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const { page, limit, offset } = parsePagination(c);

  // UNION ALL query to combine all health events
  const countResult = await db.$client.prepare(
    `SELECT (
      (SELECT COUNT(*) FROM appointments WHERE patient_id = ? AND tenant_id = ?) +
      (SELECT COUNT(*) FROM prescriptions WHERE patient_id = ? AND tenant_id = ? AND status = 'final') +
      (SELECT COUNT(*) FROM lab_orders WHERE patient_id = ? AND tenant_id = ?) +
      (SELECT COUNT(*) FROM bills WHERE patient_id = ? AND tenant_id = ?)
    ) as total`
  ).bind(patientId, tenantId, patientId, tenantId, patientId, tenantId, patientId, tenantId)
    .first<{ total: number }>();

  const { results } = await db.$client.prepare(
    `SELECT * FROM (
      SELECT 'appointment' as event_type, a.id, a.appt_date as event_date,
             'Appointment with ' || COALESCE(d.name, 'Doctor') as title,
             a.status as detail, a.chief_complaint as description, '📅' as icon
      FROM appointments a LEFT JOIN doctors d ON d.id = a.doctor_id
      WHERE a.patient_id = ? AND a.tenant_id = ?

      UNION ALL

      SELECT 'prescription' as event_type, p.id, p.created_at as event_date,
             'Prescription #' || p.rx_no as title,
             p.diagnosis as detail, p.advice as description, '💊' as icon
      FROM prescriptions p
      WHERE p.patient_id = ? AND p.tenant_id = ? AND p.status = 'final'

      UNION ALL

      SELECT 'lab_order' as event_type, lo.id, lo.created_at as event_date,
             'Lab Order #' || lo.order_no as title,
             lo.status as detail, GROUP_CONCAT(COALESCE(ltc.name, 'Test #' || loi.lab_test_id), ', ') as description, '🧪' as icon
      FROM lab_orders lo
      JOIN lab_order_items loi ON loi.lab_order_id = lo.id
      LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
      WHERE lo.patient_id = ? AND lo.tenant_id = ?
      GROUP BY lo.id

      UNION ALL

      SELECT 'bill' as event_type, b.id, b.created_at as event_date,
             'Bill #' || COALESCE(b.invoice_no, b.id) as title,
             CASE WHEN b.due > 0 THEN 'Due: ৳' || b.due ELSE 'Paid' END as detail,
             'Total: ৳' || COALESCE(b.total_amount, b.total, 0) as description, '💰' as icon
      FROM bills b
      WHERE b.patient_id = ? AND b.tenant_id = ?
    ) timeline
    ORDER BY event_date DESC
    LIMIT ? OFFSET ?`
  ).bind(
    patientId, tenantId,
    patientId, tenantId,
    patientId, tenantId,
    patientId, tenantId,
    limit, offset,
  ).all();

  await auditLog(c.env.DB, patientId, 'view_timeline', tenantId);
  return c.json(paginatedResponse(results ?? [], countResult?.total ?? 0, page, limit));
});

// ─── Family Members ─────────────────────────────────────────────────────

/**
 * GET /family — List linked family members
 */
patientPortalRoutes.get('/family', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');

  const { results } = await db.$client.prepare(
    `SELECT fl.id as link_id, fl.relationship, fl.child_patient_id,
            p.name, p.patient_code, p.age, p.gender, p.blood_group
     FROM patient_family_links fl
     JOIN patients p ON p.id = fl.child_patient_id
     WHERE fl.parent_patient_id = ? AND fl.tenant_id = ?
     ORDER BY p.name ASC`
  ).bind(patientId, tenantId).all();

  return c.json({ familyMembers: results ?? [] });
});

const linkFamilySchema = z.object({
  patientCode: z.string().min(1),
  relationship: z.enum(['spouse', 'child', 'parent', 'sibling', 'other']),
});

/**
 * POST /family — Link a family member by patient code
 */
patientPortalRoutes.post(
  '/family',
  zValidator('json', linkFamilySchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const patientId = c.get('patientId');
    const tenantId = c.get('tenantId');
    const { patientCode, relationship } = c.req.valid('json');

    const member = await db.$client.prepare(
      'SELECT id, name FROM patients WHERE patient_code = ? AND tenant_id = ?'
    ).bind(patientCode, tenantId).first<{ id: number; name: string }>();

    if (!member) {
      throw new HTTPException(404, { message: 'Patient not found with this code' });
    }

    if (String(member.id) === patientId) {
      throw new HTTPException(400, { message: 'Cannot link yourself' });
    }

    try {
      await db.$client.prepare(
        `INSERT INTO patient_family_links (parent_patient_id, child_patient_id, relationship, tenant_id)
         VALUES (?, ?, ?, ?)`
      ).bind(patientId, member.id, relationship, tenantId).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE constraint')) {
        throw new HTTPException(409, { message: 'This family member is already linked' });
      }
      throw err;
    }

    await auditLog(c.env.DB, patientId, 'link_family_member', tenantId);
    // Mask name to prevent info enumeration (first char + asterisks)
    const masked = member.name.charAt(0) + '***';
    return c.json({ message: `${masked} linked as ${relationship}` }, 201);
  }
);

/**
 * DELETE /family/:linkId — Unlink a family member
 */
patientPortalRoutes.delete('/family/:linkId', async (c) => {
  const db = getDb(c.env.DB);
  const patientId = c.get('patientId');
  const tenantId = c.get('tenantId');
  const linkId = Number(c.req.param('linkId'));
  if (!Number.isFinite(linkId) || linkId < 1) {
    throw new HTTPException(400, { message: 'Invalid link ID' });
  }

  const link = await db.$client.prepare(
    'SELECT id FROM patient_family_links WHERE id = ? AND parent_patient_id = ? AND tenant_id = ?'
  ).bind(linkId, patientId, tenantId).first();

  if (!link) {
    throw new HTTPException(404, { message: 'Family link not found' });
  }

  await db.$client.prepare(
    'DELETE FROM patient_family_links WHERE id = ? AND tenant_id = ?'
  ).bind(linkId, tenantId).run();

  await auditLog(c.env.DB, patientId, 'unlink_family_member', tenantId);
  return c.json({ message: 'Family member unlinked' });
});

export default patientPortalRoutes;
