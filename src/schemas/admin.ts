import { z } from 'zod';

// ─── Auth Schemas ────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

export const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name required'),
});

// ─── Hospital Management Schemas ─────────────────────────────────────────

export const createHospitalSchema = z.object({
  name: z.string().min(1, 'Hospital name required'),
  subdomain: z.string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Invalid subdomain format'),
  adminEmail: z.string().email().optional(),
  adminName: z.string().min(1).optional(),
  adminPassword: z.string().min(6).optional(),
});

export const updateHospitalSchema = z.object({
  name: z.string().min(1, 'Hospital name required'),
  status: z.enum(['active', 'inactive', 'suspended']),
  plan: z.string().min(1, 'Plan required'),
});
