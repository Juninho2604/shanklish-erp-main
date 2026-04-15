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
│   │   ├── constants/             # modules-registry.ts, roles.ts, permissions-registry.ts, units.ts
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
| **User** | id, email, passwordHash, pin, role, allowedModules, grantedPerms, revokedPerms, isActive, deletedAt | Usuarios del sistema. 9 roles activos. `allowedModules` (JSON array nullable) filtra módulos por usuario; `grantedPerms`/`revokedPerms` (JSON arrays de PERM keys) amplían o restringen permisos del rol base |
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

### 3.2 Los 9 Roles del Sistema

**Archivo**: `src/lib/constants/roles.ts`

| Rol | Nivel RBAC | Nivel permisos | Descripción |
|-----|-----------|---------------|-------------|
| OWNER | 1 | 100 | Acceso total. Único que activa/desactiva módulos |
| AUDITOR | 2 | 90 | Solo lectura en todo, acceso a auditoría y reportes |
| ADMIN_MANAGER | 3 | 80 | Gestión administrativa y financiera |
| OPS_MANAGER | 4 | 70 | Gestión de operaciones, inventario, producción |
| HR_MANAGER | 5 | 60 | Recursos humanos |
| CHEF | 6 | 50 | Recetas, producción, inventario (lectura) |
| AREA_LEAD | 7 | 40 | Gestión de área específica |
| KITCHEN_CHEF | 7 | 15 | Comandera de cocina (solo vista) |
| CASHIER | 8 | 20 | Cajera unificada. Módulos accesibles controlados por `allowedModules` |
| WAITER | 8 | 15 | Toma de pedidos en mesa |

**CASHIER es el rol canónico único para cajeras** (Fase 3 RBAC). Los roles `CASHIER_RESTAURANT` y `CASHIER_DELIVERY` fueron eliminados del codebase en Fase 4. El acceso a POS restaurante vs. delivery se controla ahora mediante `allowedModules` por usuario individual.

Existen dos sistemas de niveles numéricos paralelos (históricamente separados, no unificados en una sola fuente):
- `roles.ts:ROLE_HIERARCHY` — menor número = mayor rango (1-8), usado en `canManageRole()`
- `permissions.ts:roleLevels` — mayor número = mayor rango (15-100), usado en `hasPermission()`

### 3.3 Sistema de Permisos — 4 Capas

El sistema RBAC opera en **4 capas apiladas**:

| Capa | Mecanismo | Archivo | Alcance |
|------|-----------|---------|---------|
| 1 | **Middleware** — rutas protegidas por rol | `middleware.ts` | `/dashboard/usuarios`, `/dashboard/inventario/auditorias`, `/dashboard/config/*` |
| 2 | **MODULE_ROLE_ACCESS** — módulos visibles en Sidebar | `modules-registry.ts` | Todos los módulos del sistema |
| 3 | **allowedModules** — restricción por usuario | `User.allowedModules` (BD) | Subconjunto de módulos de Capa 2 |
| 4 | **grantedPerms / revokedPerms** — permisos granulares | `User.grantedPerms/revokedPerms` (BD) | Acciones específicas dentro de módulos |

#### Capa 1 — `src/lib/permissions.ts` (sistema numérico heredado)

```typescript
// userLevel >= requiredLevel = acceso permitido
roleLevels = { OWNER: 100, AUDITOR: 90, ADMIN_MANAGER: 80, OPS_MANAGER: 70,
               HR_MANAGER: 60, CHEF: 50, AREA_LEAD: 40, CASHIER: 20,
               KITCHEN_CHEF: 15, WAITER: 15, STAFF: 10 }
PERMISSIONS = { CONFIGURE_ROLES: 70, APPROVE_TRANSFERS: 40,
                VIEW_COSTS: 80, VIEW_USERS: 60, MANAGE_USERS: 70 }
```

#### Capas 2–3 — `src/lib/constants/roles.ts`

- `ROLE_PERMISSIONS` — matriz por módulo y acción (view, create, edit, delete, approve, export)
- `canManageRole(actorRole, targetRole)` — jerarquía (solo superiores modifican inferiores)
- `getManageableRoles(actorRole)` — qué roles puede crear/editar

#### Capa 4 — `src/lib/constants/permissions-registry.ts` *(nuevo)*

Catálogo de **17 permisos granulares** con resolución por usuario:

```typescript
// Permisos disponibles (PERM keys):
// POS: VOID_ORDER, APPLY_DISCOUNT, APPROVE_DISCOUNT, VIEW_ALL_ORDERS, REPRINT_COMANDA
// Inventario: ADJUST_STOCK, APPROVE_TRANSFER, CLOSE_DAILY_INV
// Financiero: EXPORT_SALES, VIEW_COSTS, OPEN_CASH_REGISTER, CLOSE_CASH_REGISTER, VIEW_FINANCES
// Admin: MANAGE_USERS, MANAGE_PINS, CONFIGURE_SYSTEM, MANAGE_BROADCAST

// ROLE_BASE_PERMS — set base por rol (sin override)
// Resolución final: base ∪ grantedPerms - revokedPerms
resolvePerms(role, grantedPerms?, revokedPerms?) → Set<PermKey>
canDo(role, perm, grantedPerms?, revokedPerms?)   → boolean
```

`PERM_GROUPS` — 4 grupos para la UI (POS/Ventas, Inventario, Financiero, Administración).
`PERM_LABELS` — etiquetas y descripciones legibles para cada permiso.

**Flujo de resolución**: El JWT carga `grantedPerms`/`revokedPerms` en la sesión (`auth.actions.ts`). `resolvePerms()` aplica la fórmula `base ∪ granted − revoked` en runtime — no hay cache, siempre calculado desde la sesión.

### 3.4 Middleware RBAC

**Archivo**: `src/middleware.ts`

Matcher: `/dashboard/:path*` y `/login`

| Regla | Rutas | Roles permitidos |
|-------|-------|-----------------|
| Login requerido | `/dashboard/*` sin sesión | Redirect → `/login` |
| Ya autenticado | `/login` con sesión | Redirect → `/dashboard` |
| Gestión usuarios | `/dashboard/usuarios` | OWNER, ADMIN_MANAGER |
| Auditorías | `/dashboard/inventario/auditorias`, `/dashboard/inventario/importar` | OWNER, ADMIN_MANAGER, OPS_MANAGER, AUDITOR |
| Config global | `/dashboard/config/*` | Solo OWNER |

**Nota**: El middleware cubre las rutas de mayor riesgo. Para el resto de módulos, el control de acceso se aplica en dos niveles: el Sidebar filtra por `MODULE_ROLE_ACCESS` (no muestra el enlace), y cada Server Component/Action hace su propia verificación de rol antes de servir datos. Un usuario que acceda directamente a una URL no autorizada verá la página vacía o recibirá error del Server Action, pero no datos sensibles.

### 3.5 Acceso por Módulos — Triple Filtro

Un módulo aparece en el Sidebar solo si pasa los **tres filtros** en orden:

1. **Habilitado** en la instalación → `SystemConfig.enabled_modules` (BD) o `NEXT_PUBLIC_ENABLED_MODULES` (env var fallback)
2. **Rol autorizado** → `MODULE_ROLE_ACCESS[moduleId].includes(userRole)` en `modules-registry.ts`
3. *(Restricción individual)* **allowedModules** → si `User.allowedModules` no es null, el módulo debe estar en ese array

Función clave: `getVisibleModules(userRole, enabledIds, userAllowedModules)` en `modules-registry.ts`

