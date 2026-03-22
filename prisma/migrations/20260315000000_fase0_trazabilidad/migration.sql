-- ============================================================================
-- SHANKLISH ERP - MIGRACIÓN FASE 0: TRAZABILIDAD
-- ============================================================================
-- POLÍTICA DE SEGURIDAD:
--   ✅ Solo ADD COLUMN (nunca DROP ni RENAME)
--   ✅ Todos los campos nuevos son NULL o tienen DEFAULT
--   ✅ No se modifica ni elimina ningún dato existente
--   ✅ Compatible con la app actual (no rompe nada)
-- ============================================================================
-- EJECUTAR DESPUÉS DE HACER BACKUP:
--   pg_dump -Fc -h HOST -U USER -d shanklish_erp > backup_pre_fase0.dump
-- ============================================================================

-- ============================================================================
-- 1. AUDIT LOG - Registro forense de operaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,

    -- QUIÉN
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,

    -- QUÉ
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    -- DETALLE
    "description" TEXT,
    "changes" TEXT,
    "metadata" TEXT,

    -- DESDE DÓNDE
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,

    -- CUÁNDO
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- CONTEXTO
    "module" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_module_idx" ON "AuditLog"("module");

-- ============================================================================
-- 2. SOFT DELETE - Agregar a entidades críticas
-- ============================================================================

-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- InventoryItem
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- Recipe
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- MenuItem
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- MenuCategory
ALTER TABLE "MenuCategory" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MenuCategory" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- SalesOrder
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- ProductionOrder
ALTER TABLE "ProductionOrder" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ProductionOrder" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- Requisition
ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- InventoryLoan
ALTER TABLE "InventoryLoan" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "InventoryLoan" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- InventoryAudit
ALTER TABLE "InventoryAudit" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "InventoryAudit" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- ProteinProcessing
ALTER TABLE "ProteinProcessing" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ProteinProcessing" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- Area
ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- DailyInventory
ALTER TABLE "DailyInventory" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "DailyInventory" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- ============================================================================
-- 3. COST SNAPSHOT EN LÍNEAS DE VENTA (margen retroactivo)
-- ============================================================================

ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "costPerUnit" DOUBLE PRECISION;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "costTotal" DOUBLE PRECISION;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "marginPerUnit" DOUBLE PRECISION;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "marginPercent" DOUBLE PRECISION;

-- ============================================================================
-- 4. ÁREA EN MOVIMIENTOS DE INVENTARIO
-- ============================================================================

ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "areaId" TEXT;

-- Vinculaciones cruzadas para trazabilidad completa
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "productionOrderId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "requisitionId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "auditId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "proteinProcessingId" TEXT;

-- Índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS "InventoryMovement_areaId_idx" ON "InventoryMovement"("areaId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_productionOrderId_idx" ON "InventoryMovement"("productionOrderId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_requisitionId_idx" ON "InventoryMovement"("requisitionId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_purchaseOrderId_idx" ON "InventoryMovement"("purchaseOrderId");

-- ============================================================================
-- 5. ÍNDICES DE SOFT DELETE (para queries eficientes con filtro)
-- ============================================================================

CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX IF NOT EXISTS "InventoryItem_deletedAt_idx" ON "InventoryItem"("deletedAt");
CREATE INDEX IF NOT EXISTS "Recipe_deletedAt_idx" ON "Recipe"("deletedAt");
CREATE INDEX IF NOT EXISTS "MenuItem_deletedAt_idx" ON "MenuItem"("deletedAt");
CREATE INDEX IF NOT EXISTS "SalesOrder_deletedAt_idx" ON "SalesOrder"("deletedAt");
CREATE INDEX IF NOT EXISTS "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_deletedAt_idx" ON "PurchaseOrder"("deletedAt");
CREATE INDEX IF NOT EXISTS "Requisition_deletedAt_idx" ON "Requisition"("deletedAt");

-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================================
-- Ejecutar después para confirmar que todo quedó bien:
--
-- SELECT COUNT(*) FROM "AuditLog";  -- Debe ser 0 (tabla nueva vacía)
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'User' AND column_name IN ('deletedAt', 'deletedById');
-- -- Debe retornar 2 filas
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'SalesOrderItem' AND column_name LIKE 'cost%';
-- -- Debe retornar costPerUnit y costTotal
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'InventoryMovement' AND column_name = 'areaId';
-- -- Debe retornar 1 fila
-- ============================================================================
