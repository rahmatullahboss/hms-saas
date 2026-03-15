import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';

const insurance = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── SCHEMES ─────────────────────────────────────────────────────────────────

insurance.get('/schemes', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM insurance_schemes WHERE tenant_id = ? AND is_active = 1 ORDER BY scheme_name'
  ).bind(tenantId).all();
  return c.json({ schemes: results });
});

insurance.post('/schemes', zValidator('json', z.object({
  scheme_name: z.string().min(1), scheme_code: z.string().optional(),
  scheme_type: z.enum(['insurance', 'government', 'corporate']).default('insurance'), contact: z.string().optional(),
})), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO insurance_schemes (tenant_id, scheme_name, scheme_code, scheme_type, contact) VALUES (?, ?, ?, ?, ?)'
  ).bind(tenantId, data.scheme_name, data.scheme_code || null, data.scheme_type, data.contact || null).run();
  return c.json({ id: result.meta.last_row_id, message: 'Scheme created' }, 201);
});

// ─── PATIENT INSURANCE ───────────────────────────────────────────────────────

insurance.get('/patients', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const patientId = c.req.query('patient_id');
  let sql = `
    SELECT pi.*, p.name as patient_name, p.patient_code, s.scheme_name
    FROM patient_insurance pi
    JOIN patients p ON pi.patient_id = p.id AND p.tenant_id = pi.tenant_id
    JOIN insurance_schemes s ON pi.scheme_id = s.id
    WHERE pi.tenant_id = ? AND pi.is_active = 1
  `;
  const params: (string | number)[] = [tenantId];
  if (patientId) { sql += ' AND pi.patient_id = ?'; params.push(patientId); }
  sql += ' ORDER BY pi.created_at DESC';
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ insurance_records: results });
});

insurance.post('/patients', zValidator('json', z.object({
  patient_id: z.number().int().positive(), scheme_id: z.number().int().positive(),
  policy_no: z.string().optional(), member_id: z.string().optional(),
  valid_from: z.string().optional(), valid_to: z.string().optional(), credit_limit: z.number().min(0).default(0),
})), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(`
    INSERT INTO patient_insurance (tenant_id, patient_id, scheme_id, policy_no, member_id, valid_from, valid_to, credit_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, data.patient_id, data.scheme_id, data.policy_no || null, data.member_id || null,
    data.valid_from || null, data.valid_to || null, data.credit_limit).run();
  return c.json({ id: result.meta.last_row_id, message: 'Insurance record created' }, 201);
});

// ─── CLAIMS ──────────────────────────────────────────────────────────────────

insurance.get('/claims', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const status = c.req.query('status');
  let sql = `
    SELECT ic.*, p.name as patient_name, p.patient_code
    FROM insurance_claims ic
    JOIN patients p ON ic.patient_id = p.id AND p.tenant_id = ?
    WHERE ic.tenant_id = ?
  `;
  const params: (string | number)[] = [tenantId, tenantId];
  if (status) { sql += ' AND ic.status = ?'; params.push(status); }
  sql += ' ORDER BY ic.submitted_at DESC LIMIT 100';
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ claims: results });
});

insurance.post('/claims', zValidator('json', z.object({
  patient_id: z.number().int().positive(),
  policy_id: z.number().int().positive().optional(),
  bill_id: z.number().int().positive().optional(),
  claim_no: z.string().optional(),
  diagnosis: z.string().optional(),
  icd10_code: z.string().optional(),
  bill_amount: z.number().min(0),
  claimed_amount: z.number().min(0),
  remarks: z.string().optional(),
})), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const userId = Number(c.get('userId'));
  const data = c.req.valid('json');
  const claimNo = data.claim_no || `CLM-${Date.now()}`;
  const result = await c.env.DB.prepare(`
    INSERT INTO insurance_claims (tenant_id, claim_no, patient_id, policy_id, bill_id, diagnosis, icd10_code, bill_amount, claimed_amount, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
  `).bind(tenantId, claimNo, data.patient_id, data.policy_id || null, data.bill_id || null,
    data.diagnosis || null, data.icd10_code || null, data.bill_amount, data.claimed_amount, userId).run();
  return c.json({ id: result.meta.last_row_id, claim_no: claimNo, message: 'Claim submitted' }, 201);
});

insurance.put('/claims/:id/status', zValidator('json', z.object({
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected', 'settled']),
  approved_amount: z.number().min(0).optional(),
  rejection_reason: z.string().optional(),
  reviewer_notes: z.string().optional(),
})), async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  const sets: string[] = ['status = ?', "updated_at = datetime('now')"];
  const vals: (string | number | null)[] = [data.status];
  if (data.approved_amount !== undefined) { sets.push('approved_amount = ?'); vals.push(data.approved_amount); }
  if (data.rejection_reason !== undefined) { sets.push('rejection_reason = ?'); vals.push(data.rejection_reason); }
  if (data.reviewer_notes !== undefined) { sets.push('reviewer_notes = ?'); vals.push(data.reviewer_notes); }
  if (data.status === 'approved' || data.status === 'rejected') { sets.push("reviewed_at = datetime('now')"); }
  if (data.status === 'settled') { sets.push("settled_at = datetime('now')"); }
  vals.push(id, tenantId);

  await c.env.DB.prepare(`UPDATE insurance_claims SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ message: `Claim status updated to ${data.status}` });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────

insurance.get('/reports/summary', async (c) => {
  const tenantId = Number(c.get('tenantId'));
  const { results } = await c.env.DB.prepare(`
    SELECT ic.status,
      COUNT(*) as claim_count,
      COALESCE(SUM(ic.claimed_amount), 0) as total_claimed,
      COALESCE(SUM(ic.approved_amount), 0) as total_approved
    FROM insurance_claims ic
    WHERE ic.tenant_id = ?
    GROUP BY ic.status ORDER BY ic.status
  `).bind(tenantId).all();
  return c.json({ report: results });
});

export default insurance;
