import { z } from 'zod';

export const createCommissionSchema = z.object({
  marketingPerson: z.string().min(1, 'Marketing person name required'),
  mobile: z.string().optional(),
  patientId: z.number().int().positive().optional(),
  billId: z.number().int().positive().optional(),
  commissionAmount: z.number().int().positive('Commission amount must be positive'),
  notes: z.string().optional(),
});

export const markCommissionPaidSchema = z.object({
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

export type CreateCommissionInput    = z.infer<typeof createCommissionSchema>;
export type MarkCommissionPaidInput  = z.infer<typeof markCommissionPaidSchema>;
