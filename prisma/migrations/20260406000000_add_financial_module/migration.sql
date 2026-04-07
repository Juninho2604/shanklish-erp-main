-- ============================================================================
-- Migration: add_financial_module
-- Adds: ExpenseCategory, Expense, CashRegister, AccountPayable, AccountPayment
-- ============================================================================

-- ExpenseCategory
CREATE TABLE "ExpenseCategory" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT,
    "icon"        TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");
CREATE INDEX "ExpenseCategory_isActive_idx" ON "ExpenseCategory"("isActive");

-- Expense
CREATE TABLE "Expense" (
    "id"             TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "notes"          TEXT,
    "categoryId"     TEXT NOT NULL,
    "amountUsd"      DOUBLE PRECISION NOT NULL,
    "amountBs"       DOUBLE PRECISION,
    "exchangeRate"   DOUBLE PRECISION,
    "paymentMethod"  TEXT NOT NULL,
    "paymentRef"     TEXT,
    "paidAt"         TIMESTAMP(3) NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'CONFIRMED',
    "voidReason"     TEXT,
    "voidedAt"       TIMESTAMP(3),
    "voidedById"     TEXT,
    "receiptUrl"     TEXT,
    "periodMonth"    INTEGER NOT NULL,
    "periodYear"     INTEGER NOT NULL,
    "createdById"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
CREATE INDEX "Expense_paidAt_idx" ON "Expense"("paidAt");
CREATE INDEX "Expense_periodYear_periodMonth_idx" ON "Expense"("periodYear", "periodMonth");
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CashRegister
CREATE TABLE "CashRegister" (
    "id"             TEXT NOT NULL,
    "registerName"   TEXT NOT NULL,
    "shiftDate"      TIMESTAMP(3) NOT NULL,
    "shiftType"      TEXT NOT NULL DEFAULT 'DAY',
    "status"         TEXT NOT NULL DEFAULT 'OPEN',
    "openingCashUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCashBs"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById"     TEXT NOT NULL,
    "closingCashUsd" DOUBLE PRECISION,
    "closingCashBs"  DOUBLE PRECISION,
    "closedAt"       TIMESTAMP(3),
    "closedById"     TEXT,
    "totalSalesUsd"  DOUBLE PRECISION,
    "totalExpenses"  DOUBLE PRECISION,
    "expectedCash"   DOUBLE PRECISION,
    "difference"     DOUBLE PRECISION,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashRegister_shiftDate_idx" ON "CashRegister"("shiftDate");
CREATE INDEX "CashRegister_status_idx" ON "CashRegister"("status");
CREATE INDEX "CashRegister_openedById_idx" ON "CashRegister"("openedById");

ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openedById_fkey"
    FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AccountPayable
CREATE TABLE "AccountPayable" (
    "id"               TEXT NOT NULL,
    "description"      TEXT NOT NULL,
    "invoiceNumber"    TEXT,
    "invoiceUrl"       TEXT,
    "supplierId"       TEXT,
    "creditorName"     TEXT,
    "totalAmountUsd"   DOUBLE PRECISION NOT NULL,
    "paidAmountUsd"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingUsd"     DOUBLE PRECISION NOT NULL,
    "invoiceDate"      TIMESTAMP(3) NOT NULL,
    "dueDate"          TIMESTAMP(3),
    "fullyPaidAt"      TIMESTAMP(3),
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "purchaseOrderId"  TEXT,
    "createdById"      TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountPayable_status_idx" ON "AccountPayable"("status");
CREATE INDEX "AccountPayable_dueDate_idx" ON "AccountPayable"("dueDate");
CREATE INDEX "AccountPayable_supplierId_idx" ON "AccountPayable"("supplierId");
CREATE INDEX "AccountPayable_purchaseOrderId_idx" ON "AccountPayable"("purchaseOrderId");
CREATE INDEX "AccountPayable_createdById_idx" ON "AccountPayable"("createdById");

ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AccountPayment
CREATE TABLE "AccountPayment" (
    "id"                TEXT NOT NULL,
    "accountPayableId"  TEXT NOT NULL,
    "amountUsd"         DOUBLE PRECISION NOT NULL,
    "amountBs"          DOUBLE PRECISION,
    "exchangeRate"      DOUBLE PRECISION,
    "paymentMethod"     TEXT NOT NULL,
    "paymentRef"        TEXT,
    "paidAt"            TIMESTAMP(3) NOT NULL,
    "notes"             TEXT,
    "createdById"       TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountPayment_accountPayableId_idx" ON "AccountPayment"("accountPayableId");
CREATE INDEX "AccountPayment_paidAt_idx" ON "AccountPayment"("paidAt");

ALTER TABLE "AccountPayment" ADD CONSTRAINT "AccountPayment_accountPayableId_fkey"
    FOREIGN KEY ("accountPayableId") REFERENCES "AccountPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPayment" ADD CONSTRAINT "AccountPayment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
