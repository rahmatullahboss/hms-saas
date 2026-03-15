import { z } from 'zod';

export const createAppointmentSchema = z.object({
  patientId:      z.number().int().positive(),
  doctorId:       z.number().int().positive().optional(),
  apptDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  apptTime:       z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  visitType:      z.enum(['opd', 'followup', 'emergency']).default('opd'),
  chiefComplaint: z.string().max(500).optional(),
  notes:          z.string().max(1000).optional(),
  fee:            z.number().int().min(0).default(0),
});

export const updateAppointmentSchema = z.object({
  status:         z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
  apptTime:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes:          z.string().max(1000).optional(),
  chiefComplaint: z.string().max(500).optional(),
  doctorId:       z.number().int().positive().optional(),
  fee:            z.number().int().min(0).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
