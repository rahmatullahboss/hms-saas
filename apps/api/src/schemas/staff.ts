import { z } from 'zod';

export const createStaffSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  position: z.string().min(1, 'Position is required'),
  salary: z.number().int().nonnegative('Salary required'),
  bankAccount: z.string().min(1, 'Bank account required'),
  mobile: z.string().min(11).max(15),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateStaffSchema = createStaffSchema.partial();

export const paySalarySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  bonus: z.number().int().nonnegative().default(0),
  deduction: z.number().int().nonnegative().default(0),
  paymentMethod: z.enum(['cash', 'bank', 'bkash', 'other']).optional(),
  referenceNo: z.string().optional(),
});

export type CreateStaffInput  = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput  = z.infer<typeof updateStaffSchema>;
export type PaySalaryInput    = z.infer<typeof paySalarySchema>;
