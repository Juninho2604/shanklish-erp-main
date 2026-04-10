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

*Continúa en Sección 6: Módulos de Ventas...*

*Generado el 2026-04-10 — Shanklish ERP / Cápsula SaaS — Partes 1-3*
