-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0014_advanced_billing_clinical_tables.sql
-- Description: Adds advanced billing tables (deposits, settlements, credit notes,
--              provisional IPD charges, handovers, cancellation columns) and
--              clinical tables (vitals, allergies).
-- Safe to run multiple times: All CREATE TABLE statements use IF NOT EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Patient Deposits ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_deposits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        INTEGER NOT NULL,
  patient_id       INTEGER NOT NULL,
  deposit_receipt_no TEXT,
  amount           REAL    NOT NULL DEFAULT 0,
  transaction_type TEXT    NOT NULL DEFAULT 'deposit' CHECK (transaction_type IN ('deposit', 'refund', 'adjustment')),
  payment_method   TEXT,
  reference_bill_id INTEGER,
  remarks          TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_by       INTEGER,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_deposits_tenant_patient ON billing_deposits (tenant_id, patient_id);

-- ─── 2. Bill Settlements ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_settlements (
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
);
CREATE INDEX IF NOT EXISTS idx_billing_settlements_tenant_patient ON billing_settlements (tenant_id, patient_id);

-- Add settlement_id to bills if it doesn't exist
ALTER TABLE bills ADD COLUMN settlement_id INTEGER;

-- ─── 3. Credit Notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_credit_notes (
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
);
CREATE INDEX IF NOT EXISTS idx_billing_credit_notes_tenant ON billing_credit_notes (tenant_id, patient_id);

CREATE TABLE IF NOT EXISTS billing_credit_note_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       INTEGER NOT NULL,
  credit_note_id  INTEGER NOT NULL,
  invoice_item_id INTEGER NOT NULL,
  item_name       TEXT,
  unit_price      REAL    NOT NULL DEFAULT 0,
  return_quantity INTEGER NOT NULL DEFAULT 1,
  total_amount    REAL    NOT NULL DEFAULT 0,
  remarks         TEXT
);
CREATE INDEX IF NOT EXISTS idx_billing_cn_items_cn ON billing_credit_note_items (credit_note_id);

-- ─── 4. Provisional IPD Charges ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_provisional_items (
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
  bill_status      TEXT    NOT NULL DEFAULT 'provisional' CHECK (bill_status IN ('provisional', 'billed', 'cancelled')),
  billed_bill_id   INTEGER,
  cancel_reason    TEXT,
  cancelled_by     INTEGER,
  cancelled_at     TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_by       INTEGER,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_prov_items_admission ON billing_provisional_items (tenant_id, admission_id);

-- ─── 5. Cash Handovers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_handovers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        INTEGER NOT NULL,
  handover_type    TEXT    NOT NULL DEFAULT 'cashier' CHECK (handover_type IN ('cashier', 'counter', 'department')),
  handover_by      INTEGER,
  handover_to      INTEGER,
  handover_amount  REAL    NOT NULL DEFAULT 0,
  due_amount       REAL    NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'verified')),
  received_by      INTEGER,
  received_at      TEXT,
  received_remarks TEXT,
  remarks          TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_handovers_tenant ON billing_handovers (tenant_id, status);

-- ─── 6. Bill cancellation columns (on existing tables) ───────────────────────
-- Bills table
ALTER TABLE bills ADD COLUMN cancelled_by  INTEGER;
ALTER TABLE bills ADD COLUMN cancelled_at  TEXT;
ALTER TABLE bills ADD COLUMN cancel_reason TEXT;

-- Invoice items table  
ALTER TABLE invoice_items ADD COLUMN status       TEXT NOT NULL DEFAULT 'active';
ALTER TABLE invoice_items ADD COLUMN cancelled_by INTEGER;
ALTER TABLE invoice_items ADD COLUMN cancelled_at TEXT;
ALTER TABLE invoice_items ADD COLUMN cancel_reason TEXT;

-- ─── 7. Clinical Vitals ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_vitals (
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
  pain_scale                INTEGER CHECK (pain_scale IS NULL OR (pain_scale >= 0 AND pain_scale <= 10)),
  blood_sugar               REAL,
  notes                     TEXT,
  taken_by                  INTEGER,
  taken_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  is_active                 INTEGER NOT NULL DEFAULT 1,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clinical_vitals_patient ON clinical_vitals (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_vitals_visit   ON clinical_vitals (tenant_id, visit_id);

-- ─── 8. Patient Allergies ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_allergies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    INTEGER NOT NULL,
  patient_id   INTEGER NOT NULL,
  allergy_type TEXT    NOT NULL CHECK (allergy_type IN ('drug', 'food', 'environmental', 'other')),
  allergen     TEXT    NOT NULL,
  severity     TEXT    NOT NULL DEFAULT 'mild' CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
  reaction     TEXT,
  onset_date   TEXT,
  notes        TEXT,
  verified_by  INTEGER,
  verified_at  TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_by   INTEGER,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON patient_allergies (tenant_id, patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_allergies_unique ON patient_allergies (tenant_id, patient_id, allergen, allergy_type, is_active);
