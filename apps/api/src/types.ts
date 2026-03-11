/**
 * Shared Cloudflare Worker environment bindings.
 * All routes and middleware should use this type.
 */
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPLOADS: R2Bucket;
  DASHBOARD_DO: DurableObjectNamespace;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}

/**
 * Shared Variables set on Hono context by middleware.
 */
export interface Variables {
  tenantId?: string;
  userId?: string;
  role?: string;
}
