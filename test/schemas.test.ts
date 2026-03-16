/**
 * Schema Validation Tests — all exported Zod schemas
 * Covers valid parsing, invalid rejections, defaults, edge cases
 */
import { describe, it, expect } from 'vitest';

// ─── Patient ────────────────────────────────────────────────────────────────
import { createPatientSchema, updatePatientSchema } from '../src/schemas/patient';

describe('Patient Schemas', () => {
  it('accepts valid data', () => {
    const v = { name: 'Rahim', fatherHusband: 'Karim', address: 'Dhaka', mobile: '01712345678' };
    expect(createPatientSchema.parse(v)).toMatchObject(v);
  });
  it('rejects missing name', () => {
    expect(() => createPatientSchema.parse({ fatherHusband: 'X', address: 'Y', mobile: '01700000000' })).toThrow();
  });
  it('rejects short mobile', () => {
    expect(() => createPatientSchema.parse({ name: 'A', fatherHusband: 'B', address: 'C', mobile: '017' })).toThrow();
  });
  it('partial update', () => {
    expect(updatePatientSchema.parse({ name: 'Updated' })).toEqual({ name: 'Updated' });
  });
  it('accepts gender enum', () => {
    const d = { name: 'A', fatherHusband: 'B', address: 'C', mobile: '01712345678', gender: 'male' };
    expect(createPatientSchema.parse(d).gender).toBe('male');
  });
  it('rejects invalid gender', () => {
    expect(() => createPatientSchema.parse({ name: 'A', fatherHusband: 'B', address: 'C', mobile: '01712345678', gender: 'x' })).toThrow();
  });
});

// ─── Billing ────────────────────────────────────────────────────────────────
import { createBillSchema, paymentSchema, invoiceItemSchema } from '../src/schemas/billing';

describe('Billing Schemas', () => {
  it('accepts valid bill', () => {
    const bill = { patientId: 1, items: [{ itemCategory: 'test', unitPrice: 500 }] };
    const r = createBillSchema.parse(bill);
    expect(r.patientId).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.discount).toBe(0);
  });
  it('rejects empty items', () => {
    expect(() => createBillSchema.parse({ patientId: 1, items: [] })).toThrow();
  });
  it('rejects negative patientId', () => {
    expect(() => createBillSchema.parse({ patientId: -1, items: [{ itemCategory: 'test', unitPrice: 100 }] })).toThrow();
  });
  it('invoice item defaults quantity=1', () => {
    expect(invoiceItemSchema.parse({ itemCategory: 'test', unitPrice: 500 }).quantity).toBe(1);
  });
  it('rejects negative unitPrice', () => {
    expect(() => invoiceItemSchema.parse({ itemCategory: 'test', unitPrice: -100 })).toThrow();
  });
  it('paymentSchema rejects empty', () => {
    expect(() => paymentSchema.parse({})).toThrow();
  });
});

// ─── Appointment ────────────────────────────────────────────────────────────
import { createAppointmentSchema, updateAppointmentSchema } from '../src/schemas/appointment';

describe('Appointment Schemas', () => {
  it('valid appointment with defaults', () => {
    const r = createAppointmentSchema.parse({ patientId: 1, apptDate: '2025-01-15' });
    expect(r.visitType).toBe('opd');
    expect(r.fee).toBe(0);
  });
  it('rejects invalid date', () => {
    expect(() => createAppointmentSchema.parse({ patientId: 1, apptDate: '15-01-2025' })).toThrow();
  });
  it('rejects invalid time', () => {
    expect(() => createAppointmentSchema.parse({ patientId: 1, apptDate: '2025-01-15', apptTime: '2pm' })).toThrow();
  });
  it('update status', () => {
    expect(updateAppointmentSchema.parse({ status: 'cancelled' }).status).toBe('cancelled');
  });
  it('rejects invalid status', () => {
    expect(() => updateAppointmentSchema.parse({ status: 'invalid' })).toThrow();
  });
});

// ─── Visit ──────────────────────────────────────────────────────────────────
import { createVisitSchema, updateVisitSchema, dischargeSchema } from '../src/schemas/visit';

describe('Visit Schemas', () => {
  it('valid visit', () => {
    const r = createVisitSchema.parse({ patientId: 5 });
    expect(r.visitType).toBe('opd');
    expect(r.admissionFlag).toBe(false);
  });
  it('accepts ICD-10', () => {
    expect(createVisitSchema.parse({ patientId: 1, icd10Code: 'J06' }).icd10Code).toBe('J06');
  });
  it('rejects invalid ICD-10', () => {
    expect(() => createVisitSchema.parse({ patientId: 1, icd10Code: 'INVALID' })).toThrow();
  });
  it('update partial', () => {
    expect(updateVisitSchema.parse({ notes: 'updated' }).notes).toBe('updated');
  });
  it('discharge requires date', () => {
    const r = dischargeSchema.parse({ dischargeDate: '2025-01-15' });
    expect(r.dischargeDate).toBe('2025-01-15');
  });
  it('discharge rejects bad date', () => {
    expect(() => dischargeSchema.parse({ dischargeDate: 'bad' })).toThrow();
  });
});

