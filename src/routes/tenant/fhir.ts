// ═══════════════════════════════════════════════════════════════════════════════
// FHIR R4 REST Routes — Read-only facade over HMS-SaaS D1 data
// Mounted at /api/fhir
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';
import {
  toFhirPatient, toFhirPractitioner, toFhirObservations,
  toFhirMedicationRequests, toFhirEncounter, toFhirAppointment,
  toBundle, buildCapabilityStatement,
} from '../../lib/fhir/mappers';
import { buildSearchClauses, parseCount } from '../../lib/fhir/search';
import { getDb } from '../../db';


const fhirRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// FHIR JSON content type helper — returns a raw Response with application/fhir+json
function fhirResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/fhir+json' },
  });
}

// ─── GET /metadata — CapabilityStatement ─────────────────────────────────────
fhirRoutes.get('/metadata', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return fhirResponse(buildCapabilityStatement(baseUrl));
});

// ═══ PATIENT ═════════════════════════════════════════════════════════════════

fhirRoutes.get('/Patient', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const q = c.req.query();

  const { where, params } = buildSearchClauses(q, {
    name:       { column: 'name', op: 'like' },
    _id:        { column: 'id', op: 'eq' },
    identifier: { column: 'patient_code', op: 'eq' },
    phone:      { column: 'mobile', op: 'like' },
  });

  const limit = parseCount(q);
  const allWhere = ['tenant_id = ?', ...where];
  const allParams: (string | number)[] = [tenantId!, ...params];

  const sql = `SELECT * FROM patients WHERE ${allWhere.join(' AND ')} ORDER BY id DESC LIMIT ?`;
  allParams.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...allParams).all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = results.map((r) => toFhirPatient(r as any, baseUrl));
  return fhirResponse(toBundle(resources, baseUrl));
});

fhirRoutes.get('/Patient/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const id = c.req.param('id');

  const row = await db.$client.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first();
  if (!row) throw new HTTPException(404, { message: 'Patient not found' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fhirResponse(toFhirPatient(row as any, baseUrl));
});

// ═══ PRACTITIONER ════════════════════════════════════════════════════════════

fhirRoutes.get('/Practitioner', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const q = c.req.query();

  const { where, params } = buildSearchClauses(q, {
    name:      { column: 'name', op: 'like' },
    _id:       { column: 'id', op: 'eq' },
    specialty: { column: 'specialty', op: 'like' },
  });

  const limit = parseCount(q);
  const allWhere = ['tenant_id = ?', 'is_active = 1', ...where];
  const allParams: (string | number)[] = [tenantId!, ...params];

  const sql = `SELECT * FROM doctors WHERE ${allWhere.join(' AND ')} ORDER BY name LIMIT ?`;
  allParams.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...allParams).all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = results.map((r) => toFhirPractitioner(r as any, baseUrl));
  return fhirResponse(toBundle(resources, baseUrl));
});

fhirRoutes.get('/Practitioner/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const id = c.req.param('id');

  const row = await db.$client.prepare('SELECT * FROM doctors WHERE id = ? AND tenant_id = ? AND is_active = 1')
    .bind(id, tenantId).first();
  if (!row) throw new HTTPException(404, { message: 'Practitioner not found' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fhirResponse(toFhirPractitioner(row as any, baseUrl));
});

// ═══ OBSERVATION (Vitals) ════════════════════════════════════════════════════

fhirRoutes.get('/Observation', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const q = c.req.query();

  const { where, params } = buildSearchClauses(q, {
    patient: { column: 'patient_id', op: 'ref' },
    date:    { column: 'recorded_at', op: 'date' },
  });

  const limit = parseCount(q);
  const allWhere = ['tenant_id = ?', ...where];
  const allParams: (string | number)[] = [tenantId!, ...params];

  const sql = `SELECT * FROM patient_vitals WHERE ${allWhere.join(' AND ')} ORDER BY recorded_at DESC LIMIT ?`;
  allParams.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...allParams).all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = results.flatMap((r) => toFhirObservations(r as any, baseUrl));
  // _count applies to FHIR resources (each vital expands into multiple Observations)
  const sliced = resources.slice(0, limit);
  return fhirResponse(toBundle(sliced, baseUrl));
});

fhirRoutes.get('/Observation/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const rawId = c.req.param('id');

  // IDs look like "123-bp" or "123-heart_rate" — extract vital row id
  const vitalId = rawId.split('-')[0];

  const row = await db.$client.prepare('SELECT * FROM patient_vitals WHERE id = ? AND tenant_id = ?')
    .bind(vitalId, tenantId).first();
  if (!row) throw new HTTPException(404, { message: 'Observation not found' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const observations = toFhirObservations(row as any, baseUrl);
  const match = observations.find(o => o.id === rawId);
  if (!match) throw new HTTPException(404, { message: 'Observation not found' });

  return fhirResponse(match);
});

// ═══ MEDICATION REQUEST (Prescriptions) ═══════════════════════════════════════

fhirRoutes.get('/MedicationRequest', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const q = c.req.query();

  const { where, params } = buildSearchClauses(q, {
    patient: { column: 'p.patient_id', op: 'ref' },
    date:    { column: 'p.created_at', op: 'date' },
    status:  { column: 'p.status', op: 'eq' },
  });

  const limit = parseCount(q);
  const allWhere = ['p.tenant_id = ?', ...where];
  const allParams: (string | number)[] = [tenantId!, ...params];

  const sql = `
    SELECT p.*, d.name as doctor_name
    FROM prescriptions p
    LEFT JOIN doctors d ON p.doctor_id = d.id AND d.tenant_id = p.tenant_id
    WHERE ${allWhere.join(' AND ')}
    ORDER BY p.created_at DESC LIMIT ?
  `;
  allParams.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...allParams).all();

  // Batch fetch all prescription items in one round-trip (fixes N+1)
  if (results.length === 0) return fhirResponse(toBundle([], baseUrl));

  const itemBatch = results.map((rx: any) =>
    db.$client.prepare(
      'SELECT pi.* FROM prescription_items pi JOIN prescriptions pr ON pi.prescription_id = pr.id AND pr.tenant_id = ? WHERE pi.prescription_id = ?'
    ).bind(tenantId, rx.id)
  );
  const batchResults = await db.$client.batch(itemBatch);

  const resources = [];
  for (let i = 0; i < results.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rxRow = results[i] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (batchResults[i] as any).results ?? [];
    resources.push(...toFhirMedicationRequests(rxRow, items, baseUrl));
  }

  return fhirResponse(toBundle(resources, baseUrl));
});

