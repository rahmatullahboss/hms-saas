import { z } from 'zod';

// ─── Create Admission ─────────────────────────────────────────────────────────

export const createAdmissionSchema = z.object({
  patient_id: z.number().int().positive('Patient ID required'),
  bed_id: z.number().int().positive().optional(),
  doctor_id: z.number().int().positive().optional(),
  admission_type: z.enum(['general', 'emergency', 'planned', 'transfer']).default('planned'),
  provisional_diagnosis: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

// ─── Update Admission ─────────────────────────────────────────────────────────

export const updateAdmissionSchema = z.object({
  status: z.enum(['admitted', 'discharged', 'critical', 'transferred', 'lama']),
});

// ─── Create Bed ───────────────────────────────────────────────────────────────

export const createBedSchema = z.object({
  ward_name: z.string().min(1, 'Ward name required').max(100),
  bed_number: z.string().min(1, 'Bed number required').max(50),
  bed_type: z.enum(['general', 'icu', 'nicu', 'hdu', 'cabin', 'vip']).default('general'),
  floor: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

// ─── Update Bed ───────────────────────────────────────────────────────────────

export const updateBedSchema = z.object({
  status: z.enum(['available', 'occupied', 'maintenance', 'reserved']).optional(),
  notes: z.string().max(500).optional(),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;
export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>;
export type CreateBedInput = z.infer<typeof createBedSchema>;
export type UpdateBedInput = z.infer<typeof updateBedSchema>;