Los permisos granulares (Capa 4) no controlan visibilidad de módulos sino acciones dentro de ellos (anular orden, exportar, abrir caja, etc.).

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
- CASHIER → estadísticas, pos_restaurant, pos_delivery, pedidosya, sales_history, barra_display, pos_config, reservations, queue, tasa_cambio, caja *(módulos visibles filtrados además por `allowedModules`)*
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
- **Costeo dinámico**: `completeProteinProcessingAction` debería calcular el costo proporcional de cada sub-producto: `costoRealPorKg = (costoUnitarioSource × pesoCongelado) / totalSubProducts`. El campo `estimatedCost` en ProteinSubProduct y `isCalculated`/`costBreakdown` en CostHistory ya existen para esto. **Verificar si está implementado o pendiente.**
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
- **Página**: `src/app/dashboard/pos/restaurante/page.tsx` — **~2850 líneas**, Client Component (el archivo más grande del sistema)
- **Actions**: `pos.actions.ts` (1470 líneas) → funciones usadas:
  - `getMenuForPOSAction()` — carga menú completo para POS
  - `validateManagerPinAction(pin)` — autoriza descuentos/cortesías
  - `validateCashierPinAction(pin)` — trazabilidad de sesión de caja (solo `updateSessionCashier`)
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
  - Tres flujos: **Mesa/Tab** (abrir → agregar items → enviar cocina → cobrar → cerrar), **Pickup Tabs** (múltiples pedidos de mostrador simultáneos, carrito persistente), **Subcuentas** (división por persona)
  - **Modal apertura de mesa**: campos Nombre (opcional, default `"Cliente"`), Número de personas, Mesonero asignado. El teléfono fue eliminado — el botón "Abrir cuenta" solo se bloquea durante `isProcessing`.
  - **Pickup Tabs** (`PickupTabLocal`): cada pickup es un "tab virtual" con número auto-generado `PK-01`, `PK-02`… (editable), nombre y teléfono opcionales. Sidebar muestra lista de pickups abiertos. Al cambiar de contexto (pickup↔mesa), el carrito se guarda y restaura automáticamente. Al cobrar, el tab completado se elimina y se activa el siguiente si existe.
  - Service charge 10% toggle por venta (estado local `serviceFeeIncluded`)
  - Descuentos: DIVISAS_33, CORTESIA_100, CORTESIA_PERCENT (requiere PIN gerente)
  - Pago único (7 métodos) o mixto (MixedPaymentSelector)
  - PaymentSplit: dividir cuenta por persona en mesa
  - Descargo automático de inventario vía `inventory.service.registerSale()`
- **Impresión** (`src/lib/print-command.ts` → `printReceipt`):
  - `ReceiptData.tableLabel?: string` — nombre de mesa impreso bajo el correlativo (ej. `Mesa: Interior 3`)
  - `ReceiptData.tipAmount?: number` — propina impresa como línea informativa tras el 10% servicio
  - Descuento siempre visible: DIVISAS_33 imprime `Desc. divisas (33.33%): -$XX` (ya no se oculta con `hideDiscount`)
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
- **Actions adicionales**: `pos.actions.ts` → `validateManagerPinAction(pin)` (anulaciones)
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
- **Actions**: `user.actions.ts` → 9 funciones:
  - `getUsers()` — lista con roles, allowedModules, grantedPerms, revokedPerms, pinSet
  - `updateUserRole(userId, newRole)` — cambia rol
  - `toggleUserStatus(userId, isActive)` — activar/desactivar
  - `changePasswordAction(currentPassword, newPassword)` — cambio propio (usa PBKDF2)
  - `updateUserModules(userId, allowedModules)` — asigna módulos individuales
  - `updateUserPin(userId, rawPin)` — asigna/cambia PIN de otro usuario (requiere MANAGE_USERS)
  - `updateUserPerms(userId, grantedPerms, revokedPerms)` — sobreescribe permisos granulares
  - **`createUserAction(data)`** — crea usuario nuevo; requiere MANAGE_USERS; hashea password con PBKDF2; valida email único; retorna `{ success, user, message }`
  - **`adminResetPasswordAction(userId, newPassword)`** — resetea contraseña de otro usuario; requiere OWNER o ADMIN_MANAGER; no puede resetear la propia
- **Modelos**: User (schema completo, no requiere migración para estas funciones)
- **Componentes**: `PinSection`, `PasswordResetSection`, `PermsSection`, `CreateUserModal` (todos en `users-view.tsx`)
- **Middleware**: Ruta protegida — solo OWNER, ADMIN_MANAGER
- **Estado**: Funcional

#### Crear Usuario (`CreateUserModal`)

- **Dónde**: Botón "➕ Nuevo Usuario" en el header de `/dashboard/usuarios`, visible solo para `canManageUsers`
- **Modal**: `z-60`, backdrop `bg-black/75 backdrop-blur-sm`, card `bg-card border border-border rounded-2xl`
- **Campos**: firstName, lastName, email, password (min 6 chars), rol (select con todos los roles)
- **Validaciones cliente**: todos los campos requeridos; server: email único, longitud password, formato email
- **Al guardar**: usuario nuevo aparece al tope de la lista y queda seleccionado — sin recarga de página
- **Password**: hasheado con PBKDF2-SHA256 antes de guardarse (ver `src/lib/password.ts`)

#### Resetear Contraseña de Otro Usuario (`PasswordResetSection`)

- **Dónde**: Panel lateral derecho, debajo de `PinSection`, visible solo para OWNER/ADMIN_MANAGER y cuando el seleccionado no es el mismo admin
- **Validación**: mínimo 6 caracteres; el servidor rechaza `session.id === userId`
- **Password resultante**: hasheada con PBKDF2-SHA256

#### Panel de Permisos Granulares (`PermsSection`)

UI dentro de `/dashboard/usuarios` para gestionar la Capa 4:
- Muestra los 17 permisos agrupados en 4 grupos (`PERM_GROUPS`) con checkboxes tri-estado: **base** (gris — del rol), **granted** (verde — añadido), **revoked** (rojo — quitado)
- Solo aparece la opción de revocar para permisos que el rol base tiene; solo aparece grant para los que no tiene
- Persiste con `updateUserPermsAction(userId, granted[], revoked[])`
- Visible solo para OWNER/ADMIN_MANAGER

#### Gestión de PINs

- **Dónde**: Panel lateral derecho de `/dashboard/usuarios` → sección "PIN de acceso (POS)"
- **Quién puede asignar**: Roles con `MANAGE_USERS` (nivel 70+: OWNER, ADMIN_MANAGER, OPS_MANAGER)
- **Restricción**: Un usuario no puede modificar su propio PIN desde este panel (`session.id === userId` → error)
- **Validación**: Numérico estricto, 4–6 dígitos (`/^\d{4,6}$/`)
- **Almacenamiento**: Nunca en texto plano — se hashea con PBKDF2-SHA256 antes de guardar en BD
- **Indicador visual**: `PinSection` muestra badge "Asignado" (verde) o "Sin PIN" (ámbar) según `pinSet: boolean` proveniente de `getUsers()`. El campo `pin` nunca se expone al cliente — solo el boolean derivado.

#### Bug PIN resuelto (2026-04-11) — Zustand vs JWT desconectados

**Causa raíz**: `loginAction` creaba el cookie JWT con el ID real del usuario en BD, pero **nunca llamaba `useAuthStore().login()`**. El store Zustand quedaba inicializado con `mockCurrentUser` (id: `'user-admin'`) de forma permanente, persisitido en localStorage.

Consecuencia directa: la guardia UI `selectedUser.id !== currentUser?.id` comparaba contra `'user-admin'` (siempre distinto de cualquier ID real), por lo que el botón "Guardar PIN" aparecía incluso cuando el OWNER seleccionaba su propio usuario. En el servidor, `session.id === userId` (ambos el ID real del OWNER) lo bloqueaba correctamente, devolviendo `{ success: false }`. El toast de error se mostraba pero el origen del problema no era evidente.

**Fix aplicado (commit `82cfb00`)**:
- `auth.actions.ts`: `loginAction` ya **no hace `redirect()` server-side**. Retorna `{ success: true, user: { id, email, firstName, lastName, role } }` con datos reales de BD.
- `login-form-client.tsx`: Al recibir `success: true`, llama `login(result.user)` en el store Zustand y luego `router.push('/dashboard')` client-side. El store siempre refleja el usuario real del JWT.
- `user.actions.ts` → `getUsers()`: añade `pin: true` al select y lo mapea a `pinSet: pin !== null` — el hash PBKDF2 nunca llega al cliente.
- `users-view.tsx`: interfaz `User` incluye `pinSet: boolean`; `PinSection` recibe `pinSet` y `onSaved()` que actualiza estado local al guardar; `ModulesPanelProps` incluye `onPinSaved`.

**Regla permanente**: `currentUser.id` en el cliente viene del store Zustand (sincronizado en login). `session.id` en el servidor viene del JWT cookie. Deben ser idénticos tras el login. Cualquier lógica de "auto-edición bloqueada" debe verificarse en el servidor — la UI puede tener estado stale.

