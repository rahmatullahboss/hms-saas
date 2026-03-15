-- Migration: Fix payments table - add columns that billing code expects
ALTER TABLE payments ADD COLUMN type TEXT DEFAULT 'current';
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
