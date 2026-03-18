import { z } from 'zod';

// ─── Shared helpers ────────────────────────────────────────────────────────────
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM');
const positiveInt = z.coerce.number().int().positive();

// ─── Leave Management ──────────────────────────────────────────────────────────
export const createLeaveCategorySchema = z.object({
  leaveName: z.string().min(1, 'Leave name is required'),
  description: z.string().max(500).optional(),
  maxDaysPerYear: z.number().int().min(0).default(0),
});

export const updateLeaveCategorySchema = createLeaveCategorySchema.partial();

export const createLeaveRequestSchema = z.object({
  staffId: z.number().int().positive(),
  leaveCategoryId: z.number().int().positive(),
  startDate: dateString,
  endDate: dateString,
  reason: z.string().max(500).optional(),
}).refine((d) => d.endDate >= d.startDate, {
  message: 'End date must be on or after start date',
  path: ['endDate'],
});

export const approveLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected', 'cancelled']),
});

export const initLeaveBalanceSchema = z.object({
  staffId: z.number().int().positive(),
  year: z.number().int().min(2020).max(2100),
});

// ─── Attendance & Shifts ───────────────────────────────────────────────────────
export const createShiftSchema = z.object({
  shiftName: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm'),
  gracePeriod: z.number().int().min(0).default(0),
});

export const updateShiftSchema = createShiftSchema.partial();

export const checkInSchema = z.object({
  staffId: z.number().int().positive(),
  shiftId: z.number().int().positive().optional(),
});

export const checkOutSchema = z.object({
  staffId: z.number().int().positive(),
});

export const attendanceReportQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  staffId: positiveInt.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).refine((q) => !q.from || !q.to || q.to >= q.from, {
  message: '"to" must be on or after "from"',
  path: ['to'],
});

// ─── Payroll ───────────────────────────────────────────────────────────────────
export const createSalaryHeadSchema = z.object({
  headName: z.string().min(1),
  headType: z.enum(['earning', 'deduction']),
  isTaxable: z.boolean().default(true),
});

export const updateSalaryHeadSchema = createSalaryHeadSchema.partial();

export const setSalaryStructureSchema = z.object({
  staffId: z.number().int().positive(),
  items: z.array(
    z.object({
      salaryHeadId: z.number().int().positive(),
      amount: z.number().min(0),
      calculationType: z.enum(['fixed', 'percentage']).default('fixed'),
    })
  ).min(1, 'At least one salary component required'),
});

export const createPayrollRunSchema = z.object({
  runMonth: monthString,
});

export const payrollListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  month: monthString.optional(),
  staffId: positiveInt.optional(),
});

// ─── Type exports ──────────────────────────────────────────────────────────────
export type CreateLeaveCategoryInput = z.infer<typeof createLeaveCategorySchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;
export type CreateSalaryHeadInput = z.infer<typeof createSalaryHeadSchema>;
export type SetSalaryStructureInput = z.infer<typeof setSalaryStructureSchema>;
export type PayrollListQuery = z.infer<typeof payrollListQuerySchema>;
