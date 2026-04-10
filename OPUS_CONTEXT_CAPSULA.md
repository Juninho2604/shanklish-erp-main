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

## 3. Autenticación, Roles y Permisos

### 3.1 Autenticación — JWT Custom

**Archivo**: `src/lib/auth.ts`

- JWT firmado con HS256 via `jose`
- Cookie `session` httpOnly, secure en prod, sameSite lax, 24h TTL
- Secret: `JWT_SECRET` env var (fallback hardcodeado — **gap de seguridad**)
- Payload: `{ id, email, firstName, lastName, role }`
- Funciones: `encrypt()`, `decrypt()`, `getSession()`, `createSession()`, `deleteSession()`

**Server Actions de auth**: `src/app/actions/auth.actions.ts`
- `loginAction(prevState, formData)` — valida email+password, crea sesión
- `logoutAction()` — elimina cookie de sesión

### 3.2 Los 10 Roles del Sistema

**Archivo**: `src/lib/constants/roles.ts`

| Rol | Nivel | Descripción |
|-----|-------|-------------|
| OWNER | 1 (100) | Acceso total. Único que activa/desactiva módulos |
| AUDITOR | 2 (90) | Solo lectura en todo, acceso a auditoría y reportes |
| ADMIN_MANAGER | 3 (80) | Gestión administrativa y financiera |
| OPS_MANAGER | 4 (70) | Gestión de operaciones, inventario, producción |
| HR_MANAGER | 5 (60) | Recursos humanos |
| CHEF | 6 (50) | Recetas, producción, inventario (lectura) |
| AREA_LEAD | 7 (40) | Gestión de área específica |
| KITCHEN_CHEF | 7 (40) | Comandera de cocina (solo vista) |
| CASHIER_RESTAURANT | 8 (10) | POS restaurante + historial propio |
| CASHIER_DELIVERY | 8 (10) | POS delivery + historial propio |

**Nota**: Existen dos sistemas de niveles numéricos paralelos:
- `roles.ts:ROLE_HIERARCHY` — menor número = mayor rango (1-8)
- `permissions.ts` — mayor número = mayor rango (10-100)
- **Gap**: No están unificados. `permissions.ts` no incluye KITCHEN_CHEF, WAITER, ni CASHIER_DELIVERY con sus niveles correctos.

### 3.3 Sistema de Permisos

**Archivo**: `src/lib/permissions.ts` — Sistema numérico simple:

```typescript
// Nivel del rol → número. userLevel >= requiredLevel = acceso permitido
const roleLevels = {
  OWNER: 100, AUDITOR: 90, ADMIN_MANAGER: 80, OPS_MANAGER: 70,
  HR_MANAGER: 60, CHEF: 50, AREA_LEAD: 40, STAFF: 10
};

export const PERMISSIONS = {
  CONFIGURE_ROLES: 70,    // OPS_MANAGER+
  APPROVE_TRANSFERS: 40,  // AREA_LEAD+
  VIEW_COSTS: 80,         // ADMIN_MANAGER+
  VIEW_USERS: 60,         // HR_MANAGER+
  MANAGE_USERS: 70,       // OPS_MANAGER+
};
```

**Archivo**: `src/lib/constants/roles.ts` — Matriz RBAC detallada:
- `ROLE_PERMISSIONS` — por módulo y acción (view, create, edit, delete, approve, export)
- `hasPermission(role, module, permission)` — verificación granular
- `canManageRole(actorRole, targetRole)` — jerarquía (solo superiores modifican inferiores)
- `getManageableRoles(actorRole)` — qué roles puede crear/editar

### 3.4 Middleware RBAC

**Archivo**: `src/middleware.ts` (56 líneas)

Matcher: `/dashboard/:path*` y `/login`

| Regla | Rutas | Roles permitidos |
|-------|-------|-----------------|
| Login requerido | `/dashboard/*` sin sesión | Redirect → `/login` |
| Ya autenticado | `/login` con sesión | Redirect → `/dashboard` |
| Gestión usuarios | `/dashboard/usuarios` | OWNER, ADMIN_MANAGER |
| Auditorías | `/dashboard/inventario/auditorias`, `/dashboard/inventario/importar` | OWNER, ADMIN_MANAGER, OPS_MANAGER, AUDITOR |
| Config global | `/dashboard/config/*` | Solo OWNER |

**Gap**: El middleware solo cubre 3 rutas específicas. El control granular para el resto de módulos se hace client-side vía `MODULE_ROLE_ACCESS` en el Sidebar. Esto significa que un usuario podría acceder a `/dashboard/finanzas` directamente si conoce la URL, aunque no debería ver ese módulo.

### 3.5 Acceso por Módulos — Doble Filtro

El acceso real a un módulo requiere pasar **dos filtros**:

1. **Módulo habilitado** en la instalación → `SystemConfig.enabled_modules` (BD) o `NEXT_PUBLIC_ENABLED_MODULES` (env var fallback)
2. **Rol autorizado** → `MODULE_ROLE_ACCESS[moduleId].includes(userRole)` en `modules-registry.ts:549-600`
3. *(Opcional)* **Módulos individuales** → `User.allowedModules` (JSON array, null = sin restricción extra)

Función clave: `getVisibleModules(userRole, enabledIds, userAllowedModules)` en `modules-registry.ts:629`

---

## 4. Module Registry y Navegación

### 4.1 Registro Maestro de Módulos

**Archivo**: `src/lib/constants/modules-registry.ts` (682 líneas)

Interfaz `ModuleDefinition`: id, label, description, icon, href, section, enabledByDefault, sortOrder, subRoutes?, tags?

### 4.2 Las 4 Secciones del Sidebar

#### Operaciones (20 módulos)

| # | id | Label | Ruta | enabledByDefault | sortOrder |
|---|-----|-------|------|-----------------|-----------|
| 1 | dashboard | Dashboard | /dashboard | true | 0 |
| 2 | estadisticas | Estadísticas | /dashboard/estadisticas | true | 5 |
| 3 | inventory_daily | Inventario Diario | /dashboard/inventario/diario | true | 10 |
| 4 | inventory | Inventario | /dashboard/inventario | true | 20 |
| 5 | inventory_count | Conteo Físico (Excel) | /dashboard/inventario/conteo-semanal | true | 25 |
| 6 | audits | Auditorías | /dashboard/inventario/auditorias | true | 30 |
| 7 | transfers | Transferencias | /dashboard/transferencias | true | 40 |
| 8 | inventory_history | Historial Mensual | /dashboard/inventario/historial-mensual | true | 45 |
| 9 | loans | Préstamos | /dashboard/prestamos | true | 50 |
| 10 | mesoneros | Mesoneros | /dashboard/mesoneros | true | 55 |
| 11 | recipes | Recetas | /dashboard/recetas | true | 60 |
| 12 | production | Producción | /dashboard/produccion | true | 70 |
| 13 | costs | Costos | /dashboard/costos | true | 80 |
| 14 | margen | Margen por Plato | /dashboard/costos/margen | true | 82 |
| 15 | purchases | Compras | /dashboard/compras | true | 90 |
| 16 | proteins | Proteínas | /dashboard/proteinas | true | 100 |
| 17 | asistente | Asistente de Nomenclatura | /dashboard/asistente | true | 105 |
| 18 | sku_studio | SKU Studio | /dashboard/sku-studio | true | 106 |
| 19 | menu | Menú | /dashboard/menu | true | 110 |
| 20 | modifiers | Modificadores | /dashboard/menu/modificadores | true | 115 |

#### Ventas / POS (9 módulos)

| # | id | Label | Ruta | enabledByDefault | sortOrder |
|---|-----|-------|------|-----------------|-----------|
| 1 | pos_restaurant | POS Restaurante | /dashboard/pos/restaurante | true | 200 |
| 2 | pos_waiter | POS Mesero | /dashboard/pos/mesero | **false** | 205 |
| 3 | pos_delivery | POS Delivery | /dashboard/pos/delivery | true | 210 |
| 4 | pedidosya | PedidosYA | /dashboard/pos/pedidosya | **false** | 220 |
| 5 | sales_entry | Cargar Ventas | /dashboard/ventas/cargar | true | 230 |
| 6 | sales_history | Historial Ventas | /dashboard/sales | true | 240 |
| 7 | kitchen_display | Comandera Cocina | /kitchen | true | 250 |
| 8 | barra_display | Comandera Barra | /kitchen/barra | true | 251 |
| 9 | pos_config | Configuración POS | /dashboard/config/pos | true | 260 |

#### Entretenimiento / Games (4 módulos — todos off por default)

| # | id | Label | Ruta | enabledByDefault | sortOrder |
|---|-----|-------|------|-----------------|-----------|
| 1 | games | Juegos | /dashboard/games | **false** | 300 |
| 2 | reservations | Reservaciones | /dashboard/reservations | **false** | 310 |
| 3 | wristbands | Pulseras | /dashboard/wristbands | **false** | 320 |
| 4 | queue | Cola de Espera | /dashboard/queue | **false** | 330 |

#### Administración (14 módulos)

| # | id | Label | Ruta | enabledByDefault | sortOrder |
|---|-----|-------|------|-----------------|-----------|
| 1 | intercompany | Intercompany | /dashboard/intercompany | **false** | 400 |
| 2 | users | Usuarios | /dashboard/usuarios | true | 500 |
| 3 | modulos_usuario | Módulos por Usuario | /dashboard/config/modulos-usuario | true | 503 |
| 4 | roles_config | Roles y Permisos | /dashboard/config/roles | true | 510 |
| 5 | module_config | Módulos | /dashboard/config/modules | true | 520 |
| 6 | almacenes | Almacenes | /dashboard/almacenes | true | 528 |
| 7 | tasa_cambio | Tasa de Cambio | /dashboard/config/tasa-cambio | true | 530 |
| 8 | metas | Objetivos y Metas | /dashboard/metas | true | 540 |
| 9 | anuncios | Anuncios a Gerencia | /dashboard/anuncios | true | 542 |
| 10 | finanzas | Dashboard Financiero | /dashboard/finanzas | true | 550 |
| 11 | gastos | Gastos | /dashboard/gastos | true | 560 |
| 12 | caja | Control de Caja | /dashboard/caja | true | 570 |
| 13 | cuentas_pagar | Cuentas por Pagar | /dashboard/cuentas-pagar | true | 580 |

### 4.3 MODULE_ROLE_ACCESS — Matriz Completa

