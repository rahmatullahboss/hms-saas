import { env } from 'cloudflare:test';

export async function createPatient(tenantId: number, data: { name: string, patient_code?: string }) {
  const result = await env.DB.prepare(
    'INSERT INTO patients (tenant_id, name, patient_code, father_husband, address, mobile) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.name, data.patient_code || 'P-001', 'Dummy Father', 'Dummy Address', '01700000000').first();
  return result?.id as number;
}

export async function createMedicine(tenantId: number, data: { name: string, generic_name?: string, stock_quantity?: number }) {
  const result = await env.DB.prepare(
    'INSERT INTO medicines (tenant_id, name, generic_name, stock_quantity) VALUES (?, ?, ?, ?) RETURNING id'
  ).bind(tenantId, data.name, data.generic_name || 'Generic', data.stock_quantity || 0).first();
  return result?.id as number;
}

export async function createMedicineBatch(
  tenantId: number, 
  medicineId: number, 
  data: { batch_number: string, quantity: number, unit_price: number, selling_price: number, expiry_date: string }
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
