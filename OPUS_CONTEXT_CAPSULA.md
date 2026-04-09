# Documento de Contexto — Shanklish ERP / Cápsula SaaS
## Radiografía Completa del Sistema — OPUS 4.6

---

## 1. Identidad del Sistema

**Shanklish ERP** es un sistema POS + ERP para restaurantes y entretenimiento construido con
Next.js 14 (App Router), Prisma ORM y PostgreSQL.

### Instancias en producción
| Instancia | Negocio | BD |
|-----------|---------|-----|
| `shanklish-erp` | Restaurante Shanklish Caracas | PostgreSQL (Google Cloud SQL) |
| `table-pong` | Sala de juegos / bar | PostgreSQL independiente |

Cada instancia tiene su propia base de datos. La visión a mediano plazo es unificarlas en un
SaaS multi-tenant llamado **Cápsula**.

### Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 App Router, Server Actions, TypeScript |
| Base de datos | PostgreSQL (Google Cloud SQL) + Prisma ORM 5.10 |
| Autenticación | JWT custom con `jose` (sesiones 24h, cookie httpOnly) |
| UI | Tailwind CSS 3.4 + Radix UI primitives + Lucide icons |
| State management | Zustand 4.5 + React Query (TanStack) |
| Tablas | TanStack React Table 8.13 |
| Impresión | ESC/POS via `react-to-print` + CSS térmico 80mm |
| Excel | ExcelJS + XLSX |
| Búsqueda fuzzy | Fuse.js |
| OCR | Google Cloud Vision API |
| Validación | Zod |
| Charts | Recharts |
| Deploy | Vercel (`vercel-build`: prisma generate + migrate deploy + next build) |

### Mapa de carpetas del proyecto
```
shanklish-erp-main/
├── prisma/
│   └── schema.prisma              # 2002 líneas, 42+ modelos
├── src/
│   ├── app/
│   │   ├── actions/               # 40 archivos .actions.ts (Server Actions)
│   │   ├── api/                   # 4 API Routes (REST)
│   │   ├── dashboard/             # 57 páginas en 31 secciones
│   │   ├── kitchen/               # 2 páginas (cocina + barra)
│   │   └── login/                 # Página de login
│   ├── components/
│   │   ├── layout/                # Navbar, Sidebar, ThemeToggle, NotificationBell, HelpPanel
│   │   ├── pos/                   # 6 componentes POS especializados
│   │   ├── ui/                    # 7 componentes UI base (Card, button, combobox, dialog...)
│   │   ├── users/                 # ChangePasswordDialog
│   │   └── *.tsx                  # 2 parsers WhatsApp (compras + órdenes)
│   ├── lib/
│   │   ├── constants/             # modules-registry.ts, roles.ts, units.ts
│   │   ├── auth.ts                # JWT encrypt/decrypt/session
│   │   ├── permissions.ts         # hasPermission() por nivel numérico
│   │   ├── audit-log.ts           # writeAuditLog() — tabla forense
│   │   ├── invoice-counter.ts     # Correlativos atómicos (REST-0101, DEL-0042...)
│   │   ├── pos-settings.ts        # POSConfig en localStorage por terminal
│   │   ├── print-command.ts       # Impresión térmica 80mm
│   │   ├── export-z-report.ts     # Generación Reporte Z Excel
│   │   ├── export-arqueo-excel.ts # Exportación arqueo de caja
│   │   ├── currency.ts            # Formateo moneda USD/Bs
│   │   ├── datetime.ts            # Utilidades fecha/hora Caracas
│   │   ├── soft-delete.ts         # Helpers para soft delete
│   │   └── prisma.ts              # Singleton PrismaClient
│   ├── server/
│   │   ├── db/index.ts            # PrismaClient export
│   │   └── services/
│   │       ├── inventory.service.ts   # Compras, ventas, ajustes de stock
│   │       ├── production.service.ts  # Órdenes de producción
│   │       └── cost.service.ts        # COGS recursivo por receta
│   └── types/
│       └── index.ts               # Tipos compartidos (User, InventoryItem, etc.)
├── middleware.ts                   # RBAC: protección /dashboard, redirect login
└── package.json
```