Roles con acceso a **todos** los módulos de operaciones:
- OWNER, ADMIN_MANAGER, OPS_MANAGER (con variaciones en inventory_history, loans, costs, margen, menu, modifiers)

Roles con acceso **restringido**:
- CHEF → dashboard, estadísticas, inventario, conteo, auditorías, transferencias, recetas, producción, compras, proteínas, sku_studio, asistente
- AREA_LEAD → dashboard, estadísticas, inventario diario/general, conteo, auditorías, transferencias, producción, compras, proteínas
- CASHIER_RESTAURANT → estadísticas, pos_restaurant, sales_history, barra_display, pos_config, caja, reservations, queue
- CASHIER_DELIVERY → estadísticas, pos_delivery, pedidosya, pos_config, caja, tasa_cambio
- KITCHEN_CHEF → estadísticas, kitchen_display, barra_display
- WAITER → estadísticas, pos_waiter
- HR_MANAGER → dashboard, users
- AUDITOR → dashboard, estadísticas, inventario (todo lectura), transfers, recipes, production, costs, margen, purchases, sales_history, intercompany, users, finanzas, gastos, caja, cuentas_pagar

### 4.4 Funciones Clave del Registry

```
getEnabledModuleIds()                                    → string[]  // Lee env var o usa defaults
getVisibleModules(userRole, enabledIds?, userAllowed?)    → ModuleDefinition[]  // Filtro triple
getModulesBySection(userRole, enabledIds?, userAllowed?)  → { operations, sales, games, admin }
```

**Nota especial**: `module_config` siempre es visible para OWNER, independientemente de `enabled_modules`. Nunca se filtra por `allowedModules`.

---

## 5. Módulos de OPERACIONES (20 módulos)

### 5.1 Dashboard

- **Ruta**: `/dashboard`
- **Página**: `src/app/dashboard/page.tsx` — Server Component
- **Actions**: `dashboard.actions.ts` → `getDashboardStatsAction()`
- **Modelos**: SalesOrder, InventoryItem, OpenTab (lectura agregada)
- **Lógica**: Métricas resumen: ventas del día, tabs abiertos, items bajo stock, última actividad
- **Conexiones**: ← SalesOrder (ventas hoy), ← InventoryLocation (alertas stock), ← OpenTab (mesas activas)
- **Estado**: Funcional

### 5.2 Estadísticas

- **Ruta**: `/dashboard/estadisticas`
- **Página**: `src/app/dashboard/estadisticas/page.tsx` — Server Component
- **Actions**: `estadisticas.actions.ts` → `getEstadisticasAction()`
- **Modelos**: SalesOrder, SalesOrderItem, OpenTab, ProductionOrder, DailyInventory
- **Lógica**: Análisis en tiempo real personalizado por rol — ventas, cocina, inventario, auditoría. Datos del día y tendencias.
- **Conexiones**: ← SalesOrder (ventas), ← ProductionOrder (producción), ← DailyInventory (conteos)
- **Estado**: Funcional
- **Roles con acceso**: Todos los roles (cada uno ve datos relevantes a su función)

### 5.3 Inventario Diario

- **Ruta**: `/dashboard/inventario/diario`
- **Página**: `src/app/dashboard/inventario/diario/page.tsx` — Server Component (carga áreas), Client Component interior
- **Actions**: `inventory-daily.actions.ts` → 14 funciones:
  - `getDailyInventoryAction(dateStr, areaId)` — carga/crea inventario del día
  - `saveDailyInventoryCountsAction(dailyId, items[])` — guarda conteos
  - `syncSalesFromOrdersAction(dailyId)` — sincroniza ventas POS al diario
  - `processManualSalesAction(dailyId, salesData[])` — ingreso manual de ventas
  - `processWhatsAppSalesForDailyAction(...)` — parser WhatsApp para ventas
  - `closeDailyInventoryAction(dailyId)` / `reopenDailyInventoryAction(dailyId)`
  - `getInventorySummaryByRangeAction(...)` / `getWeeklyInventorySummaryAction(...)`
  - `getDaysStatusAction(areaId, start, end)` — calendario de días abiertos/cerrados
  - `searchItemsForCriticalListAction(query, areaId)` — buscar items para lista crítica
  - `toggleItemCriticalStatusAction(itemId, isCritical, areaId)` — marcar/desmarcar crítico
  - `getCriticalProteinItemsAction(areaId)` — items proteína críticos
  - `getMenuItemsWithRecipesAction()` — para ingreso manual
- **Modelos**: DailyInventory, DailyInventoryItem, SalesOrder, Recipe, InventoryItem, AreaCriticalItem
- **Conexiones**: ← SalesOrder (sincroniza ventas del POS), ← Recipe (calcula consumo teórico), ← InventoryLocation (stock actual) → genera varianzas (teórico vs real)
- **Lógica clave**: Flujo diario: abrir → contar items → sincronizar ventas POS → calcular teórico → registrar varianza → cerrar
- **Estado**: Funcional

### 5.4 Inventario

- **Ruta**: `/dashboard/inventario`
- **Página**: `src/app/dashboard/inventario/page.tsx` — Server Component
- **Actions**: `inventory.actions.ts` → 6 funciones:
  - `createQuickItem(data)` — crear insumo rápido
  - `getInventoryListAction()` — listado completo con stock por área
  - `getAreasAction()` — áreas disponibles
  - `updateInventoryItemAction(id, data)` — editar insumo
  - `deleteInventoryItemAction(id)` — soft delete
  - `getInventoryHistoryAction(filters)` — historial de movimientos
- **Modelos**: InventoryItem, InventoryLocation, InventoryMovement, Area
- **Conexiones**: ← InventoryMovement (historial), ← InventoryLocation (stock actual por área)
- **Estado**: Funcional

### 5.5 Conteo Físico (Excel)

- **Ruta**: `/dashboard/inventario/conteo-semanal`
- **Página**: `src/app/dashboard/inventario/conteo-semanal/page.tsx` — Server Component
- **Actions**: `inventory-count.actions.ts` → 4 funciones:
  - `resolveDefaultCountAreasAction()` — áreas para conteo
  - `previewPhysicalCountFromExcelAction(formData)` — parsea Excel, muestra preview
  - `applyPhysicalCountAction(input)` — aplica ajustes de stock
  - `resetAllWarehouseStockAction(confirmPhrase)` — resetea stock (peligrosa, requiere confirmación)
- **Modelos**: InventoryLocation, InventoryMovement (ADJUSTMENT_IN/OUT)
- **Lógica**: Importar Excel con conteos → comparar vs sistema → generar InventoryMovement(ADJUSTMENT)
- **Estado**: Funcional

### 5.6 Auditorías

- **Ruta**: `/dashboard/inventario/auditorias` (lista) + `/dashboard/inventario/auditorias/[id]` (detalle)
- **Página**: Server Component (lista), Client interior (detalle)
- **Actions**: `audit.actions.ts` → 8 funciones:
  - `getAuditsAction()` / `getAuditAction(id)`
  - `createAuditAction(input)` — snapshot de stock actual del sistema
  - `updateAuditItemAction(input)` — actualizar conteo de un item
  - `approveAuditAction(input)` — genera InventoryMovement(ADJUSTMENT) por cada diferencia
  - `rejectAuditAction(id)` / `voidAuditAction(id)` / `deleteAuditAction(id)`
- **Modelos**: InventoryAudit, InventoryAuditItem, InventoryMovement, InventoryLocation
- **Conexiones**: → genera InventoryMovement(ADJUSTMENT_IN/OUT) al aprobar → actualiza InventoryLocation
- **Estado**: Funcional

### 5.7 Transferencias

- **Ruta**: `/dashboard/transferencias`
- **Página**: `src/app/dashboard/transferencias/page.tsx` — Server Component (importa de `entrada.actions` y `requisition.actions`)
- **Actions**: `requisition.actions.ts` → 10 funciones:
  - `getRequisitions(filter)` / `createRequisition(input)`
  - `dispatchRequisition(input)` — Jefe de Producción despacha
  - `approveRequisition(input)` — Gerente aprueba con cantidades recibidas
  - `receiveRequisition(input)` — verificación de recepción
  - `completeRequisition(id, completedById)` — cierra el flujo
  - `rejectRequisition(id, userId)`
  - `getCategoriesForTransferAction()` — categorías para filtrar
  - `previewBulkTransferAction(...)` / `executeBulkTransferAction(...)` — transferencia masiva
- **Modelos**: Requisition, RequisitionItem, InventoryMovement (TRANSFER), InventoryLocation
- **Lógica**: Flujo escalonado: Solicitud → Despacho → Aprobación → Recepción → Completar. Genera InventoryMovement(TRANSFER) y actualiza stock en áreas origen/destino.
- **Estado**: Funcional

### 5.8 Historial Mensual

- **Ruta**: `/dashboard/inventario/historial-mensual`
- **Página**: `src/app/dashboard/inventario/historial-mensual/page.tsx` — Client Component
- **Actions**: `movement-history.actions.ts` → 2 funciones:
  - `getMonthlyMovementsAction(filters)` — movimientos filtrados por mes/área/tipo/item
  - `getMovementTypesAction()` — lista de tipos de movimiento
- **Modelos**: InventoryMovement (lectura)
- **Estado**: Funcional

### 5.9 Préstamos

- **Ruta**: `/dashboard/prestamos` (lista) + `/dashboard/prestamos/nuevo` (crear)
- **Página**: Server Component (lista)
- **Actions**: `loan.actions.ts` → 4 funciones:
  - `getLoansAction()` — lista con filtros
  - `createLoanAction(input)` — genera InventoryMovement de salida
  - `resolveLoanAction(input)` — cierra préstamo (reposición o pago)
  - `getLoanableItemsAction()` — items con stock disponible
- **Modelos**: InventoryLoan, InventoryMovement, InventoryLocation
- **Conexiones**: → InventoryMovement (SALE/ADJUSTMENT al prestar, PURCHASE al reponer)
- **Estado**: Funcional

### 5.10 Mesoneros

- **Ruta**: `/dashboard/mesoneros`
- **Página**: `src/app/dashboard/mesoneros/page.tsx` — Client Component
- **Actions**: `waiter.actions.ts` → 6 funciones:
  - `getWaitersAction()` / `getActiveWaitersAction()`
  - `createWaiterAction(data)` / `updateWaiterAction(id, data)`
  - `toggleWaiterActiveAction(id, isActive)` / `deleteWaiterAction(id)`
