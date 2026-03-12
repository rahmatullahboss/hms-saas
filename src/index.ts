import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { securityHeaders } from './middleware/security';
import { tenantMiddleware } from './middleware/tenant';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware, loginRateLimit } from './middleware/rate-limit';
import adminRoutes from './routes/admin';
import authRoutes from './routes/tenant/auth';
import patientRoutes from './routes/tenant/patients';
import testRoutes from './routes/tenant/tests';
import billingRoutes from './routes/tenant/billing';
import pharmacyRoutes from './routes/tenant/pharmacy';
import staffRoutes from './routes/tenant/staff';
import dashboardRoutes from './routes/tenant/dashboard';
import settingsRoutes from './routes/tenant/settings';
import shareholderRoutes from './routes/tenant/shareholders';
import seedRoutes from './routes/seed';
import initRoutes from './routes/init';
import accountingRoutes from './routes/tenant/accounting';
import incomeRoutes from './routes/tenant/income';
import expenseRoutes from './routes/tenant/expenses';
import accountsRoutes from './routes/tenant/accounts';
import reportsRoutes from './routes/tenant/reports';
import auditRoutes from './routes/tenant/audit';
import profitRoutes from './routes/tenant/profit';
import journalRoutes from './routes/tenant/journal';
import recurringRoutes from './routes/tenant/recurring';
import scheduledHandler from './scheduled';
import doctorRoutes from './routes/tenant/doctors';
import visitRoutes from './routes/tenant/visits';
import labRoutes from './routes/tenant/lab';
import commissionRoutes from './routes/tenant/commissions';
import registerRoutes from './routes/register';
import loginDirectRoutes from './routes/login-direct';
import publicInviteRoutes from './routes/public-invite';
import invitationRoutes from './routes/tenant/invitations';
import notificationRoutes from './routes/tenant/notifications';
import pdfRoutes from './routes/tenant/pdf';
import branchRoutes from './routes/tenant/branches';
import paymentRoutes from './routes/tenant/payments';
import consultationRoutes from './routes/tenant/consultations';

import type { Env } from './types';

const app = new Hono<{ 
  Bindings: Env;
  Variables: {
    tenantId?: string;
    userId?: string;
    role?: string;
  };
}>();

// Security headers on all responses
app.use('*', securityHeaders);

// Note: CORS removed — running as single-origin Worker.
// API and frontend are served from the same domain, so CORS is not needed.
// If you expose the API to external clients, add CORS back selectively.


app.use('*', logger());

// Health check (public — useful for uptime monitors)
app.get('/api/health', (c) => c.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));

// ─── Dev-only routes (guarded by ENVIRONMENT check) ─────────────────
app.use('/api/seed/*', async (c, next) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in this environment' }, 403);
  }
  return next();
});
app.use('/api/init/*', async (c, next) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in this environment' }, 403);
  }
  return next();
});

app.route('/api/seed', seedRoutes);
app.route('/api/init', initRoutes);

// ─── Public: Hospital self-signup ──────────────────────────────────────
// Rate limit: max 10 registrations per IP per hour
app.use('/api/register', (c, next) => rateLimitMiddleware(c, next, { window: 3600, max: 10 }));
app.route('/api/register', registerRoutes);

// ─── Public: Invitation validation + acceptance (no auth needed) ────────
// Separate path /api/invite/ so it's registered before the catch-all
// '/api/*' tenant+auth middleware and doesn't require JWT.
app.route('/api/invite', publicInviteRoutes);

// ─── Admin routes ─────────────────────────────────────────────────────
// Admin login is public but rate-limited
app.use('/api/admin/login', loginRateLimit);
app.use('/api/admin/*', async (c, next) => {
  const path = c.req.path;
  // Allow login without auth
  if (path === '/api/admin/login') {
    return next();
  }
  // All other admin routes require auth
  return authMiddleware(c, next);
});

app.route('/api/admin', adminRoutes);

// ─── Direct login (no tenant slug needed) ─────────────────────────────
// Slug-free login: resolves tenant from email automatically.
// Must be mounted BEFORE the catch-all tenant middleware.
app.use('/api/auth/login-direct', loginRateLimit);
app.route('/api/auth/login-direct', loginDirectRoutes);

// ─── Tenant auth routes ──────────────────────────────────────────────
// Login and logout are public; register requires authentication
// Rate limit login: 5 attempts per IP per 15 minutes
app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth/*', tenantMiddleware);
app.use('/api/auth/register', authMiddleware);
app.route('/api/auth', authRoutes);

// ─── Protected tenant routes ─────────────────────────────────────────
app.use('/api/*', tenantMiddleware);
app.use('/api/*', authMiddleware);

app.route('/api/patients', patientRoutes);
app.route('/api/tests', testRoutes);
app.route('/api/billing', billingRoutes);
app.route('/api/pharmacy', pharmacyRoutes);
app.route('/api/staff', staffRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/shareholders', shareholderRoutes);
app.route('/api/accounting', accountingRoutes);
app.route('/api/income', incomeRoutes);
app.route('/api/expenses', expenseRoutes);
app.route('/api/accounts', accountsRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/audit', auditRoutes);
app.route('/api/profit', profitRoutes);
app.route('/api/journal', journalRoutes);
app.route('/api/recurring', recurringRoutes);
app.route('/api/doctors', doctorRoutes);
app.route('/api/visits', visitRoutes);
app.route('/api/lab', labRoutes);
app.route('/api/commissions', commissionRoutes);
app.route('/api/invitations', invitationRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/pdf', pdfRoutes);
app.route('/api/branches', branchRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/consultations', consultationRoutes);


// ─── Not Found handler ──────────────────────────────────────────────
// For API routes: return JSON 404
// For all other routes: fallback to static assets (SPA handles it)
// wrangler.toml run_worker_first=['/api/*'] ensures Worker only runs for API
// routes; this handler is a safety net for unexpected /api/* misses.
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  // Serve SPA index.html for all non-API 404s (client-side routing)
  return c.env.ASSETS.fetch(c.req.raw);
});

// Global error handler — handles HTTPException & unknown errors
app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`, err);
  if (err instanceof Error && 'getResponse' in err && typeof (err as { getResponse?: () => Response }).getResponse === 'function') {
    return (err as { getResponse: () => Response }).getResponse();
  }
  return c.json({ error: 'Internal server error' }, 500);
});

// Export both the fetch handler (app) and the scheduled handler
export default {
  fetch: app.fetch,
  scheduled: scheduledHandler.scheduled,
};
