import { Hono } from 'hono';
import { notifyDashboard } from '../../lib/accounting-helpers';

const billingRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    UPLOADS: R2Bucket;
    DASHBOARD_DO: DurableObjectNamespace;
    ENVIRONMENT: string;
  };
  Variables: {
    tenantId?: string;
    userId?: string;
  };
}>();

// Get all bills
billingRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  
  try {
    const bills = await c.env.DB.prepare(
      'SELECT * FROM bills WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(tenantId).all();
    
    return c.json({ bills: bills.results || [] });
  } catch (error) {
    return c.json({ error: 'Failed to fetch bills' }, 500);
  }
});

// Get bill for patient
billingRoutes.get('/patient/:patientId', async (c) => {
  const patientId = c.req.param('patientId');
  const tenantId = c.get('tenantId');
  
  try {
    const bill = await c.env.DB.prepare(
      'SELECT * FROM bills WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(patientId, tenantId).first();
    
    return c.json({ bill });
  } catch (error) {
    return c.json({ error: 'Failed to fetch bill' }, 500);
  }
});

// Create/update bill
billingRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { patientId, testBill = 0, admissionBill = 0, doctorVisitBill = 0, operationBill = 0, medicineBill = 0, discount = 0 } = await c.req.json();
  
  const total = testBill + admissionBill + doctorVisitBill + operationBill + medicineBill - discount;
  const fireServiceCharge = (await c.env.DB.prepare('SELECT value FROM settings WHERE key = ? AND tenant_id = ?').bind('fire_service_charge', tenantId).first<{value: string}>())?.value || '50';
  const totalWithFire = total + parseFloat(fireServiceCharge);
  
  try {
    // Check existing bill
    const existing = await c.env.DB.prepare(
      'SELECT id, total, paid FROM bills WHERE patient_id = ? AND tenant_id = ? AND due > 0 ORDER BY created_at DESC LIMIT 1'
    ).bind(patientId, tenantId).first<{id: number; total: number; paid: number}>();
    
    if (existing) {
      // Update existing bill
      const newTotal = existing.total + totalWithFire;
      await c.env.DB.prepare(
        'UPDATE bills SET test_bill = test_bill + ?, admission_bill = admission_bill + ?, doctor_visit_bill = doctor_visit_bill + ?, operation_bill = operation_bill + ?, medicine_bill = medicine_bill + ?, discount = discount + ?, total = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?'
      ).bind(testBill, admissionBill, doctorVisitBill, operationBill, medicineBill, discount, newTotal, existing.id, tenantId);
    } else {
      // Create new bill
      await c.env.DB.prepare(
        'INSERT INTO bills (patient_id, test_bill, admission_bill, doctor_visit_bill, operation_bill, medicine_bill, discount, total, due, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))'
      ).bind(patientId, testBill, admissionBill, doctorVisitBill, operationBill, medicineBill, discount, totalWithFire, totalWithFire, tenantId);
    }
    
    return c.json({ message: 'Bill updated', total: totalWithFire });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Failed to create bill' }, 500);
  }
});

// Make payment
billingRoutes.post('/pay', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { billId, amount, type = 'current' } = await c.req.json();
  
  try {
    // Get current bill
    const bill = await c.env.DB.prepare(
      'SELECT * FROM bills WHERE id = ? AND tenant_id = ?'
    ).bind(billId, tenantId).first<{id: number; total: number; paid: number; due: number; test_bill: number; admission_bill: number; doctor_visit_bill: number; operation_bill: number; medicine_bill: number}>();
    
    if (!bill) {
      return c.json({ error: 'Bill not found' }, 404);
    }
    
    const newPaid = bill.paid + amount;
    const newDue = Math.max(0, bill.total - newPaid);
    
    // Record payment
    await c.env.DB.prepare(
      'INSERT INTO payments (bill_id, amount, payment_type, tenant_id, date) VALUES (?, ?, ?, ?, datetime("now"))'
    ).bind(billId, amount, type, tenantId);
    
    // Update bill
    await c.env.DB.prepare(
      'UPDATE bills SET paid = ?, due = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?'
    ).bind(newPaid, newDue, billId, tenantId);
    
    // Record income based on bill components (proportional to payment)
    const today = new Date().toISOString().split('T')[0];
    const paymentRatio = bill.total > 0 ? amount / bill.total : 0;
    
    // Record income for each service that was billed
    if (bill.test_bill > 0) {
      const incomeAmount = Math.round(bill.test_bill * paymentRatio);
      if (incomeAmount > 0) {
        await c.env.DB.prepare(
          'INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(today, 'laboratory', incomeAmount, 'Lab test payment', billId, tenantId, userId);
        await notifyDashboard(c.env, tenantId!, 'income', incomeAmount);
      }
    }
    
    if (bill.admission_bill > 0) {
      const incomeAmount = Math.round(bill.admission_bill * paymentRatio);
      if (incomeAmount > 0) {
        await c.env.DB.prepare(
          'INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(today, 'admission', incomeAmount, 'Admission payment', billId, tenantId, userId);
        await notifyDashboard(c.env, tenantId!, 'income', incomeAmount);
      }
    }
    
    if (bill.doctor_visit_bill > 0) {
      const incomeAmount = Math.round(bill.doctor_visit_bill * paymentRatio);
      if (incomeAmount > 0) {
        await c.env.DB.prepare(
          'INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(today, 'doctor_visit', incomeAmount, 'Doctor visit payment', billId, tenantId, userId);
        await notifyDashboard(c.env, tenantId!, 'income', incomeAmount);
      }
    }
    
    if (bill.operation_bill > 0) {
      const incomeAmount = Math.round(bill.operation_bill * paymentRatio);
      if (incomeAmount > 0) {
        await c.env.DB.prepare(
          'INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(today, 'operation', incomeAmount, 'Operation payment', billId, tenantId, userId);
        await notifyDashboard(c.env, tenantId!, 'income', incomeAmount);
      }
    }
    
    if (bill.medicine_bill > 0) {
      const incomeAmount = Math.round(bill.medicine_bill * paymentRatio);
      if (incomeAmount > 0) {
        await c.env.DB.prepare(
          'INSERT INTO income (date, source, amount, description, bill_id, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(today, 'pharmacy', incomeAmount, 'Medicine payment', billId, tenantId, userId);
        await notifyDashboard(c.env, tenantId!, 'income', incomeAmount);
      }
    }
    
    return c.json({ message: 'Payment recorded', paid: newPaid, due: newDue });
  } catch (error) {
    return c.json({ error: 'Payment failed' }, 500);
  }
});

// Get bill history
billingRoutes.get('/history/:patientId', async (c) => {
  const patientId = c.req.param('patientId');
  const tenantId = c.get('tenantId');
  
  try {
    const bills = await c.env.DB.prepare(
      'SELECT * FROM bills WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC'
    ).bind(patientId, tenantId).all();
    
    return c.json({ bills: bills.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch history' }, 500);
  }
});

export default billingRoutes;