#### Hashing PBKDF2 — Fuente Autoritativa

- **Archivo compartido**: `src/lib/password.ts` — exporta `hashPassword(password)` y `verifyPassword(password, stored)`
- **Archivo de PINs**: `src/app/actions/user.actions.ts` — exporta `hashPin(rawPin)` y `pbkdf2Hex(pin, saltHex)` (mismo algoritmo, sección específica para PINs)
- **Algoritmo**: PBKDF2-SHA256, 100 000 iteraciones, salt aleatorio de 16 bytes por hash
- **Formato en BD**: `"saltHex:hashHex"` — si no contiene `:` se trata como contraseña/PIN legado en texto plano (retrocompatibilidad con usuarios creados antes del hashing)
- **Login retrocompatible**: `auth.actions.ts` → `verifyPassword(password, user.passwordHash)` detecta automáticamente si es PBKDF2 o texto plano

#### Regla permanente: contraseñas en texto plano (usuarios legacy)

> Existen usuarios en producción con `passwordHash` en texto plano (creados antes de 2026-04-11). `verifyPassword()` los soporta detectando la ausencia de `:`. Al cambiar o resetear la contraseña, se guarda en PBKDF2 automáticamente — migración progresiva sin script.
- **Uso en POS**: `pos.actions.ts` importa `hashPin` y `pbkdf2Hex` desde `user.actions.ts`; `verifyPin()` permanece local en `pos.actions.ts`

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

**Nota**: La configuración de permisos granulares (grantedPerms/revokedPerms) vive en `/dashboard/usuarios` dentro del panel de cada usuario (`PermsSection`), no en esta página. Esta página solo cambia el rol base.

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
| `constants/roles.ts` | Roles, jerarquía, ROLE_PERMISSIONS, canManageRole |
| `constants/permissions-registry.ts` | Catálogo granular de 17 PERM keys, ROLE_BASE_PERMS, resolvePerms(), canDo(), PERM_GROUPS |
| `constants/units.ts` | Unidades de medida con conversión |

---

## 10. Componentes UI Compartidos (23 componentes)

### Layout (5)
| Componente | Archivo | Propósito |
|-----------|---------|-----------|
| Navbar | `components/layout/Navbar.tsx` | Barra superior con usuario, rol, tema |
| Sidebar | `components/layout/Sidebar.tsx` | Menú lateral con módulos agrupados por sección |
| ThemeToggle | `components/layout/ThemeToggle.tsx` | Dark/light mode |
| NotificationBell | `components/layout/NotificationBell.tsx` | Modal centrado z-[70], backdrop negro, animación zoom-in-95. Tabs Stock/Sistema con bg tint activo. Cards p-4 rounded-2xl. Legible light/dark. |
| HelpPanel | `components/layout/HelpPanel.tsx` | Modal centrado z-[70], backdrop negro, animación zoom-in-95. Guía contextual por ruta. Cards p-4 rounded-2xl. Legible light/dark. |

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
| whatsapp-order-parser | `components/whatsapp-order-parser.tsx` | Parser de órdenes desde WhatsApp — se usa en POS Delivery como modal z-60 (botón "💬 WhatsApp" en header abre modal centrado con backdrop, botón X para cerrar; NO inline) |
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
| **P5** | Middleware RBAC completo | Media (middleware.ts) | Cerrar gap de acceso directo por URL *(parcialmente mitigado por Capa 4)* |
| **P6** | Unificar sistemas de niveles numéricos | Baja (permissions.ts ↔ roles.ts) | Un solo sistema numérico coherente |
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
| 7 | **Middleware RBAC cubre solo 3 rutas críticas** — resto se protege en Server Actions | `middleware.ts` | Acceso directo por URL posible, pero Server Actions no retornan datos a roles no autorizados |
| 8 | **Dos sistemas de niveles numéricos** no unificados | `permissions.ts` vs `roles.ts` | KITCHEN_CHEF, WAITER sin nivel en ROLE_HIERARCHY; CASHIER_DELIVERY ya eliminado |

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
| 17 | **Mobile UX**: combobox difícil de usar en móvil | Estrategia propuesta: drawer desde abajo en `<640px`, cards apiladas en vez de tablas, botones `min-h-[44px]`, `inputMode="decimal"` en inputs numéricos |

---

## 17. Deploy e Infraestructura

### 17.1 Deploy Principal — Vercel (Producción actual)

- **Trigger**: Push a GitHub → Vercel detecta cambios → build automático
- **Build command**: `prisma generate && prisma migrate deploy && next build` (definido en `package.json:vercel-build`)
- **Variables de entorno** (configuradas en Vercel dashboard):
  - `DATABASE_URL` — conexión PostgreSQL (Google Cloud SQL)
  - `JWT_SECRET` — secret para firmar tokens de sesión
  - `GOOGLE_VISION_API_KEY` — para OCR de notas escritas a mano
  - `NEXT_PUBLIC_ENABLED_MODULES` — fallback de módulos habilitados (opcional, se lee de BD)

### 17.2 Base de Datos — Google Cloud SQL

- **Motor**: PostgreSQL
- **Instancias**: Una por cliente (shanklish-prod, table-pong-prod)
- **Backups**: Automáticos diarios vía GCP (verificar en Consola GCP → SQL → Copias de seguridad)
- **Backup manual**:
  ```bash
  pg_dump -h localhost -U postgres -d shanklish-prod > backup_fecha.sql
  ```

### 17.3 Entornos Dev / Prod

Para evitar mezclar datos de prueba con operaciones reales:

| Entorno | Base de datos | Uso |
|---------|--------------|-----|
| Producción | `shanklish-prod` (GCP) | Restaurante real, datos reales |
| Desarrollo | `shanklish-dev` (GCP o local) | Pruebas y simulaciones |

Cambiar entorno editando `DATABASE_URL` en `.env`.

### 17.4 Script de Limpieza (Go-Live Reset)

```bash
npm run db:clean    # Ejecuta scripts/clean-transactions.ts
```

- **Borra**: Ventas, órdenes, movimientos de inventario, producciones, historial de costos, conteos
- **Preserva**: Usuarios, insumos (catálogo), recetas, áreas, proveedores
- Requiere confirmación interactiva ("BORRAR DATOS")

### 17.5 Deploy Alternativo — AWS ECR + App Runner (documentado, no activo)

Existe una guía para deploy vía Docker en AWS como alternativa a Vercel:

1. **Prerrequisitos**: Docker Desktop + AWS CLI configurado
2. **ECR (Elastic Container Registry)**: Crear repositorio privado `shanklish-erp`
3. **Build & Push**:
   ```powershell
   .\deploy-aws.ps1 -AccountId "AWS_ACCOUNT_ID" -Region "us-east-1"
   ```
   El script: login Docker con AWS → build imagen → tag → push a ECR
4. **App Runner**: Crear servicio desde la imagen ECR
   - Config: 1 vCPU / 2 GB RAM
   - Environment variables: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_VISION_API_KEY`
   - Deploy automático al pushear nuevas imágenes

**Nota**: Este flujo no está activo actualmente. La producción usa Vercel. Se documentó como opción para clientes que prefieran AWS.

### 17.6 Comandos de BD Útiles

```bash
npm run db:generate        # prisma generate (regenerar cliente)
npm run db:push            # prisma db push (sincronizar schema sin migración)
npm run db:migrate         # prisma migrate dev (crear migración con nombre)
npm run db:migrate:deploy  # prisma migrate deploy (aplicar migraciones pendientes)
npm run db:studio          # prisma studio (explorar datos en navegador)
npm run db:seed            # tsx prisma/seed.ts (datos iniciales)
```

---

---

## 18. Convenciones de UI / Design System

### 18.1 Z-Index Stack (inamovible)

| Capa | Valor | Elementos |
|------|-------|-----------|
| Header fijo | `z-30` | Navbar de cada módulo POS |
| Nav móvil | `z-50` | `<nav>` inferior en Restaurante, Delivery, PedidosYA |
| Modales POS | `z-60` | Modifier, PIN, Tip, Table, Remove-item, Open-tab, WhatsApp parser (Delivery) — todos los módulos |
| NotificationBell / HelpPanel | `z-[70]` | Backdrop + modal card — siempre sobre todo lo anterior |

**Regla**: Nunca poner un modal POS a `z-50` (colisiona con nav móvil). Verificar esta tabla ante cualquier nuevo modal.

### 18.2 Sistema de Cards Unificado (4 módulos POS)

| Propiedad | Valor | Aplica en |
|-----------|-------|-----------|
| Padding | `p-4` | Cart items, alert cards, tip cards |
| Border radius | `rounded-2xl` | Cart items, modal cards de alerta/info |
| Modal cards | `rounded-2xl` o `rounded-3xl` | Modales de tamaño completo |
| Modal sheets (mobile) | `rounded-t-3xl sm:rounded-3xl` | Modales bottom-sheet |

Módulos donde está aplicado: **Restaurante, Delivery, PedidosYA** (cart items + modales).

### 18.3 Modal Pattern — NotificationBell / HelpPanel

```
fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4   ← backdrop
  └── bg-card w-full max-w-sm rounded-2xl flex flex-col max-h-[90vh]
      shadow-2xl border border-border overflow-hidden
      animate-in fade-in zoom-in-95 duration-200                        ← animación
        ├── Header: p-5 border-b bg-{color}/15   (legible light + dark)
        ├── Tabs activos: border-b-2 bg-{color}/10  (no solo underline)
        ├── Content: overflow-y-auto flex-1
        └── Footer: bg-secondary/40  (separación visual clara)
