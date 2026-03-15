-- Migration: Fix schema mismatches found during production smoke testing
-- 
-- 1. Patients table: missing 'email' column
-- 2. Bills table: code expects total_amount/paid_amount but table has total/paid/due
--    Add alias columns and keep old ones for backward compat

-- Patients: add email column
ALTER TABLE patients ADD COLUMN email TEXT;

-- Bills: add columns that the billing code expects
-- The code INSERTs into total_amount, paid_amount, subtotal, created_by
-- We add these columns; existing rows keep the old total/paid/due columns too
ALTER TABLE bills ADD COLUMN total_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN subtotal REAL NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN created_by INTEGER;

-- Sync historical data: copy old total/paid into new columns
UPDATE bills SET total_amount = total, paid_amount = paid, subtotal = total WHERE total_amount = 0 AND total > 0;
