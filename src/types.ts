/**
 * Shared Cloudflare Worker environment bindings.
 * All routes and middleware should use this type.
 */
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPLOADS: R2Bucket;
  // Static assets binding — serves React SPA via [assets] in wrangler.toml
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  // ─── Email (Resend) ───────────────────────────────────────────────────
  RESEND_API_KEY?: string;        // wrangler secret put RESEND_API_KEY
  RESEND_FROM_EMAIL?: string;     // e.g. "HMS <noreply@yourhospital.com>"
  // ─── SMS ─────────────────────────────────────────────────────────────
  SMS_PROVIDER?: string;          // "sslwireless" | "bnotify" | "stub"
  SMS_API_KEY?: string;           // wrangler secret put SMS_API_KEY
  SMS_SENDER_ID?: string;         // wrangler secret put SMS_SENDER_ID
}

/**
 * Shared Variables set on Hono context by middleware.
 */
export interface Variables {
  tenantId?: string;
  userId?: string;
  role?: string;
}