- **Modelos**: Waiter, Branch
- **Conexiones**: → POS Restaurante (asignar mesonero a OpenTab vía `waiterLabel`)
- **Estado**: Funcional

### 5.11 Recetas

- **Ruta**: `/dashboard/recetas` (lista) + `/dashboard/recetas/[id]` (detalle) + `/dashboard/recetas/[id]/editar` + `/dashboard/recetas/nueva`
- **Página**: Server Component (lista y detalle)
- **Actions**: `recipe.actions.ts` → 6 funciones:
  - `getRecipesAction()` — lista con ingredientes, costo calculado
  - `getRecipeByIdAction(id)` — detalle completo
  - `getIngredientOptionsAction()` — items para ingredientes
  - `createRecipeAction(input)` / `updateRecipeAction(input)`
  - `updateRecipeCostAction(...)` — recalcula costo desde CostHistory
- **Modelos**: Recipe, RecipeIngredient, InventoryItem, MenuItem, CostHistory
- **Conexiones**: ← InventoryItem (ingredientes), → MenuItem (vía recipeId), ← CostHistory (cálculo de costo), → ProductionOrder (se produce la receta)
- **Lógica clave**: El costo de receta se calcula recursivamente: si un ingrediente es SUB_RECIPE, se busca su propia receta y su costo (cost.service.ts)
- **Estado**: Funcional

### 5.12 Producción

- **Ruta**: `/dashboard/produccion`
- **Página**: `src/app/dashboard/produccion/page.tsx` — Client Component
- **Actions**: `production.actions.ts` → 9 funciones:
  - `getProductionRecipesAction()` — recetas disponibles para producir
  - `calculateRequirementsAction(recipeId, qty, unit)` — verifica ingredientes disponibles
  - `quickProductionAction(...)` — producción rápida (descuenta ingredientes, suma output)
  - `manualProductionAction(...)` — producción manual sin receta formal
  - `getProductionHistoryAction(filters)` — historial
  - `getProductionAreasAction()` / `getProductionItemsAction()`
  - `updateProductionOrderAction(...)` / `deleteProductionOrderAction(...)`
- **Modelos**: ProductionOrder, Recipe, RecipeIngredient, InventoryMovement, InventoryLocation
- **Servicios**: `production.service.ts` — `createProductionOrder()`, `completeProduction()`, `calculateRequirements()`
- **Conexiones**: ← Recipe (qué producir), → InventoryMovement(PRODUCTION_OUT) por ingredientes, → InventoryMovement(PRODUCTION_IN) por output
- **Estado**: Funcional

### 5.13 Costos

- **Ruta**: `/dashboard/costos`
- **Página**: `src/app/dashboard/costos/page.tsx` — Server Component
- **Actions**: `cost.actions.ts` → 5 funciones:
  - `parseCostUploadAction(formData)` — parsea Excel de costos
  - `processCostImportAction(rows)` — importa costos desde Excel
  - `getCurrentCostsAction()` — último costo por item
  - `updateItemCostAction(itemId, cost, reason)` — actualiza costo manual
  - `getDishMarginsAction()` — margen por plato (usado en /costos/margen)
- **Modelos**: CostHistory, InventoryItem, Recipe, MenuItem
- **Servicios**: `cost.service.ts` — `calculateGrossQuantity()`, cálculo COGS recursivo
- **Conexiones**: ← PurchaseOrder (unitCost), ← Recipe (costo calculado), → MenuItem.cost (se puede actualizar)
- **Estado**: Funcional

### 5.14 Margen por Plato

- **Ruta**: `/dashboard/costos/margen`
- **Página**: `src/app/dashboard/costos/margen/page.tsx` — Server Component
- **Actions**: `cost.actions.ts` → `getDishMarginsAction()`
- **Modelos**: Recipe, MenuItem, CostHistory
- **Lógica**: Para cada MenuItem con receta: precio de venta - costo de receta = margen. Ordena por % margen.
- **Conexiones**: ← Recipe + CostHistory (costo), ← MenuItem (precio venta)
- **Estado**: Funcional

### 5.15 Compras

- **Ruta**: `/dashboard/compras`
- **Página**: `src/app/dashboard/compras/page.tsx` — Client Component
- **Actions**: `purchase.actions.ts` → 13 funciones:
  - `updateStockLevelsAction(items)` — actualiza minimumStock/reorderPoint
  - `getAllItemsWithStockConfigAction()` — items con config de stock
  - `getLowStockItemsAction()` — alertas de bajo stock
  - `getAllItemsForPurchaseAction()` — catálogo para crear OC
  - `createPurchaseOrderAction(data)` — nueva orden de compra
  - `getPurchaseOrdersAction(status?)` / `getPurchaseOrderByIdAction(id)`
  - `sendPurchaseOrderAction(id)` — cambiar estado a SENT
  - `receivePurchaseOrderItemsAction(...)` — recibir items, genera InventoryMovement(PURCHASE) + CostHistory
  - `cancelPurchaseOrderAction(id)`
  - `getSuppliersAction()` / `createSupplierAction(input)`
  - `getAreasForReceivingAction()` — áreas destino de mercancía
  - `createReorderBroadcastsAction()` — crea anuncios automáticos para items bajo stock
  - `exportPurchaseOrderTextAction(id)` — texto para WhatsApp
- **Modelos**: PurchaseOrder, PurchaseOrderItem, Supplier, SupplierItem, InventoryMovement, CostHistory, InventoryLocation, BroadcastMessage
- **Componentes**: `whatsapp-purchase-order-parser.tsx` — parser de OC desde WhatsApp
- **Conexiones**: → InventoryMovement(PURCHASE) al recibir, → CostHistory (actualiza precio), → InventoryLocation (suma stock), → AccountPayable (puede crear deuda), → BroadcastMessage (alertas reorder)
- **Estado**: Funcional

### 5.16 Proteínas

- **Ruta**: `/dashboard/proteinas`
- **Página**: `src/app/dashboard/proteinas/page.tsx` — Client Component
- **Actions**: `protein-processing.actions.ts` → 13 funciones:
  - `getProteinItemsAction()` / `getProcessingAreasAction()` / `getSuppliersAction()`
  - `createProteinProcessingAction(...)` — inicia procesamiento
  - `getProteinProcessingsAction(filters)` / `getProteinProcessingByIdAction(id)`
  - `completeProteinProcessingAction(...)` — finaliza: genera InventoryMovement de salida (source) y entrada (subproductos), calcula rendimiento/desperdicio
  - `cancelProteinProcessingAction(id)`
  - `getProteinProcessingStatsAction(startDate, endDate)` — estadísticas
  - `getProcessingTemplatesAction()` / `getTemplateBySourceItemAction(...)` / `getTemplateChainAction(...)`
  - `createProcessingTemplateAction(...)` / `deleteProcessingTemplateAction(...)`
  - `getCompletedProcessingsForChainAction()` — procesados para encadenar
- **Modelos**: ProteinProcessing, ProteinSubProduct, ProcessingTemplate, ProcessingTemplateOutput, InventoryMovement, InventoryLocation, Supplier
- **Lógica clave**: Procesamiento en cadena (LIMPIEZA → MASERADO → DISTRIBUCIÓN). Cada paso puede generar sub-productos que son input del siguiente paso. Calcula rendimiento (yieldPercentage) y desperdicio.
- **Estado**: Funcional

### 5.17 SKU Studio

- **Ruta**: `/dashboard/sku-studio`
- **Página**: `src/app/dashboard/sku-studio/page.tsx` — Server Component
- **Actions**: `sku-studio.actions.ts` → 6 funciones:
  - `getProductFamilies()` / `createProductFamily(data)`
  - `getSkuTemplates(familyId?)` / `createSkuTemplate(data)`
  - `createProductFromTemplate(...)` — crea InventoryItem + opcionalmente MenuItem desde plantilla
  - `createSkuItemAction(input)` — creación directa con chips de tipo/unidad/rol
- **Modelos**: ProductFamily, SkuCreationTemplate, InventoryItem, MenuItem
- **Conexiones**: → InventoryItem (crea), → MenuItem (opcionalmente crea)
- **Estado**: Funcional

### 5.18 Asistente de Nomenclatura

- **Ruta**: `/dashboard/asistente`
- **Página**: `src/app/dashboard/asistente/page.tsx` — Client Component
- **Actions**: `asistente.actions.ts` → 4 funciones:
  - `createRawMaterialAction(data)` — crear insumo con nombres estandarizados
  - `suggestSkuAction(prefix)` — sugerir SKU basado en prefijo
  - `getMenuRecipeStatusAction()` — qué items del menú tienen/faltan receta
  - `getRawMaterialsListAction()` — lista de materias primas
- **Modelos**: InventoryItem, Recipe, MenuItem
- **Conexiones**: → InventoryItem (crea), ← MenuItem + Recipe (diagnóstico de vinculación)
- **Estado**: Funcional

### 5.19 Menú

- **Ruta**: `/dashboard/menu`
- **Página**: `src/app/dashboard/menu/page.tsx` — Client Component
- **Actions**: `menu.actions.ts` → 9 funciones:
  - `getFullMenuAction()` — menú completo con categorías, modificadores
  - `getCategoriesAction()` — categorías activas
  - `createMenuItemAction(data)` — nuevo producto
  - `updateMenuItemPriceAction(id, price)` / `updateMenuItemNameAction(id, name)`
  - `toggleMenuItemStatusAction(id, isActive)`
  - `getMenuItemsWithoutRecipeAction()` — productos sin receta vinculada
  - `linkMenuItemToRecipeAction(menuItemId, recipeId)` — vincular receta existente
  - `createRecipeStubForMenuItemAction(menuItemId)` — crear receta vacía y vincular
  - `ensureBasicCategoriesAction()` — seed de categorías básicas
- **Modelos**: MenuItem, MenuCategory, Recipe
- **Conexiones**: ← Recipe (vía recipeId — para descargo automático), → SalesOrderItem (se vende en POS), ← MenuModifierGroup (modificadores aplicables)
- **Estado**: Funcional

### 5.20 Modificadores

