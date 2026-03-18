import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { DashboardDO } from './do/dashboard-state';
import { securityHeaders } from './middleware/security';
import { tenantMiddleware } from './middleware/tenant';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware, loginRateLimit } from './middleware/rate-limit';
import adminRoutes from './routes/admin';
import onboardingRoutes from './routes/onboarding';
import authRoutes from './routes/tenant/auth';
import patientRoutes from './routes/tenant/patients';
import testRoutes from './routes/tenant/tests';
import billingRoutes from './routes/tenant/billing';
import pharmacyRoutes from './routes/tenant/pharmacy';
import staffRoutes from './routes/tenant/staff';
import hrRoutes from './routes/tenant/hr';
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
import appointmentRoutes from './routes/tenant/appointments';
import admissionRoutes from './routes/tenant/admissions';
import nurseStationRoutes from './routes/tenant/nurseStation';
import doctorScheduleRoutes from './routes/tenant/doctorSchedules';
import prescriptionRoutes from './routes/tenant/prescriptions';
import dischargeRoutes from './routes/tenant/discharge';
import telemedicineRoutes from './routes/tenant/telemedicine';
import patientPortalRoutes from './routes/tenant/patientPortal';
import aiRoutes from './routes/tenant/ai';
import insuranceRoutes from './routes/tenant/insurance';
import billingInsuranceRoutes from './routes/tenant/billingInsurance';
import ipdChargeRoutes from './routes/tenant/ipdCharges';
import inboxRoutes from './routes/tenant/inbox';
import pushRoutes from './routes/tenant/push';
import fhirRoutes from './routes/tenant/fhir';
import allergyRoutes from './routes/tenant/allergies';
import billingCancellationRoutes from './routes/tenant/billingCancellation';
import billingHandoverRoutes from './routes/tenant/billingHandover';
import creditNoteRoutes from './routes/tenant/creditNotes';
import depositRoutes from './routes/tenant/deposits';
import doctorDashboardRoutes from './routes/tenant/doctorDashboard';
import doctorScheduleRoutes2 from './routes/tenant/doctorSchedule';
import emergencyRoutes from './routes/tenant/emergency';
import ipBillingRoutes from './routes/tenant/ipBilling';
import otRoutes from './routes/tenant/ot';
import pushNotificationRoutes from './routes/tenant/pushNotifications';
import settlementRoutes from './routes/tenant/settlements';
import vitalsRoutes from './routes/tenant/vitals';
import websiteRoutes from './routes/tenant/website';
import inventoryRoutes from './routes/tenant/inventory';
import billingMasterRoutes from './routes/tenant/billingMaster';
import billingProvisionalRoutes from './routes/tenant/billingProvisional';
import labSettingsRoutes from './routes/tenant/labSettings';
import reportLabRoutes from './routes/tenant/reportLab';
import reportPharmacyRoutes from './routes/tenant/reportPharmacy';
import reportAppointmentRoutes from './routes/tenant/reportAppointment';
import nursingRoutes from './routes/tenant/nursing';
import ePrescribingRoutes from './routes/tenant/ePrescribing';
import medicalRecordsRoutes from './routes/tenant/medicalRecords';
import clinicalRoutes from './routes/tenant/clinical';
import hospitalSiteRoutes from './routes/public/hospitalSite';

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

// ─── Public: Onboarding applications (from landing page) ─────────────
// CORS preflight for landing page cross-origin requests
app.options('/api/onboarding/*', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  c.header('Access-Control-Max-Age', '86400');
  return c.body(null, 204);
});
app.use('/api/onboarding/*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
});
app.use('/api/onboarding/*', (c, next) => rateLimitMiddleware(c, next, { window: 3600, max: 5 }));
app.route('/api/onboarding', onboardingRoutes);

// ─── Public: Hospital self-signup ──────────────────────────────────────
// Rate limit: max 10 registrations per IP per hour
app.use('/api/register', (c, next) => rateLimitMiddleware(c, next, { window: 3600, max: 10 }));
app.route('/api/register', registerRoutes);

// ─── Public: Invitation validation + acceptance (no auth needed) ────────
// Separate path /api/invite/ so it's registered before the catch-all
// '/api/*' tenant+auth middleware and doesn't require JWT.
app.route('/api/invite', publicInviteRoutes);

// ─── Public: Hospital site SSR (no auth needed) ──────────────────────
app.route('/site', hospitalSiteRoutes);

