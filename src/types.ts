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
  // ─── WhatsApp Business API (Meta Cloud) ─────────────────────────────
  WHATSAPP_PROVIDER?: string;           // "meta" | "stub" (default: stub)
  WHATSAPP_ACCESS_TOKEN?: string;       // wrangler secret put WHATSAPP_ACCESS_TOKEN
  WHATSAPP_PHONE_NUMBER_ID?: string;    // wrangler secret put WHATSAPP_PHONE_NUMBER_ID
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string; // wrangler secret put WHATSAPP_BUSINESS_ACCOUNT_ID
  // ─── bKash Payment Gateway ───────────────────────────────────────────
  BKASH_APP_KEY?: string;
  BKASH_APP_SECRET?: string;
  BKASH_USERNAME?: string;
  BKASH_PASSWORD?: string;
  BKASH_BASE_URL?: string;        // default: sandbox URL
  // ─── Nagad Payment Gateway ───────────────────────────────────────────
  NAGAD_MERCHANT_ID?: string;
  NAGAD_MERCHANT_PRIVATE_KEY?: string;
  NAGAD_BASE_URL?: string;        // default: sandbox URL
  // ─── Telemedicine (Cloudflare Realtime SFU) ─────────────────────────
  // Dashboard → Realtime SFU → Create App → copy App ID + Secret
  CF_REALTIME_APP_ID?:     string;  // wrangler secret put CF_REALTIME_APP_ID
  CF_REALTIME_APP_SECRET?: string;  // wrangler secret put CF_REALTIME_APP_SECRET
  CF_ACCOUNT_ID?:          string;  // your Cloudflare account ID (optional, for admin APIs)
  // ─── AI (OpenRouter) ──────────────────────────────────────────────
  OPENROUTER_API_KEY?: string;    // wrangler secret put OPENROUTER_API_KEY
  AI_MODEL?: string;              // optional override, default: openrouter/healer-alpha
  GEMINI_API_KEY?: string;        // wrangler secret put GEMINI_API_KEY (used for OCR)
  // ─── AI Memory (Vectorize + Workers AI) ───────────────────────────
  VECTORIZE?: Vectorize;          // wrangler.toml [[vectorize]] binding
  AI?: Ai;                        // wrangler.toml [ai] binding — Workers AI for embeddings
  // ─── Web Push Notifications (VAPID) ─────────────────────────────────
  VAPID_PUBLIC_KEY?: string;      // wrangler secret put VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY?: string;     // wrangler secret put VAPID_PRIVATE_KEY
  VAPID_SUBJECT?: string;         // wrangler secret put VAPID_SUBJECT (e.g. "mailto:admin@hmssaas.com")
}

/**
 * Shared Variables set on Hono context by middleware.
 */
export interface Variables {
  tenantId?: string;
  userId?: string;
  role?: string;
}
