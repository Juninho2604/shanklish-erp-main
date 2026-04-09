-- AlterTable: add operatorsJson to CashRegister (nullable, non-breaking)
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "operatorsJson" TEXT;
