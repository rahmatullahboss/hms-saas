import { z } from 'zod';

export const createDoctorSchema = z.object({
  name: z.string().min(1, 'Doctor name is required'),
  specialty: z.string().optional(),
  mobileNumber: z.string().optional(),
  consultationFee: z.number().int().nonnegative('Consultation fee required'),
});

export const updateDoctorSchema = createDoctorSchema.partial();

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
