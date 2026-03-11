import { z } from 'zod';

// ICD-10 code pattern: letter + 2 digits + optional dot + 1-4 chars
// Examples: J06, J06.9, A09.0, Z87.891
const icd10Pattern = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

export const createVisitSchema = z.object({
  patientId: z.number().int().positive('Patient ID required'),
  doctorId: z.number().int().positive().optional(),
  visitType: z.enum(['opd', 'ipd']).default('opd'),
  admissionFlag: z.boolean().default(false),
  admissionDate: z.string().optional(),
  notes: z.string().optional(),
  // ICD-10 diagnosis — optional at creation, can be set after consultation
  icd10Code: z.string().regex(icd10Pattern, 'Invalid ICD-10 code (e.g. J06, A09.0)').optional(),
  icd10Description: z.string().max(255).optional(),
});

export const updateVisitSchema = z.object({
  doctorId: z.number().int().positive().optional(),
  notes: z.string().optional(),
  dischargeDate: z.string().optional(),
  // Allow updating ICD-10 code (e.g. after lab results confirm diagnosis)
  icd10Code: z.string().regex(icd10Pattern, 'Invalid ICD-10 code (e.g. J06, A09.0)').optional(),
  icd10Description: z.string().max(255).optional(),
});

export const dischargeSchema = z.object({
  dischargeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Discharge date must be YYYY-MM-DD'),
  notes: z.string().optional(),
  // Final diagnosis code at discharge
  icd10Code: z.string().regex(icd10Pattern, 'Invalid ICD-10 code').optional(),
  icd10Description: z.string().max(255).optional(),
});

export type CreateVisitInput  = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput  = z.infer<typeof updateVisitSchema>;
export type DischargeInput    = z.infer<typeof dischargeSchema>;