---

## 2. Arquitectura de Datos — 42 Modelos Prisma

### 2.1 Core (3 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **User** | id, email, passwordHash, pin, role, allowedModules, isActive, deletedAt | Usuarios del sistema. 10 roles posibles. `allowedModules` (JSON array nullable) filtra módulos por usuario individual |
| **Area** | id, name, branchId, isActive, deletedAt | Áreas/almacenes de trabajo (Cocina, Bodega, Barra, etc.) |
| **Branch** | id, code, name, legalName, timezone, currencyCode | Sucursal física. Relaciona zonas, mesas, mesoneros |

### 2.2 Inventario (12 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **InventoryItem** | sku (unique), name, type (RAW_MATERIAL/SUB_RECIPE/FINISHED_GOOD), baseUnit, category, minimumStock, reorderPoint, isCritical, isBeverage, beverageCategory, productFamilyId | Insumo/producto del inventario |
| **InventoryLocation** | inventoryItemId + areaId (unique), currentStock, lastCountDate | Stock actual de un item en un área específica |
| **InventoryMovement** | inventoryItemId, movementType, quantity, unit, unitCost, totalCost, areaId, salesOrderId, loanId, productionOrderId, requisitionId, purchaseOrderId, auditId, proteinProcessingId | Registro inmutable de todo movimiento. Tipos: PURCHASE, SALE, PRODUCTION_IN/OUT, ADJUSTMENT_IN/OUT, TRANSFER, WASTE |
| **CostHistory** | inventoryItemId, costPerUnit, currency, isCalculated, costBreakdown (JSON), effectiveFrom/To | Historial de precios unitarios |
| **DailyInventory** | date + areaId (unique), status (DRAFT/OPEN/CLOSED), totalVarianceValue | Cabecera del inventario diario por área |
| **DailyInventoryItem** | dailyInventoryId + inventoryItemId (unique), initialCount, finalCount, entries, sales, waste, theoreticalStock, variance, costPerUnit | Línea de conteo diario |
| **InventoryLoan** | inventoryItemId, loaneeName, quantity, type (REPLACEMENT/PAYMENT), status, agreedPrice | Préstamos de inventario entre negocios |
| **InventoryAudit** | status (DRAFT/APPROVED/REJECTED), areaId, effectiveDate | Auditoría de inventario |
| **InventoryAuditItem** | auditId + inventoryItemId, systemStock, countedStock, difference, costSnapshot | Línea de auditoría |
| **InventoryCycle** | code, cycleType (WEEKLY/MONTHLY/SPOT_CHECK), areaIds (JSON), status | Ciclo de conteo físico semanal/mensual |
| **InventoryCycleSnapshot** | cycleId + inventoryItemId + areaId (unique), countedStock, systemStock, difference | Snapshot de conteo en un ciclo |
| **AreaCriticalItem** | areaId + inventoryItemId (unique) | Items marcados como críticos por área |

### 2.3 Producción (5 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **Recipe** | name, outputItemId, outputQuantity, outputUnit, yieldPercentage, isApproved, version | Receta/ficha técnica |
| **RecipeIngredient** | recipeId + ingredientItemId (unique), quantity, unit, wastePercentage, sortOrder | Ingrediente de una receta |
| **ProductionOrder** | orderNumber (unique), recipeId, plannedQuantity, actualQuantity, status (DRAFT→COMPLETED), actualYieldPercentage, actualCost | Orden de producción/transformación |
| **ProteinProcessing** | code (unique), sourceItemId, frozenWeight, drainedWeight, totalSubProducts, wastePercentage, yieldPercentage, status, processingStep (LIMPIEZA/MASERADO/DISTRIBUCION), parentProcessingId (cadena), areaId, supplierId | Desposte y procesamiento de proteínas |
| **ProteinSubProduct** | processingId, outputItemId, name, weight, units, unitType, estimatedCost | Sub-producto resultante del procesamiento |

### 2.4 Plantillas de Procesamiento (2 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **ProcessingTemplate** | name, sourceItemId, processingStep, canGainWeight, chainOrder | Plantilla reutilizable para procesamiento de proteínas |
| **ProcessingTemplateOutput** | templateId + outputItemId (unique), expectedWeight, expectedUnits, isIntermediate | Output esperado en la plantilla |

