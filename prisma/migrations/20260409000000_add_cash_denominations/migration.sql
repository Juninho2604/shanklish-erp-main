-- Migration: add bill denomination fields to CashRegister
-- These are nullable TEXT fields — no existing records are affected

ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "openingDenominationsJson" TEXT;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "closingDenominationsJson" TEXT;
