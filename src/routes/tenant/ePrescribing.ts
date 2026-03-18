import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';
import { getPagination, paginationMeta } from '../../lib/pagination';
import {
  createFormularyCategorySchema,
  updateFormularyCategorySchema,
  createFormularyItemSchema,
  updateFormularyItemSchema,
  createDrugInteractionSchema,
  addPatientMedicationSchema,
  updatePatientMedicationSchema,
  safetyCheckRequestSchema,
  safetyCheckOverrideSchema,
} from '../../schemas/ePrescribing';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Parse and validate integer ID from URL params
// ═══════════════════════════════════════════════════════════════════════════════

function parseId(value: string, label = 'ID'): number {
  const id = parseInt(value, 10);
  if (isNaN(id) || id <= 0) throw new HTTPException(400, { message: `Invalid ${label}: must be a positive integer` });
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Require clinical role for mutations
// ═══════════════════════════════════════════════════════════════════════════════

const CLINICAL_WRITE_ROLES = ['doctor', 'md', 'pharmacist', 'hospital_admin'];

function requireClinicalRole(c: any): void {
  const role = c.get('role');
  if (!role || !CLINICAL_WRITE_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Insufficient permissions: clinical write access required' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Ensure seed data is cloned to tenant on first use
// ═══════════════════════════════════════════════════════════════════════════════

async function ensureSeedData(db: D1Database, tenantId: string): Promise<void> {
  // Check if tenant already has interaction data
  const existing = await db.prepare(
    'SELECT COUNT(*) as count FROM drug_interaction_pairs WHERE tenant_id = ?'
  ).bind(tenantId).first<{ count: number }>();

  if (existing && existing.count > 0) return;

  // Clone seed data for this tenant using INSERT OR IGNORE to handle race conditions
  // (UNIQUE indexes on tenant_id+drug_a_name+drug_b_name and tenant_id+name prevent duplicates)
  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO drug_interaction_pairs (tenant_id, drug_a_name, drug_b_name, severity, description, recommendation, evidence_level, is_active)
      SELECT ?, drug_a_name, drug_b_name, severity, description, recommendation, evidence_level, is_active
      FROM drug_interaction_pairs WHERE tenant_id = '__seed__'
    `).bind(tenantId),
    db.prepare(`
      INSERT OR IGNORE INTO formulary_categories (tenant_id, name, description, sort_order, is_active)
      SELECT ?, name, description, sort_order, is_active
      FROM formulary_categories WHERE tenant_id = '__seed__'
    `).bind(tenantId),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMULARY CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/e-prescribing/formulary/categories
app.get('/formulary/categories', async (c) => {
  const tenantId = requireTenantId(c);
  await ensureSeedData(c.env.DB, tenantId);

  const { results } = await c.env.DB.prepare(`
    SELECT fc.*, (SELECT COUNT(*) FROM formulary_items fi WHERE fi.category_id = fc.id AND fi.tenant_id = fc.tenant_id) as item_count
    FROM formulary_categories fc
    WHERE fc.tenant_id = ? AND fc.is_active = 1
    ORDER BY fc.sort_order, fc.name
  `).bind(tenantId).all();

  return c.json({ categories: results });
});

// POST /api/e-prescribing/formulary/categories
app.post('/formulary/categories', zValidator('json', createFormularyCategorySchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    INSERT INTO formulary_categories (tenant_id, name, description, parent_id, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tenantId, data.name, data.description ?? null, data.parent_id ?? null, data.sort_order).run();

  return c.json({ id: result.meta.last_row_id, message: 'Category created' }, 201);
});

// PUT /api/e-prescribing/formulary/categories/:id
app.put('/formulary/categories/:id', zValidator('json', updateFormularyCategorySchema), async (c) => {
  const tenantId = requireTenantId(c);
  requireClinicalRole(c);
  const id = parseId(c.req.param('id'), 'Category ID');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM formulary_categories WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Category not found' });

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: (string | number | null)[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
  if (data.description !== undefined) { sets.push('description = ?'); vals.push(data.description); }
  if (data.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(data.sort_order); }

  vals.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE formulary_categories SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ success: true, message: 'Category updated' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FORMULARY ITEMS (Drug Catalog)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/e-prescribing/formulary
app.get('/formulary', async (c) => {
  const tenantId = requireTenantId(c);
  const search = c.req.query('search') || '';
  const categoryId = c.req.query('category_id');
  const { page, limit, offset } = getPagination(c);

  let whereClause = 'WHERE fi.tenant_id = ? AND fi.is_active = 1';
  const params: (string | number)[] = [tenantId];

  if (search) {
    whereClause += ' AND (fi.name LIKE ? OR fi.generic_name LIKE ? OR fi.manufacturer LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (categoryId) {
    whereClause += ' AND fi.category_id = ?';
    params.push(Number(categoryId));
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM formulary_items fi ${whereClause}`
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await c.env.DB.prepare(`
    SELECT fi.*, fc.name as category_name
    FROM formulary_items fi
    LEFT JOIN formulary_categories fc ON fi.category_id = fc.id AND fc.tenant_id = fi.tenant_id
    ${whereClause}
    ORDER BY fi.generic_name, fi.name
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ formulary: results, meta: paginationMeta(page, limit, total) });
});

// GET /api/e-prescribing/formulary/:id
app.get('/formulary/:id', async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Formulary ID');

  const item = await c.env.DB.prepare(`
    SELECT fi.*, fc.name as category_name
    FROM formulary_items fi
    LEFT JOIN formulary_categories fc ON fi.category_id = fc.id AND fc.tenant_id = fi.tenant_id
    WHERE fi.id = ? AND fi.tenant_id = ?
  `).bind(id, tenantId).first();

  if (!item) throw new HTTPException(404, { message: 'Formulary item not found' });
  return c.json(item);
});

// POST /api/e-prescribing/formulary
app.post('/formulary', zValidator('json', createFormularyItemSchema), async (c) => {
  const tenantId = requireTenantId(c);
  requireClinicalRole(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  const result = await c.env.DB.prepare(`
    INSERT INTO formulary_items (
      tenant_id, name, generic_name, category_id, strength, dosage_form, route,
      manufacturer, common_dosages, default_frequency, default_duration, max_daily_dose_mg,
      default_instructions, is_antibiotic, is_controlled, requires_prior_auth, unit_price, medicine_id, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, data.name, data.generic_name, data.category_id ?? null,
    data.strength ?? null, data.dosage_form ?? null, data.route ?? null,
    data.manufacturer ?? null,
    data.common_dosages ? JSON.stringify(data.common_dosages) : null,
    data.default_frequency ?? null, data.default_duration ?? null,
    data.max_daily_dose_mg ?? null, data.default_instructions ?? null,
    data.is_antibiotic ? 1 : 0, data.is_controlled ? 1 : 0,
    data.requires_prior_auth ? 1 : 0, data.unit_price, data.medicine_id ?? null, userId
  ).run();

  return c.json({ id: result.meta.last_row_id, message: 'Formulary item added' }, 201);
});

// PUT /api/e-prescribing/formulary/:id
app.put('/formulary/:id', zValidator('json', updateFormularyItemSchema), async (c) => {
  const tenantId = requireTenantId(c);
  requireClinicalRole(c);
  const id = parseId(c.req.param('id'), 'Formulary ID');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM formulary_items WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Formulary item not found' });

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: (string | number | null)[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
  if (data.generic_name !== undefined) { sets.push('generic_name = ?'); vals.push(data.generic_name); }
  if (data.category_id !== undefined) { sets.push('category_id = ?'); vals.push(data.category_id); }
  if (data.strength !== undefined) { sets.push('strength = ?'); vals.push(data.strength); }
  if (data.dosage_form !== undefined) { sets.push('dosage_form = ?'); vals.push(data.dosage_form); }
  if (data.route !== undefined) { sets.push('route = ?'); vals.push(data.route); }
  if (data.manufacturer !== undefined) { sets.push('manufacturer = ?'); vals.push(data.manufacturer); }
  if (data.common_dosages !== undefined) { sets.push('common_dosages = ?'); vals.push(JSON.stringify(data.common_dosages)); }
  if (data.default_frequency !== undefined) { sets.push('default_frequency = ?'); vals.push(data.default_frequency); }
  if (data.default_duration !== undefined) { sets.push('default_duration = ?'); vals.push(data.default_duration); }
  if (data.max_daily_dose_mg !== undefined) { sets.push('max_daily_dose_mg = ?'); vals.push(data.max_daily_dose_mg); }
  if (data.default_instructions !== undefined) { sets.push('default_instructions = ?'); vals.push(data.default_instructions); }
  if (data.is_antibiotic !== undefined) { sets.push('is_antibiotic = ?'); vals.push(data.is_antibiotic ? 1 : 0); }
  if (data.is_controlled !== undefined) { sets.push('is_controlled = ?'); vals.push(data.is_controlled ? 1 : 0); }
  if (data.unit_price !== undefined) { sets.push('unit_price = ?'); vals.push(data.unit_price); }
  if (data.medicine_id !== undefined) { sets.push('medicine_id = ?'); vals.push(data.medicine_id); }

  vals.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE formulary_items SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ success: true, message: 'Formulary item updated' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DRUG INTERACTION PAIRS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/e-prescribing/interactions
app.get('/interactions', async (c) => {
  const tenantId = requireTenantId(c);
  await ensureSeedData(c.env.DB, tenantId);

  const search = c.req.query('search') || '';
  const severity = c.req.query('severity');
  const { page, limit, offset } = getPagination(c);

  let whereClause = 'WHERE tenant_id = ? AND is_active = 1';
  const params: (string | number)[] = [tenantId];

  if (search) {
    whereClause += ' AND (drug_a_name LIKE ? OR drug_b_name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (severity) {
    whereClause += ' AND severity = ?';
    params.push(severity);
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM drug_interaction_pairs ${whereClause}`
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM drug_interaction_pairs ${whereClause}
    ORDER BY CASE severity 
      WHEN 'contraindicated' THEN 1 WHEN 'major' THEN 2 
      WHEN 'moderate' THEN 3 WHEN 'minor' THEN 4 END,
    drug_a_name
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({ interactions: results, meta: paginationMeta(page, limit, total) });
});

// POST /api/e-prescribing/interactions
app.post('/interactions', zValidator('json', createDrugInteractionSchema), async (c) => {
  const tenantId = requireTenantId(c);
  requireClinicalRole(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  // Normalize to lowercase for matching
  const drugA = data.drug_a_name.toLowerCase().trim();
  const drugB = data.drug_b_name.toLowerCase().trim();

  // Check for duplicate (either direction)
  const duplicate = await c.env.DB.prepare(`
    SELECT id FROM drug_interaction_pairs
    WHERE tenant_id = ? AND is_active = 1
      AND ((drug_a_name = ? AND drug_b_name = ?) OR (drug_a_name = ? AND drug_b_name = ?))
  `).bind(tenantId, drugA, drugB, drugB, drugA).first();

  if (duplicate) throw new HTTPException(400, { message: 'This interaction pair already exists' });

  const result = await c.env.DB.prepare(`
    INSERT INTO drug_interaction_pairs (tenant_id, drug_a_name, drug_b_name, severity, description, recommendation, evidence_level, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tenantId, drugA, drugB, data.severity, data.description, data.recommendation ?? null, data.evidence_level ?? null, userId).run();

  return c.json({ id: result.meta.last_row_id, message: 'Interaction pair added' }, 201);
});

// DELETE /api/e-prescribing/interactions/:id
app.delete('/interactions/:id', async (c) => {
  const tenantId = requireTenantId(c);
  requireClinicalRole(c);
  const id = parseId(c.req.param('id'), 'Interaction ID');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM drug_interaction_pairs WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Interaction pair not found' });

  await c.env.DB.prepare(
    'UPDATE drug_interaction_pairs SET is_active = 0 WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();

  return c.json({ success: true, message: 'Interaction pair removed' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATIENT ACTIVE MEDICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/e-prescribing/patient/:patientId/medications
app.get('/patient/:patientId/medications', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = parseId(c.req.param('patientId'), 'Patient ID');
  const status = c.req.query('status') || 'active';

  const { results } = await c.env.DB.prepare(`
    SELECT pam.*, fi.name as formulary_name, fi.category_id,
           fc.name as category_name,
           s.name as prescribed_by_name
    FROM patient_active_medications pam
    LEFT JOIN formulary_items fi ON pam.formulary_item_id = fi.id AND fi.tenant_id = pam.tenant_id
    LEFT JOIN formulary_categories fc ON fi.category_id = fc.id AND fc.tenant_id = pam.tenant_id
    LEFT JOIN staff s ON pam.prescribed_by = s.id AND s.tenant_id = pam.tenant_id
    WHERE pam.tenant_id = ? AND pam.patient_id = ? AND pam.status = ? AND pam.is_active = 1
    ORDER BY pam.start_date DESC
  `).bind(tenantId, patientId, status).all();

  return c.json({
    medications: results,
    total: results.length,
    patient_id: patientId,
  });
});

// POST /api/e-prescribing/patient/:patientId/medications
app.post('/patient/:patientId/medications', zValidator('json', addPatientMedicationSchema.omit({ patient_id: true })), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const patientId = parseId(c.req.param('patientId'), 'Patient ID');
  const data = c.req.valid('json');

  // Validate patient exists
  const patient = await c.env.DB.prepare(
    'SELECT id FROM patients WHERE id = ? AND tenant_id = ?'
  ).bind(patientId, tenantId).first();
  if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

  // If formulary_item_id provided, fetch generic_name from formulary
  let genericName = data.generic_name ?? null;
  if (data.formulary_item_id && !genericName) {
    const fi = await c.env.DB.prepare(
      'SELECT generic_name FROM formulary_items WHERE id = ? AND tenant_id = ?'
    ).bind(data.formulary_item_id, tenantId).first<{ generic_name: string }>();
    if (fi) genericName = fi.generic_name;
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO patient_active_medications (
      tenant_id, patient_id, formulary_item_id, medication_name, generic_name,
      strength, dosage_form, dosage, frequency, duration, instructions,
      start_date, end_date, source, prescription_id, prescribed_by, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId, patientId, data.formulary_item_id ?? null,
    data.medication_name, genericName,
    data.strength ?? null, data.dosage_form ?? null,
    data.dosage ?? null, data.frequency ?? null, data.duration ?? null,
    data.instructions ?? null, data.start_date ?? null, data.end_date ?? null,
    data.source, data.prescription_id ?? null, userId, userId
  ).run();

  return c.json({ id: result.meta.last_row_id, message: 'Medication added' }, 201);
});

// PUT /api/e-prescribing/patient/:patientId/medications/:id
app.put('/patient/:patientId/medications/:id', zValidator('json', updatePatientMedicationSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = parseId(c.req.param('patientId'), 'Patient ID');
  const id = parseId(c.req.param('id'), 'Medication ID');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM patient_active_medications WHERE id = ? AND patient_id = ? AND tenant_id = ?'
  ).bind(id, patientId, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Medication record not found' });

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: (string | number | null)[] = [];

  if (data.status !== undefined) { sets.push('status = ?'); vals.push(data.status); }
  if (data.status_reason !== undefined) { sets.push('status_reason = ?'); vals.push(data.status_reason); }
  if (data.end_date !== undefined) { sets.push('end_date = ?'); vals.push(data.end_date); }
  if (data.dosage !== undefined) { sets.push('dosage = ?'); vals.push(data.dosage); }
  if (data.frequency !== undefined) { sets.push('frequency = ?'); vals.push(data.frequency); }
  if (data.instructions !== undefined) { sets.push('instructions = ?'); vals.push(data.instructions); }

  if (sets.length === 1) throw new HTTPException(400, { message: 'No fields to update' });

  vals.push(id, patientId, tenantId);
  await c.env.DB.prepare(
    `UPDATE patient_active_medications SET ${sets.join(', ')} WHERE id = ? AND patient_id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ success: true, message: 'Medication updated' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY CHECKING — THE CORE FEATURE
// ═══════════════════════════════════════════════════════════════════════════════

interface SafetyWarning {
  type: 'drug_interaction' | 'allergy_contraindication' | 'duplicate_therapy' | 'max_dose';
  severity: 'info' | 'warning' | 'critical' | 'contraindicated';
  title: string;
  description: string;
  recommendation?: string;
}

// POST /api/e-prescribing/check-safety
app.post('/check-safety', zValidator('json', safetyCheckRequestSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const data = c.req.valid('json');

  await ensureSeedData(c.env.DB, tenantId);

  const warnings: SafetyWarning[] = [];
  const medName = data.medication_name.toLowerCase().trim();
  const genericName = (data.generic_name || data.medication_name).toLowerCase().trim();

  // ─── CHECK 1: Drug-Drug Interactions ─────────────────────────────────────
  // Get patient's currently active medications
  const { results: activeMeds } = await c.env.DB.prepare(`
    SELECT medication_name, generic_name FROM patient_active_medications
    WHERE tenant_id = ? AND patient_id = ? AND status = 'active' AND is_active = 1
  `).bind(tenantId, data.patient_id).all<{ medication_name: string; generic_name: string | null }>();

  for (const med of activeMeds) {
    const activeGeneric = (med.generic_name || med.medication_name).toLowerCase().trim();

    // Check both directions: (new drug, existing drug) and (existing drug, new drug)
    // H3 fix: exact match only (both directions) — no fuzzy LIKE to avoid false positives
    const interaction = await c.env.DB.prepare(`
      SELECT * FROM drug_interaction_pairs
      WHERE tenant_id = ? AND is_active = 1
        AND (
          (drug_a_name = ? AND drug_b_name = ?)
          OR (drug_a_name = ? AND drug_b_name = ?)
        )
    `).bind(
      tenantId,
      genericName, activeGeneric,
      activeGeneric, genericName
    ).first<{
      severity: string; description: string; recommendation: string;
      drug_a_name: string; drug_b_name: string;
    }>();

    if (interaction) {
      const severityMap: Record<string, SafetyWarning['severity']> = {
        'minor': 'info', 'moderate': 'warning', 'major': 'critical', 'contraindicated': 'contraindicated',
      };
      warnings.push({
        type: 'drug_interaction',
        severity: severityMap[interaction.severity] || 'warning',
        title: `Drug Interaction: ${data.medication_name} ↔ ${med.medication_name}`,
        description: interaction.description,
        recommendation: interaction.recommendation,
      });
    }
  }

  // ─── CHECK 2: Allergy-Drug Contraindications ────────────────────────────
  const { results: drugAllergies } = await c.env.DB.prepare(`
    SELECT allergen, severity, reaction FROM patient_allergies
    WHERE tenant_id = ? AND patient_id = ? AND allergy_type = 'drug' AND is_active = 1
  `).bind(tenantId, data.patient_id).all<{ allergen: string; severity: string; reaction: string | null }>();

  for (const allergy of drugAllergies) {
    const allergen = allergy.allergen.toLowerCase().trim();
    // Word-boundary matching: split both strings into words (3+ chars) and check for overlap
    const allergenWords = allergen.split(/[\s,\/]+/).filter(w => w.length >= 3);
    const genericWords = genericName.split(/[\s,\/]+/).filter(w => w.length >= 3);
    const medWords = medName.split(/[\s,\/]+/).filter(w => w.length >= 3);

    const hasMatch = allergenWords.some(aw =>
      genericWords.some(gw => gw === aw || gw.startsWith(aw) || aw.startsWith(gw)) ||
      medWords.some(mw => mw === aw || mw.startsWith(aw) || aw.startsWith(mw))
    );

    if (hasMatch) {
      const sevMap: Record<string, SafetyWarning['severity']> = {
        'mild': 'warning', 'moderate': 'critical', 'severe': 'contraindicated', 'life_threatening': 'contraindicated',
      };
      warnings.push({
        type: 'allergy_contraindication',
        severity: sevMap[allergy.severity] || 'critical',
        title: `⚠️ ALLERGY ALERT: Patient allergic to ${allergy.allergen}`,
        description: `Patient has documented ${allergy.severity} allergy to "${allergy.allergen}"${allergy.reaction ? ` (Reaction: ${allergy.reaction})` : ''}. ${data.medication_name} may trigger allergic reaction.`,
        recommendation: 'Consider alternative medication. If proceeding, document clinical justification and monitor closely.',
      });
    }
  }

  // ─── CHECK 3: Duplicate Therapy ─────────────────────────────────────────
  for (const med of activeMeds) {
    const activeGeneric = (med.generic_name || med.medication_name).toLowerCase().trim();
    const activeName = med.medication_name.toLowerCase().trim();
    if (genericName === activeGeneric || medName === activeName) {
      warnings.push({
        type: 'duplicate_therapy',
        severity: 'warning',
        title: `Duplicate Therapy: ${data.medication_name}`,
        description: `Patient already has active prescription for "${med.medication_name}" (same medication). This may result in overdosing.`,
        recommendation: 'Discontinue existing medication before starting new one, or verify intentional duplicate therapy.',
      });
    }
  }

  // ─── CHECK 4: Max Daily Dose (real comparison when dose provided) ─────
  // Exact match on formulary item name/generic_name — no fuzzy LIKE
  const formularyItem = await c.env.DB.prepare(`
    SELECT max_daily_dose_mg, generic_name, name FROM formulary_items
    WHERE tenant_id = ? AND is_active = 1
      AND (LOWER(name) = ? OR LOWER(generic_name) = ?)
    LIMIT 1
  `).bind(tenantId, medName, genericName).first<{
    max_daily_dose_mg: number | null; generic_name: string; name: string;
  }>();

  if (formularyItem?.max_daily_dose_mg) {
    const maxDose = formularyItem.max_daily_dose_mg;
    const prescribedDailyDose = (data.dose_mg && data.frequency_per_day)
      ? data.dose_mg * data.frequency_per_day
      : null;

    if (prescribedDailyDose && prescribedDailyDose > maxDose) {
      const ratio = prescribedDailyDose / maxDose;
      warnings.push({
        type: 'max_dose',
        severity: ratio >= 1.5 ? 'critical' : 'warning',
        title: `⚠️ MAX DOSE EXCEEDED: ${formularyItem.name}`,
        description: `Prescribed daily dose (${prescribedDailyDose}mg/day) exceeds the maximum recommended daily dose of ${maxDose}mg/day for ${formularyItem.generic_name} (${Math.round(ratio * 100)}% of max).`,
        recommendation: `Reduce dose to at most ${maxDose}mg/day, or document clinical justification for exceeding the limit.`,
      });
    } else {
      warnings.push({
        type: 'max_dose',
        severity: 'info',
        title: `Max Dose Reminder: ${formularyItem.name}`,
        description: `Maximum recommended daily dose for ${formularyItem.generic_name} is ${maxDose}mg/day.${prescribedDailyDose ? ` Prescribed: ${prescribedDailyDose}mg/day — within range.` : ' Provide dose_mg and frequency_per_day for actual dose comparison.'}`,
        recommendation: 'Ensure prescribed dose does not exceed maximum daily allowance.',
      });
    }
  }

  // ─── Log safety check ───────────────────────────────────────────────────
  const safetyCheckResult = await c.env.DB.prepare(`
    INSERT INTO prescription_safety_checks (
      tenant_id, prescription_id, patient_id, medication_name, generic_name,
      check_type, has_warnings, warning_count, warnings_json, checked_by
    ) VALUES (?, ?, ?, ?, ?, 'combined', ?, ?, ?, ?)
  `).bind(
    tenantId, data.prescription_id ?? null, data.patient_id,
    data.medication_name, data.generic_name ?? null,
    warnings.length > 0 ? 1 : 0, warnings.length,
    JSON.stringify(warnings), userId
  ).run();

  return c.json({
    safe: warnings.length === 0,
    warning_count: warnings.length,
    has_critical: warnings.some(w => w.severity === 'critical' || w.severity === 'contraindicated'),
    has_contraindicated: warnings.some(w => w.severity === 'contraindicated'),
    warnings,
    safety_check_id: safetyCheckResult.meta.last_row_id,
    patient_id: data.patient_id,
    medication_name: data.medication_name,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY CHECK HISTORY & OVERRIDE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/e-prescribing/safety-checks/:prescriptionId
app.get('/safety-checks/:prescriptionId', async (c) => {
  const tenantId = requireTenantId(c);
  const prescriptionId = parseId(c.req.param('prescriptionId'), 'Prescription ID');

  const { results } = await c.env.DB.prepare(`
    SELECT psc.*, s.name as checked_by_name
    FROM prescription_safety_checks psc
    LEFT JOIN staff s ON psc.checked_by = s.id AND s.tenant_id = psc.tenant_id
    WHERE psc.tenant_id = ? AND psc.prescription_id = ?
    ORDER BY psc.checked_at DESC
  `).bind(tenantId, prescriptionId).all();

  return c.json({ safety_checks: results });
});

// GET /api/e-prescribing/patient/:patientId/safety-checks
app.get('/patient/:patientId/safety-checks', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = parseId(c.req.param('patientId'), 'Patient ID');

  const { results } = await c.env.DB.prepare(`
    SELECT psc.*, s.name as checked_by_name
    FROM prescription_safety_checks psc
    LEFT JOIN staff s ON psc.checked_by = s.id AND s.tenant_id = psc.tenant_id
    WHERE psc.tenant_id = ? AND psc.patient_id = ?
    ORDER BY psc.checked_at DESC
    LIMIT 50
  `).bind(tenantId, patientId).all();

  return c.json({ safety_checks: results, total: results.length });
});

// PUT /api/e-prescribing/safety-checks/:id/override
app.put('/safety-checks/:id/override', zValidator('json', safetyCheckOverrideSchema.omit({ safety_check_id: true })), async (c) => {
  const tenantId = requireTenantId(c);
  const id = parseId(c.req.param('id'), 'Safety Check ID');
  const data = c.req.valid('json');

  const role = c.get('role');
  const allowedRoles = ['doctor', 'md', 'hospital_admin'];
  if (!role || !allowedRoles.includes(role)) {
    throw new HTTPException(403, { message: 'Only doctors and administrators can override safety checks' });
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM prescription_safety_checks WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) throw new HTTPException(404, { message: 'Safety check not found' });

  await c.env.DB.prepare(
    'UPDATE prescription_safety_checks SET action_taken = ?, override_reason = ? WHERE id = ? AND tenant_id = ?'
  ).bind(data.action_taken, data.override_reason, id, tenantId).run();

  return c.json({ success: true, message: 'Safety check override recorded' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY / STATS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/e-prescribing/stats
app.get('/stats', async (c) => {
  const tenantId = requireTenantId(c);

  const [formularyCount, interactionCount, safetyCheckCount, warningCount] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM formulary_items WHERE tenant_id = ? AND is_active = 1').bind(tenantId).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM drug_interaction_pairs WHERE tenant_id = ? AND is_active = 1').bind(tenantId).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM prescription_safety_checks WHERE tenant_id = ?').bind(tenantId).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM prescription_safety_checks WHERE tenant_id = ? AND has_warnings = 1').bind(tenantId).first<{ count: number }>(),
  ]);

  return c.json({
    formulary_items: formularyCount?.count ?? 0,
    interaction_pairs: interactionCount?.count ?? 0,
    total_safety_checks: safetyCheckCount?.count ?? 0,
    checks_with_warnings: warningCount?.count ?? 0,
  });
});

export default app;
