import { z } from 'zod';

// ─── Lab Test Catalog ─────────────────────────────────────────────────────────

export const createLabTestSchema = z.object({
  code: z.string().min(1, 'Test code required'),
  name: z.string().min(1, 'Test name required'),
  category: z.string().optional(),
  price: z.number().int().nonnegative('Price required'),
  unit: z.string().optional(),                    // 'mg/dL', 'mmol/L', 'g/dL'
  normalRange: z.string().optional(),             // '70-100' or 'M:4.5-5.5|F:4.0-5.0'
  method: z.string().optional(),                  // 'Colorimetric', 'Immunoassay'
  criticalLow: z.number().optional(),             // explicit critical low threshold
  criticalHigh: z.number().optional(),            // explicit critical high threshold
});

export const updateLabTestSchema = createLabTestSchema.partial();

// ─── Lab Order Items ──────────────────────────────────────────────────────────

const labOrderItemSchema = z.object({
  labTestId: z.number().int().positive('Lab test ID required'),
  discount: z.number().int().nonnegative().default(0),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  instructions: z.string().optional(),
});

export const createLabOrderSchema = z.object({
  patientId: z.number().int().positive('Patient ID required'),
  visitId: z.number().int().positive().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['draft', 'sent']).default('sent'),
  diagnosis: z.string().optional(),
  relevantHistory: z.string().optional(),
  fastingRequired: z.boolean().default(false),
  specimenType: z.string().default('Blood'),
  collectionNotes: z.string().optional(),
  items: z.array(labOrderItemSchema).min(1, 'At least one test required'),
});

// ─── Result Entry ─────────────────────────────────────────────────────────────

export const updateLabItemResultSchema = z.object({
  result: z.string().min(1, 'Result required'),
  resultNumeric: z.number().optional(),           // e.g., 5.5 for "5.5 mmol/L"
  abnormalFlag: z.enum(['normal', 'high', 'low', 'critical']).optional(),  // auto-detected if omitted
});

// ─── Sample Status ────────────────────────────────────────────────────────────

export const updateSampleStatusSchema = z.object({
  sampleStatus: z.enum(['collected', 'processing', 'completed', 'rejected']),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateLabTestInput        = z.infer<typeof createLabTestSchema>;
export type CreateLabOrderInput       = z.infer<typeof createLabOrderSchema>;
export type UpdateLabItemResultInput  = z.infer<typeof updateLabItemResultSchema>;
export type UpdateSampleStatusInput   = z.infer<typeof updateSampleStatusSchema>;
