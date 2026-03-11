import { z } from 'zod';

export const createMedicineSchema = z.object({
  name: z.string().min(1, 'Medicine name is required'),
  genericName: z.string().optional(),
  company: z.string().optional(),
  unit: z.string().optional(),
  salePrice: z.number().int().nonnegative('Sale price required'),
  reorderLevel: z.number().int().nonnegative().default(10),
});

export const updateMedicineSchema = createMedicineSchema.partial();

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name required'),
  mobileNumber: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

const purchaseItemSchema = z.object({
  medicineId: z.number().int().positive('Medicine ID required'),
  batchNo: z.string().min(1, 'Batch number required'),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be YYYY-MM-DD'),
  quantity: z.number().int().positive('Quantity must be positive'),
  purchasePrice: z.number().int().nonnegative('Purchase price required'),
  salePrice: z.number().int().nonnegative('Sale price required'),
});

export const createPurchaseSchema = z.object({
  supplierId: z.number().int().positive('Supplier ID required'),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be YYYY-MM-DD'),
  items: z.array(purchaseItemSchema).min(1, 'At least one item required'),
  discount: z.number().int().nonnegative().default(0),
});

const saleItemSchema = z.object({
  medicineId: z.number().int().positive(),
  quantity: z.number().int().positive('Quantity must be positive'),
  unitPrice: z.number().int().nonnegative(),
});

export const createSaleSchema = z.object({
  patientId: z.number().int().positive().optional(),
  billId: z.number().int().positive().optional(),
  items: z.array(saleItemSchema).min(1),
  discount: z.number().int().nonnegative().default(0),
});

export type CreateMedicineInput   = z.infer<typeof createMedicineSchema>;
export type CreateSupplierInput   = z.infer<typeof createSupplierSchema>;
export type CreatePurchaseInput   = z.infer<typeof createPurchaseSchema>;
export type CreateSaleInput       = z.infer<typeof createSaleSchema>;
