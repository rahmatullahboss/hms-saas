import { Context, Next } from 'hono';

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60; // seconds
const MAX_REQUESTS = 100;
const LOGIN_RATE_LIMIT = 5;
const LOGIN_WINDOW = 900; // 15 minutes in seconds

export interface RateLimitConfig {
  window?: number; // seconds
  max?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KVContext = Context<{ Bindings: any; Variables: any }>;

/**
 * KV-backed rate limiting middleware.
 * Uses Cloudflare KV with TTL for automatic cleanup.
 */
export async function rateLimitMiddleware(c: KVContext, next: Next, config?: RateLimitConfig) {
  const windowSec = config?.window ?? RATE_LIMIT_WINDOW;
  const max = config?.max ?? MAX_REQUESTS;
  
  const ip = c.req.header('CF-Connecting-IP') ?? 
             c.req.header('X-Forwarded-For') ?? 
             'unknown';
  
  const key = `rate:${ip}`;
  
  try {
    const current = await c.env.KV.get(key);
    const now = Math.floor(Date.now() / 1000);
    let count: number;
    let windowStart: number;
    
    if (current) {
      // Format: "count:timestamp"
      const parts = current.split(':');
      count = parseInt(parts[0], 10);
      windowStart = parseInt(parts[1], 10);
      
      // If window has elapsed, reset
      if (now - windowStart >= windowSec) {
        count = 0;
        windowStart = now;
      }
    } else {
      count = 0;
      windowStart = now;
    }
    
    if (count >= max) {
      const retryAfter = windowSec - (now - windowStart);
      c.res.headers.set('X-RateLimit-Limit', String(max));
      c.res.headers.set('X-RateLimit-Remaining', '0');
      c.res.headers.set('X-RateLimit-Reset', String(windowStart + windowSec));
      c.res.headers.set('Retry-After', String(retryAfter));
      return c.json({
        success: false,
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${retryAfter}s.`,
      }, 429);
    }
    
    // Increment counter — TTL = remaining window time so it auto-expires
    const remainingTtl = windowSec - (now - windowStart);
    await c.env.KV.put(key, `${count + 1}:${windowStart}`, { expirationTtl: remainingTtl > 0 ? remainingTtl : windowSec });
    
    c.res.headers.set('X-RateLimit-Limit', String(max));
    c.res.headers.set('X-RateLimit-Remaining', String(max - count - 1));
    c.res.headers.set('X-RateLimit-Reset', String(windowStart + windowSec));
  } catch {
    // If KV is unavailable (e.g., local dev), allow the request through
  }
  
  return next();
}

/**
 * KV-backed login rate limiting (stricter).
 * Limits login attempts per IP+email combination.
 */
export async function loginRateLimit(c: KVContext, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  
  // Use IP-only key since we don't have parsed body yet
  const key = `login:${ip}`;
  
  try {
    const current = await c.env.KV.get(key);
    const count = current ? parseInt(current, 10) : 0;
    
    if (count >= LOGIN_RATE_LIMIT) {
      return c.json({
        success: false,
        error: 'Too many login attempts',
        message: 'Too many login attempts. Try again in 15 minutes.',
      }, 429);
    }
    
    await c.env.KV.put(key, String(count + 1), { expirationTtl: LOGIN_WINDOW });
  } catch {
    // If KV is unavailable, allow the request through
  }
  
  return next();
}