### 2.5 Menú (4 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **MenuCategory** | name, sortOrder, isActive | Categoría del menú (Shawarmas, Bebidas...) |
| **MenuItem** | sku (unique), name, categoryId, price, cost, recipeId, pedidosYaPrice, pedidosYaEnabled, posGroup, posSubcategory, serviceCategory, kitchenRouting, isIntercompanyItem | Producto de venta |
| **MenuModifierGroup** | name, isRequired, minSelections, maxSelections | Grupo de modificadores (Acompañantes, Tamaño...) |
| **MenuModifier** | groupId, name, priceAdjustment, linkedMenuItemId, isAvailable | Opción modificadora (Tabulé, Extra queso...) |
| **MenuItemModifierGroup** | menuItemId + modifierGroupId (unique) | Pivote: qué grupos aplican a qué productos |

### 2.6 Ventas / POS (8 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **SalesOrder** | orderNumber (unique), orderType (RESTAURANT/DELIVERY), serviceFlow (DIRECT_SALE/OPEN_TAB/TAB_CLOSING), sourceChannel, status, kitchenStatus, subtotal, discount, total, discountType, paymentMethod, paymentStatus, exchangeRateValue, totalBs, areaId, branchId, serviceZoneId, tableOrStationId, openTabId | Orden de venta (central del POS) |
| **SalesOrderItem** | orderId, menuItemId, itemName (snapshot), unitPrice, quantity, lineTotal, costPerUnit, marginPerUnit | Línea de venta con snapshot de precio y margen |
| **SalesOrderItemModifier** | orderItemId, modifierId, name (snapshot), priceAdjustment | Modificador aplicado en la venta |
| **SalesOrderPayment** | salesOrderId, method, amountUSD, amountBS, exchangeRate, reference | Línea de pago (para pagos mixtos) |
| **OpenTab** | tabCode (unique), branchId, serviceZoneId, tableOrStationId, status (OPEN/PARTIALLY_PAID/CLOSED), runningTotal, balanceDue, totalServiceCharge, totalTip, waiterLabel | Mesa/tab abierta |
| **OpenTabOrder** | openTabId + salesOrderId (unique) | Vincula órdenes con tab abierto |
| **PaymentSplit** | openTabId, salesOrderId, splitLabel, splitType, paymentMethod, status, serviceChargeAmount, tipAmount, total | División de cuenta (pago parcial por persona) |
| **InvoiceCounter** | channel (unique), lastValue | Correlativo global por canal. Nunca se resetea |

### 2.7 Modelo Operativo Restaurante (4 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **ServiceZone** | branchId + name (unique), zoneType (DINING/BAR/TERRACE/VIP), sortOrder | Zona de servicio del local |
| **TableOrStation** | branchId + code (unique), serviceZoneId, stationType (TABLE/BAR_SEAT/VIP_ROOM), capacity, currentStatus | Mesa o estación física |
| **Waiter** | branchId, firstName, lastName, isActive | Mesonero del restaurante |

### 2.8 Compras (4 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **Supplier** | name, code (unique), contactName, phone, email | Proveedor |
| **SupplierItem** | supplierId + inventoryItemId (unique), unitPrice, leadTimeDays, isPreferred | Catálogo de items por proveedor |
| **PurchaseOrder** | orderNumber (unique), orderName, supplierId, status (DRAFT→RECEIVED), subtotal, totalAmount | Orden de compra |
| **PurchaseOrderItem** | purchaseOrderId, inventoryItemId, quantityOrdered, quantityReceived, unitPrice | Línea de orden de compra |

