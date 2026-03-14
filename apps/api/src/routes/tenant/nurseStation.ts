import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, Variables } from '../../types';

const nurseStation = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const recordVitalsSchema = z.object({
  patient_id: z.number().int().positive(),
  admission_id: z.number().int().positive().optional(),
  systolic: z.number().int().min(50).max(300).optional(),
  diastolic: z.number().int().min(20).max(200).optional(),
  temperature: z.number().min(30).max(110).optional(), // accepts both Celsius (30-45) and Fahrenheit (86-110)
  heart_rate: z.number().int().min(20).max(250).optional(),
  spo2: z.number().int().min(50).max(100).optional(),
  respiratory_rate: z.number().int().min(5).max(60).optional(),
  weight: z.number().min(0.5).max(500).optional(),
  notes: z.string().optional(),
});

// ─── GET /api/nurse-station/dashboard ─────────────────────────────────────────

nurseStation.get('/dashboard', async (c) => {
  const tenantId = Number(c.get('tenantId'));

  try {
    // Get active admissions with latest vitals
    let patients: Record<string, unknown>[] = [];
    try {
      const result = await c.env.DB.prepare(`
        SELECT a.id as admission_id, a.admission_no, a.patient_id, a.provisional_diagnosis,
               a.status as admission_status, a.admission_date,
               p.name as patient_name, p.patient_code,
               b.ward_name, b.bed_number,
               s.name as doctor_name
        FROM admissions a
        JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
        LEFT JOIN beds b ON b.id = a.bed_id AND b.tenant_id = a.tenant_id
        LEFT JOIN staff s ON s.id = a.doctor_id AND s.tenant_id = a.tenant_id
        WHERE a.tenant_id = ? AND a.status IN ('admitted', 'critical')
        ORDER BY CASE a.status WHEN 'critical' THEN 0 ELSE 1 END, a.admission_date DESC
        LIMIT 50
      `).bind(tenantId).all();
      patients = result.results;
    } catch (err) {
      // admissions table may not exist or have different schema
      console.error('[nurse-station] Admissions query failed:', err);
    }

    // Get latest vitals for each patient (separate try-catch so dashboard still works if vitals table missing)
    const patientIds = patients.map((p: Record<string, unknown>) => p.patient_id);
    let vitalsMap: Record<number, Record<string, unknown>> = {};

    if (patientIds.length > 0) {
      try {
        const placeholders = patientIds.map(() => '?').join(',');
        const { results: vitals } = await c.env.DB.prepare(`
          SELECT v.* FROM patient_vitals v
          INNER JOIN (
            SELECT patient_id, MAX(recorded_at) as max_at
            FROM patient_vitals WHERE tenant_id = ? AND patient_id IN (${placeholders})
            GROUP BY patient_id
          ) latest ON v.patient_id = latest.patient_id AND v.recorded_at = latest.max_at
          WHERE v.tenant_id = ?
        `).bind(tenantId, ...patientIds, tenantId).all();

        for (const v of vitals) {
          vitalsMap[v.patient_id as number] = v;
        }
      } catch (err) {
        // patient_vitals table may not exist yet
        console.error('[nurse-station] Vitals query failed (table may not exist):', err);
      }
    }

    // Stats
    const activeCount = patients.length;
    const pendingVitals = patients.filter((p: Record<string, unknown>) => !vitalsMap[p.patient_id as number]).length;

    return c.json({
      patients: patients.map((p: Record<string, unknown>) => ({
        ...p,
        latestVitals: vitalsMap[p.patient_id as number] ?? null,
      })),
      stats: {
        activePatients: activeCount,
        pendingVitals,
        roundsCompleted: activeCount - pendingVitals,
        totalRounds: activeCount,
      },
    });
  } catch (error) {
    console.error('[nurse-station] Dashboard error:', error);
    // Return empty dashboard instead of 500
    return c.json({
      patients: [],
      stats: { activePatients: 0, pendingVitals: 0, roundsCompleted: 0, totalRounds: 0 },
    });
  }
});

// ─── GET /api/nurse-station/vitals — recent vitals log ────────────────────────

nurseStation.get('/vitals', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

  const { results } = await c.env.DB.prepare(`
    SELECT v.*, p.name as patient_name, p.patient_code
    FROM patient_vitals v
    JOIN patients p ON p.id = v.patient_id AND p.tenant_id = v.tenant_id
    WHERE v.tenant_id = ?
    ORDER BY v.recorded_at DESC
    LIMIT ?
  `).bind(tenantId, limit).all();

  return c.json({ vitals: results });
});

// ─── POST /api/nurse-station/vitals — record vitals ───────────────────────────

nurseStation.post('/vitals', zValidator('json', recordVitalsSchema), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const data = c.req.valid('json');
  const userId = c.get('userId');

  // Look up the staff member's name for readable recorded_by
  let nurseName = 'Nurse';
  if (userId) {
    const staffRow = await c.env.DB.prepare(
      `SELECT name FROM staff WHERE user_id = ? AND tenant_id = ? LIMIT 1`
    ).bind(Number(userId), tenantId).first<{ name: string }>();
    if (staffRow?.name) nurseName = staffRow.name;
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO patient_vitals (tenant_id, patient_id, admission_id, systolic, diastolic, temperature, heart_rate, spo2, respiratory_rate, weight, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.patient_id, data.admission_id ?? null,
    data.systolic ?? null, data.diastolic ?? null,
    data.temperature ?? null, data.heart_rate ?? null,
    data.spo2 ?? null, data.respiratory_rate ?? null,
    data.weight ?? null, data.notes ?? null, nurseName
  ).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

// ─── GET /api/nurse-station/vitals-trends/:patientId ─────────────────────────

nurseStation.get('/vitals-trends/:patientId', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const patientId = parseInt(c.req.param('patientId'), 10);
  const days = Math.max(0, parseInt(c.req.query('days') || '30', 10));

  if (isNaN(patientId) || patientId <= 0) {
    return c.json({ error: 'Invalid patient ID' }, 400);
  }

  try {
    // Vitals history — for production, limit by days; for safety use LIMIT
    // Note: using a high LIMIT instead of date math to avoid D1 datetime comparison edge cases
    const limit = days === 0 ? 0 : Math.min(days * 24, 500); // rough cap by readings per day

    const { results: vitals } = await c.env.DB.prepare(`
      SELECT systolic, diastolic, temperature, heart_rate, spo2, respiratory_rate, weight, recorded_at
      FROM patient_vitals
      WHERE tenant_id = ? AND patient_id = ?
      ORDER BY recorded_at ${days === 0 ? 'DESC LIMIT 0' : 'ASC LIMIT ' + limit}
    `).bind(tenantId, patientId).all();

    // Alert rule thresholds for display
    const { results: thresholds } = await c.env.DB.prepare(`
      SELECT vital_type, min_value, max_value, severity
      FROM vital_alert_rules
      WHERE tenant_id = ? AND is_active = 1
      ORDER BY vital_type
    `).bind(tenantId).all();

    return c.json({ vitals, thresholds, patientId, days });
  } catch (error) {
    console.error('[nurse-station] vitals-trends error:', error);
    return c.json({ error: 'Failed to fetch vitals trends' }, 500);
  }
});

export default nurseStation;