- **Ruta**: `/dashboard/menu/modificadores`
- **Página**: `src/app/dashboard/menu/modificadores/page.tsx` — Server Component
- **Actions**: `modifier.actions.ts` → 11 funciones:
  - `getModifierGroupsWithItemsAction()` — grupos con sus modificadores y menú items vinculados
  - `createModifierGroupAction(data)` / `updateModifierGroupAction(id, data)` / `deleteModifierGroupAction(id)`
  - `addModifierAction(data)` / `updateModifierNamePriceAction(id, name, price)` / `deleteModifierAction(id)`
  - `toggleModifierAvailabilityAction(id, isAvailable)`
  - `linkGroupToMenuItemAction(groupId, menuItemId)` / `unlinkGroupFromMenuItemAction(groupId, menuItemId)`
  - `linkModifierToMenuItemAction(modifierId, menuItemId)` — vincula modificador a MenuItem para descargo de inventario
  - `getMenuItemsForModifierLinkAction()` — lista de MenuItems para vincular
- **Modelos**: MenuModifierGroup, MenuModifier, MenuItemModifierGroup, MenuItem
- **Lógica clave**: Un modificador puede tener `linkedMenuItemId` — cuando el cliente elige ese modificador, se descarga la receta del plato vinculado (ej: elegir "Tabulé" como acompañante descuenta ingredientes del tabulé)
- **Estado**: Funcional

### Conexiones Críticas entre Módulos de Operaciones

```
Receta ──── se vincula a ──→ MenuItem ──→ POS la usa para descargar inventario
  ↓
Producción ──→ InventoryMovement(PRODUCTION_IN/OUT) ──→ actualiza stock
  
Compras ──→ InventoryMovement(PURCHASE) ──→ actualiza stock + CostHistory
  
Auditorías ──→ InventoryMovement(ADJUSTMENT) ──→ corrige stock
  
Transferencias ──→ InventoryMovement(TRANSFER) ──→ mueve stock entre áreas
  
Inv. Diario ←── sincroniza ventas POS ──→ calcula consumo teórico vs real
  
Costos/Margen ←── CostHistory ←── Compras (unitCost) + Recetas (costo calculado)
  
Proteínas ──→ InventoryMovement (salida source, entrada subproductos) ──→ stock
```

---

## 6. Módulos de VENTAS / POS (9 módulos)

### 6.1 POS Restaurante

- **Ruta**: `/dashboard/pos/restaurante`
- **Página**: `src/app/dashboard/pos/restaurante/page.tsx` — **2581 líneas**, Client Component (el archivo más grande del sistema)
- **Actions**: `pos.actions.ts` (1470 líneas) → funciones usadas:
  - `getMenuForPOSAction()` — carga menú completo para POS
  - `validateManagerPinAction(pin)` — autoriza descuentos/cortesías
  - `validateCashierPinAction(pin)` — autoriza cambio de cajera
  - `createSalesOrderAction(data)` — crea orden con descargo de inventario
  - `recordCollectiveTipAction(data)` — propina colectiva a mesoneros
  - `openTabAction(data)` — abre mesa/tab
  - `addItemsToOpenTabAction(data)` — agrega items a tab abierto (envía a cocina)
  - `registerOpenTabPaymentAction(data)` — registra pago parcial/total en tab
  - `closeOpenTabAction(tabId)` — cierra tab
  - `removeItemFromOpenTabAction(data)` — elimina item de tab
  - `getRestaurantLayoutAction()` — zonas y mesas del restaurante
  - `getUsersForTabAction()` — usuarios asignables a tabs
- **Actions adicionales**: `exchange.actions.ts` → `getExchangeRateValue()`
- **Modelos escritos**: SalesOrder, SalesOrderItem, SalesOrderItemModifier, SalesOrderPayment, OpenTab, OpenTabOrder, PaymentSplit, InvoiceCounter
- **Modelos leídos**: MenuItem, MenuCategory, MenuModifier, ExchangeRate, ServiceZone, TableOrStation, Waiter
- **Componentes**: `MixedPaymentSelector`, `PrintTicket`, `PriceDisplay`, `CashierShiftModal`, `BillDenominationInput`, `CurrencyCalculator`
- **Lógica clave**:
  - Dos flujos: **Venta Directa** (delivery-style, cobro inmediato) y **Mesa/Tab** (abrir → agregar items → enviar cocina → cobrar → cerrar)
  - Service charge 10% toggle por venta (estado local `serviceFeeIncluded`)
  - Descuentos: DIVISAS_33, CORTESIA_100, CORTESIA_PERCENT (requiere PIN gerente)
  - Pago único (7 métodos) o mixto (MixedPaymentSelector)
  - PaymentSplit: dividir cuenta por persona en mesa
  - Descargo automático de inventario vía `inventory.service.registerSale()`
- **Estado**: Funcional
- **Valores hardcodeados** (detallados en Sección 11)

### 6.2 POS Mesero

- **Ruta**: `/dashboard/pos/mesero`
- **Página**: `src/app/dashboard/pos/mesero/page.tsx` — Client Component
- **Actions**: `pos.actions.ts` (subset: solo apertura de tab y agregar items, sin cobro)
- **Modelos**: OpenTab, SalesOrder, SalesOrderItem, MenuItem
- **Lógica**: Vista simplificada del POS Restaurante. Mesonero toma pedido por mesa, agrega items, envía a cocina. **No tiene acceso a cobro ni cierre de mesa.**
- **Conexiones**: → OpenTab (abre/agrega items) → SalesOrder (crea con kitchenStatus: SENT)
- **Estado**: Funcional
- **enabledByDefault**: false (debe habilitarse manualmente)

### 6.3 POS Delivery

- **Ruta**: `/dashboard/pos/delivery`
- **Página**: `src/app/dashboard/pos/delivery/page.tsx` — **898 líneas**, Client Component
- **Actions**: `pos.actions.ts` → `createSalesOrderAction()`, `getMenuForPOSAction()`, `validateManagerPinAction()`; `exchange.actions.ts` → `getExchangeRateValue()`
- **Modelos escritos**: SalesOrder, SalesOrderItem, SalesOrderPayment, InvoiceCounter
- **Lógica clave**:
  - Solo venta directa (sin tabs/mesas)
  - Delivery fee automático: $4.50 normal / $3.00 divisas (**hardcodeado**)
  - Mismos descuentos: DIVISAS_33, CORTESIA_100, CORTESIA_PERCENT
  - Impresión de comanda + factura configurable por POSConfig (localStorage)
- **Valores hardcodeados**:
  ```typescript
  // src/app/dashboard/pos/delivery/page.tsx:15-16
  const DELIVERY_FEE_NORMAL = 4.5;
  const DELIVERY_FEE_DIVISAS = 3;
  ```
- **Estado**: Funcional

### 6.4 PedidosYA

- **Ruta**: `/dashboard/pos/pedidosya`
- **Página**: `src/app/dashboard/pos/pedidosya/page.tsx` — Client Component
- **Actions**: `pedidosya.actions.ts` → `createPedidosYAOrderAction(data)`; `pos.actions.ts` → `getMenuForPOSAction()`
- **Modelos**: SalesOrder, SalesOrderItem
- **Lógica**: Carga órdenes de PedidosYA. Usa precios `pedidosYaPrice` del MenuItem si existen, sino precio normal. Canal: `PEDIDOS_YA`. No maneja pagos (PedidosYA cobra directamente).
- **Lib**: `src/lib/pedidosya-price.ts` — lógica de precio PedidosYA
- **Estado**: Funcional
- **enabledByDefault**: false

### 6.5 Cargar Ventas

- **Ruta**: `/dashboard/ventas/cargar`
- **Página**: `src/app/dashboard/ventas/cargar/page.tsx` — Client Component
- **Actions**: `sales-entry.actions.ts` → 7 funciones:
  - `getMenuItemsForSalesAction()` / `getMenuCategoriesAction()`
  - `createSalesEntryAction(data)` — crea SalesOrder manual (sourceChannel configurable)
  - `getTodaySalesAction()` — ventas del día
  - `getSalesAreasAction()` — áreas disponibles
  - `voidSalesOrderAction(params)` — anular venta
  - `getSalesSummaryAction(startDate, endDate)` — resumen
- **Modelos**: SalesOrder, SalesOrderItem, MenuItem, MenuCategory, Area
- **Lógica**: Carga manual de ventas externas (plataformas, eventos). Permite crear órdenes sin pasar por el POS. Útil para registrar ventas de canales que no usan el sistema directamente.
- **Estado**: Funcional

### 6.6 Historial Ventas

- **Ruta**: `/dashboard/sales`
- **Página**: `src/app/dashboard/sales/page.tsx` — Client Component
- **Actions**: `sales.actions.ts` (810 líneas) → 5 funciones:
  - `getSalesHistoryAction(date?)` — listado de ventas por fecha
  - `getSalesForArqueoAction(date)` — datos para arqueo de caja
  - `getDailyZReportAction(date?)` — Reporte Z completo del día
  - `voidSalesOrderAction(params)` — anulación con PIN y razón
  - `getEndOfDaySummaryAction(date?)` — resumen de cierre del día
- **Actions adicionales**: `pos.actions.ts` → `validateCashierPinAction(pin)`
- **Modelos**: SalesOrder, SalesOrderItem, SalesOrderPayment, PaymentSplit, OpenTab
- **Lógica clave**:
  - **Reporte Z**: Agrupa ventas por método de pago, calcula totales Bs/USD, service charge (detectado por splitLabel `+10% serv`), descuentos, anulaciones
  - **Arqueo**: Exporta a Excel vía `export-arqueo-excel.ts`
  - **Anulación**: Requiere PIN de cajera, razón obligatoria, marca `voidedAt/voidedById/voidReason`
- **Libs**: `export-z-report.ts`, `export-arqueo-excel.ts`, `arqueo-excel-utils.ts`
- **Estado**: Funcional
- **Gap**: Service charge se detecta por string matching (`splitLabel.includes('| +10% serv')`) — frágil

### 6.7 Comandera Cocina

- **Ruta**: `/kitchen`
- **Página**: `src/app/kitchen/page.tsx` — Client Component (fuera de `/dashboard`, sin sidebar)
- **API**: `src/app/api/kitchen/orders/route.ts` → GET (órdenes pendientes) + PATCH (actualizar estado)
- **Modelos**: SalesOrder (filtrado por `kitchenStatus: 'SENT'`), SalesOrderItem, MenuItem, MenuCategory
- **Lógica**:
  - Polling constante al API route (no Server Actions — necesita refresh sin navegación)
  - Filtra items: excluye categoría "Bebidas" (constante `BAR_CATEGORIES = ['Bebidas']`)
  - PATCH actualiza `kitchenStatus` de la orden
  - Impresión de comanda vía `printKitchenCommand()` (`src/lib/print-command.ts`)
