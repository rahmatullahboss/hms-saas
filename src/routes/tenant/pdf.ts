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

// ─── GET /invoice/:billId ─────────────────────────────────────────────────────
pdfRoutes.get('/invoice/:billId', async (c) => {
  const tenantId = requireTenantId(c);
  const billId = c.req.param('billId');
  const role = c.get('role');
  if (!role || !ALLOWED_PDF_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  try {
    // Fetch bill from the actual 'bills' table (flat category amounts)
    const bill = await c.env.DB.prepare(`
      SELECT b.id, b.invoice_no, b.test_bill, b.admission_bill,
             b.doctor_visit_bill, b.operation_bill, b.medicine_bill,
             b.discount, b.total, b.paid, b.due,
             b.created_at,
             p.name         AS patient_name,
             p.patient_code,
             p.mobile       AS patient_mobile,
             t.name         AS hospital_name,
             t.address      AS hospital_address,
             t.phone        AS hospital_phone
      FROM bills b
      JOIN patients p ON b.patient_id = p.id AND p.tenant_id = b.tenant_id
      JOIN tenants  t ON b.tenant_id  = t.id
      WHERE b.id = ? AND b.tenant_id = ?
    `).bind(billId, tenantId).first<{
      id: number;
      invoice_no: string | null;
      test_bill: number;
      admission_bill: number;
      doctor_visit_bill: number;
      operation_bill: number;
      medicine_bill: number;
      discount: number;
      total: number;
      paid: number;
      due: number;
      created_at: string;
      patient_name: string;
      patient_code: string;
      patient_mobile: string;
      hospital_name: string;
      hospital_address?: string;
      hospital_phone?: string;
    }>();

    if (!bill) throw new HTTPException(404, { message: 'Invoice not found' });

    // Derive line items from the flat category columns (skip zero-amount categories)
    const categoryLabels: Array<{ key: keyof typeof bill; en: string; bn: string }> = [
      { key: 'test_bill',         en: 'Lab Tests',       bn: 'ল্যাব পরীক্ষা' },
      { key: 'admission_bill',    en: 'Admission',       bn: 'ভর্তি ফি' },
      { key: 'doctor_visit_bill', en: 'Doctor Visit',    bn: 'ডাক্তার ভিজিট' },
      { key: 'operation_bill',    en: 'Operation / OT',  bn: 'অপারেশন' },
      { key: 'medicine_bill',     en: 'Medicine',        bn: 'ঔষধ' },
    ];

    const items = categoryLabels
      .filter(cat => (bill[cat.key] as number) > 0)
      .map(cat => ({
        description: cat.en,
        descriptionBn: cat.bn,
        quantity: 1,
        unitPrice: bill[cat.key] as number,
        total: bill[cat.key] as number,
      }));

    const discount = bill.discount ?? 0;
    const subtotal = bill.total + discount;

    const html = renderInvoiceHtml({
      invoiceNo: bill.invoice_no || `INV-${bill.id}`,
      date: bill.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
      patientName: bill.patient_name,
      patientCode: bill.patient_code,
      patientMobile: bill.patient_mobile,
      hospitalName: bill.hospital_name,
      hospitalAddress: bill.hospital_address,
      hospitalPhone: bill.hospital_phone,
      items,
      subtotal,
      discount: discount > 0 ? discount : undefined,
      totalAmount: bill.total,
      paidAmount: bill.paid,
      dueAmount: bill.due,
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
