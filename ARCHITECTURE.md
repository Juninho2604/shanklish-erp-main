# 🏗️ Shanklish Caracas ERP - Arquitectura del Sistema

## 📋 Tabla de Contenidos
1. [Visión General](#visión-general)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Estructura de Carpetas](#estructura-de-carpetas)
4. [Módulos del Sistema](#módulos-del-sistema)
5. [Jerarquía de Usuarios](#jerarquía-de-usuarios)
6. [Modelo de Datos](#modelo-de-datos)

---

## Visión General

Sistema ERP personalizado para gestión integral de operaciones de restauración y manufactura de alimentos, diseñado para escalar desde el módulo de Gerencia Operativa hasta módulos financieros completos.

### Principios de Diseño
- **Modularidad**: Cada módulo es independiente pero integrado
- **Escalabilidad**: Arquitectura preparada para crecimiento
- **Auditoría**: Todo cambio crítico queda registrado
- **Type-Safety**: TypeScript end-to-end con Prisma + tRPC + Zod

---

## Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|------------|---------|-----------|
| Frontend | Next.js | 14.x | App Router, RSC, SSR |
| API Layer | tRPC | 11.x | Type-safe API calls |
| ORM | Prisma | 5.x | Database access, migrations |
| Database | PostgreSQL | 15+ | Primary data store |
| Auth | NextAuth.js | 5.x | Authentication & sessions |
| UI | Shadcn/ui | latest | Component library |
| Validation | Zod | 3.x | Schema validation |
| State | Zustand | 4.x | Client state management |
| Charts | Recharts | 2.x | Data visualization |

---

## Estructura de Carpetas

```
shanklish-erp/
├── prisma/
│   ├── schema.prisma          # Esquema de base de datos
│   ├── seed.ts                # Datos iniciales
│   └── migrations/            # Historial de migraciones
│
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/           # Grupo de rutas de autenticación
│   │   │   ├── login/
│   │   │   └── forgot-password/
│   │   │
│   │   ├── (dashboard)/      # Área protegida principal
│   │   │   ├── layout.tsx    # Layout con sidebar/navbar
│   │   │   ├── page.tsx      # Dashboard home
│   │   │   │
│   │   │   ├── operaciones/  # 🎯 MÓDULO GERENCIA OPERATIVA (Fase 1)
│   │   │   │   ├── inventario/
│   │   │   │   │   ├── insumos/
│   │   │   │   │   ├── subrecetas/
│   │   │   │   │   └── productos/
│   │   │   │   ├── recetas/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   └── nueva/
│   │   │   │   ├── produccion/
│   │   │   │   ├── mermas/
│   │   │   │   └── costos/
│   │   │   │
│   │   │   ├── administracion/  # Módulo futuro
│   │   │   │   ├── usuarios/
│   │   │   │   ├── roles/
│   │   │   │   └── configuracion/
│   │   │   │
│   │   │   ├── finanzas/        # Módulo futuro
│   │   │   │   ├── ingresos/
│   │   │   │   ├── egresos/
│   │   │   │   ├── cuentas/
│   │   │   │   └── reportes/
│   │   │   │
│   │   │   ├── rrhh/            # Módulo futuro
│   │   │   │   ├── empleados/
│   │   │   │   ├── nomina/
│   │   │   │   └── asistencia/
│   │   │   │
│   │   │   └── reportes/        # Reportes globales
│   │   │
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts
│   │   │   └── auth/[...nextauth]/route.ts
│   │   │
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── server/               # Lógica del servidor
│   │   ├── api/
│   │   │   ├── root.ts       # Router principal tRPC
│   │   │   ├── trpc.ts       # Configuración tRPC
│   │   │   └── routers/
│   │   │       ├── auth.ts
│   │   │       ├── users.ts
│   │   │       ├── inventory.ts
│   │   │       ├── recipes.ts
│   │   │       ├── production.ts
│   │   │       └── costs.ts
│   │   │
│   │   ├── db/
│   │   │   └── index.ts      # Cliente Prisma singleton
│   │   │
│   │   └── services/         # Lógica de negocio
│   │       ├── recipe.service.ts
│   │       ├── cost.service.ts
│   │       ├── inventory.service.ts
│   │       └── production.service.ts
│   │
│   ├── lib/                  # Utilidades compartidas
│   │   ├── utils.ts
│   │   ├── validations/
│   │   │   ├── recipe.schema.ts
│   │   │   ├── inventory.schema.ts
│   │   │   └── user.schema.ts
│   │   └── constants/
│   │       ├── roles.ts
│   │       └── units.ts
│   │
│   ├── components/           # Componentes UI
│   │   ├── ui/              # Shadcn components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── Footer.tsx
│   │   ├── forms/
│   │   ├── tables/
│   │   └── charts/
│   │
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useInventory.ts
│   │   └── useRecipes.ts
│   │
│   ├── stores/              # Zustand stores
│   │   ├── auth.store.ts
│   │   └── ui.store.ts
│   │
│   └── types/               # TypeScript types
│       ├── index.ts
│       ├── api.types.ts
│       └── enums.ts
│
├── public/
│   ├── logo.svg
│   └── icons/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Módulos del Sistema

### Fase 1: Gerencia Operativa (Activa - En Mejora Continua)
- ✅ Inventario Multi-nivel (áreas: restaurante, almacén, producción)
- ✅ Recetas/BOM con sub-recetas (FINISHED_GOOD, SUB_RECIPE, RAW_MATERIAL)
- ✅ Cálculo de costos (COGS) - con recálculo manual por botón
- ✅ Control de mermas/yield
- ✅ Órdenes de producción
- ✅ Transferencias entre almacenes (Requisiciones) - con flujo: Solicitud → Despacho → Recepción
- ✅ Procesamiento de Proteínas (desposte multi-paso con plantillas)
- ✅ Inventario Diario - apertura/cierre con items críticos por área
- ✅ Auditorías de inventario retroactivas
- ✅ Órdenes de Compra (con carga vía WhatsApp/OCR)
- ✅ Préstamos entre operaciones
- ✅ Historial de Movimientos

### Módulo POS (Punto de Venta) - En Integración Activa
- ✅ POS Restaurante - interfaz de cajera con categorías y modificadores
- ✅ Menú con categorías, precios editables, activar/desactivar items
- ✅ Órdenes de venta con descuento de inventario automático (por receta)
- ✅ Métodos de pago: BS_POS, ZELLE, CASH_USD, MOBILE_PAY
- ✅ Descuento automático 33% para pagos en divisas (Zelle/Efectivo USD)
- ✅ Cortesías con % variable (0-100%) + descripción + autorización por PIN
- ✅ Impresión de tickets (factura + comanda de cocina)
- 🔄 Recetas vinculadas a Menú - auto-creación al agregar plato (EN PROGRESO)
- 🔄 Descargo de inventario por receta al procesar venta (EN PROGRESO)
- ⏳ POS Delivery - pendiente de integración completa
- ⏳ Reportes de ventas detallados

### Fase 2: Administración
- ✅ Gestión de usuarios (CRUD básico)
- ✅ Roles y permisos (OWNER, OPS_MANAGER, CHEF, AREA_LEAD, etc.)
- ✅ PIN de autorización para acciones sensibles
- ⏳ Configuración del sistema

### Fase 3: Finanzas
- ⏳ Ingresos y egresos
- ⏳ Cuentas por pagar/cobrar
- ⏳ Reportes financieros
- ⏳ Facturación

### Fase 4: RRHH
- ⏳ Gestión de empleados
- ⏳ Nómina
- ⏳ Control de asistencia

---

## Prioridades Actuales (Marzo 2026)

### Prioridad 1 - Completar Integración POS ↔ Recetario
- **Problema**: Los platos del Menú no tienen recetas creadas → no hay descargo automático de inventario
- **Solución**: Al crear plato en Menú → auto-crear stub de receta → el chef completa los ingredientes
- **Filtro de faltantes**: Módulo de Recetas muestra qué platos del Menú no tienen receta aún

### Prioridad 2 - Módulo Inventario Diario
- Apertura de día con inventario de productos críticos
- Jefes de cocina/producción pueden crear productos nuevos al hacer transferencias
- Al crear producto de venta final sin receta → auto-crear stub de receta
- Aviso de coordinación de nomenclatura al crear productos nuevos

---

## Jerarquía de Usuarios

```
Nivel 1: OWNER (Dueños)
   └── Acceso total al sistema
   └── Puede ver módulos financieros sensibles
   └── Gestiona otros usuarios OWNER

Nivel 2: AUDITOR
   └── Solo lectura a TODOS los módulos
   └── Acceso a reportes y logs de auditoría
   └── No puede modificar datos

Nivel 3: ADMIN_MANAGER (Gerente Administrativo)
   └── Gestión de usuarios (excepto OWNER/AUDITOR)
   └── Módulos financieros
   └── Configuración del sistema

Nivel 4: OPS_MANAGER (Gerente Operativo)
   └── Módulo de operaciones completo
   └── Aprobación de recetas
   └── Gestión de inventario
   └── Reportes operativos

Nivel 5: HR_MANAGER (RRHH)
   └── Módulo de RRHH
   └── Nómina
   └── Gestión de personal

Nivel 6: CHEF (Chef/Cocinero)
   └── Ver y crear recetas
   └── Registrar producción
   └── Ver inventario (solo lectura)

Nivel 7: AREA_LEAD (Jefe de Área)
   └── Registrar uso de insumos
   └── Reportar mermas
   └── Ver inventario de su área
```

---

## Modelo de Datos

Ver archivo `prisma/schema.prisma` para el esquema completo.

### Diagrama ER Simplificado

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   User      │────▶│   AuditLog   │     │   Supplier      │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                                          │
       ▼                                          ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Permission  │     │  Inventory   │◀────│  PurchaseOrder  │
└─────────────┘     │    Item      │     └─────────────────┘
                    └──────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │  RAW_MAT   │  │ SUB_RECIPE │  │  PRODUCT   │
    │ (Insumos)  │  │(Intermedio)│  │  (Final)   │
    └────────────┘  └────────────┘  └────────────┘
                           │               │
                           ▼               ▼
                    ┌──────────────────────────┐
                    │    Recipe (BOM)          │
                    │  ┌────────────────────┐  │
                    │  │ RecipeIngredient   │  │
                    │  │ - quantity         │  │
                    │  │ - unit             │  │
                    │  │ - yield_percentage │  │
                    │  └────────────────────┘  │
                    └──────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────────┐
                    │   CostHistory            │
                    │   - cost_per_unit        │
                    │   - effective_date       │
                    │   - calculated_cogs      │
                    └──────────────────────────┘
```