- **Conexiones**: ← SalesOrder (órdenes con kitchenStatus SENT), → SalesOrder (marca como READY)
- **Estado**: Funcional
- **Gap**: `BAR_CATEGORIES` hardcodeado — debería ser configurable

### 6.8 Comandera Barra

- **Ruta**: `/kitchen/barra`
- **Página**: `src/app/kitchen/barra/page.tsx` — Client Component
- **API**: Mismo `src/app/api/kitchen/orders/route.ts` con `?station=bar`
- **Lógica**: Idéntica a Comandera Cocina pero filtro invertido: **solo** categoría "Bebidas"
- **Estado**: Funcional

### 6.9 Configuración POS

- **Ruta**: `/dashboard/config/pos`
- **Página**: `src/app/dashboard/config/pos/page.tsx` — Server Component (lee SystemConfig)
- **Actions**: `system-config.actions.ts` → `getStockValidationEnabled()`, `setStockValidationEnabled()`
- **Lib**: `src/lib/pos-settings.ts` — POSConfig en localStorage (por terminal/estación):
  ```typescript
  interface POSConfig {
    printComandaOnDelivery: boolean;      // default: false
    printReceiptOnDelivery: boolean;      // default: true
    printComandaOnRestaurant: boolean;    // default: true
    printReceiptOnRestaurant: boolean;    // default: true
    stockValidationEnabled: boolean;      // default: false
  }
  ```
- **Lógica**: Configuración híbrida — `stockValidationEnabled` se lee de BD (SystemConfig) + localStorage. El resto es solo localStorage. Cada terminal puede tener configuración distinta.
- **Estado**: Funcional
- **Gap**: Mezcla de BD y localStorage dificulta administración centralizada

### Flujo POS Completo End-to-End

```
1. Cajera abre POS
   ├── getMenuForPOSAction() → carga menú completo (categorías, items, modificadores, precios)
   └── getExchangeRateValue() → tasa del día para conversión Bs

2. Selecciona items → arma carrito (CartItem[])
   └── Cada CartItem: { menuItemId, name, price, quantity, modifiers[], notes? }

3A. RESTAURANTE (mesa):
   ├── openTabAction() → crea OpenTab + asigna zona/mesa/mesonero
   ├── addItemsToOpenTabAction() → crea SalesOrder con kitchenStatus: SENT
   │   └── Cocina: /kitchen ve la orden → marca como READY
   ├── registerOpenTabPaymentAction() → pago parcial/total → PaymentSplit
   │   ├── Pago único → 1 SalesOrderPayment
   │   └── Pago mixto → N SalesOrderPayment (MixedPaymentSelector)
   └── closeOpenTabAction() → cierra tab, actualiza totales

3B. DELIVERY (directo):
   └── createSalesOrderAction() → crea SalesOrder + items + pagos + descargo inventario
       ├── Calcula delivery fee ($4.50 normal / $3.00 divisas)
       ├── Aplica descuento si aplica (DIVISAS_33 / CORTESIA)
       ├── Registra SalesOrderPayment[]
       ├── registerSale() → descuenta ingredientes por receta de cada item
       └── getNextCorrelativo('DELIVERY') → número único DEL-0042

4. Descargo automático de inventario (inventory.service.ts)
   ├── Para cada SalesOrderItem con MenuItem que tiene recipeId:
   │   ├── Busca Recipe → RecipeIngredient[]
   │   └── Crea InventoryMovement(SALE) por cada ingrediente
   └── Actualiza InventoryLocation.currentStock

5. Post-venta
   ├── Historial: /dashboard/sales → getSalesHistoryAction()
   ├── Reporte Z: getDailyZReportAction() → agrupa por método de pago
   ├── Arqueo: getSalesForArqueoAction() → exporta Excel
   └── Anulación: voidSalesOrderAction() → marca voidedAt, requiere PIN
```

### Valores Hardcodeados en POS (candidatos a Panel Admin)

| Valor | Archivo | Línea | Descripción |
|-------|---------|-------|-------------|
| `DELIVERY_FEE_NORMAL = 4.5` | `pos.actions.ts` | 263 | Tarifa delivery pago Bs |
| `DELIVERY_FEE_DIVISAS = 3` | `pos.actions.ts` | 264 | Tarifa delivery pago divisas |
| `DELIVERY_FEE_NORMAL = 4.5` | `delivery/page.tsx` | 15 | Duplicado en frontend |
| `DELIVERY_FEE_DIVISAS = 3` | `delivery/page.tsx` | 16 | Duplicado en frontend |
| `* 0.1` (10% servicio) | `restaurante/page.tsx` | 696, 769 | Service charge restaurante |
| `* 1.1` (total + 10%) | `restaurante/page.tsx` | 430 | Monto con servicio incluido |
| `DIVISAS_33` (1/3 descuento) | `pos.actions.ts` | 276-280 | Descuento divisas fijo |
| `CORTESIA_100` | `pos.actions.ts` | 285-286 | Cortesía 100% |
| `CORTESIA_PERCENT` | `pos.actions.ts` | 290-292 | Cortesía porcentaje variable |
| `'| +10% serv'` | `sales.actions.ts` | 120,264,428,737 | Detección service charge por string |
| `BAR_CATEGORIES = ['Bebidas']` | `api/kitchen/orders/route.ts` | 7 | Categorías que van a barra |

### Métodos de Pago Hardcodeados (3 archivos)

**`MixedPaymentSelector.tsx:23-31`**:
```typescript
const METHODS = [
  { id: 'CASH_USD',       label: '💵 Cash $' },
  { id: 'CASH_EUR',       label: '€ Cash €' },
  { id: 'ZELLE',          label: '⚡ Zelle' },
  { id: 'CASH_BS',        label: '💴 Efectivo Bs' },
  { id: 'PDV_SHANKLISH',  label: '💳 PDV Shanklish' },
  { id: 'PDV_SUPERFERRO', label: '💳 PDV Superferro' },
  { id: 'MOVIL_NG',       label: '📱 Pago Móvil NG' },
  { id: 'CORTESIA',       label: '🎁 Cortesía' },
];
const BS_METHODS = new Set(['CASH_BS','PDV_SHANKLISH','PDV_SUPERFERRO','MOVIL_NG','MOBILE_PAY','CARD','TRANSFER']);
```

**`restaurante/page.tsx:147-149`**:
```typescript
const BS_SINGLE_METHODS = new Set(["PDV_SHANKLISH","PDV_SUPERFERRO","MOVIL_NG","CASH_BS"]);
const SINGLE_PAY_METHODS = ["CASH_USD","CASH_EUR","ZELLE","PDV_SHANKLISH","PDV_SUPERFERRO","MOVIL_NG","CASH_BS"];
```

**`delivery/page.tsx:226`**: Idéntico `BS_SINGLE_METHODS` inline.

---

## 7. Módulos de ADMINISTRACIÓN (14 módulos)

### 7.1 Usuarios

- **Ruta**: `/dashboard/usuarios`
- **Página**: Server Component — importa `getUsers()` + `getEnabledModulesFromDB()`
- **Actions**: `user.actions.ts` → 5 funciones:
  - `getUsers()` — lista con roles y allowedModules
  - `updateUserRole(userId, newRole)` — cambia rol (jerarquía: solo superiores)
  - `toggleUserStatus(userId, isActive)` — activar/desactivar
  - `changePasswordAction(currentPassword, newPassword)` — cambio propio
  - `updateUserModules(userId, allowedModules)` — asigna módulos individuales
- **Modelos**: User
- **Componentes**: `ChangePasswordDialog`
- **Middleware**: Ruta protegida — solo OWNER, ADMIN_MANAGER
- **Estado**: Funcional

### 7.2 Módulos por Usuario

- **Ruta**: `/dashboard/config/modulos-usuario`
- **Página**: Server Component — importa `getUsers()` + `getEnabledModulesFromDB()`
- **Actions**: `user.actions.ts` → `updateUserModules(userId, allowedModules | null)`
- **Modelos**: User (campo `allowedModules` JSON array)
- **Lógica**: Seleccionar usuario → ver/editar checkboxes de módulos permitidos. `null` = acceso por rol completo, array = solo esos módulos.
- **Estado**: Funcional

### 7.3 Roles y Permisos

- **Ruta**: `/dashboard/config/roles`
- **Página**: Server Component — importa `getUsers()`
- **Actions**: `user.actions.ts` → `updateUserRole(userId, newRole)`
- **Lógica**: Vista de usuarios agrupados por rol. Permite reasignar roles respetando jerarquía (`canManageRole()`).
- **Estado**: Funcional

### 7.4 Módulos (toggle por instalación)

- **Ruta**: `/dashboard/config/modules`
- **Página**: Server Component — importa `getEnabledModulesFromDB()`
- **Actions**: `system-config.actions.ts` → 4 funciones:
  - `getEnabledModulesFromDB()` — lee `SystemConfig['enabled_modules']`
  - `saveEnabledModules(moduleIds[])` — guarda módulos activos
  - `getStockValidationEnabled()` / `setStockValidationEnabled(enabled)`
- **Modelos**: SystemConfig
- **Lógica**: OWNER activa/desactiva módulos para toda la instalación. Lee `MODULE_REGISTRY` como catálogo, guarda selección en BD.
- **Acceso**: Solo OWNER
- **Estado**: Funcional

### 7.5 Almacenes

- **Ruta**: `/dashboard/almacenes`
- **Página**: Server Component — importa `getAreasAction()`
- **Actions**: `areas.actions.ts` → 4 funciones:
  - `getAreasAction()` — lista de áreas con branchId
  - `createAreaAction(data)` — crear área nueva
  - `toggleAreaStatusAction(id, isActive)` — activar/desactivar
  - `findDuplicateAreasAction()` — detecta nombres duplicados
- **Modelos**: Area, Branch
- **Estado**: Funcional

### 7.6 Tasa de Cambio

- **Ruta**: `/dashboard/config/tasa-cambio`
- **Página**: Server Component — importa `getExchangeRateHistory()`
- **Actions**: `exchange.actions.ts` → 5 funciones:
  - `getCurrentExchangeRate()` — última tasa activa
  - `getExchangeRateForDisplay()` — formateada para UI
  - `getExchangeRateValue()` — solo número (usado por POS)
  - `setExchangeRateAction(rate, effectiveDate)` — registra nueva tasa
  - `getExchangeRateHistory(limit)` — historial
