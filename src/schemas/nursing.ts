import { z } from 'zod';

// ─── Common Query Schema ─────────────────────────────────────────────────────
export const NursingQuerySchema = z.object({
  patient_id: z.coerce.number().optional(),
  visit_id: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── 1. Care Plan ─────────────────────────────────────────────────────────────
export const createCarePlanSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  problem: z.string().optional(),
  goal: z.string().optional(),
  intervention: z.string().optional(),
  evaluation: z.string().optional(),
});
export const updateCarePlanSchema = createCarePlanSchema.partial();

// ─── 2. Nursing Notes ────────────────────────────────────────────────────────
export const createNursingNoteSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  note_type: z.string().min(1),
  note: z.string().min(1),
});
export const updateNursingNoteSchema = createNursingNoteSchema.partial();

// ─── 3. MAR ──────────────────────────────────────────────────────────────────
export const createMARSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  medication_name: z.string().min(1),
  dose: z.string().optional(),
  route: z.string().optional(),
  frequency: z.string().optional(),
  administered_on: z.string().optional(),
  administered_by: z.number().int().optional(),
  remarks: z.string().optional(),
  status: z.string().default('given'),
});
export const updateMARSchema = createMARSchema.partial();

// ─── 4. Intake/Output ────────────────────────────────────────────────────────
export const createIntakeOutputSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  intake_type: z.string().optional(),
  intake_amount: z.number().optional(),
  intake_unit: z.string().default('ml'),
  output_type: z.string().optional(),
  output_amount: z.number().optional(),
  output_unit: z.string().default('ml'),
  remarks: z.string().optional(),
  recorded_on: z.string().optional(),
});
export const updateIntakeOutputSchema = createIntakeOutputSchema.partial();

// ─── 5. Patient Monitoring ───────────────────────────────────────────────────
export const createMonitoringSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  temperature: z.number().optional(),
  temperature_unit: z.string().default('F'),
  pulse: z.number().int().optional(),
  respiration: z.number().int().optional(),
  bp_systolic: z.number().int().optional(),
  bp_diastolic: z.number().int().optional(),
  spo2: z.number().optional(),
  pain_scale: z.number().int().optional(),
  remarks: z.string().optional(),
  recorded_on: z.string().optional(),
});
export const updateMonitoringSchema = createMonitoringSchema.partial();

// ─── 6. IV Drug ──────────────────────────────────────────────────────────────
export const createIVDrugSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  drug_name: z.string().min(1),
  dosing: z.string().optional(),
  rate: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  status: z.string().default('running'),
  note: z.string().optional(),
});
export const updateIVDrugSchema = createIVDrugSchema.partial();

// ─── 7. Wound Care ───────────────────────────────────────────────────────────
export const createWoundCareSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  wound_site: z.string().optional(),
  wound_type: z.string().optional(),
  size: z.string().optional(),
  depth: z.string().optional(),
  exudate: z.string().optional(),
  description: z.string().optional(),
  treatment: z.string().optional(),
  next_dressing_due: z.string().optional(),
});
export const updateWoundCareSchema = createWoundCareSchema.partial();

// ─── 8. Handover ─────────────────────────────────────────────────────────────
export const createHandoverSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  shift: z.string().min(1),
  given_by: z.number().int().optional(),
  taken_by: z.number().int().optional(),
  content: z.string().min(1),
});
export const updateHandoverSchema = createHandoverSchema.partial();

// ─── 9. Clinical Info (Triage) ───────────────────────────────────────────────
export const createClinicalInfoSchema = z.object({
  patient_id: z.number().int(),
  visit_id: z.number().int(),
  key_name: z.string().min(1),
  value: z.string(),
});
export const updateClinicalInfoSchema = z.object({
  value: z.string().optional(),
  is_active: z.number().int().optional(),
});

// ─── 10. Employee Preferences ────────────────────────────────────────────────
export const createPreferenceSchema = z.object({
  employee_id: z.number().int(),
  preference_value: z.string().min(1),
});

// ─── OPD Check-in/Check-out ──────────────────────────────────────────────────
export const checkInSchema = z.object({
  visit_id: z.number().int(),
});
export const checkOutSchema = z.object({
  visit_id: z.number().int(),
  visit_status: z.string().default('concluded'),
});
export const exchangeDoctorSchema = z.object({
  visit_id: z.number().int(),
  performer_id: z.number().int(),
  performer_name: z.string().min(1),
  department_id: z.number().int().optional(),
});
export const freeReferralSchema = z.object({
  patient_id: z.number().int(),
  referred_by_id: z.number().int(),
  department_id: z.number().int().optional(),
});

// ─── OPD Query Schemas ───────────────────────────────────────────────────────
export const opdVisitsQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const clinicalInfoQuerySchema = z.object({
  visit_id: z.coerce.number().int(),
});
export const favoritesQuerySchema = z.object({
  employee_id: z.coerce.number().int(),
});
