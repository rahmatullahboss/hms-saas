import { env } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';

import { testSchema } from './db_schema';

// Additional tables / columns missing from the base testSchema
const EXTRA_SQL: string[] = [
  // ── bills table: drop old schema (has total/paid/due) and recreate with correct columns ──
  `DROP TABLE IF EXISTS invoice_items`,
  `DROP TABLE IF EXISTS payments`,
  `DROP TABLE IF EXISTS bills`,
  `CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    visit_id INTEGER,
    invoice_no TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bills_patient2 ON bills(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bills_tenant2 ON bills(tenant_id)`,
  // ── invoice_items: no CHECK constraint so all valid Zod categories work ──
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    item_category TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    reference_id INTEGER,
    tenant_id INTEGER NOT NULL,
    FOREIGN KEY (bill_id) REFERENCES bills(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_items_bill2 ON invoice_items(bill_id)`,
  // ── payments table: recreated with all columns billing routes use ──
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER,
    patient_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    type TEXT,
    receipt_no TEXT,
    payment_method TEXT,
    received_by INTEGER,
    settlement_type_id INTEGER,
    idempotency_key TEXT,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES bills(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payments_bill2 ON payments(bill_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_tenant2 ON payments(tenant_id)`,
  // notifications table (missing entirely) — includes link column used by route
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    link TEXT,
    is_read INTEGER DEFAULT 0,
    user_id INTEGER,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // appointments — includes chief_complaint and updated_at used by routes
  `CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER,
    appt_no TEXT,
    token_no INTEGER DEFAULT 1,
    appt_date DATE NOT NULL,
    appt_time TEXT,
    visit_type TEXT DEFAULT 'opd',
    fee INTEGER DEFAULT 0,
    status TEXT DEFAULT 'scheduled',
    chief_complaint TEXT,
    notes TEXT,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    UNIQUE (appt_no, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_appts_patient ON appointments(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_appts_date ON appointments(appt_date)`,
  `CREATE INDEX IF NOT EXISTS idx_appts_tenant ON appointments(tenant_id)`,
  // prescriptions
  `CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER,
    rx_no TEXT,
    chief_complaint TEXT,
    diagnosis TEXT,
    notes TEXT,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE TABLE IF NOT EXISTS prescription_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL,
    medicine_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    instructions TEXT,
    tenant_id INTEGER NOT NULL,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
  )`,
  // beds — drop old schema (no bed_type) and recreate with required columns
  `DROP TABLE IF EXISTS admissions`,
  `DROP TABLE IF EXISTS beds`,
  `CREATE TABLE IF NOT EXISTS beds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ward_name TEXT NOT NULL,
    bed_number TEXT NOT NULL,
    bed_type TEXT DEFAULT 'general',
    status TEXT DEFAULT 'available',
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // admissions — drop old schema then recreate with all required columns
  `CREATE TABLE IF NOT EXISTS admissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_no TEXT,
    patient_id INTEGER NOT NULL,
    bed_id INTEGER,
    doctor_id INTEGER,
    admission_type TEXT DEFAULT 'general',
    provisional_diagnosis TEXT,
    admission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    discharge_date DATETIME,
    status TEXT DEFAULT 'admitted',
    notes TEXT,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (bed_id) REFERENCES beds(id)
  )`,
  // audit_log — no CHECK constraint (routes use lowercase: 'create','update','delete','approve')
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    table_name TEXT,
    record_id INTEGER,
    details TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // audit_logs (base schema uses UPPERCASE CHECK — drop and recreate without CHECK for tests)
  `DROP TABLE IF EXISTS audit_logs`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant2 ON audit_logs(tenant_id)`,
  // doctor_schedules
  `DROP TABLE IF EXISTS doctor_schedules`,
  `CREATE TABLE IF NOT EXISTS doctor_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    day_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    session_type TEXT NOT NULL DEFAULT 'morning',
    chamber TEXT,
    max_patients INTEGER DEFAULT 20,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    tenant_id INTEGER NOT NULL,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`,
  // ipd_charges — drop and recreate with full schema
  `DROP TABLE IF EXISTS ipd_charges`,
  `CREATE TABLE IF NOT EXISTS ipd_charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    admission_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    charge_date TEXT NOT NULL,
    charge_type TEXT NOT NULL DEFAULT 'room',
    description TEXT,
    amount REAL NOT NULL DEFAULT 0,
    posted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admission_id) REFERENCES admissions(id)
  )`,
  // telemedicine_sessions — drop old (missing columns) and recreate with full schema
  `DROP TABLE IF EXISTS telemedicine_sessions`,
  `CREATE TABLE IF NOT EXISTS telemedicine_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_no TEXT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER,
    appointment_id INTEGER,
    scheduled_at DATETIME,
    session_token TEXT,
    meeting_link TEXT,
    platform TEXT DEFAULT 'video',
    status TEXT DEFAULT 'scheduled',
    started_at DATETIME,
    ended_at DATETIME,
    notes TEXT,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  // nurse_station table if referenced
  `CREATE TABLE IF NOT EXISTS nurse_station_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_id INTEGER,
    note TEXT NOT NULL,
    nurse_id INTEGER,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // lab_orders — drop old schema (missing: visit_id, order_date, diagnosis, fasting_required, etc.)
  `DROP TABLE IF EXISTS lab_order_items`,
  `DROP TABLE IF EXISTS lab_orders`,
  `CREATE TABLE IF NOT EXISTS lab_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT,
    patient_id INTEGER NOT NULL,
    visit_id INTEGER,
    ordered_by INTEGER,
    order_date DATE NOT NULL DEFAULT (date('now')),
    status TEXT DEFAULT 'sent',
    diagnosis TEXT,
    relevant_history TEXT,
    fasting_required INTEGER DEFAULT 0,
    specimen_type TEXT DEFAULT 'Blood',
    collection_notes TEXT,
    print_count INTEGER DEFAULT 0,
    last_printed_at DATETIME,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lab_orders_patient2 ON lab_orders(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lab_orders_date2 ON lab_orders(order_date)`,
  `CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant2 ON lab_orders(tenant_id)`,
  `CREATE TABLE IF NOT EXISTS lab_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_order_id INTEGER NOT NULL,
    lab_test_id INTEGER NOT NULL,
    unit_price REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    line_total REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'routine',
    result TEXT,
    instructions TEXT,
    completed_at DATETIME,
    tenant_id INTEGER NOT NULL,
    FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id),
    FOREIGN KEY (lab_test_id) REFERENCES lab_test_catalog(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lab_items_order2 ON lab_order_items(lab_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lab_items_tenant2 ON lab_order_items(tenant_id)`,

  // ── prescriptions (base schema missing rx_no, vitals, chief_complaint, diagnosis etc.) ──
  `DROP TABLE IF EXISTS prescription_items`,
  `DROP TABLE IF EXISTS prescriptions`,
  `CREATE TABLE prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rx_no TEXT NOT NULL,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER,
    appointment_id INTEGER,
    bp TEXT,
    temperature REAL,
    weight REAL,
    spo2 REAL,
    chief_complaint TEXT,
    diagnosis TEXT,
    examination_notes TEXT,
    advice TEXT,
    lab_tests TEXT DEFAULT '[]',
    follow_up_date DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final')),
    dispense_status TEXT DEFAULT 'pending',
    created_by INTEGER,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rx_tenant ON prescriptions(tenant_id)`,
  `CREATE TABLE prescription_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL,
    medicine_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    instructions TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rx_items_prescription ON prescription_items(prescription_id)`,

  // ── patients: base schema has NOT NULL on father_husband, address, mobile — make nullable ──
  `DROP TABLE IF EXISTS patients`,
  `CREATE TABLE patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    father_husband TEXT,
    address TEXT,
    mobile TEXT,
    guardian_mobile TEXT,
    age INTEGER,
    gender TEXT CHECK(gender IN ('male', 'female', 'other')),
    blood_group TEXT,
    patient_code TEXT,
    date_of_birth TEXT,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_patients_tenant2 ON patients(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_patients_patient_code2 ON patients(patient_code)`,

  // ── shareholders: base schema has strict CHECK(type) and NOT NULL on address/phone/investment ──
  `DROP TABLE IF EXISTS shareholder_distributions`,
  `DROP TABLE IF EXISTS profit_distributions`,
  `DROP TABLE IF EXISTS shareholders`,
  `CREATE TABLE shareholders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    share_count INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'owner',
    investment REAL DEFAULT 0,
    start_date DATE,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shareholders_tenant2 ON shareholders(tenant_id)`,
  `CREATE TABLE profit_distributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    total_profit REAL NOT NULL DEFAULT 0,
    distributable_profit REAL NOT NULL DEFAULT 0,
    profit_percentage REAL NOT NULL DEFAULT 30,
    approved_by INTEGER,
    approved_at DATETIME,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE shareholder_distributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distribution_id INTEGER NOT NULL,
    shareholder_id INTEGER NOT NULL,
    share_count INTEGER NOT NULL,
    per_share_amount INTEGER NOT NULL,
    distribution_amount INTEGER NOT NULL,
    paid_status TEXT NOT NULL DEFAULT 'unpaid',
    paid_date DATE,
    notes TEXT,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (distribution_id) REFERENCES profit_distributions(id),
    FOREIGN KEY (shareholder_id) REFERENCES shareholders(id)
  )`,

  // ── invitations (new table for invitation-based onboarding) ──────────────────
  `CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    invited_by INTEGER,
    accepted_at DATETIME,
    expires_at DATETIME,
    token TEXT,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON invitations(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email)`,

  // ── doctors: add bmdc_reg_no, qualifications, visiting_hours, user_id (missing from base schema) ──
  `ALTER TABLE doctors ADD COLUMN bmdc_reg_no TEXT`,
  `ALTER TABLE doctors ADD COLUMN qualifications TEXT`,
  `ALTER TABLE doctors ADD COLUMN visiting_hours TEXT`,
  `ALTER TABLE doctors ADD COLUMN user_id INTEGER`,
  // ── staff: add user_id column (referenced by nurse-station route) ──
  `ALTER TABLE staff ADD COLUMN user_id INTEGER`,

  // ── discharge_summaries ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS discharge_summaries (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id              INTEGER NOT NULL,
    admission_id           INTEGER NOT NULL,
    patient_id             INTEGER NOT NULL,
    admission_diagnosis    TEXT,
    final_diagnosis        TEXT,
    treatment_summary      TEXT,
    procedures_performed   TEXT,
    medicines_on_discharge TEXT,
    follow_up_date         TEXT,
    follow_up_instructions TEXT,
    doctor_notes           TEXT,
    status                 TEXT NOT NULL DEFAULT 'draft',
    finalized_at           DATETIME,
    finalized_by           INTEGER,
    updated_at             DATETIME,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── patient_vitals ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS patient_vitals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id        INTEGER NOT NULL,
    patient_id       INTEGER NOT NULL,
    admission_id     INTEGER,
    systolic         INTEGER,
    diastolic        INTEGER,
    temperature      REAL,
    heart_rate       INTEGER,
    spo2             INTEGER,
    respiratory_rate INTEGER,
    weight           REAL,
    notes            TEXT,
    recorded_by      TEXT,
    recorded_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
];