```

### 18.4 Cajera Activa en Sesión y Trazabilidad

- `validateCashierPinAction()` escribe el `id` de la cajera autenticada en el cookie JWT (`activeCashierId`)
- `createSalesOrderAction()` usa `session.activeCashierId ?? session.id` como `createdById`
- Función: `updateSessionCashier(cashierId)` en `src/lib/auth.ts`
- Resultado: cuando varias cajeras comparten terminal, cada orden queda bajo la cajera que validó el PIN
- **Mesa consolidada** (`getSalesHistoryAction`): en el tab RESTAURANT, el grupo de órdenes de un OpenTab se consolida en una fila. `createdBy` toma de `last.createdBy` (la orden más reciente = quien procesó el pago final), no de `first`. Así el historial refleja la cajera de cierre, no de apertura.
- **Modal de anulación** (`sales/page.tsx`): muestra `createdBy.firstName` (cajera) y, si `authorizedById` existe, también `authorizedBy.firstName` con label "Autorizado por:"

### 18.8 Método de Pago PedidosYA

- El método de pago para órdenes PedidosYA se guarda en BD como `'PY'` (antes era `'EXTERNAL'`)
- Escritura: `pedidosya.actions.ts:60` — `paymentMethod: 'PY'`
- Lectura/arqueo: `sales.actions.ts` — branch `k === 'PY'` acumula en `pay.external` del resumen de caja
- Nunca usar `'EXTERNAL'` — es el valor legado, ya renombrado

### 18.5 Redondeo de Descuentos y Total Final

#### roundCents — redondeo de descuentos intermedios
- Helper: `roundCents(n)` = `Math.round(n * 100) / 100` — en `pos.actions.ts` (función privada)
- **Aplica a todos los tipos de descuento** en `calculateCartTotals`: `DIVISAS_33` y `CORTESIA_PERCENT` (ambas ramas DELIVERY y RESTAURANT/PICKUP)
- El frontend (`handleCheckoutPickup` en restaurante/page.tsx) replica el redondeo con `rc()` inline para mantener consistencia de vuelto en pantalla
- `CORTESIA_100` no requiere redondeo (siempre es subtotal exacto)
- Regla: igual o mayor a 0.5 → redondea arriba; menor a 0.5 → redondea abajo

#### roundToWhole — redondeo del total final por método de pago
- Helper: `roundToWhole(amount, paymentMethod)` — en `pos.actions.ts` (función privada) y replicado como lambda en restaurante/page.tsx y delivery/page.tsx
- **Aplica Math.round al total final** solo para: `CASH_USD`, `ZELLE`, `CASH_BS`
- **No aplica** para: `PDV_SHANKLISH`, `PDV_SUPERFERRO`, `MOVIL_NG`, `PY`, y cualquier otro método
- **Orden de aplicación:** ÚLTIMO paso — después de todos los descuentos y después del 10% service charge si aplica
- Ubicaciones de aplicación:
  - `pos.actions.ts` → `calculateCartTotals()`: al `total` final, en ambas ramas (DELIVERY y RESTAURANT/PICKUP), antes de calcular el vuelto
  - `restaurante/page.tsx` → `paymentAmountToCharge`: aplicado después del `* 1.1` (service charge)
  - `restaurante/page.tsx` → `handleCheckoutPickup` `finalTotal`: aplicado al total pickup antes de enviar a la action
  - `restaurante/page.tsx` → IIFE display `pickupTotal`: para que la pantalla muestre el mismo total redondeado
  - `delivery/page.tsx` → `finalTotal`: único punto de display y submit en delivery

### 18.7 amountPaid en Delivery — Regla por Método Bs

**Regla implementada en `delivery/page.tsx` → `handleCheckout` IIFE (desde 2026-04-11):**

| Método | Comportamiento |
|--------|---------------|
| `PDV_SHANKLISH`, `PDV_SUPERFERRO` | Siempre `amountPaid = finalTotal`. Terminales que cobran exacto, sin entrada manual. |
| `MOVIL_NG` | Si `rawAmt >= finalTotal * 10` → convierte Bs→USD (`rawAmt / exchangeRate`). Si no, usa `finalTotal`. |
| `CASH_BS` | Siempre convierte Bs→USD con el monto real ingresado (para calcular vuelto). |

**Bug corregido (2026-04-11):** Entre DEL-0156 (10 abr) y DEL-0197 (11 abr), `amountPaid` se guardaba como `total / exchangeRate` en lugar de `total`. Root cause: el cajero ingresaba el monto USD (ej. `22.5`) en el campo Bs; el código lo dividía por el tipo de cambio → `22.5 / 476 = $0.047`. 25 órdenes afectadas (MOVIL_NG + PDV_SHANKLISH). Corregidas con `scripts/fix-movil-ng-amounts.ts` el 11 abr 2026 (`amountPaid = total`, `change = 0`). El historial de ventas y Z-Report usan `amountPaid - change` para la columna COBRADO — quedaron correctos tras el fix.

### 18.8 Flujo Completo de Propina Colectiva (resuelto 2026-04-11)

#### Creación
- Botón "🪙 PROPINA" en POS Restaurante → modal → `handleRecordTip` (restaurante/page.tsx)
- Si método es Bs (`CASH_BS`, `PDV_SHANKLISH`, `PDV_SUPERFERRO`, `MOVIL_NG`): convierte `tipAmountUSD = Math.round(amount / exchangeRate * 100) / 100`
- Llama `recordCollectiveTipAction(data)` en `pos.actions.ts`
- Crea `SalesOrder` con: `orderType='PICKUP'`, `total=0`, `amountPaid=tipAmountUSD`, `customerName='PROPINA COLECTIVA'`, correlativo `PKP-XXXX` (via `getNextCorrelativo('PICKUP')`)
- `amountPaid` siempre en USD. Toast: "Bs 50.00 ($1.96) registrada" o "$5.00 registrada"

#### Historial de Ventas (`sales/page.tsx`)
- Filtro "Tipo → 🍽️ Mesa / Pickup" incluye `orderType='RESTAURANT'` Y `'PICKUP'` (ambos)
- Filtro "Tipo → 🪙 Propinas" filtra por `customerName === 'PROPINA COLECTIVA'`
- Filas PROPINA COLECTIVA: badge ámbar "🪙 PROPINA", correlativo en ámbar, fila con fondo `bg-amber-950/20`
- Columna "Total Factura" muestra `—` (el total es $0), columna "Cobrado" muestra `amountPaid` en ámbar

#### Reporte Z (`getDailyZReportAction` en `sales.actions.ts`)
- `totalTips` acumula: para mesas (tab) → `totalCobrado - totalFactura`; para órdenes sueltas → `amountPaid - total` cuando `change=0` y `amountPaid > total`
- `tipCount` cuenta las transacciones de propina (tanto de mesas como PROPINA COLECTIVA)
- El Reporte Z imprimible muestra `(+) PROPINAS (N)` con el monto acumulado

#### Cierre del Día (`getEndOfDaySummaryAction` en `sales.actions.ts`)
- `propinas` acumula igual que Z-report; `propinaCount` cuenta transacciones
- Modal "Cierre del Día" muestra `Propinas (N): +$X.XX`

#### Control de Caja (`closeCashRegisterAction` en `cash-register.actions.ts`)
- **Bug corregido**: `salesAgg._sum.total` era 0 para PROPINA COLECTIVA (su `total=0`)
- Fix: agrega `tipsAgg._sum.amountPaid` de órdenes `customerName='PROPINA COLECTIVA'`
- `expectedCash = openingCashUsd + totalSalesUsd + totalTipsUsd - totalExpenses`
- Modal de cierre en `caja-view.tsx` muestra línea "🪙 Propinas (N): +$X.XX" obtenida via `getEndOfDaySummaryAction` en `useEffect` cuando se abre el modal

#### Regla permanente
> **PROPINA COLECTIVA siempre usa `amountPaid`, nunca `total`.** El campo `total` es 0 por diseño (no es una venta de producto). Cualquier lógica que agregue ingresos de propina debe usar `_sum.amountPaid` filtrado por `customerName='PROPINA COLECTIVA'`, no `_sum.total`.

### 18.9 Correcciones Responsive — RedmiPad 2 + Desktop (2026-04-11)

**Target devices**: RedmiPad 2 landscape 1200×2000px, Desktop 1920×1080px.

**Breakpoints activos** (tailwind.config.ts):
- `md:` = 768px — sidebar visible, main padding 24px
- `lg:` = 1024px — paneles desktop POS activos
- `tablet-land:` = 1200px — **breakpoint custom para tablet landscape** (antes sin uso)
- `xl:` = 1280px — NO activa a 1200px (RedmiPad 2)

#### 18.9.1 Modo Pantalla Completa (commits a6e4623)

- **`ui.store.ts`**: `posFullscreen: boolean` + `togglePosFullscreen()` añadidos al `UIState`
- **`DashboardShell.tsx`** (Client Component nuevo en `components/layout/`):
  - Fullscreen: `h-screen w-screen overflow-hidden`, sin Sidebar/Navbar, botón flotante `z-[80]` "Salir POS" (bottom-right)
  - Normal: renderiza Sidebar + Navbar + `<main p-4 md:p-6>`
  - Recibe `sidebar` como prop (JSX del Server Component layout.tsx)
- **`dashboard/layout.tsx`**: importa DashboardShell, pasa `<Sidebar ...>` como prop, ya no importa Navbar directamente
- **`Navbar.tsx`**: botón fullscreen toggle (SVG expand/compress) en barra de acciones derecha

#### 18.9.2 POS Restaurante — layout 3 paneles (commit 0f5f2ab)

- Panel izquierdo (mesas): `lg:w-64 tablet-land:w-64 xl:w-72` (antes `lg:w-72 xl:w-80`)
- Panel derecho (cuenta): `lg:w-[380px] tablet-land:w-[380px] xl:w-[440px]` (antes `lg:w-[420px] xl:w-[480px]`)
- A 1200px: menú pasa de ~188px a ~308px de ancho
- Grilla de productos: `tablet-land:grid-cols-4` añadido (antes solo `xl:grid-cols-4` que no activaba a 1200px)

#### 18.9.3 Delivery + PedidosYA — doble header eliminado (commit efd32ea)

**Problema**: Headers `fixed top-0 z-30` de las páginas POS quedaban ocultos detrás del Navbar `sticky z-40`. El body `pt-16/pt-24` creaba blank gap visible.

**Solución**: Ambas páginas importan `useUIStore`:
```tsx
const { posFullscreen } = useUIStore();
```

- **Fullscreen** (comportamiento anterior): `fixed top-0 w-full z-30`, body `h-screen pt-16/pt-24`
- **Normal**: header `relative w-full z-[31]` (en flow), body `flex-1 min-h-0`, root `flex-1 -m-4 md:-m-6 h-[calc(100vh-4rem)]` (negative margins cancelan padding del main)

Ambas páginas también tienen `tablet-land:grid-cols-4` en su grilla de productos.
PedidosYA: panel derecho `w-80 tablet-land:w-96 xl:w-96`.

#### 18.9.4 Historial de Ventas — scroll horizontal (commit d8fa308)

- `<table className="w-full min-w-[900px]">` en `sales/page.tsx`
- El wrapper `overflow-x-auto` ya existía; el `min-w` evita compresión de columnas

### 18.10 Subcuentas en POS Restaurante y Mesero (2026-04-11)

#### Schema Prisma (commit d9dfc85)
- `TabSubAccount`: división de un `OpenTab` en hasta 25 subcuentas; campos `subtotal`, `serviceCharge` (10%), `total`, `paidAmount`, `status (OPEN|PAID|VOID)`
- `SubAccountItem`: vincula un `SalesOrderItem` a una `TabSubAccount`; `quantity` puede ser parcial (ej. 1 de 3 del mismo ítem)
- `PaymentSplit.subAccountId`: FK nullable — `null` = cobro de mesa completa (comportamiento existente), set = cobro de subcuenta
- Migración manual SQL en `prisma/migrations/20260411000000_add_tab_sub_accounts/migration.sql` (sin `prisma migrate dev` por shadow DB no disponible)

#### Server Actions (commit b72a9bb) — `src/app/actions/pos.actions.ts`
| Action | Descripción |
|--------|-------------|
| `createSubAccountsAction` | Crea N subcuentas con labels personalizados (máx 25) |
| `renameSubAccountAction` | Renombra una subcuenta |
| `deleteSubAccountAction` | Elimina subcuenta (solo si OPEN y sin ítems pagados) |
| `assignItemToSubAccountAction` | Asigna qty parcial de un SalesOrderItem a una subcuenta |
| `unassignItemFromSubAccountAction` | Desasigna un ítem de una subcuenta |
| `autoSplitEqualAction` | División round-robin igualitaria (crea subcuentas + reparte ítems) |
| `paySubAccountAction` | Cobra una subcuenta; cierra mesa si todas pagadas y saldo ≤ 0.01 |
| `getOpenTabWithSubAccountsAction` | Deep include subcuentas → ítems → order ítems → modifiers |

#### Componente UI (commits e5340a1, 9fc4954)
- `src/components/pos/SubAccountPanel.tsx` — Client Component con sub-componentes top-level `PoolItemRow` y `SubAccountCard`
- División rápida: botones 2/3/4/5/6 llaman `autoSplitEqualAction`
- Pool: ítems sin asignar o parcialmente asignados — no bloquean cierre de mesa
- Cobro por subcuenta: selector de método, toggle +10% servicio, input monto
- Integrado en **POS Restaurante** (`restaurante/page.tsx`): botón "÷ Dividir cuenta" en header del tab activo; alterna con panel de cobro normal (state `subAccountMode`)
- Integrado en **POS Mesero** (`mesero/page.tsx`): botón "÷ Dividir cuenta" en bloque "Total cuenta"; mesonero crea labels y asigna ítems sin acceso a cobro principal

#### Reglas de diseño
- Labels editables inline (click en nombre → input, Enter confirma)
- Modificadores siempre siguen al ítem principal
- Cocina no ve subcuentas — comanda normal
- Pool sin asignar se cobra con el botón principal de la mesa (flow existente)

### 18.11 Bugfixes POS — z-index, carrito compartido, pre-cuenta (2026-04-11)

#### commit 24f7799 — fix(pos): 3 bugs en restaurante/delivery/pedidosya

**Bug 1 — `z-60` → `z-[60]` en todos los modales POS**

`z-60` no existe en la escala Tailwind (va hasta `z-50`; no había entry en `tailwind.config.ts`). Sin z-index efectivo, los modales renderizan en `z-index: auto` y quedan detrás del Sidebar (`z-50`) y bottom nav mobile (`z-50`). El síntoma: clicar "+" Propina abría el modal pero éste era invisible (detrás del Sidebar).

Archivos corregidos:
| Archivo | Ocurrencias |
|---------|-------------|
| `pos/restaurante/page.tsx` | 6 modales (propina, mesa, abrir tab, PIN pago, eliminar ítem, modificador) |
| `pos/delivery/page.tsx` | 3 (WhatsApp parser, modificador, propina) |
| `pos/pedidosya/page.tsx` | 1 (modificador) |

commit `77fa94a` — también corregido en `dashboard/usuarios/users-view.tsx` (1 ocurrencia).

**Bug 2 — Carrito compartido entre mesas (`resetTableState`)**

`cart` era un `useState` global nunca limpiado al cambiar de mesa. `setCart([])` solo se llamaba tras `handleSendToTab` o `handleCheckoutPickup`. Resultado: ítems de Mesa A permanecían en carrito al abrir Mesa B y se enviaban a la cuenta equivocada.

Solución: nueva función `resetTableState()` en `restaurante/page.tsx` que limpia:
```typescript
setCart([])
setDiscountType("NONE")
setAuthorizedManager(null)
setMixedPaymentsTable([])
setIsTableMixedMode(false)
setCortesiaPercent("100")
setAmountReceived("")
setSubAccountMode(false)
setCheckoutTip("")
```
Llamada en 3 puntos: selección de mesa, cambio de zona, cierre de modal de mesa (backdrop click).

**Bug 3 — Pre-cuenta mostraba descuento falso**

`handlePrintPrecuenta` usaba `base = activeTab.balanceDue` como subtotal de la pre-cuenta. `balanceDue` disminuye con pagos parciales, por lo que si la mesa había pagado $30 de $100, la pre-cuenta mostraba: ítems=$100, subtotal=$70 → diferencia de $30 aparecía como descuento.

Fix: `base = activeTab.runningTotal` — campo que siempre refleja el total de todos los consumos sin importar pagos intermedios. `runningTotal` ya existía en el tipo `OpenTabSummary` (línea 102 del componente).

Adicionalmente: `discountType` tampoco se reseteaba al cambiar mesa → pre-cuenta de Mesa B heredaba el descuento DIVISAS_33 configurado para Mesa A. Resuelto por `resetTableState()`.

#### Diagnóstico: PKP (Propinas Colectivas) en totalFacturado vs totalCobrado

`recordCollectiveTipAction` crea un `SalesOrder` con `total=0` y `amountPaid=tipAmount`. En `getSalesHistoryAction` (y en `sales/page.tsx` donde se calculan los totales del header):

```typescript
// sales/page.tsx línea 258-267
acc.invoiced  += s.totalFactura ?? s.total ?? 0;  // PKP: += 0
acc.collected += s.totalCobrado ?? s.total ?? 0;  // PKP: += tipAmount
```

Para un PKP de $10: `totalFactura=0`, `totalCobrado=10`, `propina=10`.

**Resultado**: `totalCobrado > totalFacturado` por el monto exacto de todas las propinas colectivas del período. Esto es **comportamiento por diseño** — las propinas no son ventas facturadas, pero sí ingreso recibido. La diferencia entre ambos totales = servicio 10% + propinas. El Z-report los trata de forma separada con `totalTips` explícito.

### 18.12 Separación de responsabilidades — validateManagerPinAction vs validateCashierPinAction (2026-04-12)

#### Contexto

Existían dos funciones de validación de PIN en `pos.actions.ts`. `validateCashierPinAction` tenía `AREA_LEAD` y `CASHIER` en su filtro de roles, lo que permitía a cajeras y jefes de área "autorizar" operaciones que deben ser exclusivamente gerenciales. Además, `sales/page.tsx` (anulaciones) llamaba a `validateCashierPinAction` en lugar de `validateManagerPinAction`.

#### Regla definitiva

| Función | Roles que acceden | Propósito único |
|---------|------------------|-----------------|
| `validateManagerPinAction` | `OWNER`, `ADMIN_MANAGER`, `OPS_MANAGER` | Autorizar descuentos, cortesías, pagos, **anulaciones** |
| `validateCashierPinAction` | `OWNER`, `ADMIN_MANAGER`, `OPS_MANAGER` | Trazabilidad de sesión de caja (`updateSessionCashier`) |

**Regla**: `CASHIER` y `AREA_LEAD` no autorizan operaciones sensibles. Solo pueden identificarse para la trazabilidad de su sesión de caja — y eso solo si usan el mismo PIN que uno de los roles permitidos (actualmente ambas funciones usan los mismos 3 roles).

#### Cambios aplicados (commit `80253d0`)

1. **`pos.actions.ts`** — `validateCashierPinAction`: eliminados `'AREA_LEAD'` y `'CASHIER'` del filtro `role: { in: [...] }`. Ambas funciones usan ahora exactamente los mismos roles (`OWNER`, `ADMIN_MANAGER`, `OPS_MANAGER`). La diferencia es el efecto secundario: solo `validateCashierPinAction` llama a `updateSessionCashier`.

2. **`sales/page.tsx`** — `handleVoidPinConfirm` (anulaciones): cambiado de `validateCashierPinAction` a `validateManagerPinAction`. El import correspondiente también actualizado.

#### Mapa completo de uso de PINs en la UI

| Archivo | Función | Flujo |
|---------|---------|-------|
| `pos/restaurante/page.tsx` | `validateManagerPinAction` | Cortesía, pago checkout |
| `pos/delivery/page.tsx` | `validateManagerPinAction` | Descuento / cortesía |
| `pos/mesero/page.tsx` | `validateManagerPinAction` | Autorización subcuentas |
| `dashboard/sales/page.tsx` | `validateManagerPinAction` | **Anulaciones** (corregido) |
| (solo si aplica) | `validateCashierPinAction` | Registro de sesión cajera |

### 18.13 Export Excel Arqueo — Formato completo ExcelJS (2026-04-12)

#### Commit `08e6969` — feat(arqueo): Excel de arqueo con formato completo, 24 columnas y estilo oscuro

El botón **EXPORTAR EXCEL** en `/dashboard/ventas` genera un `.xlsx` desde el servidor via `/api/arqueo?date=` sin depender de plantilla externa.

#### Arquitectura del flujo

```
sales/page.tsx
  └─ handleExportArqueo()
       └─ GET /api/arqueo?date=YYYY-MM-DD      (route.ts)
            ├─ getSalesForArqueoAction(date)    (sales.actions.ts)
            └─ buildArqueoWorkbookFromTemplate(sales, dateStr)  (arqueo-excel-utils.ts)
                 └─ devuelve ExcelJS.Buffer → descarga .xlsx
