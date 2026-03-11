import { z } from 'zod';

export const createVisitSchema = z.object({
  patientId: z.number().int().positive('Patient ID required'),
  doctorId: z.number().int().positive().optional(),
  visitType: z.enum(['opd', 'ipd']).default('opd'),
  admissionFlag: z.boolean().default(false),
  admissionDate: z.string().optional(),
  notes: z.string().optional(),
});

export const updateVisitSchema = z.object({
  doctorId: z.number().int().positive().optional(),
  notes: z.string().optional(),
  dischargeDate: z.string().optional(),
});

export const dischargeSchema = z.object({
  dischargeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Discharge date must be YYYY-MM-DD'),
  notes: z.string().optional(),
});

export type CreateVisitInput  = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput  = z.infer<typeof updateVisitSchema>;
export type DischargeInput    = z.infer<typeof dischargeSchema>;
