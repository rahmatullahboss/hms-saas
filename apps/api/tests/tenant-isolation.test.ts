import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient } from './helpers/fixtures';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

function makeToken(tenantId: number, role = 'admin') {
  return jwt.sign(
    { userId: '1', tenantId: String(tenantId), role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function apiHeaders(tenantId: number, subdomain: string) {
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': subdomain,
    'Authorization': `Bearer ${makeToken(tenantId)}`,
  };
}

async function apiAs(tenantId: number, subdomain: string, method: string, path: string, body?: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: apiHeaders(tenantId, subdomain),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Multi-Tenant Isolation', () => {
  let tenant2Id: number;
  let patient1Id: number;

  beforeEach(async () => {
    // Create a second tenant
    const result = await env.DB.prepare(
      'INSERT INTO tenants (name, subdomain) VALUES (?, ?) RETURNING id'
    ).bind('Tenant Two Clinic', 'tenant2').first<{ id: number }>();
    tenant2Id = result!.id;

    // Create a patient for tenant 1
    patient1Id = await createPatient(1, { name: 'Tenant 1 Patient', patient_code: 'T1-001' });
  });

  it('Tenant 1 cannot read Tenant 2 patient data', async () => {
    // Create patient in tenant 2
    const p2Result = await env.DB.prepare(
      'INSERT INTO patients (tenant_id, name, patient_code, mobile) VALUES (?, ?, ?, ?) RETURNING id'
    ).bind(tenant2Id, 'Tenant 2 Patient', 'T2-001', '01700000001').first<{ id: number }>();
    const p2Id = p2Result!.id;

    // Tenant 1 tries to GET patient from their own context
    const res = await apiAs(1, 'test', 'GET', `/api/patients/${p2Id}`);
    // Should either 404 (not found in tenant 1) or return with tenant_id mismatch
    if (res.status === 200) {
      const data = await res.json() as any;
      expect(data.patient.tenant_id).toBe(1); // Must not be tenant 2's patient
    } else {
      expect(res.status).toBe(404);
    }
  });

  it('Tenant 1 cannot create data visible to Tenant 2', async () => {
    await apiAs(1, 'test', 'POST', '/api/patients', {
      name: 'T1 Only Patient',
      mobile: '01700000002',
    });

    // Tenant 2 lists patients — should be empty
    const res = await apiAs(tenant2Id, 'tenant2', 'GET', '/api/patients');
    if (res.status === 200) {
      const data = await res.json() as any;
      const found = data.patients?.find((p: any) => p.name === 'T1 Only Patient');
      expect(found).toBeUndefined();
    }
  });

  it('Unauthenticated request to protected route → 401', async () => {
    const req = new Request('http://localhost/api/patients', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test' },
    });
    const res = await app.fetch(req, env as any, {} as any);
    expect(res.status).toBe(401);
  });

  it('Invalid JWT → 401', async () => {
    const req = new Request('http://localhost/api/patients', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Subdomain': 'test',
        'Authorization': 'Bearer this-is-not-a-valid-jwt',
      },
    });
    const res = await app.fetch(req, env as any, {} as any);
    expect(res.status).toBe(401);
  });

  it('Expired JWT → 401', async () => {
    const expiredToken = jwt.sign(
      { userId: '1', tenantId: '1', role: 'admin', permissions: [] },
      TEST_JWT_SECRET,
      { expiresIn: '-1h' } // Already expired
    );
    const req = new Request('http://localhost/api/patients', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Subdomain': 'test',
        'Authorization': `Bearer ${expiredToken}`,
      },
    });
    const res = await app.fetch(req, env as any, {} as any);
    expect(res.status).toBe(401);
  });
});
