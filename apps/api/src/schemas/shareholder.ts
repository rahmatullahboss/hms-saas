import { z } from 'zod';

export const createShareholderSchema = z.object({
  name: z.string().min(1, 'Name required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  shareCount: z.number().int().positive('Share count must be positive'),
  type: z.enum(['profit', 'owner', 'doctor', 'shareholder']),
  investment: z.number().int().nonnegative().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateShareholderSchema = createShareholderSchema.partial();

export const distributeMonthlyProfitSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
});

export type CreateShareholderInput      = z.infer<typeof createShareholderSchema>;
export type DistributeMonthlyProfitInput = z.infer<typeof distributeMonthlyProfitSchema>;