- **Modelos**: ExchangeRate
- **Conexiones**: → POS (conversión Bs/USD en pagos), → SalesOrder.exchangeRateValue (snapshot)
- **Estado**: Funcional

### 7.7 Anuncios a Gerencia

- **Ruta**: `/dashboard/anuncios`
- **Página**: Server Component — importa `getAllBroadcastsAdminAction()`
- **Actions**: `notifications.actions.ts` → 4 funciones:
  - `getNotificationsAction()` — anuncios activos para el usuario (filtro por rol + fecha)
  - `createBroadcastAction(input)` — crea anuncio con targetRoles, fecha inicio/expiración
  - `getAllBroadcastsAdminAction()` — todos los anuncios (admin view)
  - `dismissBroadcastAction(id)` — marcar como leído (localStorage)
- **Modelos**: BroadcastMessage
- **Componentes**: `NotificationBell` en Navbar — muestra campana con contador de no leídos
- **Lógica**: Los anuncios se filtran por: `isActive`, `targetRoles` incluye rol del usuario, `startsAt <= now`, `expiresAt > now || null`
- **Estado**: Funcional

### 7.8 Objetivos y Metas

- **Ruta**: `/dashboard/metas`
- **Página**: Server Component — importa `getMetasAction()`
- **Actions**: `metas.actions.ts` → 2 funciones:
  - `getMetasAction()` — lee metas actuales + progreso vs ventas reales
  - `saveMetasAction(input)` — guarda targets en SystemConfig (keys: `meta_diaria`, `meta_semanal`, `meta_mensual`, `merma_aceptable_pct`)
- **Modelos**: SystemConfig (lectura/escritura), SalesOrder (lectura para progreso)
- **Lógica**: Fijar metas de venta (diaria, semanal, mensual) y % de merma aceptable. Muestra progreso en tiempo real comparando ventas actuales vs targets.
- **Conexiones**: ← SalesOrder (ventas actuales) vs SystemConfig (targets)
- **Estado**: Funcional

### 7.9 Dashboard Financiero

- **Ruta**: `/dashboard/finanzas`
- **Página**: Server Component — importa `getFinancialSummaryAction()` + `getMonthlyTrendAction()`
- **Actions**: `finance.actions.ts` → 2 funciones:
  - `getFinancialSummaryAction(month?, year?)` — P&L mensual: ingresos (ventas), COGS (compras recibidas), gastos operativos, cuentas por pagar, utilidad neta
  - `getMonthlyTrendAction(months)` — tendencia de últimos N meses
- **Modelos**: SalesOrder (ingresos), PurchaseOrder (COGS), Expense (gastos), AccountPayable (deudas)
- **Conexiones**: ← SalesOrder.total (ingresos), ← PurchaseOrder.totalAmount con status RECEIVED (COGS), ← Expense.amountUsd (gastos), ← AccountPayable.remainingUsd (deudas pendientes)
- **Estado**: Funcional

### 7.10 Gastos

- **Ruta**: `/dashboard/gastos`
- **Página**: Server Component — importa `getExpensesAction()` + `getExpenseCategoriesAction()`
- **Actions**: `expense.actions.ts` → 6 funciones:
  - `getExpenseCategoriesAction()` / `createExpenseCategoryAction(input)` / `updateExpenseCategoryAction(id, data)`
  - `getExpensesAction(filters)` — filtro por categoría, fecha, status
  - `createExpenseAction(input)` — registro con categoría, monto USD/Bs, método de pago, período
  - `voidExpenseAction(id, reason)` — anula gasto
- **Modelos**: Expense, ExpenseCategory
- **Conexiones**: → Finanzas (P&L como gasto operativo), → Caja (gastos del turno)
- **Estado**: Funcional

### 7.11 Control de Caja

- **Ruta**: `/dashboard/caja`
- **Página**: Server Component — importa `getCashRegistersAction()`
- **Actions**: `cash-register.actions.ts` → 4 funciones:
  - `getCashRegistersAction(filters)` — lista de cajas por fecha/status
  - `openCashRegisterAction(input)` — apertura con fondo inicial USD/Bs + desglose billetes
  - `closeCashRegisterAction(input)` — cierre: conteo final, calcula diferencia vs esperado
  - `updateRegisterOperatorsAction(id, operators[])` — asigna operadoras al turno
- **Modelos**: CashRegister
- **Componentes**: `BillDenominationInput` — entrada de billetes por denominación
- **Conexiones**: ← SalesOrder (ventas del turno para calcular esperado), ← Expense (gastos del turno)
- **Lógica**: Apertura → ventas del día → cierre con conteo → `expectedCash = apertura + ventas_efectivo - gastos` → `difference = cierre_contado - esperado`
- **Estado**: Funcional

### 7.12 Cuentas por Pagar

- **Ruta**: `/dashboard/cuentas-pagar`
- **Página**: Server Component — importa `getAccountsPayableAction()` + `getSuppliersAction()`
- **Actions**: `account-payable.actions.ts` → 3 funciones:
  - `getAccountsPayableAction(filters)` — filtro por status, proveedor, fecha
  - `createAccountPayableAction(input)` — nueva deuda (manual o desde PurchaseOrder)
  - `registerPaymentAction(input)` — pago parcial/total → actualiza `paidAmountUsd`, `remainingUsd`, `status`
- **Modelos**: AccountPayable, AccountPayment, Supplier, PurchaseOrder
- **Conexiones**: ← PurchaseOrder (puede crear deuda al recibir), ← Supplier (acreedor), → Finanzas (deudas pendientes en P&L)
- **Estado**: Funcional

### 7.13 Intercompany

- **Ruta**: `/dashboard/intercompany`
- **Página**: Server Component — importa `getSettlements()`
- **Actions**: `intercompany.actions.ts` → 4 funciones:
  - `getSettlements(filters)` — lista por status, período
  - `getSettlementById(id)` — detalle con líneas
  - `createSettlement(data)` — nueva liquidación entre negocios
  - `approveSettlement(id)` — aprobación
- **Modelos**: IntercompanySettlement, IntercompanySettlementLine, IntercompanyItemMapping
- **Lógica**: Liquidación periódica entre Shanklish y Table Pong. Registra items vendidos por un negocio que pertenecen al otro (ej: comida de Shanklish vendida en Table Pong).
- **enabledByDefault**: false
- **Estado**: Funcional

### 7.14 Entrada de Mercancía

- **Ruta**: `/dashboard/inventario/entrada`
- **Página**: Server Component — importa de `entrada.actions.ts`
- **Actions**: `entrada.actions.ts` → 4 funciones:
  - `registrarEntradaMercancia(data)` — registra entrada vía `inventory.service.registerPurchase()` → genera InventoryMovement(PURCHASE) + CostHistory
  - `getInventoryItemsForSelect()` — items disponibles
  - `getAreasForSelect()` — áreas destino
  - `getRecentMovements(limit)` — últimas entradas
- **Modelos**: InventoryMovement, InventoryLocation, CostHistory, InventoryItem, Area
- **Servicios**: `inventory.service.ts` → `registerPurchase()`
- **Conexiones**: → InventoryMovement(PURCHASE) → InventoryLocation (suma stock) → CostHistory (actualiza precio)
- **Nota**: Este módulo está registrado como sub-ruta de `inventory` en el registry, no como módulo independiente
- **Estado**: Funcional

### Conexiones Críticas entre Módulos de Administración

```
Finanzas ← SalesOrder (ingresos) + PurchaseOrder (COGS) + Expense (gastos) + AccountPayable (deudas)
   ↓
P&L = Ingresos - COGS - Gastos Operativos

Caja ← SalesOrder (ventas del turno) + Expense (gastos del turno)
   ↓
Cuadre = Apertura + Ventas_Efectivo - Gastos - Cierre_Contado

Metas ← SalesOrder (ventas actuales) vs SystemConfig (targets guardados)

Cuentas por Pagar ← PurchaseOrder (deuda al recibir) → pagos parciales → AccountPayment

Intercompany: Shanklish ←→ Table Pong (items vendidos entre negocios)
```

---

## 8. Módulos de ENTRETENIMIENTO — Table Pong (4 módulos)

Todos estos módulos están **deshabilitados por default** (`enabledByDefault: false`). Se activan solo en la instancia Table Pong.

### 8.1 Juegos

- **Ruta**: `/dashboard/games`
- **Página**: Server Component — importa `getGameStations()`, `getActiveSessions()`, `getGamesDashboardStats()`
- **Actions**: `games.actions.ts` → 16+ funciones organizadas en bloques:
  - **GameType CRUD**: `getGameTypes()`, `createGameType(data)`, `updateGameType(id, data)`
  - **GameStation CRUD**: `getGameStations(filters)`, `createGameStation(data)`, `updateStationStatus(id, status)`
  - **Sesiones**: `getActiveSessions()`, `getSessionHistory(filters)`, `startSession(data)`, `endSession(id, notes?)`, `pauseSession(id)`, `resumeSession(id)`
  - **Stats**: `getGamesDashboardStats()` — resumen del día
- **Modelos**: GameType, GameStation, GameSession, SalesOrder
- **Lógica**: Dashboard de juegos con estaciones activas, sesiones en curso, facturación por hora o pulsera. `endSession()` calcula tiempo + monto y opcionalmente crea SalesOrder.
- **Conexiones**: → SalesOrder (facturación de sesión) → InvoiceCounter (correlativo GSN-xxxx)
- **Estado**: Funcional

### 8.2 Reservaciones

- **Ruta**: `/dashboard/reservations`
- **Página**: Server Component
- **Actions**: `games.actions.ts` (mismo archivo) → funciones de reservas implícitas
- **Modelos**: Reservation, GameStation, WristbandPlan
- **Lógica**: Reservar estación para cliente con fecha/hora, opcionalmente vincular plan de pulsera. Estados: PENDING → CONFIRMED → CHECKED_IN / NO_SHOW / CANCELLED.
- **Estado**: Funcional

### 8.3 Pulseras

