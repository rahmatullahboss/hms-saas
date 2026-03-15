-- Migration 0011: Add missing patient portal tables
-- These tables are required by src/routes/tenant/patientPortal.ts
-- but were never created in any previous migration.

-- 1. Patient Portal Audit Log (fire-and-forget action tracking)
CREATE TABLE IF NOT EXISTS patient_portal_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT,
  action TEXT NOT NULL,
  tenant_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_portal_audit_patient
  ON patient_portal_audit(patient_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_patient_portal_audit_action
  ON patient_portal_audit(action, tenant_id);

-- 2. Patient OTP Codes (login flow)
CREATE TABLE IF NOT EXISTS patient_otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_otp_codes_email
  ON patient_otp_codes(email, tenant_id);

-- 3. Patient Credentials (portal login state)
CREATE TABLE IF NOT EXISTS patient_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_credentials_unique
  ON patient_credentials(patient_id, tenant_id);

-- 4. Patient Vitals (vital signs tracking)
CREATE TABLE IF NOT EXISTS patient_vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  systolic REAL,
  diastolic REAL,
  temperature REAL,
  heart_rate REAL,
  spo2 REAL,
  respiratory_rate REAL,
  weight REAL,
  notes TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tenant_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient
  ON patient_vitals(patient_id, tenant_id);

-- 5. Patient Messages (secure messaging between patient and doctor)
CREATE TABLE IF NOT EXISTS patient_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('patient', 'doctor')),
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  tenant_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_messages_conversation
  ON patient_messages(patient_id, doctor_id, tenant_id);

-- 6. Patient Family Links (family member management)
CREATE TABLE IF NOT EXISTS patient_family_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_patient_id INTEGER NOT NULL,
  child_patient_id INTEGER NOT NULL,
  relationship TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_family_links_unique
  ON patient_family_links(parent_patient_id, child_patient_id, tenant_id);

-- 7. Prescription Refill Requests
CREATE TABLE IF NOT EXISTS prescription_refill_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
  tenant_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prescription_refill_requests_patient
  ON prescription_refill_requests(patient_id, tenant_id);