// ─── Lab ────────────────────────────────────────────────────────────────────
import { createLabTestSchema, updateLabTestSchema, createLabOrderSchema } from '../src/schemas/lab';

describe('Lab Schemas', () => {
  it('valid test', () => {
    expect(createLabTestSchema.parse({ code: 'CBC', name: 'Complete Blood Count', price: 500 }).code).toBe('CBC');
  });
  it('rejects missing code', () => {
    expect(() => createLabTestSchema.parse({ name: 'X', price: 100 })).toThrow();
  });
  it('partial update', () => {
    expect(updateLabTestSchema.parse({ price: 600 }).price).toBe(600);
  });
  it('valid order', () => {
    expect(createLabOrderSchema.parse({ patientId: 1, items: [{ labTestId: 1 }] }).items[0].discount).toBe(0);
  });
});

// ─── Pharmacy ───────────────────────────────────────────────────────────────
import { createMedicineSchema, createSupplierSchema, createPurchaseSchema } from '../src/schemas/pharmacy';

describe('Pharmacy Schemas', () => {
  it('valid medicine', () => {
    expect(createMedicineSchema.parse({ name: 'Paracetamol', salePrice: 5 }).name).toBe('Paracetamol');
  });
  it('rejects missing name', () => {
    expect(() => createMedicineSchema.parse({ salePrice: 5 })).toThrow();
  });
  it('valid supplier', () => {
    expect(createSupplierSchema.parse({ name: 'MedSupply' }).name).toBe('MedSupply');
  });
  it('valid purchase', () => {
    const r = createPurchaseSchema.parse({
      supplierId: 1, purchaseDate: '2025-01-15',
      items: [{ medicineId: 1, batchNo: 'B001', expiryDate: '2026-12-31', quantity: 100, purchasePrice: 3, salePrice: 5 }],
    });
    expect(r.items[0].quantity).toBe(100);
  });
});

// ─── Staff ──────────────────────────────────────────────────────────────────
import { createStaffSchema, updateStaffSchema, paySalarySchema } from '../src/schemas/staff';

describe('Staff Schemas', () => {
  it('valid staff', () => {
    const r = createStaffSchema.parse({ name: 'Karim', address: 'Dhaka', position: 'Nurse', salary: 20000, bankAccount: 'AB123', mobile: '01700000000' });
    expect(r.name).toBe('Karim');
  });
  it('partial update', () => {
    expect(updateStaffSchema.parse({ name: 'Updated' }).name).toBe('Updated');
  });
  it('paySalary valid', () => {
    const r = paySalarySchema.parse({ month: '2025-01' });
    expect(r.bonus).toBe(0);
  });
});

// ─── Doctor ─────────────────────────────────────────────────────────────────
import { createDoctorSchema, updateDoctorSchema } from '../src/schemas/doctor';

describe('Doctor Schemas', () => {
  it('valid doctor', () => {
    const r = createDoctorSchema.parse({ name: 'Dr. A', specialty: 'Cardiology', consultationFee: 1000 });
    expect(r.specialty).toBe('Cardiology');
  });
  it('partial update', () => {
    expect(updateDoctorSchema.parse({ specialty: 'Neuro' }).specialty).toBe('Neuro');
  });
});

// ─── Expense ────────────────────────────────────────────────────────────────
import { createExpenseSchema } from '../src/schemas/expense';

describe('Expense Schema', () => {
  it('valid expense', () => {
    const r = createExpenseSchema.parse({ date: '2025-01-15', category: 'utilities', amount: 5000, description: 'Electricity' });
    expect(r.category).toBe('utilities');
  });
});

// ─── Income ─────────────────────────────────────────────────────────────────
import { createIncomeSchema } from '../src/schemas/income';

describe('Income Schema', () => {
  it('valid income', () => {
    const r = createIncomeSchema.parse({ date: '2025-01-15', source: 'pharmacy', amount: 1000 });
    expect(r.amount).toBe(1000);
  });
});

// ─── Commission ─────────────────────────────────────────────────────────────
import { createCommissionSchema, markCommissionPaidSchema } from '../src/schemas/commission';

describe('Commission Schemas', () => {
  it('valid commission', () => {
    const r = createCommissionSchema.parse({ marketingPerson: 'Ali', commissionAmount: 500 });
    expect(r.marketingPerson).toBe('Ali');
  });
  it('markPaid valid', () => {
    const r = markCommissionPaidSchema.parse({ paidDate: '2025-01-15' });
    expect(r.paidDate).toBe('2025-01-15');
  });
});

// ─── Branch ─────────────────────────────────────────────────────────────────
import { createBranchSchema, updateBranchSchema } from '../src/schemas/branch';

describe('Branch Schemas', () => {
  it('valid branch', () => {
    expect(createBranchSchema.parse({ name: 'Main', address: 'Dhaka', phone: '01700000000' }).name).toBe('Main');
  });
  it('partial update', () => {
    expect(updateBranchSchema.parse({ name: 'Branch 2' }).name).toBe('Branch 2');
  });
});

