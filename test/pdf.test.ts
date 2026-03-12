import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import pdfRoutes from '../src/routes/tenant/pdf';

describe('PDF Routes', () => {
  describe('GET /invoice/:billingId', () => {
    it('should return 403 for missing role on invoice endpoint', async () => {
      const app = new Hono<{ Variables: { tenantId: number } }>();

      app.use('*', async (c, next) => {
        c.set('tenantId', 1);
        await next();
      });

      app.route('/pdf', pdfRoutes);

      const res = await app.request('/pdf/invoice/123');
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain('Insufficient permissions');
    });

    it('should return 403 for unauthorized roles on invoice endpoint', async () => {
      const app = new Hono<{ Variables: { role: string; tenantId: number } }>();

      app.use('*', async (c, next) => {
        c.set('role', 'unauthorized_role');
        c.set('tenantId', 1);
        await next();
      });

      app.route('/pdf', pdfRoutes);

      const res = await app.request('/pdf/invoice/123');
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain('Insufficient permissions');
    });
  });

  describe('GET /patient-card/:patientId', () => {
    it('should return 403 for missing role on patient-card endpoint', async () => {
      const app = new Hono<{ Variables: { tenantId: number } }>();

      app.use('*', async (c, next) => {
        c.set('tenantId', 1);
        await next();
      });

      app.route('/pdf', pdfRoutes);

      const res = await app.request('/pdf/patient-card/123');
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain('Insufficient permissions');
    });

    it('should return 403 for unauthorized roles on patient-card endpoint', async () => {
      const app = new Hono<{ Variables: { role: string; tenantId: number } }>();

      app.use('*', async (c, next) => {
        c.set('role', 'unauthorized_role');
        c.set('tenantId', 1);
        await next();
      });

      app.route('/pdf', pdfRoutes);

      const res = await app.request('/pdf/patient-card/123');
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain('Insufficient permissions');
    });
  });
});
