-- ============================================================================
-- SHANKLISH ERP - MIGRACIÓN: POS RESTAURANTE COMPLETO
-- ============================================================================
-- Agrega Branch, ServiceZone, TableOrStation, OpenTab, PaymentSplit,
-- ExchangeRate y campos adicionales en SalesOrder para soportar
-- mesas, cuentas abiertas y pagos divididos.
-- POLÍTICA: Solo ADD, nunca DROP. 100% aditivo.
-- ============================================================================

-- ============================================================================
-- 1. BRANCH (Sucursales)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Caracas',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Branch_code_key" ON "Branch"("code");

-- ============================================================================
-- 2. SERVICE ZONE (Zonas dentro de sucursal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ServiceZone" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "zoneType" TEXT NOT NULL DEFAULT 'DINING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceZone_branchId_name_key" ON "ServiceZone"("branchId", "name");
CREATE INDEX IF NOT EXISTS "ServiceZone_branchId_zoneType_idx" ON "ServiceZone"("branchId", "zoneType");

ALTER TABLE "ServiceZone" ADD CONSTRAINT "ServiceZone_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 3. TABLE OR STATION (Mesas/Puestos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "TableOrStation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "serviceZoneId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stationType" TEXT NOT NULL DEFAULT 'TABLE',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "currentStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TableOrStation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TableOrStation_branchId_code_key" ON "TableOrStation"("branchId", "code");
CREATE INDEX IF NOT EXISTS "TableOrStation_serviceZoneId_stationType_idx" ON "TableOrStation"("serviceZoneId", "stationType");
CREATE INDEX IF NOT EXISTS "TableOrStation_currentStatus_idx" ON "TableOrStation"("currentStatus");

ALTER TABLE "TableOrStation" ADD CONSTRAINT "TableOrStation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TableOrStation" ADD CONSTRAINT "TableOrStation_serviceZoneId_fkey" FOREIGN KEY ("serviceZoneId") REFERENCES "ServiceZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 4. OPEN TAB (Cuentas abiertas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "OpenTab" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "serviceZoneId" TEXT,
    "tableOrStationId" TEXT,
    "tabCode" TEXT NOT NULL,
    "customerLabel" TEXT,
    "customerPhone" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "serviceType" TEXT NOT NULL DEFAULT 'TABLE_SERVICE',
    "runningSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "runningDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "runningTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "runningTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "waiterLabel" TEXT,
    "openedById" TEXT NOT NULL,
    "assignedWaiterId" TEXT,
    "closedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    CONSTRAINT "OpenTab_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpenTab_tabCode_key" ON "OpenTab"("tabCode");
CREATE INDEX IF NOT EXISTS "OpenTab_branchId_status_idx" ON "OpenTab"("branchId", "status");
CREATE INDEX IF NOT EXISTS "OpenTab_tableOrStationId_idx" ON "OpenTab"("tableOrStationId");

ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_serviceZoneId_fkey" FOREIGN KEY ("serviceZoneId") REFERENCES "ServiceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_tableOrStationId_fkey" FOREIGN KEY ("tableOrStationId") REFERENCES "TableOrStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_assignedWaiterId_fkey" FOREIGN KEY ("assignedWaiterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 5. OPEN TAB ORDER (Puente tab ↔ órdenes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "OpenTabOrder" (
    "id" TEXT NOT NULL,
    "openTabId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpenTabOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpenTabOrder_openTabId_salesOrderId_key" ON "OpenTabOrder"("openTabId", "salesOrderId");
CREATE INDEX IF NOT EXISTS "OpenTabOrder_salesOrderId_idx" ON "OpenTabOrder"("salesOrderId");

ALTER TABLE "OpenTabOrder" ADD CONSTRAINT "OpenTabOrder_openTabId_fkey" FOREIGN KEY ("openTabId") REFERENCES "OpenTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenTabOrder" ADD CONSTRAINT "OpenTabOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 6. PAYMENT SPLIT (División de cuenta)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PaymentSplit" (
    "id" TEXT NOT NULL,
    "openTabId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "splitLabel" TEXT NOT NULL,
    "splitType" TEXT NOT NULL DEFAULT 'EQUAL',
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "PaymentSplit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentSplit_openTabId_status_idx" ON "PaymentSplit"("openTabId", "status");
CREATE INDEX IF NOT EXISTS "PaymentSplit_salesOrderId_idx" ON "PaymentSplit"("salesOrderId");

ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_openTabId_fkey" FOREIGN KEY ("openTabId") REFERENCES "OpenTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 7. EXCHANGE RATE (Tasa de cambio USD/Bs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ExchangeRate" (
    "id" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BCV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExchangeRate_effectiveDate_idx" ON "ExchangeRate"("effectiveDate");

-- ============================================================================
-- 8. CAMPOS NUEVOS EN SALES ORDER (para POS completo)
-- ============================================================================

ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "serviceFlow" TEXT DEFAULT 'DIRECT_SALE';
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT DEFAULT 'POS_RESTAURANT';
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "kitchenStatus" TEXT DEFAULT 'NOT_SENT';
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "sentToKitchenAt" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "serviceZoneId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "tableOrStationId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "openTabId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "exchangeRateId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "exchangeRateValue" DOUBLE PRECISION;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION;

-- FK para los nuevos campos
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_serviceZoneId_fkey" FOREIGN KEY ("serviceZoneId") REFERENCES "ServiceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_tableOrStationId_fkey" FOREIGN KEY ("tableOrStationId") REFERENCES "TableOrStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_openTabId_fkey" FOREIGN KEY ("openTabId") REFERENCES "OpenTab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "SalesOrder_serviceFlow_idx" ON "SalesOrder"("serviceFlow");
CREATE INDEX IF NOT EXISTS "SalesOrder_kitchenStatus_idx" ON "SalesOrder"("kitchenStatus");
CREATE INDEX IF NOT EXISTS "SalesOrder_branchId_idx" ON "SalesOrder"("branchId");
CREATE INDEX IF NOT EXISTS "SalesOrder_serviceZoneId_idx" ON "SalesOrder"("serviceZoneId");
CREATE INDEX IF NOT EXISTS "SalesOrder_tableOrStationId_idx" ON "SalesOrder"("tableOrStationId");
CREATE INDEX IF NOT EXISTS "SalesOrder_openTabId_idx" ON "SalesOrder"("openTabId");

-- ============================================================================
-- 9. CAMPOS EN AREA (vinculación con Branch)
-- ============================================================================

ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Area" ADD CONSTRAINT "Area_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Area_branchId_idx" ON "Area"("branchId");

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('Branch','ServiceZone','TableOrStation','OpenTab','OpenTabOrder','PaymentSplit','ExchangeRate');
-- ============================================================================
