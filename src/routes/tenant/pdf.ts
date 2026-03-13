/**
 * PDF routes — Bangla-compatible HTML invoice and patient card endpoints.
 *
 * GET /api/pdf/invoice/:billingId   — Full invoice HTML (open in browser, Ctrl+P)
 * GET /api/pdf/patient-card/:id     — Patient ID card HTML
 *
 * Add ?autoprint=1 to trigger window.print() automatically after fonts load.
 *
 * Frontend usage:
 *   window.open(`/api/pdf/invoice/${billingId}?autoprint=1`, '_blank');
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { renderInvoiceHtml, renderPatientCardHtml } from '../../lib/pdf-bangla';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';

const ALLOWED_PDF_ROLES = ['hospital_admin', 'reception', 'doctor', 'nurse'];

const pdfRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── GET /invoice/:billingId ───────────────────────────────────────────────────
pdfRoutes.get('/invoice/:billingId', async (c) => {
  const tenantId = requireTenantId(c);
  const billingId = c.req.param('billingId');
  const role = c.get('role');
  if (!role || !ALLOWED_PDF_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  try {
    // Fetch billing record
    const billing = await c.env.DB.prepare(`
      SELECT b.*,
             p.name      as patient_name,
             p.patient_code,
             p.mobile    as patient_mobile,
             t.name      as hospital_name,
             t.address   as hospital_address,
             t.phone     as hospital_phone
      FROM billing b
      JOIN patients p ON b.patient_id  = p.id
      JOIN tenants  t ON b.tenant_id   = t.id
      WHERE b.id = ? AND b.tenant_id = ?
    `).bind(billingId, tenantId).first<{
      invoice_no: string;
      created_at: string;
      patient_name: string;
      patient_code: string;
      patient_mobile: string;
      hospital_name: string;
      hospital_address?: string;
      hospital_phone?: string;
      total_amount: number;
      paid_amount: number;
      discount?: number;
      notes?: string;
    }>();

    if (!billing) throw new HTTPException(404, { message: 'Invoice not found' });

    // Fetch billing items
    const itemsResult = await c.env.DB.prepare(`
      SELECT description, quantity, unit_price, total_price
      FROM billing_items
      WHERE billing_id = ?
      ORDER BY id ASC
    `).bind(billingId).all<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>();

    const items = itemsResult.results.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.total_price,
    }));

    const totalAmount = billing.total_amount;
    const discount = billing.discount ?? 0;
    const paidAmount = billing.paid_amount;
    const subtotal = totalAmount + discount;

    const html = renderInvoiceHtml({
      invoiceNo: billing.invoice_no || billingId,
      date: billing.created_at.split('T')[0],
      patientName: billing.patient_name,
      patientCode: billing.patient_code,
      patientMobile: billing.patient_mobile,
      hospitalName: billing.hospital_name,
      hospitalAddress: billing.hospital_address,
      hospitalPhone: billing.hospital_phone,
      items,
      subtotal,
      discount: discount > 0 ? discount : undefined,
      totalAmount,
      paidAmount,
      dueAmount: totalAmount - paidAmount,
      notes: billing.notes,
    });

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to generate invoice' });
  }
});

// ─── GET /patient-card/:patientId ─────────────────────────────────────────────
pdfRoutes.get('/patient-card/:patientId', async (c) => {
  const tenantId = requireTenantId(c);
  const patientId = c.req.param('patientId');
  const role = c.get('role');
  if (!role || !ALLOWED_PDF_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  try {
    const patient = await c.env.DB.prepare(`
      SELECT p.*,
             t.name as hospital_name
      FROM patients p
      JOIN tenants  t ON p.tenant_id = t.id
      WHERE p.id = ? AND p.tenant_id = ?
    `).bind(patientId, tenantId).first<{
      patient_code: string;
      name: string;
      name_bn?: string;
      date_of_birth?: string;
      gender?: string;
      mobile: string;
      address?: string;
      blood_group?: string;
      created_at: string;
      emergency_contact?: string;
      hospital_name: string;
    }>();

    if (!patient) throw new HTTPException(404, { message: 'Patient not found' });

    const html = renderPatientCardHtml({
      patientCode: patient.patient_code,
      name: patient.name,
      nameBn: patient.name_bn,
      dateOfBirth: patient.date_of_birth,
      gender: patient.gender,
      mobile: patient.mobile,
      address: patient.address,
      bloodGroup: patient.blood_group,
      registrationDate: patient.created_at.split('T')[0],
      emergencyContact: patient.emergency_contact,
      hospitalName: patient.hospital_name,
    });

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to generate patient card' });
  }
});

export default pdfRoutes;
