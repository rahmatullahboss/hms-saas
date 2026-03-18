import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../types';

type AppEnv = { Bindings: Env; Variables: Variables };

/**
 * Reusable RBAC middleware.
 * 
 * Usage:
 *   app.post('/resource', requireRole('doctor', 'nurse', 'hospital_admin'), handler)
 * 
 * Throws 403 if the authenticated user's role is not in the allowed list.
 */
export function requireRole(...roles: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const role = c.get('role');
    if (!role || !roles.includes(role)) {
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required roles: ${roles.join(', ')}`,
      });
    }
    await next();
  };
}

// ─── Preset role groups ──────────────────────────────────────────────────────

/** Clinical staff who can write patient-related data */
export const CLINICAL_ROLES = ['doctor', 'md', 'nurse', 'pharmacist', 'hospital_admin'] as const;

/** Admin-only operations */
export const ADMIN_ROLES = ['hospital_admin', 'md'] as const;

/** Nursing staff */
export const NURSING_ROLES = ['nurse', 'doctor', 'md', 'hospital_admin'] as const;

/** OPD staff (front desk + clinical) */
export const OPD_ROLES = ['nurse', 'receptionist', 'doctor', 'hospital_admin'] as const;

/** Prescribing roles */
export const PRESCRIBING_ROLES = ['doctor', 'md', 'pharmacist', 'hospital_admin'] as const;
