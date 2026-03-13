-- Migration: Add idempotency_key to payments table
-- Prevents duplicate payments from network retries / double-clicks

ALTER TABLE payments ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON payments(idempotency_key, tenant_id)
  WHERE idempotency_key IS NOT NULL;