- **Ruta**: `/dashboard/wristbands`
- **Página**: Server Component
- **Actions**: `games.actions.ts` → `getWristbandPlans()`, `createWristbandPlan(data)`, `updateWristbandPlan(id, data)`
- **Modelos**: WristbandPlan
- **Lógica**: CRUD de planes de pulsera con duración, precio, color, máximo de sesiones simultáneas. Se vinculan a Reservations y GameSessions.
- **Estado**: Funcional

### 8.4 Cola de Espera

- **Ruta**: `/dashboard/queue`
- **Página**: Server Component
- **Actions**: `games.actions.ts` → funciones de cola (QueueTicket)
- **Modelos**: QueueTicket, GameStation
- **Lógica**: Gestión de turnos. Ticket con número correlativo (reset diario), estado WAITING → CALLED → SEATED / EXPIRED / CANCELLED. Estimación de tiempo de espera.
- **Estado**: Funcional

---

## 9. API Routes y Servicios

### 9.1 API Routes (4 rutas)

| Método | Ruta | Archivo | Propósito |
|--------|------|---------|-----------|
| GET | `/api/kitchen/orders?station=kitchen\|bar` | `src/app/api/kitchen/orders/route.ts` | Órdenes pendientes para comandera (filtra por categoría food/beverage) |
| PATCH | `/api/kitchen/orders` | (mismo archivo) | Actualizar kitchenStatus de una orden |
| GET | `/api/arqueo?date=YYYY-MM-DD` | `src/app/api/arqueo/route.ts` | Datos de arqueo para exportar |
| GET | `/api/auth/session` | `src/app/api/auth/session/route.ts` | Verificar sesión activa (devuelve payload JWT) |
| POST | `/api/upload` | `src/app/api/upload/route.ts` | Upload de archivos (comprobantes, imágenes OCR) |

**Nota**: Las API routes se usan solo donde Server Actions no son prácticas (polling de cocina, verificación de sesión client-side). Todo lo demás usa Server Actions.

### 9.2 Server Services (3 servicios)

| Servicio | Archivo | Funciones principales |
|----------|---------|----------------------|
| **Inventory** | `src/server/services/inventory.service.ts` | `registerPurchase(input)` — entrada de mercancía + actualiza stock + CostHistory |
| | | `registerSale(input)` — descuento por venta (receta → ingredientes) |
| | | `registerAdjustment(...)` — ajuste de inventario |
| **Production** | `src/server/services/production.service.ts` | `createProductionOrder(input)` — crear orden |
| | | `completeProduction(input)` — finalizar (resta ingredientes, suma output) |
| | | `calculateRequirements(recipeId, qty)` — verifica disponibilidad |
| **Cost** | `src/server/services/cost.service.ts` | `calculateGrossQuantity(net, waste%)` — cantidad bruta con merma |
| | | Cálculo recursivo de COGS para recetas con sub-recetas |

### 9.3 Lib Utilities (20 archivos)

| Archivo | Propósito |
|---------|-----------|
| `auth.ts` | JWT encrypt/decrypt, session CRUD |
| `prisma.ts` | Singleton PrismaClient |
| `permissions.ts` | `hasPermission()` por nivel numérico |
| `audit-log.ts` | `writeAuditLog()` — registro forense inmutable |
| `invoice-counter.ts` | `getNextCorrelativo(channel)` — correlativos atómicos |
| `pos-settings.ts` | `POSConfig` en localStorage por terminal |
| `print-command.ts` | Impresión térmica 80mm (comanda cocina + factura) |
| `export-z-report.ts` | Generación Reporte Z a Excel |
| `export-arqueo-excel.ts` | Exportación arqueo de caja a Excel |
| `arqueo-excel-utils.ts` | Utilidades para formato de arqueo |
| `currency.ts` | Formateo USD/Bs |
| `datetime.ts` | Utilidades fecha/hora timezone Caracas |
| `soft-delete.ts` | Helpers para soft delete en queries |
| `inventory-excel-parse.ts` | Parser de Excel para conteo físico |
| `pedidosya-price.ts` | Lógica de precio PedidosYA |
| `mock-data.ts` | Datos de ejemplo para desarrollo |
| `utils.ts` | Utilidades generales (cn, etc.) |
| `constants/modules-registry.ts` | Registro maestro de módulos (682 líneas) |
| `constants/roles.ts` | Roles, jerarquía, permisos RBAC (298 líneas) |
| `constants/units.ts` | Unidades de medida con conversión |

---

## 10. Componentes UI Compartidos (23 componentes)

### Layout (5)
| Componente | Archivo | Propósito |
|-----------|---------|-----------|
| Navbar | `components/layout/Navbar.tsx` | Barra superior con usuario, rol, tema |
| Sidebar | `components/layout/Sidebar.tsx` | Menú lateral con módulos agrupados por sección |
| ThemeToggle | `components/layout/ThemeToggle.tsx` | Dark/light mode |
| NotificationBell | `components/layout/NotificationBell.tsx` | Campana con anuncios no leídos |
| HelpPanel | `components/layout/HelpPanel.tsx` | Panel de ayuda contextual |

### POS (6)
| Componente | Archivo | Propósito |
|-----------|---------|-----------|
| MixedPaymentSelector | `components/pos/MixedPaymentSelector.tsx` | Selector de pago mixto (N métodos, conversión Bs) |
| PrintTicket | `components/pos/PrintTicket.tsx` | Template de factura imprimible |
| PriceDisplay | `components/pos/PriceDisplay.tsx` | Muestra precio USD + equivalente Bs |
| CashierShiftModal | `components/pos/CashierShiftModal.tsx` | Modal para cambio de cajera (PIN) |
| BillDenominationInput | `components/pos/BillDenominationInput.tsx` | Entrada de billetes por denominación |
| CurrencyCalculator | `components/pos/CurrencyCalculator.tsx` | Calculadora de conversión USD↔Bs |

### UI Base (7)
| Componente | Archivo | Propósito |
|-----------|---------|-----------|
| Card | `components/ui/Card.tsx` | Tarjeta contenedora |
| button | `components/ui/button.tsx` | Botón con variantes (CVA) |
| combobox | `components/ui/combobox.tsx` | Selector con búsqueda (Radix + cmdk) |
| dialog | `components/ui/dialog.tsx` | Modal (Radix Dialog) |
| command | `components/ui/command.tsx` | Command palette (cmdk) |
| scroll-area | `components/ui/scroll-area.tsx` | Scroll personalizado (Radix) |
| popover | `components/ui/popover.tsx` | Popover (Radix) |
| quick-create-item-dialog | `components/ui/quick-create-item-dialog.tsx` | Diálogo rápido para crear insumo |

### Otros (3)
| Componente | Archivo | Propósito |
|-----------|---------|-----------|
| ChangePasswordDialog | `components/users/ChangePasswordDialog.tsx` | Cambio de contraseña |
| whatsapp-purchase-order-parser | `components/whatsapp-purchase-order-parser.tsx` | Parser de OC desde mensaje WhatsApp |
| whatsapp-order-parser | `components/whatsapp-order-parser.tsx` | Parser de órdenes desde WhatsApp |
| theme-provider | `components/theme-provider.tsx` | Provider de next-themes |

---

## 11. PANEL ADMIN — Sistema de Configuración Cápsula (Propuesta)

### 11.1 Decisión de Diseño: Enfoque Híbrido

**Administración** = Gestión del negocio (usuarios, finanzas, gastos, caja, metas)
**Panel Admin** = Configuración del sistema/SaaS (módulos, roles, métodos de pago, fees, plantillas)

Propuesta: mover las páginas de `/dashboard/config/*` a `/dashboard/admin/*` y crear las nuevas funcionalidades ahí. Un solo namespace para toda la configuración del sistema.

### 11.2 Migración de Rutas Existentes

| Ruta Actual | Ruta Propuesta | Actions |
|-------------|---------------|---------|
| `/dashboard/config/modules` | `/dashboard/admin/modules` | system-config.actions.ts |
| `/dashboard/config/roles` | `/dashboard/admin/roles` | user.actions.ts |
| `/dashboard/config/modulos-usuario` | `/dashboard/admin/modulos-usuario` | user.actions.ts |
| `/dashboard/config/tasa-cambio` | `/dashboard/admin/tasa-cambio` | exchange.actions.ts |
| `/dashboard/config/pos` | `/dashboard/admin/pos` | system-config.actions.ts |

**Impacto de migración**: Actualizar `modules-registry.ts` (hrefs), `middleware.ts` (RBAC rules para `/dashboard/admin/*`), Sidebar links.

### 11.3 Nuevas Páginas (Cápsula SaaS)

| Funcionalidad | Estado | Ruta Propuesta |
|--------------|--------|---------------|
| Métodos de Pago CRUD | **NO EXISTE** | `/dashboard/admin/payment-methods` |
| Fees y Porcentajes | **NO EXISTE** | `/dashboard/admin/fees` |
| Tipos de Descuento | **NO EXISTE** | `/dashboard/admin/discounts` |
| Canales de Orden | **NO EXISTE** | `/dashboard/admin/channels` |
| Datos del Negocio | **NO EXISTE** | `/dashboard/admin/business` |
| Plantilla de Configuración | **NO EXISTE** | `/dashboard/admin/template` |

### 11.4 Prioridad 1 — Métodos de Pago (CRUD completo)

**¿Por qué CRUD y no toggle?** Cada cliente puede necesitar métodos distintos. Venezuela: Zelle, Pago Móvil. Colombia: Nequi, Daviplata. México: OXXO Pay.

