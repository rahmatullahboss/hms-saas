import { Context, Next } from 'hono';

// In-memory cache (use KV in production)
interface CacheEntry {
  value: any;
  expiry: number;
}

const memoryCache = new Map<string, CacheEntry>();

// Default cache TTL (Time To Live) in seconds
const DEFAULT_TTL = 300; // 5 minutes

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: string; // Custom cache key
}

/**
 * Get value from cache
 */
export function getCache(key: string): any | null {
  const entry = memoryCache.get(key);
  
  if (!entry) {
    return null;
  }
  
  if (Date.now() > entry.expiry) {
    memoryCache.delete(key);
    return null;
  }
  
  return entry.value;
}

/**
 * Set value in cache
 */
export function setCache(key: string, value: any, ttl: number = DEFAULT_TTL): void {
  memoryCache.set(key, {
    value,
    expiry: Date.now() + (ttl * 1000),
  });
}

/**
 * Delete value from cache
 */
export function deleteCache(key: string): boolean {
  return memoryCache.delete(key);
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
  memoryCache.clear();
}

/**
 * Clear expired cache entries
 */
export function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (now > entry.expiry) {
      memoryCache.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupCache, 60 * 1000);

/**
 * Cache middleware
 * Caches GET request responses
 */
export function cacheMiddleware(c: Context, next: Next, options: CacheOptions = {}) {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const key = options.key ?? `cache:${c.req.method}:${c.req.url}`;
  
  // Only cache GET requests
  if (c.req.method !== 'GET') {
    return next();
  }
  
  // Check cache first
  const cached = getCache(key);
  if (cached !== null) {
    return c.json(cached);
  }
  
  // Execute the handler
  const response = next();
  
  // Cache the response
  response.then((res) => {
    // Only cache successful responses
    if (res.status === 200) {
      // Clone the response to read the body
      res.clone().json().then((body) => {
        setCache(key, body, ttl);
      }).catch(() => {
        // Ignore JSON parse errors
      });
    }
  });
  
  return response;
}

/**
 * Invalidate cache by pattern
 */
export function invalidateCache(pattern: string): number {
  let count = 0;
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  
  for (const entry of memoryCache.values()) {
    if (now > entry.expiry) {
      expired++;
    } else {
      active++;
    }
  }
  
  return {
    total: memoryCache.size,
    active,
    expired,
  };
}
