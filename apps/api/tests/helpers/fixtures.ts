import { env } from 'cloudflare:test';

export async function createPatient(tenantId: number, data: { name: string; patient_code?: string }) {
  const result = await env.DB.prepare(
    'INSERT INTO patients (tenant_id, name, patient_code, father_husband, address, mobile) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.name, data.patient_code || 'P-001', 'Dummy Father', 'Dummy Address', '01700000000').first();
  return result?.id as number;
}

export async function createDoctor(tenantId: number, data: { name: string; specialty?: string; consultation_fee?: number }) {
  const result = await env.DB.prepare(
    'INSERT INTO doctors (tenant_id, name, specialty, consultation_fee, is_active) VALUES (?, ?, ?, ?, 1) RETURNING id'
  ).bind(tenantId, data.name, data.specialty ?? 'General', data.consultation_fee ?? 500).first();
  return result?.id as number;
}

export async function createUser(tenantId: number, data: { name: string; email: string; role?: string; password_hash?: string }) {
  const result = await env.DB.prepare(
    'INSERT INTO users (tenant_id, name, email, role, password_hash) VALUES (?, ?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.name, data.email, data.role ?? 'admin', data.password_hash ?? '$2a$10$test').first();
  return result?.id as number;
}

export async function createVisit(tenantId: number, data: { patientId: number; visitType?: string; doctorId?: number }) {
  const result = await env.DB.prepare(
    'INSERT INTO visits (tenant_id, patient_id, visit_no, visit_type, doctor_id, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.patientId, 'V-001', data.visitType ?? 'opd', data.doctorId ?? null, 1).first();
  return result?.id as number;
}

export async function createAppointment(tenantId: number, data: { patientId: number; apptDate: string; doctorId?: number }) {
  const result = await env.DB.prepare(
    'INSERT INTO appointments (tenant_id, patient_id, appt_no, token_no, appt_date, doctor_id, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.patientId, 'APT-000001', 1, data.apptDate, data.doctorId ?? null, 'waiting').first();
  return result?.id as number;
}

export async function createLabTestCatalog(tenantId: number, data: { name: string; code: string; price: number }) {
  const result = await env.DB.prepare(
    'INSERT INTO lab_test_catalog (tenant_id, name, code, price, is_active) VALUES (?, ?, ?, ?, 1) RETURNING id'
  ).bind(tenantId, data.name, data.code, data.price).first();
  return result?.id as number;
}

export async function createBed(tenantId: number, data: { ward_name: string; bed_number: string }) {
  const result = await env.DB.prepare(
    'INSERT INTO beds (tenant_id, ward_name, bed_number, status) VALUES (?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.ward_name, data.bed_number, 'available').first();
  return result?.id as number;
}

export async function createMedicine(tenantId: number, data: { name: string; generic_name?: string; stock_quantity?: number }) {
  const result = await env.DB.prepare(
    'INSERT INTO medicines (tenant_id, name, generic_name, stock_quantity) VALUES (?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.name, data.generic_name || 'Generic', data.stock_quantity || 0).first();
  return result?.id as number;
}

export async function createMedicineBatch(
  tenantId: number,
  medicineId: number,
  data: { batch_number: string; quantity: number; unit_price: number; selling_price: number; expiry_date: string }
) {
  const result = await env.DB.prepare(`
    INSERT INTO medicine_batches 
      (tenant_id, medicine_id, batch_number, quantity, unit_price, selling_price, expiry_date) 
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(
    tenantId, medicineId, data.batch_number, data.quantity,
    data.unit_price, data.selling_price, data.expiry_date
  ).first();
  return result?.id as number;
}
