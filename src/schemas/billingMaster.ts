import { z } from 'zod';

// ─── Billing Schemes ─────────────────────────────────────────────────────────

export const createSchemeSchema = z.object({
  scheme_name: z.string().min(1).max(200),
  scheme_code: z.string().max(50).optional(),
  scheme_type: z.enum(['general', 'insurance', 'government', 'corporate']).default('general'),
  description: z.string().max(500).optional(),
  default_discount_percent: z.number().min(0).max(100).default(0),
});

export const updateSchemeSchema = createSchemeSchema.partial();

// ─── Sub Schemes ─────────────────────────────────────────────────────────────

export const createSubSchemeSchema = z.object({
  scheme_id: z.number().int().positive(),
  sub_scheme_name: z.string().min(1).max(200),
  sub_scheme_code: z.string().max(50).optional(),
  discount_percent: z.number().min(0).max(100).default(0),
});

// ─── Price Categories ────────────────────────────────────────────────────────

export const createPriceCategorySchema = z.object({
  category_name: z.string().min(1).max(200),
  category_code: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  is_default: z.boolean().default(false),
});

export const updatePriceCategorySchema = createPriceCategorySchema.partial();

// ─── Service Departments ─────────────────────────────────────────────────────

export const createServiceDeptSchema = z.object({
  department_name: z.string().min(1).max(200),
  department_code: z.string().max(50).optional(),
  parent_id: z.number().int().positive().optional(),
});

export const updateServiceDeptSchema = createServiceDeptSchema.partial();

// ─── Service Items ───────────────────────────────────────────────────────────

export const createServiceItemSchema = z.object({
  item_name: z.string().min(1).max(300),
  item_code: z.string().max(50).optional(),
  service_department_id: z.number().int().positive().optional(),
  price: z.number().min(0),
  tax_applicable: z.boolean().default(false),
  tax_percent: z.number().min(0).max(100).default(0),
  allow_discount: z.boolean().default(true),
  allow_multiple_qty: z.boolean().default(true),
  description: z.string().max(500).optional(),
  display_order: z.number().int().default(0),
});

export const updateServiceItemSchema = createServiceItemSchema.partial();

export const listServiceItemsSchema = z.object({
  search: z.string().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Counters ────────────────────────────────────────────────────────────────

export const createCounterSchema = z.object({
  counter_name: z.string().min(1).max(200),
  counter_code: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

// ─── Fiscal Years ────────────────────────────────────────────────────────────

export const createFiscalYearSchema = z.object({
  fiscal_year_name: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_current: z.boolean().default(false),
});

// ─── Credit Organizations ────────────────────────────────────────────────────

export const createCreditOrgSchema = z.object({
  organization_name: z.string().min(1).max(300),
  organization_code: z.string().max(50).optional(),
  contact_person: z.string().max(200).optional(),
  contact_no: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  credit_limit: z.number().min(0).default(0),
});

export const updateCreditOrgSchema = createCreditOrgSchema.partial();

// ─── Packages ────────────────────────────────────────────────────────────────

export const createPackageSchema = z.object({
  package_name: z.string().min(1).max(300),
  package_code: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  total_price: z.number().min(0),
  discount_percent: z.number().min(0).max(100).default(0),
  items: z.array(z.object({
    service_item_id: z.number().int().positive().optional(),
    item_name: z.string().min(1),
    quantity: z.number().int().min(1).default(1),
    price: z.number().min(0),
  })).optional(),
});

export const updatePackageSchema = createPackageSchema.partial();

// ─── Deposit Heads ───────────────────────────────────────────────────────────

export const createDepositHeadSchema = z.object({
  head_name: z.string().min(1).max(200),
  head_code: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

// ─── Membership Types ────────────────────────────────────────────────────────

export const createMembershipTypeSchema = z.object({
  membership_name: z.string().min(1).max(200),
  membership_code: z.string().max(50).optional(),
  community_name: z.string().max(200).optional(),
  discount_percent: z.number().min(0).max(100).default(0),
  description: z.string().max(500).optional(),
});

export const updateMembershipTypeSchema = createMembershipTypeSchema.partial();

export const assignMembershipSchema = z.object({
  patient_id: z.number().int().positive(),
  membership_type_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── Scheme ↔ Price Category Mapping ─────────────────────────────────────────

export const schemePriceCategoryMapSchema = z.object({
  scheme_id: z.number().int().positive(),
  price_category_id: z.number().int().positive(),
});

// ─── Item ↔ Price Category Mapping ───────────────────────────────────────────

export const itemPriceCategoryMapSchema = z.object({
  service_item_id: z.number().int().positive(),
  price_category_id: z.number().int().positive(),
  price: z.number().min(0),
  discount_percent: z.number().min(0).max(100).default(0),
});