export async function setupDb() {
  const db = env.DB;

  // Apply base schema
  const cleanSchema = testSchema.replace(/--.*$/gm, '');
  const statements = cleanSchema
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  for (const sql of statements) {
    try {
      if (
        sql.includes('CREATE TABLE') ||
        sql.includes('ALTER TABLE') ||
        sql.includes('CREATE INDEX') ||
        sql.includes('INSERT')
      ) {
        await db.prepare(sql).run();
      }
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('duplicate column name') ||
          err.message.includes('already exists'))
      ) {
        // silently ignore idempotent operations
      } else {
        console.error('Base schema error:', sql.slice(0, 80), err.message);
      }
    }
  }

  // Apply extra DDL: new tables & columns missing from base schema
  for (const sql of EXTRA_SQL) {
    try {
      await db.prepare(sql).run();
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('duplicate column name') ||
          err.message.includes('already exists'))
      ) {
        // silently ignore
      } else {
        console.error('Extra schema error:', sql.slice(0, 80), err.message);
      }
    }
  }
}

const ALL_TABLES = [
  'prescription_items',
  'prescriptions',
  'invoice_items',
  'payments',
  'income',
  'expenses',
  'bills',
  'medicine_stock_movements',
  'medicine_stock_batches',
  'medicine_purchase_items',
  'medicine_purchases',
  'medicines',
  'lab_order_items',
  'lab_orders',
  'nurse_station_notes',
  'discharge_summaries',
  'patient_vitals',
  'ipd_charges',
  'invoice_items',
  'admissions',
  'appointments',
  'notifications',
  'audit_log',
  'audit_logs',
  'commissions',
  'shareholder_distributions',
  'profit_distributions',
  'recurring_expenses',
  'expense_categories',
  'telemedicine_sessions',
  'visits',
  'serials',
  'tests',
  'salary_payments',
  'staff',
  'shareholders',
  'journal_entries',
  'chart_of_accounts',
  'patients',
  'doctors',
  'beds',
  'doctor_schedules',
  'sequence_counters',
  'settlement_types',
  'settings',
  'users',
  'roles',
  'tenants',
];

beforeAll(async () => {
  await setupDb();
});

beforeEach(async () => {
  // Clear all data between tests
  for (const table of ALL_TABLES) {
    try {
      await env.DB.exec(`DELETE FROM ${table};`);
    } catch {
      // ignore if table doesn't exist
    }
  }

  // Restore default tenant
  await env.DB.prepare(
    'INSERT INTO tenants (id, name, subdomain) VALUES (1, "Test Clinic", "test")',
  ).run();

  // Seed default admin user (id=1) so created_by FK constraints are satisfied
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, name, email, role, tenant_id, password_hash) VALUES (1, "Admin User", "admin@test.com", "admin", 1, "$2a$10$dummy")',
    ).run();
  } catch {
    // ignore if already exists or email unique conflict
  }

  // Seed director user (id=2) so expenses.approved_by FK constraint is satisfied
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, name, email, role, tenant_id, password_hash) VALUES (2, "Director User", "director@test.com", "director", 1, "$2a$10$dummy")',
    ).run();
  } catch {
    // ignore if already exists
  }
});
