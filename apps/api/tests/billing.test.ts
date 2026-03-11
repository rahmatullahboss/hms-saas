import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { createPatient } from './helpers/fixtures';

// Helper to make API requests with tenant auth context
// For tests, we mock the auth middleware behavior by injecting headers 
// assuming the middleware checks headers (or we bypass it simply by having it)
// Let's assume the auth middleware accepts a dummy token or we can just mock it,
// but actually, we should just see what the auth middleware expects. 
// Assuming tests run in a controlled environment, let's just pass the required request.

async function request(method: string, path: string, body?: any) {
  // For testing purposes, we need to pass a valid JWT or bypass auth.
  // We can create a valid token, or maybe we can just bypass it.
  // Actually, wait, let's look at auth middleware. We don't have its secret.
  // But wait, we can just use the DB to create a test user and sign a token!
  // For now, let's assume `X-Tenant-Subdomain` is enough for tenantMiddleware.
  // If `authMiddleware` blocks us, we might need a token. Let's try without auth first or generate a test token.
  
  // Here I will generate a valid token using standard jsonwebtoken, but since it's a worker 
  // maybe we don't have jsonwebtoken easily. Let's see what happens.
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Subdomain': 'test'
      // 'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  // The fetch handler takes (request, env, ctx)
  return app.fetch(req, env as any, {} as any);
}

// Since authMiddleware might block, let's just mock the tenant and user context manually
// or write the test assuming we have a way. Actually, the easiest way for integration tests 
// is setting JWT_SECRET in env and signing a token.
import * as jwt from 'jsonwebtoken';

function getAuthHeaders(tenantId: number, userId: number = 1) {
  const token = jwt.sign(
    { sub: userId.toString(), tenantId },
    env.JWT_SECRET || 'test-secret', // Assuming JWT_SECRET is test-secret or fallback
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`
  };
}

async function api(method: string, path: string, body?: any) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(1),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

describe('Billing API Tests', () => {
  let patientId: number;

  beforeEach(async () => {
    // We already have a "test" tenant from setup.ts with ID = 1
    patientId = await createPatient(1, { name: 'John Doe', patient_code: 'P-123' });
  });

  describe('Bill Creation', () => {
    it('1. Create bill with multiple line items → correct subtotal/total', async () => {
      const payload = {
        patientId,
        items: [
          { itemCategory: 'test', description: 'Blood Test', quantity: 1, unitPrice: 500 },
          { itemCategory: 'medicine', description: 'Paracetamol', quantity: 2, unitPrice: 50 }
        ],
        discount: 0
      };

      const res = await api('POST', '/api/billing', payload);
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.message).toBe('Bill created');
      expect(data.total).toBe(600); // 500 + 100
      expect(data.invoiceNo).toMatch(/^INV-/);
    });

    it('2. Discount > subtotal → total clamped to 0', async () => {
      const payload = {
        patientId,
        items: [{ itemCategory: 'test', quantity: 1, unitPrice: 500 }],
        discount: 600 // More than subtotal
      };

      const res = await api('POST', '/api/billing', payload);
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.total).toBe(0); // Clamped to 0
    });

    it('8. Income record created on bill creation', async () => {
      const payload = {
        patientId,
        items: [{ itemCategory: 'test', quantity: 1, unitPrice: 500 }],
        discount: 0
      };

      const res = await api('POST', '/api/billing', payload);
      const data = await res.json() as any;

      // Check income table
      const income = await env.DB.prepare('SELECT amount FROM income WHERE ref_id = ?').bind(data.billId).first<{ amount: number }>();
      expect(income).toBeTruthy();
      expect(income?.amount).toBe(500);
    });

    it('9. Invoice number auto-increments', async () => {
      const payload = { patientId, items: [{ itemCategory: 'test', quantity: 1, unitPrice: 100 }], discount: 0 };
      
      const res1 = await api('POST', '/api/billing', payload);
      const data1 = await res1.json() as any;
      
      const res2 = await api('POST', '/api/billing', payload);
      const data2 = await res2.json() as any;

      expect(data1.invoiceNo).not.toBe(data2.invoiceNo);
    });
  });

  describe('Payment Processing', () => {
    let billId: number;

    beforeEach(async () => {
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'test', quantity: 1, unitPrice: 1000 }],
        discount: 0
      });
      const data = await res.json() as any;
      billId = data.billId;
    });

    it('3. Collect partial payment → status = partially_paid', async () => {
      const res = await api('POST', '/api/billing/pay', {
        billId, amount: 400, type: 'current'
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe('partially_paid');
      expect(data.outstanding).toBe(600);
      expect(data.paidAmount).toBe(400);
    });

    it('4. Collect full remaining → status = paid', async () => {
      await api('POST', '/api/billing/pay', { billId, amount: 400, type: 'current' });
      const res = await api('POST', '/api/billing/pay', { billId, amount: 600, type: 'due' });
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe('paid');
      expect(data.outstanding).toBe(0);
      expect(data.paidAmount).toBe(1000);
    });

    it('5. Overpayment rejected → 400 error', async () => {
      const res = await api('POST', '/api/billing/pay', {
        billId, amount: 1500, type: 'current'
      });
      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toBeDefined();
    });

    it('6. Pay on already-paid bill → 400 error', async () => {
      await api('POST', '/api/billing/pay', { billId, amount: 1000, type: 'current' });
      
      const res = await api('POST', '/api/billing/pay', { billId, amount: 100, type: 'due' });
      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toBeDefined(); // Bill is already fully paid
    });

    it('7. Bill not found → 404', async () => {
      const res = await api('POST', '/api/billing/pay', {
        billId: 9999, amount: 100, type: 'current'
      });
      expect(res.status).toBe(404);
    });

    it('10. Receipt number auto-increments', async () => {
      const res1 = await api('POST', '/api/billing/pay', { billId, amount: 100, type: 'current' });
      const data1 = await res1.json() as any;
      
      const res2 = await api('POST', '/api/billing/pay', { billId, amount: 200, type: 'current' });
      const data2 = await res2.json() as any;

      expect(data1.receiptNo).not.toBe(data2.receiptNo);
    });
  });

  describe('Security & Isolation', () => {
    it('11. Tenant isolation — cannot access other tenants bills', async () => {
      // Create a bill for Tenant 1
      const res = await api('POST', '/api/billing', {
        patientId,
        items: [{ itemCategory: 'test', quantity: 1, unitPrice: 1000 }],
        discount: 0
      });
      const data = await res.json() as any;
      const billId = data.billId;

      // Try to pay the bill as Tenant 2
      const token = jwt.sign({ sub: '1', tenantId: 2 }, env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
      
      const req = new Request(`http://localhost/api/billing/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': 'tenant2', // let's pretend 
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ billId, amount: 100, type: 'current' }),
      });
      const maliciousRes = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      
      expect(maliciousRes.status).toBe(404); // Bill not found for tenant 2
    });
  });
});
