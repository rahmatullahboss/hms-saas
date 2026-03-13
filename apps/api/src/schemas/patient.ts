import { z } from 'zod';

export const createPatientSchema = z.object({
  name: z.string().min(1, 'Patient name is required'),
  fatherHusband: z.string().min(1, 'Father/husband name is required'),
  address: z.string().min(1, 'Address is required'),
  mobile: z.string().min(11, 'Mobile must be at least 11 digits').max(15),
  guardianMobile: z.string().optional(),
  email: z.string().email().optional(),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  bloodGroup: z.string().optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
