import type { MiddlewareHandler } from 'hono';
import { verify, sign } from 'hono/jwt';
import type { Env, Variables } from '../types';

export interface JWTPayload {
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

  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // WebSocket connections can't send custom headers.
    // Accept token via query param for WebSocket-style paths.
    // NOTE: we also check Upgrade header, but Cloudflare's asset
    // pipeline may strip it before the worker sees the request.
    const queryToken = c.req.query('token');
    const isWsPath = c.req.path.endsWith('/ws');
    const isWsUpgrade = c.req.header('Upgrade') === 'websocket';
    if (queryToken && (isWsUpgrade || isWsPath)) {
      token = queryToken;
    }
  }

  if (!token) {
    return c.json({ error: 'No token provided' }, 401);
  }

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

    // Use hono/jwt verify — fully edge-runtime compatible (no Node.js crypto)
    const decoded = (await verify(token, secret, 'HS256')) as unknown as JWTPayload;

    c.set('userId', decoded.userId);
    c.set('role', decoded.role);
    if (decoded.tenantId) {
      c.set('tenantId', decoded.tenantId);
    }

    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('expired')) {
      return c.json({ error: 'Token has expired' }, 401);
    }
    return c.json({ error: 'Invalid token' }, 401);
  }
};

/**
 * Generate a JWT token using hono/jwt (edge-runtime compatible).
 * Pass `c.env.JWT_SECRET` as the `secret` argument.
 * Returns a Promise — callers must await.
 */
export async function generateToken(
  payload: JWTPayload,
  secret: string,
  expiresInHours = 8
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...payload,
      iat: now,
      exp: now + expiresInHours * 3600,
    } as Record<string, unknown>,
    secret
  );
}

/**
 * Blacklist a token in KV so it cannot be used again.
 * @param ttl remaining validity in seconds
 */
export async function blacklistToken(
  token: string,
  kv: KVNamespace,
  ttl = 86400
): Promise<void> {
  await kv.put(`blacklist:${token}`, '1', { expirationTtl: ttl });
}
