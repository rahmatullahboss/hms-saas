import type { MiddlewareHandler } from 'hono';
import jwt from 'jsonwebtoken';
import type { Env, Variables } from '../types';

interface JWTPayload {
  userId: string;
  role: string;
  tenantId?: string;
  permissions: string[];
}

export type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  // Public auth routes — skip token check
  if (path.startsWith('/api/auth/')) {
    await next();
    return;
  }

  // Patient portal public endpoints (OTP) — skip token check
  if (path === '/api/patient-portal/request-otp' || path === '/api/patient-portal/verify-otp') {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No token provided' }, 401);
  }

  const token = authHeader.substring(7);
  const secret = c.env.JWT_SECRET;

  if (!secret) {
    console.error('JWT_SECRET environment variable is not set.');
    return c.json({ error: 'Server configuration error' }, 500);
  }

  try {
    // Check token blacklist (for logout)
    try {
      const isBlacklisted = await c.env.KV.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return c.json({ error: 'Token has been revoked' }, 401);
      }
    } catch {
      // KV not available in local dev — skip blacklist check
    }

    const decoded = jwt.verify(token, secret) as JWTPayload;

    c.set('userId', decoded.userId);
    c.set('role', decoded.role);
    if (decoded.tenantId) {
      c.set('tenantId', decoded.tenantId);
    }

    await next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError && error.name === 'TokenExpiredError') {
      return c.json({ error: 'Token has expired' }, 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    return c.json({ error: 'Authentication failed' }, 401);
  }
};

/**
 * Generate a JWT token.
 * Pass `c.env.JWT_SECRET` as the `secret` argument.
 */
export function generateToken(payload: JWTPayload, secret: string, expiresIn = '8h'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, secret, { expiresIn } as any);
}

/**
 * Blacklist a token in KV so it cannot be used again.
 * @param ttl remaining validity in seconds
 */
export async function blacklistToken(token: string, kv: KVNamespace, ttl = 86400): Promise<void> {
  await kv.put(`blacklist:${token}`, '1', { expirationTtl: ttl });
}
