import { z } from 'zod';

export const createLabTestSchema = z.object({
  code: z.string().min(1, 'Test code required'),
  name: z.string().min(1, 'Test name required'),
  category: z.enum(['blood', 'urine', 'xray', 'ultrasound', 'ecg', 'other']).optional(),
  price: z.number().int().nonnegative('Price required'),
});

export const updateLabTestSchema = createLabTestSchema.partial();

const labOrderItemSchema = z.object({
  labTestId: z.number().int().positive('Lab test ID required'),
  discount: z.number().int().nonnegative().default(0),
});

export const createLabOrderSchema = z.object({
  patientId: z.number().int().positive('Patient ID required'),
  visitId: z.number().int().positive().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(labOrderItemSchema).min(1, 'At least one test required'),
});

export const updateLabItemResultSchema = z.object({
  result: z.string().min(1, 'Result required'),
});

export type CreateLabTestInput        = z.infer<typeof createLabTestSchema>;
export type CreateLabOrderInput       = z.infer<typeof createLabOrderSchema>;
export type UpdateLabItemResultInput  = z.infer<typeof updateLabItemResultSchema>;