### 2.9 Financiero (4 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **ExpenseCategory** | name (unique), color, icon, sortOrder | Categoría de gasto (Alquiler, Nómina...) |
| **Expense** | description, categoryId, amountUsd, amountBs, paymentMethod, paidAt, status (CONFIRMED/VOID), periodMonth/Year | Gasto operativo |
| **CashRegister** | registerName, shiftDate, shiftType, status (OPEN/CLOSED), openingCashUsd/Bs, closingCashUsd/Bs, expectedCash, difference, openingDenominationsJson, closingDenominationsJson, operatorsJson | Apertura/cierre de caja |
| **AccountPayable** | description, supplierId, totalAmountUsd, paidAmountUsd, remainingUsd, status (PENDING/PARTIAL/PAID/OVERDUE), purchaseOrderId | Cuenta por pagar |
| **AccountPayment** | accountPayableId, amountUsd, amountBs, paymentMethod, paymentRef, paidAt | Pago aplicado a cuenta |

### 2.10 Entretenimiento — Table Pong (5 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **GameType** | code (unique), name, defaultSessionMinutes | Tipo de juego (BILLAR, PLAYSTATION...) |
| **GameStation** | code (unique), gameTypeId, branchId, currentStatus, hourlyRate | Estación física de juego |
| **WristbandPlan** | code (unique), name, durationMinutes, price, maxSessions | Plan de pulsera |
| **Reservation** | code (unique), stationId, wristbandPlanId, customerName, scheduledStart/End, status, depositAmount | Reserva de estación |
| **GameSession** | code (unique), stationId, gameTypeId, reservationId, salesOrderId, wristbandCode, billingType (HOURLY/WRISTBAND/FLAT), minutesBilled, amountBilled, status | Sesión activa de juego |
| **QueueTicket** | ticketNumber, stationId, gameTypeId, customerName, status (WAITING→SEATED), estimatedWaitMinutes | Turno en cola de espera |

### 2.11 Intercompany (3 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **IntercompanySettlement** | code (unique), fromBranchId, toBranchId, periodStart/End, status, totalAmount | Liquidación entre negocios |
| **IntercompanySettlementLine** | settlementId, menuItemId, inventoryItemId, description, quantity, unitPrice | Línea de liquidación |
| **IntercompanyItemMapping** | menuItemId + fromBranchId (unique), sourceInventoryItemId, toBranchId, transferPrice | Mapeo de items entre negocios |

### 2.12 Configuración y Sistema (4 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **SystemConfig** | key (PK), value, updatedBy | Configuración clave-valor. Keys activas: `enabled_modules`, `pos_stock_validation_enabled`, metas de venta |
| **ExchangeRate** | rate (Bs por 1 USD), effectiveDate, source (BCV) | Tasa de cambio diaria |
| **ProductFamily** | code (unique), name | Familia de productos para SKU Studio |
| **SkuCreationTemplate** | name, productFamilyId, defaultFields (JSON) | Plantilla de creación rápida de SKUs |

### 2.13 Comunicación y Auditoría (2 modelos)

| Modelo | Campos clave | Propósito |
|--------|-------------|-----------|
| **BroadcastMessage** | title, body, type (INFO/WARNING/ALERT/SUCCESS), targetRoles (JSON), startsAt, expiresAt | Anuncios internos |
| **AuditLog** | userId, userName, userRole, action, entityType, entityId, description, changes (JSON), module, createdAt | Registro forense inmutable. NUNCA se borra |

### 2.14 Diagrama de Relaciones Principales

```
MenuItem ←── recipeId ──→ Recipe ←── ingredientItemId ──→ InventoryItem
   ↓                        ↓                                  ↓
SalesOrderItem          RecipeIngredient              InventoryLocation (stock por área)
   ↓                                                           ↑
SalesOrder ──→ inventory.service.registerSale() ──→ InventoryMovement(SALE)
   ↓                                                           ↑
SalesOrderPayment                                   InventoryMovement(PURCHASE) ←── PurchaseOrder
   ↓                                                           ↑
OpenTab / PaymentSplit                              InventoryMovement(PRODUCTION) ←── ProductionOrder
   ↓                                                           ↑
CashRegister ← ventas del turno                     InventoryMovement(TRANSFER) ←── Requisition
   ↓                                                           ↑
Finanzas (P&L) ← Expense + AccountPayable          InventoryMovement(ADJUSTMENT) ←── InventoryAudit
```

---

*Continúa en Sección 3: Autenticación, Roles y Permisos...*

*Generado el 2026-04-09 — Shanklish ERP / Cápsula SaaS — Parte 1 de N*