fhirRoutes.get('/MedicationRequest/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const rawId = c.req.param('id');

  // IDs are "rxId" or "rxId-itemIdx"
  const rxId = rawId.split('-')[0];

  const rx = await db.$client.prepare(
    `SELECT p.*, d.name as doctor_name FROM prescriptions p LEFT JOIN doctors d ON p.doctor_id = d.id AND d.tenant_id = p.tenant_id
     WHERE p.id = ? AND p.tenant_id = ?`
  ).bind(rxId, tenantId).first();
  if (!rx) throw new HTTPException(404, { message: 'MedicationRequest not found' });

  const { results: items } = await db.$client.prepare(
    'SELECT pi.* FROM prescription_items pi JOIN prescriptions pr ON pi.prescription_id = pr.id AND pr.tenant_id = ? WHERE pi.prescription_id = ?'
  ).bind(tenantId, rxId).all();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = toFhirMedicationRequests(rx as any, items as any, baseUrl);
  const match = all.find(r => r.id === rawId) ?? all[0];
  return fhirResponse(match);
});

// ═══ ENCOUNTER (Visits) ══════════════════════════════════════════════════════

fhirRoutes.get('/Encounter', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const q = c.req.query();

  const { where, params } = buildSearchClauses(q, {
    patient: { column: 'v.patient_id', op: 'ref' },
    date:    { column: 'v.created_at', op: 'date' },
    type:    { column: 'v.visit_type', op: 'eq' },
  });

  const limit = parseCount(q);
  const allWhere = ['v.tenant_id = ?', ...where];
  const allParams: (string | number)[] = [tenantId!, ...params];

  const sql = `
    SELECT v.*, d.name as doctor_name
    FROM visits v
    LEFT JOIN doctors d ON v.doctor_id = d.id AND d.tenant_id = v.tenant_id
    WHERE ${allWhere.join(' AND ')}
    ORDER BY v.created_at DESC LIMIT ?
  `;
  allParams.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...allParams).all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = results.map((r) => toFhirEncounter(r as any, baseUrl));
  return fhirResponse(toBundle(resources, baseUrl));
});

fhirRoutes.get('/Encounter/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const id = c.req.param('id');

  const row = await db.$client.prepare(
    `SELECT v.*, d.name as doctor_name FROM visits v LEFT JOIN doctors d ON v.doctor_id = d.id AND d.tenant_id = v.tenant_id
     WHERE v.id = ? AND v.tenant_id = ?`
  ).bind(id, tenantId).first();
  if (!row) throw new HTTPException(404, { message: 'Encounter not found' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fhirResponse(toFhirEncounter(row as any, baseUrl));
});

// ═══ APPOINTMENT ═════════════════════════════════════════════════════════════

fhirRoutes.get('/Appointment', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const q = c.req.query();

  const { where, params } = buildSearchClauses(q, {
    patient: { column: 'a.patient_id', op: 'ref' },
    date:    { column: 'a.appt_date', op: 'date' },
    status:  { column: 'a.status', op: 'eq' },
  });

  const limit = parseCount(q);
  const allWhere = ['a.tenant_id = ?', ...where];
  const allParams: (string | number)[] = [tenantId!, ...params];

  const sql = `
    SELECT a.*, d.name as doctor_name
    FROM appointments a
    LEFT JOIN doctors d ON a.doctor_id = d.id AND d.tenant_id = a.tenant_id
    WHERE ${allWhere.join(' AND ')}
    ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT ?
  `;
  allParams.push(limit);

  const { results } = await db.$client.prepare(sql).bind(...allParams).all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = results.map((r) => toFhirAppointment(r as any, baseUrl));
  return fhirResponse(toBundle(resources, baseUrl));
});

fhirRoutes.get('/Appointment/:id', async (c) => {
  const db = getDb(c.env.DB);
  const tenantId = requireTenantId(c);
  const baseUrl = new URL(c.req.url).origin;
  const id = c.req.param('id');

  const row = await db.$client.prepare(
    `SELECT a.*, d.name as doctor_name FROM appointments a LEFT JOIN doctors d ON a.doctor_id = d.id AND d.tenant_id = a.tenant_id
     WHERE a.id = ? AND a.tenant_id = ?`
  ).bind(id, tenantId).first();
  if (!row) throw new HTTPException(404, { message: 'Appointment not found' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fhirResponse(toFhirAppointment(row as any, baseUrl));
});

export default fhirRoutes;
