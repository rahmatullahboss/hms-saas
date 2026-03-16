/**
 * Integration tests for src/middleware/tenant.ts
 *
 * Tests tenant identification via hostname, X-Tenant-ID header,
 * subdomain lookup, and status validation.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware } from '../../../src/middleware/tenant';
import { createMockDB } from '../helpers/mock-db';
import { TENANT_1, TENANT_INACTIVE, TENANT_SUSPENDED } from '../helpers/fixtures';
import type { Env, Variables } from '../../../src/types';

// ─── Test helpers ──────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  subdomain: string;
  status: string;
  name: string;
}

function buildApp(tenants: TenantRow[] = []) {
  const { db } = createMockDB({
    tables: { tenants: tenants as unknown as Record<string, unknown>[] },
  });

  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use('*', async (c, next) => {
    c.env = { DB: db } as unknown as Env;
    await next();
  });

  app.use('*', tenantMiddleware);

  // Echo endpoint — returns resolved tenantId
  app.get('/ping', (c) => c.json({ tenantId: c.get('tenantId') }));

  app.onError((err, c) =>
    c.json({ error: err.message }, (err as { status?: number }).status ?? 500)
  );

  return app;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Tenant Middleware', () => {

  describe('Localhost / development mode', () => {
    it('resolves tenant from X-Tenant-ID header on localhost', async () => {
      const app = buildApp([TENANT_1 as unknown as TenantRow]);
      const res = await app.request(
        'http://localhost/ping',
        { headers: { 'X-Tenant-ID': TENANT_1.id } }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { tenantId: string };
      expect(body.tenantId).toBe(TENANT_1.id);
    });

    it('resolves tenant from X-Tenant-Subdomain on localhost via DB lookup', async () => {
      const app = buildApp([TENANT_1 as unknown as TenantRow]);
      const res = await app.request(
        'http://localhost/ping',
        { headers: { 'X-Tenant-Subdomain': TENANT_1.subdomain } }
      );
      expect(res.status).toBe(200);
    });
  });

  describe('Subdomain validation', () => {
    it('rejects reserved subdomain "www"', async () => {
      const app = buildApp([]);
      const res = await app.request('http://www.hospital.com/ping');
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Ii]nvalid|[Rr]eserved/);
    });

    it('rejects reserved subdomain "admin"', async () => {
      const app = buildApp([]);
      const res = await app.request('http://admin.hospital.com/ping');
      expect(res.status).toBe(400);
    });

    it('rejects reserved subdomain "api"', async () => {
      const app = buildApp([]);
      const res = await app.request('http://api.hospital.com/ping');
      expect(res.status).toBe(400);
    });

    it('returns 404 when subdomain not found in DB', async () => {
      const app = buildApp([]); // empty tenants table
      const res = await app.request('http://unknown-subdomain.hospital.com/ping');
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Nn]ot found|[Hh]ospital/);
    });
  });

  describe('Tenant status validation', () => {
    it('returns 403 when tenant is inactive', async () => {
      const app = buildApp([TENANT_INACTIVE as unknown as TenantRow]);
      const res = await app.request(
        `http://${TENANT_INACTIVE.subdomain}.hospital.com/ping`
      );
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/[Ii]nactive|[Ss]uspend|[Dd]isabled/);
    });

    it('returns 403 when tenant is suspended', async () => {
      const app = buildApp([TENANT_SUSPENDED as unknown as TenantRow]);
      const res = await app.request(
        `http://${TENANT_SUSPENDED.subdomain}.hospital.com/ping`
      );
      expect(res.status).toBe(403);
    });
  });

  describe('Active tenant resolution', () => {
    it('sets tenantId for an active tenant from subdomain', async () => {
      const app = buildApp([TENANT_1 as unknown as TenantRow]);
      const res = await app.request(
        `http://${TENANT_1.subdomain}.hospital.com/ping`
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { tenantId: string };
      expect(body.tenantId).toBeTruthy();
    });
  });
});
