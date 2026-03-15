import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { captureException } from './lib/sentry';
import { securityHeaders } from './middleware/security';
import { tenantMiddleware } from './middleware/tenant';
import { authMiddleware } from './middleware/auth';
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
import appointmentRoutes from './routes/tenant/appointments';
import { prescriptionRoutes } from './routes/tenant/prescriptions';
import doctorDashboardRoutes from './routes/tenant/doctorDashboard';
import admissionRoutes from './routes/tenant/admissions';
import notificationRoutes from './routes/tenant/notifications';
import nurseStationRoutes from './routes/tenant/nurseStation';
import dischargeRoutes from './routes/tenant/discharge';
import doctorScheduleRoutes from './routes/tenant/doctorSchedule';
import ipdChargeRoutes from './routes/tenant/ipdCharges';
import telemedicineRoutes from './routes/tenant/telemedicine';
import consultationRoutes from './routes/tenant/consultations';
import invitationRoutes from './routes/tenant/invitations';
import patientPortalRoutes from './routes/tenant/patientPortal';
import branchRoutes from './routes/tenant/branches';
import pushRoutes from './routes/tenant/pushNotifications';
import hospitalSite from './routes/public/hospitalSite';
import websiteRoutes from './routes/tenant/website';

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

// CORS — restrict to allowed origins
app.use('*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5174', 'http://localhost:8787'];
  
  const corsMiddleware = cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Tenant-Subdomain'],
    exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
    credentials: true,
  });
  
  return corsMiddleware(c, next);
});

app.use('*', logger());

// Health check (public)
app.get('/', (c) => c.json({ 
  message: 'HMS API Running',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

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

// ─── Public hospital website (no auth, served from KV cache) ─────────
app.route('/site', hospitalSite);

// ─── Admin routes ─────────────────────────────────────────────────────
// Admin login is public (no auth needed)
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

// ─── Tenant auth routes ──────────────────────────────────────────────
// Login and logout are public; register requires authentication
app.use('/api/auth/*', tenantMiddleware);
app.use('/api/auth/register', authMiddleware);
app.route('/api/auth', authRoutes);

// ─── Patient Portal routes ───────────────────────────────────────────
// Auth endpoints (request-otp, verify-otp) are public; all other
// endpoints require JWT via authMiddleware + patientAuthMiddleware.
app.use('/api/patient-portal/*', tenantMiddleware);
app.use('/api/patient-portal/me', authMiddleware);
app.use('/api/patient-portal/dashboard', authMiddleware);
app.use('/api/patient-portal/appointments', authMiddleware);
app.use('/api/patient-portal/prescriptions', authMiddleware);
app.use('/api/patient-portal/prescriptions/*', authMiddleware);
app.use('/api/patient-portal/lab-results', authMiddleware);
app.use('/api/patient-portal/bills', authMiddleware);
app.use('/api/patient-portal/vitals', authMiddleware);
app.use('/api/patient-portal/visits', authMiddleware);
app.use('/api/patient-portal/available-doctors', authMiddleware);
app.use('/api/patient-portal/available-slots/*', authMiddleware);
app.use('/api/patient-portal/book-appointment', authMiddleware);
app.use('/api/patient-portal/cancel-appointment/*', authMiddleware);
app.use('/api/patient-portal/messages', authMiddleware);
app.use('/api/patient-portal/messages/*', authMiddleware);
app.use('/api/patient-portal/refill-requests', authMiddleware);
app.use('/api/patient-portal/timeline', authMiddleware);
app.use('/api/patient-portal/family', authMiddleware);
app.use('/api/patient-portal/family/*', authMiddleware);
app.use('/api/patient-portal/refresh-token', authMiddleware);
app.route('/api/patient-portal', patientPortalRoutes);

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
app.route('/api/doctors', doctorDashboardRoutes); // /api/doctors/dashboard — must be before :id routes
app.route('/api/doctors', doctorRoutes);
app.route('/api/visits', visitRoutes);
app.route('/api/lab', labRoutes);
app.route('/api/commissions', commissionRoutes);
app.route('/api/appointments', appointmentRoutes);
app.route('/api/prescriptions', prescriptionRoutes);
app.route('/api/admissions', admissionRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/nurse-station', nurseStationRoutes);
app.route('/api/discharge', dischargeRoutes);
app.route('/api/doctor-schedules', doctorScheduleRoutes);
app.route('/api/ipd-charges', ipdChargeRoutes);
app.route('/api/telemedicine', telemedicineRoutes);
app.route('/api/consultations', consultationRoutes);
app.route('/api/invitations', invitationRoutes);
app.route('/api/branches', branchRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/website', websiteRoutes);


// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Global error handler — handles HTTPException & unknown errors
app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`, err);
  // Report unexpected (non-HTTP) errors to Sentry
  if (!(err instanceof HTTPException)) {
    captureException(c as any, err, { path: c.req.path, method: c.req.method });
  }
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
