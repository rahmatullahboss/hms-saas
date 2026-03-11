/**
 * Email service using Resend (https://resend.com).
 *
 * Resend works natively on Cloudflare Workers (pure fetch, no Node.js deps).
 * Free tier: 3,000 emails/month, 100/day.
 *
 * Setup:
 *   1. Create account at resend.com
 *   2. Add & verify your domain (e.g., mail.yourhospital.com)
 *   3. wrangler secret put RESEND_API_KEY
 *   4. Set RESEND_FROM_EMAIL in wrangler.toml vars
 */

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;           // Plain-text fallback
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

// ─── XSS protection for HTML email templates ───────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Core send function ───────────────────────────────────────────────────────
export async function sendEmail(
  env: EmailEnv,
  payload: EmailPayload
): Promise<EmailResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL || 'HMS <noreply@hms.app>';

  if (!apiKey) {
    // Dev fallback: log to console if no API key configured
    console.log(`[EMAIL STUB] To: ${payload.to} | Subject: ${payload.subject}`);
    return { success: true, messageId: `stub-${Date.now()}` };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: payload.replyTo,
      }),
    });

    const data = await res.json() as { id?: string; message?: string; name?: string };

    if (!res.ok) {
      console.error(`[EMAIL] Resend error ${res.status}:`, data);
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }

    return { success: true, messageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EMAIL] Send failed:', message);
    return { success: false, error: message };
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function baseLayout(content: string, hospitalName = 'HMS'): string {
  const safeHospital = escapeHtml(hospitalName);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 32px auto; }
    .card { background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .header { background: #0f766e; color: white; border-radius: 8px 8px 0 0; padding: 20px 32px; margin: -32px -32px 24px; }
    .header h1 { margin: 0; font-size: 20px; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px; }
    .btn { display: inline-block; background: #0f766e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
    .info-row { border-bottom: 1px solid #f3f4f6; padding: 10px 0; }
    .info-row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-size: 13px; }
    .value { font-weight: 600; color: #111827; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header"><h1>🏥 ${safeHospital}</h1></div>
      ${content}
    </div>
    <div class="footer">This is an automated message from ${safeHospital}. Please do not reply.</div>
  </div>
</body>
</html>`.trim();
}

export const EmailTemplates = {

  // ─── Appointment Reminder ────────────────────────────────────────────────
  appointmentReminder({
    patientName,
    doctorName,
    appointmentDate,
    appointmentTime,
    hospitalName,
  }: {
    patientName: string;
    doctorName: string;
    appointmentDate: string;
    appointmentTime: string;
    hospitalName?: string;
  }) {
    const html = baseLayout(`
      <p>Dear <strong>${escapeHtml(patientName)}</strong>,</p>
      <p>This is a reminder for your upcoming appointment:</p>
      <div style="background:#f0fdf4;border-radius:6px;padding:16px;margin:16px 0;">
        <div class="info-row"><span class="label">Doctor</span><br><span class="value">Dr. ${escapeHtml(doctorName)}</span></div>
        <div class="info-row"><span class="label">Date</span><br><span class="value">${escapeHtml(appointmentDate)}</span></div>
        <div class="info-row"><span class="label">Time</span><br><span class="value">${escapeHtml(appointmentTime)}</span></div>
      </div>
      <p>Please arrive 10–15 minutes early. If you need to reschedule, contact us as soon as possible.</p>
    `, hospitalName);

    return {
      subject: `Appointment Reminder — Dr. ${escapeHtml(doctorName)} on ${escapeHtml(appointmentDate)}`,
      html,
      text: `Dear ${patientName}, reminder: appointment with Dr. ${doctorName} on ${appointmentDate} at ${appointmentTime}.`,
    };
  },

  // ─── Lab Report Ready ────────────────────────────────────────────────────
  labReportReady({
    patientName,
    testName,
    completedDate,
    hospitalName,
  }: {
    patientName: string;
    testName: string;
    completedDate: string;
    hospitalName?: string;
  }) {
    const html = baseLayout(`
      <p>Dear <strong>${escapeHtml(patientName)}</strong>,</p>
      <p>Your lab report is ready for collection:</p>
      <div style="background:#eff6ff;border-radius:6px;padding:16px;margin:16px 0;">
        <div class="info-row"><span class="label">Test</span><br><span class="value">${escapeHtml(testName)}</span></div>
        <div class="info-row"><span class="label">Completed</span><br><span class="value">${escapeHtml(completedDate)}</span></div>
      </div>
      <p>Please visit the hospital to collect your report. Bring this email or your patient ID.</p>
    `, hospitalName);

    return {
      subject: `Lab Report Ready — ${escapeHtml(testName)}`,
      html,
      text: `Dear ${patientName}, your lab report for "${testName}" is ready. Please collect it from the hospital.`,
    };
  },

  // ─── Invoice / Bill ───────────────────────────────────────────────────────
  invoiceSummary({
    patientName,
    invoiceNumber,
    totalAmount,
    paidAmount,
    dueAmount,
    dueDate,
    hospitalName,
  }: {
    patientName: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    dueDate?: string;
    hospitalName?: string;
  }) {
    const html = baseLayout(`
      <p>Dear <strong>${escapeHtml(patientName)}</strong>,</p>
      <p>Please find your invoice summary below:</p>
      <div style="background:#fff7ed;border-radius:6px;padding:16px;margin:16px 0;">
        <div class="info-row"><span class="label">Invoice #</span><br><span class="value">${escapeHtml(invoiceNumber)}</span></div>
        <div class="info-row"><span class="label">Total Amount</span><br><span class="value">৳${totalAmount.toLocaleString()}</span></div>
        <div class="info-row"><span class="label">Amount Paid</span><br><span class="value" style="color:#16a34a;">৳${paidAmount.toLocaleString()}</span></div>
        <div class="info-row"><span class="label">Amount Due</span><br><span class="value" style="color:${dueAmount > 0 ? '#dc2626' : '#16a34a'};">৳${dueAmount.toLocaleString()}</span></div>
        ${dueDate ? `<div class="info-row"><span class="label">Due Date</span><br><span class="value">${escapeHtml(dueDate)}</span></div>` : ''}
      </div>
      ${dueAmount > 0 ? '<p>Please settle the outstanding amount at your earliest convenience.</p>' : '<p>Thank you — your account is fully settled.</p>'}
    `, hospitalName);

    return {
      subject: `Invoice ${escapeHtml(invoiceNumber)} — ${dueAmount > 0 ? `৳${dueAmount} Due` : 'Fully Paid'}`,
      html,
      text: `Dear ${patientName}, Invoice ${invoiceNumber}: Total ৳${totalAmount}, Paid ৳${paidAmount}, Due ৳${dueAmount}.`,
    };
  },

  // ─── New User Welcome ────────────────────────────────────────────────────
  welcomeUser({
    name,
    email,
    role,
    hospitalName,
    loginUrl,
  }: {
    name: string;
    email: string;
    role: string;
    hospitalName: string;
    loginUrl: string;
  }) {
    const html = baseLayout(`
      <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your account has been created at <strong>${escapeHtml(hospitalName)}</strong>.</p>
      <div style="background:#f0fdf4;border-radius:6px;padding:16px;margin:16px 0;">
        <div class="info-row"><span class="label">Email</span><br><span class="value">${escapeHtml(email)}</span></div>
        <div class="info-row"><span class="label">Role</span><br><span class="value" style="text-transform:capitalize;">${escapeHtml(role.replace('_', ' '))}</span></div>
      </div>
      <p style="text-align:center;margin-top:24px;">
        <a href="${escapeHtml(loginUrl)}" class="btn">Login to HMS</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If you did not expect this email, please ignore it.</p>
    `, hospitalName);

    return {
      subject: `Welcome to ${escapeHtml(hospitalName)} — Your Account is Ready`,
      html,
      text: `Hello ${name}, your account at ${hospitalName} is ready. Login at: ${loginUrl}`,
    };
  },

  // ─── Medicine Expiry Alert (internal/staff) ───────────────────────────────
  medicineExpiryAlert({
    medicines,
    hospitalName,
  }: {
    medicines: Array<{ name: string; expiryDate: string; stock: number; batchNo: string }>;
    hospitalName?: string;
  }) {
    const rows = medicines.map(m => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(m.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(m.batchNo)}</td>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#dc2626;font-weight:bold;">${escapeHtml(m.expiryDate)}</td>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${m.stock}</td>
      </tr>`).join('');

    const html = baseLayout(`
      <p>⚠️ The following medicines are expiring within 30 days:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#fef2f2;">
            <th style="padding:8px;text-align:left;">Medicine</th>
            <th style="padding:8px;text-align:left;">Batch</th>
            <th style="padding:8px;text-align:left;">Expiry</th>
            <th style="padding:8px;text-align:left;">Stock</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#dc2626;">Please take immediate action to dispose of or return these medicines.</p>
    `, hospitalName);

    return {
      subject: `⚠️ Medicine Expiry Alert — ${medicines.length} item(s) expiring soon`,
      html,
      text: `Medicine expiry alert: ${medicines.map(m => `${m.name} (expires ${m.expiryDate})`).join(', ')}`,
    };
  },
};
