import { z } from 'zod';

// Individual line item on a bill
export const invoiceItemSchema = z.object({
  itemCategory: z.enum(['test', 'doctor_visit', 'operation', 'medicine', 'admission', 'fire_service', 'other']),
  description: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().int().nonnegative('Price cannot be negative'),
  referenceId: z.number().int().optional(),
});

export const createBillSchema = z.object({
  patientId: z.number().int().positive('Patient ID required'),
  visitId: z.number().int().positive().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  discount: z.number().int().nonnegative().default(0),
});

export const paymentSchema = z.object({
  billId: z.number().int().positive('Bill ID required'),
  amount: z.number().int().positive('Amount must be positive'),
  type: z.enum(['current', 'due', 'fire_service']).default('current'),
  paymentMethod: z.enum(['cash', 'bkash', 'bank', 'other']).optional(),
  notes: z.string().optional(),
  /** Optional UUID generated client-side. If provided, duplicate submissions
   *  with the same key return the existing payment (idempotent). */
  idempotencyKey: z.string().uuid().optional(),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