// ─── Consultation ───────────────────────────────────────────────────────────
import { createConsultationSchema, endConsultationSchema } from '../src/schemas/consultation';

describe('Consultation Schemas', () => {
  it('valid consultation', () => {
    const r = createConsultationSchema.parse({ patientId: 1, doctorId: 2, scheduledAt: '2025-01-15T10:00:00Z' });
    expect(r.patientId).toBe(1);
    expect(r.durationMin).toBe(30);
  });
  it('endConsultation valid', () => {
    const r = endConsultationSchema.parse({ prescription: 'Napa 500mg', notes: 'Rest required' });
    expect(r.prescription).toBe('Napa 500mg');
  });
});

// ─── Shareholder ────────────────────────────────────────────────────────────
import { createShareholderSchema, distributeMonthlyProfitSchema } from '../src/schemas/shareholder';

describe('Shareholder Schemas', () => {
  it('valid shareholder', () => {
    const r = createShareholderSchema.parse({ name: 'Ali', type: 'owner', shareCount: 10, investment: 50000 });
    expect(r.name).toBe('Ali');
    expect(r.isActive).toBe(true);
  });
  it('distribute valid', () => {
    expect(distributeMonthlyProfitSchema.parse({ month: '2025-01' }).month).toBe('2025-01');
  });
});

// ─── Prescription ───────────────────────────────────────────────────────────
import { createPrescriptionSchema, prescriptionItemSchema } from '../src/schemas/prescription';

describe('Prescription Schemas', () => {
  it('valid prescription', () => {
    const r = createPrescriptionSchema.parse({ patientId: 1, doctorId: 2 });
    expect(r.patientId).toBe(1);
    expect(r.status).toBe('draft');
  });
  it('item valid', () => {
    expect(prescriptionItemSchema.parse({ medicine_name: 'Napa', dosage: '1+0+1', duration: '5 days', quantity: 10 }).medicine_name).toBe('Napa');
  });
});

// ─── Insurance ──────────────────────────────────────────────────────────────
import { insurancePolicySchema, insuranceClaimSchema } from '../src/schemas/insurance';

describe('Insurance Schemas', () => {
  it('valid policy', () => {
    const r = insurancePolicySchema.parse({
      patient_id: 1, provider_name: 'MetLife', policy_no: 'P123',
    });
    expect(r.provider_name).toBe('MetLife');
    expect(r.policy_type).toBe('individual');
  });
  it('valid claim', () => {
    expect(insuranceClaimSchema.parse({ patient_id: 1, bill_amount: 50000, claimed_amount: 50000 }).claimed_amount).toBe(50000);
  });
});

// ─── Patient Portal ─────────────────────────────────────────────────────────
import { requestOtpSchema, verifyOtpSchema } from '../src/schemas/patientPortal';

describe('PatientPortal Schemas', () => {
  it('requestOtp', () => {
    expect(requestOtpSchema.parse({ email: 'test@x.com' }).email).toBe('test@x.com');
  });
  it('verifyOtp', () => {
    expect(verifyOtpSchema.parse({ email: 'test@x.com', otp: '123456' }).otp).toBe('123456');
  });
});

// ─── Payment ────────────────────────────────────────────────────────────────
import { initiatePaymentSchema } from '../src/schemas/payment';

describe('Payment Schema', () => {
  it('valid', () => {
    expect(initiatePaymentSchema.parse({ billId: 1, gateway: 'bkash', amount: 5000, callbackUrl: 'https://example.com/cb' }).gateway).toBe('bkash');
  });
});

// ─── Website ────────────────────────────────────────────────────────────────
import { websiteConfigSchema, websiteServiceSchema } from '../src/schemas/website';

describe('Website Schemas', () => {
  it('valid config', () => {
    expect(websiteConfigSchema.parse({ tagline: 'Care', theme: 'medtrust' }).theme).toBe('medtrust');
  });
  it('valid service', () => {
    expect(websiteServiceSchema.parse({ name: 'Surgery', description: 'General', icon: '🏥' }).name).toBe('Surgery');
  });
});

// ─── AI ─────────────────────────────────────────────────────────────────────
import { prescriptionAssistSchema, diagnosisSuggestSchema, billingFromNotesSchema } from '../src/schemas/ai';

describe('AI Schemas', () => {
  it('prescriptionAssist valid', () => {
    const r = prescriptionAssistSchema.parse({
      medications: [{ name: 'Napa', dosage: '500mg', frequency: '3x/day', duration: '5 days' }],
    });
    expect(r.medications).toHaveLength(1);
  });
  it('diagnosisSuggest valid', () => {
    expect(diagnosisSuggestSchema.parse({ symptoms: 'chest pain' }).symptoms).toBe('chest pain');
  });
  it('billingFromNotes valid', () => {
    const r = billingFromNotesSchema.parse({ consultationNotes: 'CBC test ordered, consultation done, ECG performed' });
    expect(r.consultationNotes).toContain('CBC');
  });
});
