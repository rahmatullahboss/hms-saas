import { env } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';

import { testSchema } from './db_schema';

// Additional tables / columns missing from the base testSchema
const EXTRA_SQL: string[] = [

  // ── visits: recreate without strict CHECK so visit_type='emergency' works ──
  `DROP TABLE IF EXISTS lab_orders`,
  `DROP TABLE IF EXISTS lab_order_items`,
  `DROP TABLE IF EXISTS visits`,
  `CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    visit_no TEXT,
    visit_date TEXT,
    doctor_id INTEGER,
    visit_type TEXT NOT NULL DEFAULT 'opd',
    admission_flag INTEGER NOT NULL DEFAULT 0,
    admission_no TEXT,
    admission_date DATETIME,
    discharge_date DATETIME,
    status TEXT DEFAULT 'initiated',
    notes TEXT,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_visits_tenant ON visits(tenant_id)`,

  // ── tenants: add subscription columns missing from base schema ───────────────
  `ALTER TABLE tenants ADD COLUMN trial_ends_at TEXT`,
  `ALTER TABLE tenants ADD COLUMN plan_price REAL DEFAULT 0`,
  `ALTER TABLE tenants ADD COLUMN billing_cycle TEXT DEFAULT 'monthly'`,
  `ALTER TABLE tenants ADD COLUMN addons TEXT DEFAULT '[]'`,

  // ── bills table: drop old schema and recreate with correct columns ──
  `DROP TABLE IF EXISTS invoice_items`,
  `DROP TABLE IF EXISTS payments`,
  `DROP TABLE IF EXISTS bills`,
  `CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    visit_id INTEGER,
    invoice_no TEXT,
    subtotal REAL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    total REAL DEFAULT 0,
    paid REAL DEFAULT 0,
    due REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    branch_id INTEGER,
    cancelled_by INTEGER,
    cancelled_at TEXT,
    cancel_reason TEXT,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    status TEXT DEFAULT 'active',
    cancelled_by INTEGER,
    cancelled_at TEXT,
    cancel_reason TEXT,
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
    result_numeric REAL,
    abnormal_flag TEXT DEFAULT 'pending',
    sample_status TEXT DEFAULT 'ordered',
    instructions TEXT,
    collected_at DATETIME,
    processed_by INTEGER,
    completed_at DATETIME,
    tenant_id INTEGER NOT NULL,
    FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id),
    FOREIGN KEY (lab_test_id) REFERENCES lab_test_catalog(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lab_items_order2 ON lab_order_items(lab_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lab_items_tenant2 ON lab_order_items(tenant_id)`,

  // ── lab_test_catalog: add columns missing from base schema ────────────────
  `ALTER TABLE lab_test_catalog ADD COLUMN unit TEXT`,
  `ALTER TABLE lab_test_catalog ADD COLUMN normal_range TEXT`,
  `ALTER TABLE lab_test_catalog ADD COLUMN method TEXT`,
  `ALTER TABLE lab_test_catalog ADD COLUMN critical_low REAL`,
  `ALTER TABLE lab_test_catalog ADD COLUMN critical_high REAL`,

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
    email TEXT,
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
  // ── admissions: add columns used by ipBilling routes ──
  `ALTER TABLE admissions ADD COLUMN admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE admissions ADD COLUMN discharged_at DATETIME`,
  // ── beds: add rate and is_occupied for ip-billing bed charge calculation ──
  `ALTER TABLE beds ADD COLUMN rate REAL DEFAULT 0`,
  `ALTER TABLE beds ADD COLUMN is_occupied INTEGER DEFAULT 0`,

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

  // ── vital_alert_rules (migration 0018) ───────────────────────────────────
  `CREATE TABLE IF NOT EXISTS vital_alert_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL,
    vital_type  TEXT    NOT NULL,
    min_value   REAL,
    max_value   REAL,
    severity    TEXT    NOT NULL DEFAULT 'warning',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_vital_alert_rules_tenant ON vital_alert_rules(tenant_id)`,

  // ── vital_alerts (written by nurse-station alert checker) ─────────────────
  `CREATE TABLE IF NOT EXISTS vital_alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id       INTEGER NOT NULL,
    patient_id      INTEGER NOT NULL,
    vital_id        INTEGER,
    rule_id         INTEGER,
    vital_type      TEXT    NOT NULL,
    recorded_value  REAL,
    threshold_min   REAL,
    threshold_max   REAL,
    severity        TEXT    NOT NULL DEFAULT 'warning',
    is_read         INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_vital_alerts_tenant ON vital_alerts(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vital_alerts_patient ON vital_alerts(patient_id)`,

  // ── push_subscriptions (web push notification subscriptions) ─────────────
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(endpoint, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON push_subscriptions(tenant_id)`,

  // ── medicine_batches (alias for medicine_stock_batches used in some routes) ──
  `CREATE TABLE IF NOT EXISTS medicine_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL,
    batch_number TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    selling_price REAL DEFAULT 0,
    expiry_date DATE,
    tenant_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_med_batches_medicine ON medicine_batches(medicine_id)`,
  `CREATE INDEX IF NOT EXISTS idx_med_batches_tenant ON medicine_batches(tenant_id)`,

  // ── stock_quantity column on medicines (used by pharmacy routes) ──────────
  `ALTER TABLE medicines ADD COLUMN stock_quantity INTEGER DEFAULT 0`,

  // ── patient_portal_audit (fire-and-forget action tracking) ────────────────
  `CREATE TABLE IF NOT EXISTS patient_portal_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT,
    action TEXT NOT NULL,
    tenant_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── patient_otp_codes (login flow) ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS patient_otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── patient_credentials (portal login state) ─────────────────────────────
  `CREATE TABLE IF NOT EXISTS patient_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── patient_messages (secure messaging) ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS patient_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    tenant_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── patient_family_links (family member management) ──────────────────────
  `CREATE TABLE IF NOT EXISTS patient_family_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_patient_id INTEGER NOT NULL,
    child_patient_id INTEGER NOT NULL,
    relationship TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── prescription_refill_requests ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS prescription_refill_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    tenant_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── Advanced Billing: deposits ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_deposits (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id        INTEGER NOT NULL,
    patient_id       INTEGER NOT NULL,
    deposit_receipt_no TEXT,
    amount           REAL    NOT NULL DEFAULT 0,
    transaction_type TEXT    NOT NULL DEFAULT 'deposit',
    payment_method   TEXT,
    reference_bill_id INTEGER,
    remarks          TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_by       INTEGER,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_deposits_tp ON billing_deposits (tenant_id, patient_id)`,

  // ── Advanced Billing: settlements ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_settlements (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id              INTEGER NOT NULL,
    patient_id             INTEGER NOT NULL,
    settlement_receipt_no  TEXT,
    payable_amount         REAL    NOT NULL DEFAULT 0,
    paid_amount            REAL    NOT NULL DEFAULT 0,
    deposit_deducted       REAL    NOT NULL DEFAULT 0,
    discount_amount        REAL    NOT NULL DEFAULT 0,
    payment_mode           TEXT    NOT NULL DEFAULT 'cash',
    remarks                TEXT,
    is_active              INTEGER NOT NULL DEFAULT 1,
    created_by             INTEGER,
    created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `ALTER TABLE bills ADD COLUMN settlement_id INTEGER`,

  // ── Advanced Billing: credit notes ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_credit_notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id      INTEGER NOT NULL,
    credit_note_no TEXT,
    bill_id        INTEGER NOT NULL,
    patient_id     INTEGER NOT NULL,
    reason         TEXT    NOT NULL,
    total_amount   REAL    NOT NULL DEFAULT 0,
    refund_amount  REAL    NOT NULL DEFAULT 0,
    payment_mode   TEXT    NOT NULL DEFAULT 'cash',
    remarks        TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_by     INTEGER,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS billing_credit_note_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id       INTEGER NOT NULL,
    credit_note_id  INTEGER NOT NULL,
    invoice_item_id INTEGER NOT NULL,
    item_name       TEXT,
    unit_price      REAL    NOT NULL DEFAULT 0,
    return_quantity INTEGER NOT NULL DEFAULT 1,
    total_amount    REAL    NOT NULL DEFAULT 0,
    remarks         TEXT
  )`,

  // ── Advanced Billing: provisional IPD items ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_provisional_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id        INTEGER NOT NULL,
    patient_id       INTEGER NOT NULL,
    admission_id     INTEGER,
    visit_id         INTEGER,
    item_category    TEXT    NOT NULL,
    item_name        TEXT    NOT NULL,
    department       TEXT,
    unit_price       REAL    NOT NULL DEFAULT 0,
    quantity         INTEGER NOT NULL DEFAULT 1,
    discount_percent REAL    NOT NULL DEFAULT 0,
    discount_amount  REAL    NOT NULL DEFAULT 0,
    total_amount     REAL    NOT NULL DEFAULT 0,
    doctor_id        INTEGER,
    doctor_name      TEXT,
    reference_id     INTEGER,
    bill_status      TEXT    NOT NULL DEFAULT 'provisional',
    billed_bill_id   INTEGER,
    cancel_reason    TEXT,
    cancelled_by     INTEGER,
    cancelled_at     TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_by       INTEGER,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Advanced Billing: cash handovers ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_handovers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id        INTEGER NOT NULL,
    handover_type    TEXT    NOT NULL DEFAULT 'cashier',
    handover_by      INTEGER,
    handover_to      INTEGER,
    handover_amount  REAL    NOT NULL DEFAULT 0,
    due_amount       REAL    NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'pending',
    received_by      INTEGER,
    received_at      TEXT,
    received_remarks TEXT,
    remarks          TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Bill cancellation columns on existing tables ───────────────────────────
  `ALTER TABLE bills ADD COLUMN cancelled_by  INTEGER`,
  `ALTER TABLE bills ADD COLUMN cancelled_at  TEXT`,
  `ALTER TABLE bills ADD COLUMN cancel_reason TEXT`,
  `ALTER TABLE invoice_items ADD COLUMN status        TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE invoice_items ADD COLUMN cancelled_by  INTEGER`,
  `ALTER TABLE invoice_items ADD COLUMN cancelled_at  TEXT`,
  `ALTER TABLE invoice_items ADD COLUMN cancel_reason TEXT`,

  // ── Clinical: vitals ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS clinical_vitals (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id                 INTEGER NOT NULL,
    patient_id                INTEGER NOT NULL,
    visit_id                  INTEGER,
    temperature               REAL,
    pulse                     INTEGER,
    blood_pressure_systolic   INTEGER,
    blood_pressure_diastolic  INTEGER,
    respiratory_rate          INTEGER,
    spo2                      REAL,
    weight                    REAL,
    height                    REAL,
    bmi                       REAL,
    pain_scale                INTEGER,
    blood_sugar               REAL,
    notes                     TEXT,
    taken_by                  INTEGER,
    taken_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
    is_active                 INTEGER NOT NULL DEFAULT 1,
    created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clinical_vitals_patient ON clinical_vitals (tenant_id, patient_id)`,

  // ── Clinical: allergies ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS patient_allergies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    INTEGER NOT NULL,
    patient_id   INTEGER NOT NULL,
    allergy_type TEXT    NOT NULL,
    allergen     TEXT    NOT NULL,
    severity     TEXT    NOT NULL DEFAULT 'mild',
    reaction     TEXT,
    onset_date   TEXT,
    notes        TEXT,
    verified_by  INTEGER,
    verified_at  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_by   INTEGER,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON patient_allergies (tenant_id, patient_id)`,

  // ── Emergency Room: er_patients ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS er_patients (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id                 INTEGER NOT NULL,
    er_patient_number         TEXT,
    patient_id                INTEGER,
    visit_id                  INTEGER,
    visit_datetime            TEXT,
    first_name                TEXT NOT NULL,
    middle_name               TEXT,
    last_name                 TEXT NOT NULL,
    gender                    TEXT,
    age                       INTEGER,
    date_of_birth             TEXT,
    contact_no                TEXT,
    care_of_person_contact    TEXT,
    address                   TEXT,
    referred_by               TEXT,
    referred_to               TEXT,
    case_type                 TEXT,
    condition_on_arrival      TEXT,
    brought_by                TEXT,
    relation_with_patient     TEXT,
    mode_of_arrival_id        INTEGER,
    care_of_person            TEXT,
    er_status                 TEXT NOT NULL DEFAULT 'new',
    triage_code               TEXT,
    triaged_by                INTEGER,
    triaged_on                TEXT,
    finalized_status          TEXT,
    finalized_remarks         TEXT,
    finalized_by              INTEGER,
    finalized_on              TEXT,
    discharge_summary_id      INTEGER,
    performer_id              INTEGER,
    performer_name            TEXT,
    is_police_case            INTEGER DEFAULT 0,
    is_existing_patient       INTEGER DEFAULT 0,
    ward_no                   TEXT,
    is_active                 INTEGER NOT NULL DEFAULT 1,
    created_by                INTEGER,
    created_at                TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_er_patients_tenant ON er_patients (tenant_id)`,

  // ── Emergency Room: er_patient_cases ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS er_patient_cases (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id             INTEGER NOT NULL,
    er_patient_id         INTEGER NOT NULL,
    main_case             TEXT,
    sub_case              TEXT,
    other_case_details    TEXT,
    biting_site           TEXT,
    datetime_of_bite      TEXT,
    biting_animal         TEXT,
    first_aid             TEXT,
    first_aid_others      TEXT,
    biting_animal_others  TEXT,
    biting_site_others    TEXT,
    biting_address        TEXT,
    biting_animal_name    TEXT,
    is_active             INTEGER NOT NULL DEFAULT 1,
    created_by            INTEGER,
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Emergency Room: er_discharge_summaries ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS er_discharge_summaries (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id               INTEGER NOT NULL,
    patient_id              INTEGER NOT NULL,
    visit_id                INTEGER NOT NULL,
    discharge_type          TEXT,
    chief_complaints        TEXT,
    treatment_in_er         TEXT,
    investigations          TEXT,
    advice_on_discharge     TEXT,
    on_examination          TEXT,
    provisional_diagnosis   TEXT,
    doctor_name             TEXT,
    medical_officer         TEXT,
    created_by              INTEGER,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Emergency Room: er_mode_of_arrival ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS er_mode_of_arrival (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL,
    name        TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── OT: ot_bookings ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ot_bookings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER NOT NULL,
    patient_id          INTEGER NOT NULL,
    visit_id            INTEGER,
    booked_for_date     TEXT NOT NULL,
    surgery_type        TEXT,
    diagnosis           TEXT,
    procedure_type      TEXT,
    anesthesia_type     TEXT,
    remarks             TEXT,
    consent_form_path   TEXT,
    pac_form_path       TEXT,
    cancel_reason       TEXT,
    cancelled_by        INTEGER,
    cancelled_at        TEXT,
    cancelled_on        TEXT,
    cancellation_remarks TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_by          INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ot_bookings_tenant ON ot_bookings (tenant_id)`,

  // ── OT: ot_team_members ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ot_team_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   INTEGER NOT NULL,
    booking_id  INTEGER NOT NULL,
    patient_id  INTEGER NOT NULL,
    visit_id    INTEGER,
    staff_id    INTEGER NOT NULL,
    role_type   TEXT NOT NULL,
    created_by  INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── OT: ot_checklist_items ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ot_checklist_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER NOT NULL,
    booking_id    INTEGER NOT NULL,
    item_name     TEXT NOT NULL,
    item_value    INTEGER DEFAULT 0,
    item_details  TEXT,
    created_by    INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── OT: ot_summaries ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ot_summaries (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER NOT NULL,
    booking_id          INTEGER NOT NULL,
    team_member_id      INTEGER,
    pre_op_diagnosis    TEXT,
    post_op_diagnosis   TEXT,
    anesthesia          TEXT,
    ot_charge           REAL NOT NULL DEFAULT 0,
    ot_description      TEXT,
    category            TEXT,
    nurse_signature     TEXT,
    created_by          INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Insurance: insurance_schemes ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS insurance_schemes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER NOT NULL,
    scheme_name   TEXT NOT NULL,
    scheme_code   TEXT,
    scheme_type   TEXT NOT NULL DEFAULT 'insurance',
    contact       TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Insurance: patient_insurance ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS patient_insurance (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER NOT NULL,
    patient_id    INTEGER NOT NULL,
    scheme_id     INTEGER NOT NULL,
    policy_no     TEXT,
    member_id     TEXT,
    valid_from    TEXT,
    valid_to      TEXT,
    credit_limit  REAL DEFAULT 0,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Insurance: insurance_claims ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS insurance_claims (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id         INTEGER NOT NULL,
    claim_no          TEXT NOT NULL,
    patient_id        INTEGER NOT NULL,
    policy_id         INTEGER,
    bill_id           INTEGER,
    diagnosis         TEXT,
    icd10_code        TEXT,
    bill_amount       REAL NOT NULL DEFAULT 0,
    claimed_amount    REAL NOT NULL DEFAULT 0,
    approved_amount   REAL,
    rejection_reason  TEXT,
    reviewer_notes    TEXT,
    status            TEXT NOT NULL DEFAULT 'submitted',
    submitted_at      TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at       TEXT,
    settled_at        TEXT,
    updated_at        TEXT,
    created_by        INTEGER,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Consultations (renamed from telemedicine_sessions) ────────────────────
  `CREATE TABLE IF NOT EXISTS consultations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_no   TEXT,
    patient_id        INTEGER NOT NULL,
    doctor_id         INTEGER,
    appointment_id    INTEGER,
    scheduled_at      DATETIME,
    session_token     TEXT,
    meeting_link      TEXT,
    platform          TEXT DEFAULT 'video',
    status            TEXT DEFAULT 'scheduled',
    started_at        DATETIME,
    ended_at          DATETIME,
    notes             TEXT,
    tenant_id         INTEGER NOT NULL,
    created_by        INTEGER,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
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
  'vital_alerts',
  'vital_alert_rules',
  'push_subscriptions',
  'medicine_batches',
  'invitations',
  'patient_portal_audit',
  'patient_otp_codes',
  'patient_credentials',
  'patient_messages',
  'patient_family_links',
  'prescription_refill_requests',
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
  // Advanced billing & clinical
  'billing_deposits',
  'billing_settlements',
  'billing_credit_notes',
  'billing_credit_note_items',
  'billing_provisional_items',
  'billing_handovers',
  'clinical_vitals',
  'patient_allergies',
  // ER tables
  'er_discharge_summaries',
  'er_patient_cases',
  'er_patients',
  'er_mode_of_arrival',
  // OT tables
  'ot_summaries',
  'ot_checklist_items',
  'ot_team_members',
  'ot_bookings',
  // Insurance tables
  'insurance_claims',
  'patient_insurance',
  'insurance_schemes',
  // Consultations
  'consultations',
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

  // Restore default tenant — include trial_ends_at so subscription guard passes
  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await env.DB.prepare(
    `INSERT INTO tenants (id, name, subdomain, status, trial_ends_at) VALUES (1, 'Test Clinic', 'test', 'active', '${trialEnd}')`,
  ).run();

  // Seed tenant 2 for isolation tests
  await env.DB.prepare(
    `INSERT INTO tenants (id, name, subdomain, status, trial_ends_at) VALUES (2, 'Test Clinic 2', 'test-2', 'active', '${trialEnd}')`,
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