// ─── Public: Shared prescription view (no auth) ─────────────────────────
app.get('/api/rx/:token', async (c) => {
  const token = c.req.param('token');
  if (!token || token.length < 16) {
    return c.json({ error: 'Invalid share link' }, 400);
  }

  const rx = await c.env.DB.prepare(`
    SELECT p.*, pt.name AS patient_name, pt.patient_code, pt.date_of_birth, pt.gender,
           d.name AS doctor_name, d.specialty, d.bmdc_reg_no, d.qualifications
    FROM prescriptions p
    LEFT JOIN patients pt ON p.patient_id = pt.id AND pt.tenant_id = p.tenant_id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.share_token = ?
  `).bind(token).first();

  if (!rx) return c.json({ error: 'Prescription not found or link expired' }, 404);

  // Check expiry
  const expiresAt = (rx as Record<string, unknown>).share_expires_at as string | null;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return c.json({ error: 'This share link has expired' }, 410);
  }

  // Fetch items
  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY sort_order'
  ).bind((rx as Record<string, unknown>).id).all();

  // Fetch hospital name
  const setting = await c.env.DB.prepare(
    `SELECT value FROM settings WHERE tenant_id = ? AND key = 'hospital_name'`
  ).bind((rx as Record<string, unknown>).tenant_id).first<{ value: string }>();

  return c.json({
    prescription: {
      ...rx,
      hospital_name: setting?.value ?? 'Hospital',
      items,
    },
  });
});

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
app.use('/api/admin/*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/admin/login') {
    return next();
  }
  // 🛡️ Sentinel: Ensure only super_admin can access the admin dashboard routes.
  if (c.get('role') !== 'super_admin') {
    return c.json({ error: 'Forbidden: Super admin access required' }, 403);
  }
  return next();
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

// ─── Public patient-portal OTP routes (tenant only, no JWT) ─────────
// Must be before the catch-all auth middleware so patients can request/verify OTP
app.use('/api/patient-portal/request-otp', tenantMiddleware);
app.use('/api/patient-portal/request-otp', (c, next) => rateLimitMiddleware(c, next, { window: 900, max: 5 }));
app.use('/api/patient-portal/verify-otp', tenantMiddleware);
app.use('/api/patient-portal/verify-otp', (c, next) => rateLimitMiddleware(c, next, { window: 900, max: 10 }));

// ─── Protected tenant routes ─────────────────────────────────────────
app.use('/api/*', tenantMiddleware);
app.use('/api/*', authMiddleware);

app.route('/api/patients', patientRoutes);
app.route('/api/tests', testRoutes);
app.route('/api/billing', billingRoutes);
app.route('/api/pharmacy', pharmacyRoutes);
app.route('/api/staff', staffRoutes);
app.route('/api/hr', hrRoutes);
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
app.route('/api/appointments', appointmentRoutes);
app.route('/api/admissions', admissionRoutes);
app.route('/api/nurse-station', nurseStationRoutes);
app.route('/api/doctor-schedules', doctorScheduleRoutes);
app.route('/api/prescriptions', prescriptionRoutes);
app.route('/api/discharge', dischargeRoutes);
app.route('/api/telemedicine', telemedicineRoutes);
app.route('/api/patient-portal', patientPortalRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/insurance', insuranceRoutes);
app.route('/api/billing/insurance', billingInsuranceRoutes);
app.route('/api/ipd-charges', ipdChargeRoutes);
app.route('/api/inbox', inboxRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/fhir', fhirRoutes);
app.route('/api/allergies', allergyRoutes);
app.route('/api/billing-cancellation', billingCancellationRoutes);
app.route('/api/billing-handover', billingHandoverRoutes);
app.route('/api/credit-notes', creditNoteRoutes);
app.route('/api/deposits', depositRoutes);
app.route('/api/doctor-dashboard', doctorDashboardRoutes);
app.route('/api/doctor-schedule', doctorScheduleRoutes2);
app.route('/api/emergency', emergencyRoutes);
app.route('/api/ip-billing', ipBillingRoutes);
app.route('/api/ot', otRoutes);
app.route('/api/push-notifications', pushNotificationRoutes);
app.route('/api/settlements', settlementRoutes);
app.route('/api/vitals', vitalsRoutes);
app.route('/api/website', websiteRoutes);
app.route('/api/inventory', inventoryRoutes);
app.route('/api/billing-master', billingMasterRoutes);
app.route('/api/billing-provisional', billingProvisionalRoutes);
app.route('/api/lab-settings', labSettingsRoutes);
app.route('/api/reports/lab', reportLabRoutes);
app.route('/api/reports/pharmacy', reportPharmacyRoutes);
app.route('/api/reports/appointment', reportAppointmentRoutes);
app.route('/api/nursing', nursingRoutes);
app.route('/api/e-prescribing', ePrescribingRoutes);
app.route('/api/medical-records', medicalRecordsRoutes);
app.route('/api/clinical', clinicalRoutes);


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
  if ('status' in err && typeof (err as { status: number }).status === 'number') {
    return c.json({ error: err.message }, (err as { status: number }).status as 500);
  }
  return c.json({ error: 'Internal server error' }, 500);
});

// Export both the fetch handler (app) and the scheduled handler
// DashboardDO must be re-exported for the Cloudflare Workers runtime (matches wrangler.toml class_name)
export { DashboardDO };
export default {
  fetch: app.fetch,
  scheduled: scheduledHandler.scheduled,
};
