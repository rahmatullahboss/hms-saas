import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    KV: KVNamespace;
    ALLOWED_ORIGINS: string;
    ENVIRONMENT: string;
    JWT_SECRET: string;
  }
}
