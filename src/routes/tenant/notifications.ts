/**
 * Notification routes — SMS + Email
 *
 * All routes require authentication (tenant middleware + authMiddleware applied in index.ts).
 *
 * POST /api/notifications/sms         — Send ad-hoc SMS to a phone number
 * POST /api/notifications/email       — Send ad-hoc email
 * POST /api/notifications/appointment — Send appointment reminder (SMS + Email)
 * POST /api/notifications/lab-ready   — Notify patient that lab report is ready
 * POST /api/notifications/invoice     — Send invoice summary email
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { createSmsProvider, SmsTemplates } from '../../lib/sms';
import { sendEmail, EmailTemplates } from '../../lib/email';
import { createWhatsAppProvider, WhatsAppTemplates } from '../../lib/whatsapp';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';

const notificationRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// ─── Schemas ──────────────────────────────────────────────────────────────────
const ALLOWED_NOTIFICATION_ROLES = ['hospital_admin', 'reception', 'doctor', 'nurse'];

function requireNotificationRole(role?: string): void {
  if (!role || !ALLOWED_NOTIFICATION_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Insufficient permissions to send notifications' });
  }
}

const smsSchema = z.object({
  phone: z.string().min(10, 'Phone number required'),
  message: z.string().min(1, 'Message required').max(612, 'SMS message too long (max 612 chars)'),
});

const emailSchema = z.object({
  to: z.string().email('Valid email required'),
  subject: z.string().min(1, 'Subject required'),
  html: z.string().min(1, 'HTML body required'),
  text: z.string().optional(),
});

const appointmentSchema = z.object({
  patientName: z.string().min(1),
  patientEmail: z.string().email().optional(),
  patientPhone: z.string().min(10).optional(),
  doctorName: z.string().min(1),
  appointmentDate: z.string().min(1),
  appointmentTime: z.string().min(1),
  channel: z.enum(['sms', 'email', 'whatsapp', 'both', 'all']).default('both'),
});

const labReadySchema = z.object({
  patientName: z.string().min(1),
  patientEmail: z.string().email().optional(),
  patientPhone: z.string().min(10).optional(),
  testName: z.string().min(1),
  completedDate: z.string().min(1),
  channel: z.enum(['sms', 'email', 'whatsapp', 'both', 'all']).default('both'),
});

const prescriptionReadySchema = z.object({
  patientName: z.string().min(1),
  patientPhone: z.string().min(10).optional(),
  patientEmail: z.string().email().optional(),
  doctorName: z.string().min(1),
  shareToken: z.string().min(1),
  shareUrl: z.string().url(),                          // full shareable link
  channel: z.enum(['sms', 'email', 'whatsapp', 'both', 'all']).default('whatsapp'),
});

const whatsappSchema = z.object({
  phone: z.string().min(10, 'Phone number required'),
  message: z.string().min(1, 'Message required').max(4096, 'WhatsApp message too long'),
});

const invoiceSchema = z.object({
  patientName: z.string().min(1),
  patientEmail: z.string().email(),
  invoiceNumber: z.string().min(1),
  totalAmount: z.number().min(0),
  paidAmount: z.number().min(0),
  dueAmount: z.number().min(0),
  dueDate: z.string().optional(),
});

// ─── POST /sms — Raw SMS ──────────────────────────────────────────────────────
notificationRoutes.post('/sms', zValidator('json', smsSchema), async (c) => {
  const { phone, message } = c.req.valid('json');
  const role = c.get('role');

  if (role !== 'hospital_admin' && role !== 'reception') {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  const sms = createSmsProvider(c.env);
  const result = await sms.sendSMS(phone, message);

  if (!result.success) {
    return c.json({ error: `SMS failed: ${result.error}` }, 502);
  }

  return c.json({ success: true, messageId: result.messageId });
});

// ─── POST /email — Raw Email ──────────────────────────────────────────────────
notificationRoutes.post('/email', zValidator('json', emailSchema), async (c) => {
  const payload = c.req.valid('json');
  const role = c.get('role');

  if (role !== 'hospital_admin' && role !== 'reception') {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  const result = await sendEmail(c.env, payload);

  if (!result.success) {
    return c.json({ error: `Email failed: ${result.error}` }, 502);
  }

  return c.json({ success: true, messageId: result.messageId });
});

// ─── POST /appointment — Appointment reminder ─────────────────────────────────
notificationRoutes.post('/appointment', zValidator('json', appointmentSchema), async (c) => {
  const data = c.req.valid('json');
  const tenantId = requireTenantId(c);
  requireNotificationRole(c.get('role'));

  // Get hospital name for this tenant
  const tenant = await c.env.DB.prepare(
    'SELECT name FROM tenants WHERE id = ?'
  ).bind(tenantId).first<{ name: string }>();

  const hospitalName = tenant?.name || 'HMS';
  const results: Record<string, unknown> = {};

  const usesSms  = data.channel === 'sms'  || data.channel === 'both' || data.channel === 'all';
  const usesEmail= data.channel === 'email' || data.channel === 'both' || data.channel === 'all';
  const usesWa   = data.channel === 'whatsapp' || data.channel === 'all';

  // ─── SMS ───────────────────────────────────────────────────────────────
  if (usesSms && data.patientPhone) {
    const sms = createSmsProvider(c.env);
    const dateTime = `${data.appointmentDate} ${data.appointmentTime}`;
    const message = SmsTemplates.appointmentReminderEn(
      data.patientName,
      data.doctorName,
      dateTime
    );
    results.sms = await sms.sendSMS(data.patientPhone, message);
  }

  // ─── WhatsApp ──────────────────────────────────────────────────────────
  if (usesWa && data.patientPhone) {
    const wa = createWhatsAppProvider(c.env);
    const params = WhatsAppTemplates.appointmentReminderBn(
      data.patientName,
      data.doctorName,
      data.appointmentDate,
      data.appointmentTime,
      hospitalName
    );
    results.whatsapp = await wa.sendTemplate(data.patientPhone, 'appointment_reminder_bn', 'bn', params);
  }

  // ─── Email ─────────────────────────────────────────────────────────────
  if (usesEmail && data.patientEmail) {
    const template = EmailTemplates.appointmentReminder({
      patientName: data.patientName,
      doctorName: data.doctorName,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      hospitalName,
    });
    results.email = await sendEmail(c.env, { to: data.patientEmail, ...template });
  }

  return c.json({ success: true, results });
});

// ─── POST /lab-ready — Lab report notification ────────────────────────────────
notificationRoutes.post('/lab-ready', zValidator('json', labReadySchema), async (c) => {
  const data = c.req.valid('json');
  const tenantId = requireTenantId(c);
  requireNotificationRole(c.get('role'));

  const tenant = await c.env.DB.prepare(
    'SELECT name FROM tenants WHERE id = ?'
  ).bind(tenantId).first<{ name: string }>();

  const hospitalName = tenant?.name || 'HMS';
  const results: Record<string, unknown> = {};

  const usesSmsLab  = data.channel === 'sms'  || data.channel === 'both' || data.channel === 'all';
  const usesEmailLab = data.channel === 'email' || data.channel === 'both' || data.channel === 'all';
  const usesWaLab    = data.channel === 'whatsapp' || data.channel === 'all';

  if (usesSmsLab && data.patientPhone) {
    const sms = createSmsProvider(c.env);
    const message = SmsTemplates.labReady(data.patientName, data.testName);
    results.sms = await sms.sendSMS(data.patientPhone, message);
  }

  if (usesWaLab && data.patientPhone) {
    const wa = createWhatsAppProvider(c.env);
    const params = WhatsAppTemplates.labReportReadyBn(data.patientName, data.testName);
    results.whatsapp = await wa.sendTemplate(data.patientPhone, 'lab_report_ready_bn', 'bn', params);
  }

  if (usesEmailLab && data.patientEmail) {
    const template = EmailTemplates.labReportReady({
      patientName: data.patientName,
      testName: data.testName,
      completedDate: data.completedDate,
      hospitalName,
    });
    results.email = await sendEmail(c.env, { to: data.patientEmail, ...template });
  }

  return c.json({ success: true, results });
});

// ─── POST /invoice — Invoice summary email ────────────────────────────────────
notificationRoutes.post('/invoice', zValidator('json', invoiceSchema), async (c) => {
  const data = c.req.valid('json');
  const tenantId = requireTenantId(c);
  requireNotificationRole(c.get('role'));

  const tenant = await c.env.DB.prepare(
    'SELECT name FROM tenants WHERE id = ?'
  ).bind(tenantId).first<{ name: string }>();

  const hospitalName = tenant?.name || 'HMS';

  const template = EmailTemplates.invoiceSummary({ ...data, hospitalName });
  const result = await sendEmail(c.env, { to: data.patientEmail, ...template });

  if (!result.success) {
    return c.json({ error: `Email failed: ${result.error}` }, 502);
  }

  return c.json({ success: true, messageId: result.messageId });
});

// ─── POST /prescription-ready — Prescription share notification ───────────────
notificationRoutes.post('/prescription-ready', zValidator('json', prescriptionReadySchema), async (c) => {
  const data = c.req.valid('json');
  requireNotificationRole(c.get('role'));

  const results: Record<string, unknown> = {};

  const usesWa    = data.channel === 'whatsapp' || data.channel === 'both' || data.channel === 'all';
  const usesSms   = data.channel === 'sms'      || data.channel === 'both' || data.channel === 'all';
  const usesEmail = data.channel === 'email'    || data.channel === 'both' || data.channel === 'all';

  if (usesWa && data.patientPhone) {
    const wa = createWhatsAppProvider(c.env);
    const params = WhatsAppTemplates.prescriptionReadyBn(
      data.patientName,
      data.doctorName,
      data.shareToken
    );
    results.whatsapp = await wa.sendTemplate(data.patientPhone, 'prescription_ready_bn', 'bn', params);
  }

  if (usesSms && data.patientPhone) {
    const sms = createSmsProvider(c.env);
    const msg = `প্রিয় ${data.patientName}, Dr. ${data.doctorName} এর প্রেসক্রিপশন: ${data.shareUrl} (৪৮ ঘণ্টা বৈধ) - HMS`;
    results.sms = await sms.sendSMS(data.patientPhone, msg);
  }

  if (usesEmail && data.patientEmail) {
    results.email = await sendEmail(c.env, {
      to: data.patientEmail,
      subject: 'আপনার প্রেসক্রিপশন প্রস্তুত',
      html: `<p>প্রিয় ${data.patientName},</p><p>Dr. ${data.doctorName} আপনার প্রেসক্রিপশন দিয়েছেন।</p><p><a href="${data.shareUrl}">প্রেসক্রিপশন দেখুন</a> (৪৮ ঘণ্টা বৈধ)</p>`,
      text: `প্রেসক্রিপশন লিংক: ${data.shareUrl}`,
    });
  }

  return c.json({ success: true, results });
});

// ─── POST /whatsapp — Ad-hoc WhatsApp text message ────────────────────────────
notificationRoutes.post('/whatsapp', zValidator('json', whatsappSchema), async (c) => {
  const { phone, message } = c.req.valid('json');
  const role = c.get('role');

  if (role !== 'hospital_admin' && role !== 'reception') {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  const wa = createWhatsAppProvider(c.env);
  const result = await wa.sendText(phone, message);

  if (!result.success) {
    return c.json({ error: `WhatsApp failed: ${result.error}` }, 502);
  }

  return c.json({ success: true, messageId: result.messageId });
});

export default notificationRoutes;