**Modelo propuesto**:
```prisma
model PaymentMethod {
  id              String   @id @default(cuid())
  key             String   // "ZELLE", "BINANCE", "NEQUI" — único por tenant
  label           String   // "⚡ Zelle"
  emoji           String?
  isBsMethod      Boolean  @default(false)   // true = ingresa Bs, convierte a USD
  isDivisasMethod Boolean  @default(false)   // true = aplica descuento divisas
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  showInSinglePay Boolean  @default(true)    // botones de pago único
  showInMixedPay  Boolean  @default(true)    // MixedPaymentSelector
  tenantId        String?                    // NULL ahora, para SaaS futuro
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Archivos a refactorizar**:
1. `MixedPaymentSelector.tsx` — cargar métodos desde prop (no array fijo)
2. `restaurante/page.tsx` — cargar métodos desde BD al montar
3. `delivery/page.tsx` — ídem
4. `pos.actions.ts` — leer `isBsMethod`/`isDivisasMethod` desde BD
5. `sales.actions.ts` — Reporte Z con métodos dinámicos
6. `sales/page.tsx` — labels dinámicos en historial

**Compatibilidad histórica**: Keys legacy (`CASH`, `MOBILE_PAY`, `CARD`, `TRANSFER`) existen en `SalesOrderPayment.method`. Fallback: `methods.find(m => m.key === key)?.label ?? key`.

### 11.5 Prioridad 2 — Fees y Porcentajes

Almacenar en `SystemConfig`:

| Key | Default | Descripción |
|-----|---------|-------------|
| `delivery_fee_normal` | 4.50 | Tarifa delivery pago en Bs |
| `delivery_fee_divisas` | 3.00 | Tarifa delivery pago en divisas |
| `service_charge_pct` | 10 | % servicio mesas (0 = desactivado) |
| `divisas_discount_pct` | 33.33 | % descuento pago en divisas |

### 11.6 Prioridad 3 — Tipos de Descuento

Toggle + nombre personalizable:
- `DIVISAS_33` → habilitado/no, nombre configurable, % vinculado a `divisas_discount_pct`
- `CORTESIA_100` → habilitado/no, nombre configurable
- `CORTESIA_PERCENT` → habilitado/no, nombre configurable

### 11.7 Prioridad 4 — Canales de Orden Activos

Toggle por `orderType`:
- RESTAURANT ✅ siempre
- DELIVERY ✅/❌ configurable
- PICKUP ✅/❌ configurable
- PEDIDOSYA ✅/❌ configurable
- WINK ✅/❌ configurable
- EVENTO ✅/❌ configurable

---

## 12. Mapa de Conexiones Inter-módulo

```
┌─────────────────────── OPERACIONES ───────────────────────┐
│                                                            │
│  InventoryItem ←──── RecipeIngredient ────→ Recipe         │
│       ↓                                      ↓             │
│  InventoryLocation                    MenuItem (recipeId)  │
│       ↑↓                                     ↓             │
│  InventoryMovement ←──────────── SalesOrderItem            │
│    ↑    ↑    ↑    ↑                          ↓             │
│    │    │    │    │              ┌── SalesOrder ──┐         │
│    │    │    │    │              │                │         │
│    │    │    │    └── Audit      │   ┌──────────┐│         │
│    │    │    └─── Transfer       │   │ OpenTab  ││         │
│    │    └──── Production         │   │ PaySplit ││         │
│    └───── Purchase               │   └──────────┘│         │
│              ↓                   │                │         │
│         CostHistory              └────────┬───────┘         │
│              ↓                            │                 │
│         MenuItem.cost                     │                 │
└───────────────────────────────────────────┼─────────────────┘
                                            │
┌─────────── VENTAS/POS ────────────────────┼─────────────────┐
│                                           │                  │
│  POS Restaurante ── openTab ── cocina ────┤                  │
│  POS Delivery ───── directSale ───────────┤                  │
│  POS Mesero ─────── openTab (sin cobro) ──┤                  │
│  PedidosYA ──────── directSale ───────────┤                  │
│  Cargar Ventas ──── manual entry ─────────┤                  │
│                                           │                  │
│  SalesOrderPayment[]                      │                  │
│       ↓                                   │                  │
│  MixedPaymentSelector / SinglePay         │                  │
└───────────────────────────────────────────┼──────────────────┘
                                            │
┌─────────── ADMINISTRACIÓN ────────────────┼──────────────────┐
│                                           │                  │
│  Finanzas (P&L) ← ventas ────────────────┘                  │
│       ↑              ↑                                       │
│  Expense        PurchaseOrder.totalAmount                    │
│       ↑              ↑                                       │
│  Gastos         Compras (COGS)                               │
│                      ↓                                       │
│                 AccountPayable ← deuda → AccountPayment      │
│                                                              │
│  CashRegister ← ventas_turno + gastos → cuadre de caja      │
│  Metas ← ventas_actuales vs targets (SystemConfig)           │
│  ExchangeRate → POS (conversión Bs) → SalesOrder (snapshot)  │
└──────────────────────────────────────────────────────────────┘
```

---

## 13. Restricciones Técnicas Inamovibles

1. **BD solo aditiva**: Solo `ALTER TABLE ADD COLUMN` con DEFAULT o nullable. Nunca `DROP COLUMN`, `DROP TABLE`, `ALTER TYPE` destructivo.

2. **Sin romper historial**: Keys legacy de métodos de pago (`CASH`, `MOBILE_PAY`, `CARD`, `TRANSFER`) deben seguir mostrándose en historial aunque no existan en tabla nueva.

3. **Server Actions**: Toda lógica de negocio en `src/app/actions/*.actions.ts`. Los componentes client-side llaman Server Actions, no APIs REST directas (excepto cocina que usa polling).

4. **Caching**: Métodos de pago y menú se usan en cada render del POS. Usar `unstable_cache` o pasar como prop desde Server Component.

5. **Sin librerías nuevas** salvo estrictamente necesarias y justificadas.

6. **TypeScript estricto**: Sin `any` salvo casos justificados.

7. **Soft Delete**: Todos los modelos con `deletedAt` usan soft delete. Nunca `DELETE FROM` en datos de negocio.

8. **AuditLog inmutable**: La tabla AuditLog NUNCA se borra. Solo archivar a cold storage.

9. **Correlativos nunca se resetean**: InvoiceCounter es global y monotónico por canal.

---

## 14. Visión Multi-Tenant (diseñar para ello, NO implementar ahora)

### Estado actual
- 1 BD por cliente (instancias separadas)
- Sin `tenantId` en ningún modelo

### Objetivo: SaaS "Cápsula"
- Múltiples clientes en una sola BD
- Aislamiento total de datos por tenant
- Admin de cada tenant solo ve/modifica sus datos

### Restricción de diseño
Agregar `tenantId String?` (nullable) a todo modelo de configuración nuevo (`PaymentMethod`, etc.). Migración futura:
```sql
UPDATE "PaymentMethod" SET "tenantId" = 'tenant_shanklish' WHERE "tenantId" IS NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "tenantId" SET NOT NULL;
```

---

## 15. Roadmap de Implementación

| Prioridad | Tarea | Complejidad | Impacto |
|-----------|-------|-------------|---------|
| **P1** | Panel Admin — Métodos de Pago CRUD | Alta (6 archivos refactor) | Elimina hardcoding en 3+ archivos |
| **P2** | Panel Admin — Fees y Porcentajes | Media (SystemConfig + 4 archivos) | Delivery fee, service charge configurables |
| **P3** | Panel Admin — Tipos de Descuento | Media (toggle + POS refactor) | Descuentos configurables por instalación |
| **P4** | Panel Admin — Canales de Orden | Baja (toggle de orderType) | Canales activables por cliente |
| **P5** | Middleware RBAC completo | Media (middleware.ts) | Cerrar gap de acceso directo por URL |
| **P6** | Unificar sistemas de permisos | Baja (refactor permissions.ts + roles.ts) | Un solo sistema numérico coherente |
| **P7** | Service charge como dato (no string matching) | Media (schema + POS + sales) | Elimina detección frágil por splitLabel |

---

## 16. Gap Analysis — Qué falta para 100%

### Gaps Críticos (afectan producción)

| # | Gap | Archivos afectados | Impacto |
|---|-----|-------------------|---------|
| 1 | **Métodos de pago hardcodeados** en 3+ archivos | `MixedPaymentSelector.tsx`, `restaurante/page.tsx`, `delivery/page.tsx` | No se pueden agregar/quitar métodos sin deploy |
| 2 | **Delivery fees hardcodeados** duplicados front+back | `pos.actions.ts:263-264`, `delivery/page.tsx:15-16` | Cambiar tarifa requiere editar 2 archivos |
| 3 | **Service charge 10% hardcodeado** | `restaurante/page.tsx:696,769`, `sales.actions.ts` | No configurable por instalación |
| 4 | **Service charge detectado por string** (`'| +10% serv'`) | `sales.actions.ts:120,264,428,737` | Detección frágil, se rompe si cambia el texto |
| 5 | **BAR_CATEGORIES hardcodeado** `['Bebidas']` | `api/kitchen/orders/route.ts:7` | No configurable qué va a barra vs cocina |

### Gaps de Seguridad

| # | Gap | Archivo | Impacto |
|---|-----|---------|---------|
| 6 | **JWT secret con fallback hardcodeado** | `src/lib/auth.ts:5` | Si no se configura env var, todos los JWT usan la misma key |
| 7 | **Middleware RBAC incompleto** — solo 3 rutas protegidas | `middleware.ts` | Acceso directo por URL a módulos no autorizados |
| 8 | **Dos sistemas de niveles numéricos** no unificados | `permissions.ts` vs `roles.ts` | KITCHEN_CHEF, WAITER, CASHIER_DELIVERY no en permissions.ts |

### Gaps Funcionales

| # | Gap | Detalle |
|---|-----|---------|
| 9 | **Descuentos no configurables** por instalación | DIVISAS_33, CORTESIA fijos en código |
| 10 | **Canales de orden no configurables** | DELIVERY, PICKUP, PEDIDOSYA siempre disponibles si el módulo está activo |
| 11 | **kitchenRouting no se usa** en comandera | MenuItem tiene campo `kitchenRouting` (BAR/KITCHEN/GRILL) pero la API filtra por categoría name |
| 12 | **Inventario diario no sincroniza** producción ni transferencias automáticamente | Solo sincroniza ventas POS, no registra entradas/producción del día |
| 13 | **CostHistory no se actualiza** automáticamente al recibir compra en todos los flujos | `receivePurchaseOrderItemsAction` lo hace, pero `registrarEntradaMercancia` podría no |
| 14 | **Intercompany desconectado** de descargo automático | Items intercompany no generan InventoryMovement en el negocio proveedor |

### Gaps de UX

| # | Gap | Detalle |
|---|-----|---------|
| 15 | **POSConfig mixto** BD + localStorage | `stockValidationEnabled` en BD, el resto en localStorage — difícil administrar centralizadamente |
| 16 | **Páginas legacy** bajo `/dashboard/inventario/` sin registro en module-registry | `historial`, `importar`, `compras` existen como páginas pero no como módulos independientes |

---

*Generado el 2026-04-10 — Shanklish ERP / Cápsula SaaS — Documento Completo*
*42 modelos Prisma · 47 módulos · 40 actions · 4 API routes · 3 services · 23 componentes*
*Total: ~1600 líneas*