```

#### Estructura del workbook

**Sección 1 — Resumen (filas 1-14)**: Totales del día por método de pago, auto-calculados. Celdas en blanco para entradas manuales (Capital Inicio, Egresos, BCV).

| Filas | Contenido |
|-------|-----------|
| 1 | Título con fecha |
| 2 | Labels de sub-secciones (Cash $, Cash €, Cash Bs) |
| 3-4 | Capital Dólares Inicio / Cash $ Ingreso (auto) / Egreso / Cerrado |
| 5-6 | Capital Euro Inicio / Cash € Ingreso EN$ (auto) / Egreso / Cerrado |
| 7-8 | Capital Bs Inicio / Cash Bs Ingreso EN$ (auto) / Egreso / Cerrado |
| 9-10 | Vuelto PM / PM Shanklish EN$ (auto) |
| 11-12 | PDV Shanklish EN$ (auto) / PDV Superferro EN$ (auto) / Zelle (auto) / Servicio 10% |
| 13-14 | Total Ingreso $ (auto, verde grande) / PM Nour (auto) / PedidosYA (auto) / BCV manual |

**Sección 2 — Detalle (fila 15+)**: 24 columnas, filas congeladas en fila 15.

```
A  Item · B Descripción · C Correlativo · D Total Ingreso $ · E Total Gasto $
F  Cash $ In · G Cash $ Out · H Cash € In · I Cash € Out
J  Cash Bs In · K Cash Bs Out · L Zelle
M  Vuelto PM Bs · N Vuelto PM $ · O PM Bs Shanklish · P PM $ Shanklish
Q  PM Bs Nour · R PM $ Nour · S PDV Shanklish Bs · T PDV Shanklish $
U  PDV Superferro Bs · V PDV Superferro $ · W Servicio 10% · X Propina Extra
```

Filas agrupadas en bloques por tipo:
- `▸ MESAS — RESTAURANTE` (orders con `orderType === 'RESTAURANT'`)
- `▸ PICKUP / PARA LLEVAR`
- `▸ DELIVERY`
- `▸ PEDIDOS YA` (detectado por `orderType === 'PEDIDOSYA'` o `sourceChannel === 'POS_PEDIDOSYA'`)

Cada bloque tiene su **fila de subtotal** en verde oscuro y un separador visual. Al final: **TOTAL GENERAL DEL DÍA** en verde intenso.

#### Paleta de colores (todos ARGB)

| Uso | Color |
|-----|-------|
| Fondo título / datos | `FF0D1117` (casi negro) |
| Sección labels | `FF161B22` |
| Encabezados columna | `FF1B3A5C` (azul oscuro) |
| Encabezado de bloque | `FF1A2A3A` |
| Subtotal de bloque | `FF0A3D2B` (verde oscuro) |
| Total general | `FF052E16` (verde muy oscuro) |
| Labels / valores clave | `FFFBBF24` (ámbar) |
| Totales numéricos | `FF86EFAC` (verde claro) |
| Celdas entrada manual | `FF21262D` (gris oscuro) |

#### Cambios en ArqueoSaleRow (sales.actions.ts)

- `orderType` expandido: `'RESTAURANT' | 'PICKUP' | 'DELIVERY' | 'PEDIDOSYA'`
- `paymentBreakdown` añade `cashEur: number` y `cashBs: number`
- Separación de pagos: `CASH`/`CASH_USD` → `cashUsd`, `CASH_EUR` → `cashEur`, `CASH_BS` → `cashBs`
- PEDIDOSYA detectado por `orderType === 'PEDIDOSYA' || sourceChannel === 'POS_PEDIDOSYA'`

#### Librerías usadas

- **ExcelJS** `^4.4.0` — única librería activa para generación server-side
- `xlsx` (`^0.18.5`) sigue en `package.json` pero solo se usa en el fallback cliente `export-arqueo-excel.ts` (no en el flujo principal)
- El archivo `public/templates/arqueo-plantilla.xlsx` ya no se usa — `buildArqueoWorkbookFromTemplate` genera desde cero siempre

### 18.6 Skills Instalados en `.claude/skills/`

Estos archivos son cargados automáticamente en toda sesión de Claude Code:

| Skill | Archivo | Uso |
|-------|---------|-----|
| Frontend Design | `frontend-design.md` | Guía estética para componentes UI — tipografía, color, motion, layout |
| Vercel React Best Practices | `vercel-react-best-practices.md` | 69 reglas de performance React/Next.js (waterfalls, bundle, re-renders) |
| Error Handling Patterns | `error-handling-patterns.md` | Patrones de manejo de errores TypeScript — Result types, Circuit Breaker |
| PostgreSQL Table Design | `postgresql-table-design.md` | Diseño de esquemas PostgreSQL — tipos, índices, constraints, partitioning |

**Ubicación**: `C:\Users\Usuario\Desktop\SHANKLISH ERP 3.0\.claude\skills\`

### 18.14 Mejoras flujo POS Restaurante — 4 cambios (2026-04-12)

#### Branch: `claude/review-pos-workflow-hEEWh`

---

#### Cambio 1 — Modal apertura de mesa sin campos obligatorios (commit `6122a00`)

**Archivo**: `src/app/dashboard/pos/restaurante/page.tsx`

- Eliminado el campo **Teléfono del cliente** del modal "Abrir cuenta" — estado `openTabPhone` removido por completo junto con su validación y el parámetro `customerPhone` en `openTabAction`.
- El campo **Nombre del cliente** pasa a ser opcional (label `(opcional)`, ya no `*`). Si está vacío, se usa `"Cliente"` como default.
- El botón "✓ Abrir cuenta" solo se deshabilita durante `isProcessing`; ya no depende de que haya texto en ningún campo.
- **Campos que quedan**: Nombre (opcional), Número de personas (spinner), Mesonero asignado (select).

---

#### Cambio 2 — Número de mesa en factura impresa (commit `4c36741`)

**Archivos**: `src/lib/print-command.ts`, `src/app/dashboard/pos/restaurante/page.tsx`

- `ReceiptData` (print-command.ts) recibe nuevo campo `tableLabel?: string`.
- El HTML térmico imprime una línea `Mesa: [valor]` inmediatamente debajo del correlativo, solo si `tableLabel` está presente.
- `printReceipt` se llama con `tableLabel: selectedTable?.name` en:
  - Pago real (`handlePaymentPinConfirm`) — línea ~820
  - Pre-cuenta (`handlePrintPrecuenta`) — línea ~900
- El flujo de Pickup no pasa `tableLabel` (no tiene mesa física).

---

#### Cambio 3 — Pickup tipo mesa con tabs persistentes (commit `86d8d5b`)

**Archivo**: `src/app/dashboard/pos/restaurante/page.tsx`

**Interfaz añadida**:
```typescript
interface PickupTabLocal {
  id: string;           // UUID (crypto.randomUUID)
  pickupNumber: string; // "PK-01", "PK-02"... editable en modal
  customerName: string; // opcional
  customerPhone: string; // opcional
  cart: CartItem[];     // carrito guardado al cambiar de contexto
}
```

**Estado nuevo**: `pickupTabs: PickupTabLocal[]`, `activePickupTabId: string | null`, modal fields (`newPickupNumber`, `newPickupName`, `newPickupPhone`).

**Derivado**: `activePickupTab = useMemo(() => pickupTabs.find(t => t.id === activePickupTabId))`.

**Flujo**:
1. Clic "🛍️ Venta Directa / Pickup" → abre modal con número auto-generado `PK-NN` (editable), nombre y teléfono opcionales.
2. Confirmar → crea `PickupTabLocal` con cart vacío, lo activa, limpia carrito.
3. Items se acumulan en `cart` (estado global) como antes.
4. **Al cambiar de contexto** (pickup→mesa, mesa→pickup, pickup→otro pickup): `saveActivePickupCart(cart)` guarda `cart` en `pickupTabs[activeId].cart` antes de `resetTableState()`.
5. Sidebar muestra lista de tabs abiertos (`PK-01 · Juan · $12.50`); clic activa el tab y restaura su carrito; `×` descarta el tab.
6. Botón "COBRAR" idéntico al anterior (`handleCheckoutPickup`). Al éxito: elimina el tab completado de `pickupTabs`, activa el siguiente si existe, sale de pickup mode si no quedan tabs.

**Funciones añadidas**: `openPickupModal()`, `handleCreatePickupTab()`, `handleSelectPickupTab(tabId)`, `handleDiscardPickupTab(tabId)`, `saveActivePickupCart(cart)`.

**No requiere cambios en backend** — `createSalesOrderAction` no cambia; el tab de pickup es puramente frontend.

---

#### Cambio 4 — Factura: descuento divisas visible y línea de propina (commit `b5abd37`)

**Archivos**: `src/lib/print-command.ts`, `src/app/dashboard/pos/restaurante/page.tsx`

**4a — Descuento divisas siempre visible**:
- Antes: `hideDiscount=true` (DIVISAS_33) suprimía completamente la línea de descuento → factura mostraba subtotal=$20, TOTAL=$13.33 sin explicación.
- Ahora: siempre se imprime si `discountAmount > 0`. Label: `data.discountReason` si existe, o `'Desc. divisas (33.33%)'` si `hideDiscount=true`, o `'Descuento aplicado'` como fallback.
- Código: `${discountAmount > 0 ? \`...(data.discountReason || (data.hideDiscount ? 'Desc. divisas (33.33%)' : 'Descuento aplicado'))...\` : ''}`

**4b — Propina en recibo**:
- `ReceiptData` recibe `tipAmount?: number`.
- Si `tipAmount > 0`, se imprime línea informativa `Propina: $XX.XX` después del bloque TOTAL/TOTAL A PAGAR.
- En el pago de mesa (`handlePaymentPinConfirm`): `tipVal` se calcula antes de `printReceipt` y se pasa como `tipAmount`; luego se llama `recordCollectiveTipAction` con el mismo valor (sin cambio funcional).
- En checkout pickup (`handleCheckoutPickup`): `pickupTipVal = parseFloat(checkoutTip) || 0` se pasa como `tipAmount` en `pickupReceiptData`.

---

### 18.23 Bugfixes críticos — subcuentas loop + propina/vuelto (2026-04-15)

#### Branch: `claude/review-pos-workflow-hEEWh` — commit `bb2c42e`

---

#### Bug A — Subcuentas: bucle infinito de carga

**Síntoma**: Al hacer clic en el botón de subcuentas, la pantalla entraba en un bucle de carga infinita; la única salida era "Atrás" en el navegador.

**Causa raíz**:
- `onTabUpdated={() => loadData()}` en `restaurante/page.tsx` (línea ~1968) llamaba `loadData()`.
- `loadData()` ejecuta `setIsLoading(true)`.
- El `if (isLoading)` early-return en línea 1179 desmontaba `SubAccountPanel`.
- Al re-montar, `useEffect` disparaba `loadTab()` → `onTabUpdatedRef.current()` → `loadData()` → desmonte de nuevo → **bucle**.

**Fix** (`src/app/dashboard/pos/restaurante/page.tsx`):
```typescript
// NUEVO: refresco ligero — NO setea isLoading
const refreshLayoutSilently = async () => {
  const layoutResult = await getRestaurantLayoutAction();
  if (layoutResult.success && layoutResult.data) {
    setLayout(layoutResult.data as SportBarLayout);
  }
};

// Antes: onTabUpdated={() => loadData()}
// Ahora:
onTabUpdated={refreshLayoutSilently}
```

`refreshLayoutSilently` actualiza `layout` (el grid de mesas) sin tocar `isLoading`, rompiendo el ciclo de desmonte/remonte.

---

#### Bug B — Z-report: vuelto sumado como propina en mesas/subcuentas

**Síntoma**: El Z-report mostraba propinas que en realidad eran vuelto (cambio) que el cajero devolvió al cliente.

**Causa raíz**:
- `registerOpenTabPaymentAction` y `paySubAccountAction` guardaban `paidAmount: data.amount` — el monto BRUTO recibido del cliente (incluyendo el vuelto que se devuelve).
- El Z-report calcula: `tabTip = Σ paidAmount − totalFactura`. Si `paidAmount = $25` para una cuenta de `$22`, `tabTip = $3` → contado como propina aunque sean $3 de vuelto.

**Fix** (`src/app/actions/pos.actions.ts`):

En `registerOpenTabPaymentAction`:
```typescript
// Antes: paidAmount: data.amount (monto bruto)
// Ahora: paidAmount: appliedAmount (neto = lo que queda en caja)
paidAmount: appliedAmount,  // Math.min(data.amount, effectiveBalance)
```

En `paySubAccountAction`:
```typescript
// Neto = subtotal + (servicio si aplica) — excluye vuelto
const expectedAmount = sub.subtotal + (data.serviceFeeIncluded ? sub.serviceCharge : 0);
const netAmount = Math.min(data.amount, expectedAmount);
// ...
paidAmount: netAmount,  // tanto en TabSubAccount como en PaymentSplit
```

**Efecto**: `totalCobrado = Σ paidAmount = totalFactura` cuando no hay propina real → `tabTip = 0`. El badge "PAGADA $XX.XX" en subcuentas muestra el monto neto de la factura.

**Fórmula invariante** (`sales.actions.ts`):
- Para mesas (tabs): `tabTip = Math.max(0, totalCobrado - totalFactura)` → ahora solo sube si el cliente explícitamente dejó propina extra.
- Para delivery/pickup no-tab: `orderTip = (o.change === 0 && amountPaid > o.total)` — sin cambios (el campo `change` para estos órdenes sigue siendo el mecanismo correcto).

---

### 18.24 Fecha caja + Z-report + auditoría OPUS vs código (2026-04-15)

#### Branch: `claude/review-pos-workflow-hEEWh` — commits `08b7ac7` + `2beda42`

---

#### Fix 1 — Control de Caja: fecha seleccionable (`08b7ac7`)

**Problema**: `openCashRegisterAction` usaba siempre `hoy` como `shiftDate`; no había forma de registrar una caja de un día anterior.

**Fix**:
- `openCashRegisterAction` acepta `shiftDateStr?: string` (formato `YYYY-MM-DD`). Si se omite, usa hoy en zona Caracas (comportamiento anterior).
- Modal "Abrir Caja" en `caja-view.tsx` añade campo `<input type="date">` pre-rellenado con hoy. Permite registrar cajas de días pasados.

---

#### Fix 2 — Z-report / Cierre del día: tabs abiertos inflaban totales (`08b7ac7`)

**Problema**: `getZReportData` y `getEndOfDaySummaryAction` filtraban `status: notIn CANCELLED` pero incluían mesas OPEN/PARTIALLY_PAID. Para esas mesas sin splits pagados el código asumía `totalCobrado = totalFactura`, contando como cobrado lo que aún estaba pendiente.

**Fix**: Filtro cambiado a `paymentStatus: 'PAID'` en el `findMany` de ambas funciones. Este valor:
- Incluye todas las órdenes efectivamente cobradas (delivery, pickup, mesas cerradas, propinas colectivas).
- Excluye anuladas (`paymentStatus: 'REFUNDED'`) y tabs sin cerrar (`PARTIAL`/`PENDING`) automáticamente.

---

#### Fix 3 — Z-report: null-safety en campo `change` (`08b7ac7`)

`o.change === 0` fallaba para registros legacy con `change = null` en BD.
Cambiado a `(o.change ?? 0) === 0` en ambas funciones Z-report/cierre del día.

---

#### Bugs encontrados en auditoría OPUS vs código real (`2beda42`)

Al comparar el OPUS con el código de la rama se detectaron 3 fixes documentados en la rama `master` que **no estaban aplicados** en esta rama de feature:

| # | Archivo | Bug | Fix aplicado |
|---|---------|-----|-------------|
| 1 | `pos.actions.ts` | `paySubAccountAction` deducía `sub.total` (incluye serviceCharge) de `balanceDue`, sobre-deduciendo el saldo | Cambiado a `sub.subtotal` |
| 2 | `print-command.ts` | Factura térmica pasaba de "Subtotal" a "TOTAL" sin mostrar el subtotal neto tras el descuento | Añadida línea `Subtotal con desc.: $XX.XX` cuando `discountAmount > 0` |
| 3 | `delivery/page.tsx` | `CurrencyCalculator` recibía `deliveryFee` aunque `finalTotal` ya lo incluye → suma doble en la calculadora Bs | Eliminado prop `deliveryFee` en ambas instancias (header modal + panel inline) |

**Nota**: Estos fixes existían en la rama `master` (commits `a95232e`, `786668d`, `bd19d04`) pero no habían sido portados a esta rama de feature. Ya aplicados en `2beda42`.

---

#### Estado OPUS vs código — verificación completa

| Sección | Claim | Estado |
|---------|-------|--------|
| 18.12 — `validateCashierPinAction` sin CASHIER/AREA_LEAD | `role: { in: ['OWNER','ADMIN_MANAGER','OPS_MANAGER'] }` | ✓ Confirmado |
| 18.14 C1 — `customerPhone` eliminado del modal de mesa | Call a `openTabAction` sin `customerPhone` | ✓ Confirmado |
| 18.14 C2 — `tableLabel` en factura térmica | `ReceiptData.tableLabel?: string` + línea Mesa: | ✓ Confirmado |
| 18.14 C4 — `tipAmount` en factura térmica | `ReceiptData.tipAmount?: number` + línea Propina: | ✓ Confirmado |
| 18.23 A — `refreshLayoutSilently` en restaurante/page | Función presente, `onTabUpdated={refreshLayoutSilently}` | ✓ Confirmado |
| 18.23 B — `paidAmount: netAmount` en subcuentas | Tanto en `TabSubAccount` como en `PaymentSplit` | ✓ Confirmado |
| 18.23 B — `balanceDue - sub.subtotal` | **Faltaba → aplicado en 2beda42** | ✓ Corregido |
| 18.x — "Subtotal con desc." en factura | **Faltaba → aplicado en 2beda42** | ✓ Corregido |
| 18.x — `deliveryFee` duplicado en CurrencyCalculator | **Faltaba → aplicado en 2beda42** | ✓ Corregido |

---

*Actualizado el 2026-04-15 — Shanklish ERP / Cápsula SaaS — Documento Completo*
*44 modelos Prisma · 47 módulos · 48 actions · 4 API routes · 3 services · 24 componentes*
*Commits sesión: e5340a1 9fc4954 d269c74 24f7799 77fa94a 08e6969 80253d0 6122a00 4c36741 86d8d5b b5abd37 bb2c42e 2d8a2c2 08b7ac7 2beda42*
