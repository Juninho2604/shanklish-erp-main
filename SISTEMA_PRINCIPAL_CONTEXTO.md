# SHANKLISH ERP – Sistema Principal en Producción

> **Contexto:** Este es el sistema ERP principal de Shanklish Caracas (restaurante de comida árabe/mediterránea en Venezuela). Se encuentra en **producción** y es la versión de referencia para cualquier otro proyecto o modelo.

---

## 1. ¿Qué es y para qué sirve?

**SHANKLISH ERP** es un sistema de gestión empresarial para restaurantes que integra:

- **Punto de venta (POS)** – Restaurante, Delivery y Pickup
- **Inventario** – Stock por áreas, movimientos, transferencias
- **Recetas y producción** – Costos, descargo automático
- **Compras y proveedores**
- **Ventas, historial y cierres de caja**
- **Usuarios, roles y trazabilidad**

Sirve para operar el restaurante de forma integrada: desde la venta en caja hasta el descargo de inventario, el control de costos y el arqueo de caja.

---

## 2. Stack técnico

| Tecnología | Uso |
|------------|-----|
| **Next.js 14** | Framework React con App Router |
| **Prisma** | ORM, PostgreSQL |
| **NextAuth / JWT** | Autenticación |
| **Tailwind CSS** | Estilos |
| **ExcelJS / XLSX** | Exportación a Excel |
| **Vercel** | Hosting |

---

## 3. Módulos y lógica

### 3.1 POS Restaurante (`/dashboard/pos/restaurante`)

**Función:** Punto de venta para mesas del restaurante (sala principal).

**Lógica principal:**
- **Layout de mesas:** Zonas (Bar, Terraza, etc.) → Mesas/estaciones
- **OpenTab (cuenta abierta):** Una mesa = una cuenta. Se abre con nombre y teléfono del cliente
- **Consumos:** Se agregan productos al carrito y se envían a la cuenta. Se pueden agregar varias tandas sin cerrar
- **Correlativo fijo:** Se usa `tabCode` (ej. TAB-2026-03-16-001) como correlativo de factura. No cambia al agregar consumos
- **Pagos:** Efectivo, Zelle, Tarjeta (Punto), Pago Móvil, Transferencia
- **10% servicio:** Opcional. Checkbox "Incluir 10% servicio". Solo aplica en sala principal (no Delivery ni Pickup). Se guarda si el cliente pagó o no
- **Descuento divisas:** 33.33% cuando paga en efectivo o Zelle
- **Apertura de caja:** Una vez al día (localStorage). Botón "Cambiar cajera" para cambio de turno
- **Pickup:** Modo venta directa sin mesa (mismo POS, sin abrir cuenta)
- **Impresión:** Comanda a cocina, factura al registrar pago

**Flujo:** Abrir mesa → Agregar consumos → Registrar pago(s) → Cerrar cuenta

---

### 3.2 POS Delivery (`/dashboard/pos/delivery`)

**Función:** Punto de venta para pedidos a domicilio.

**Lógica principal:**
- **Delivery fee:** $4.50 normal, $3 en divisas (Zelle/Efectivo)
- **Descuento 33.33%** en pago con divisas
- **Sin 10% servicio**
- Dirección, teléfono y nombre del cliente obligatorios
- Impresión de factura solo después de confirmar la venta

---

### 3.3 Historial de Ventas (`/dashboard/sales`)

**Función:** Ver ventas, reimprimir facturas, anular, generar reportes.

**Lógica principal:**
- **Agrupación por mesa:** Las órdenes RESTAURANT con el mismo `openTabId` se muestran como una sola venta
- **Columna 10% Serv.:** Indica si el cliente pagó el servicio (Sí/No/-)
- **Reimpresión:** Respeta si se cobró o no el 10% de servicio
- **Reporte Z (cierre):** Resumen del día: ventas brutas, descuentos, arqueo por método de pago
- **Exportar a Excel:** Reporte Z y Arqueo de caja
- **Arqueo:** Usa plantilla Excel (`public/templates/arqueo-plantilla.xlsx`) y rellena datos preservando formato y colores

---

### 3.4 Inventario (`/dashboard/inventario`)

**Función:** Gestionar insumos, stock por áreas y movimientos.

**Lógica principal:**
- **Items:** SKU, nombre, tipo (RAW_MATERIAL, SUB_RECIPE, FINISHED_GOOD), unidad, mínimo, punto de reorden
- **Ubicaciones:** Stock por Área (ej. BARRA, OFICINA, COCINA)
- **Movimientos:** PURCHASE, SALE, PRODUCTION_IN/OUT, ADJUSTMENT, TRANSFER, WASTE
- **Costo:** Promedio ponderado al registrar compras
- **Descargo:** Automático al vender (vía recetas) o al producir

---

### 3.5 Inventario Diario (`/dashboard/inventario/diario`)

**Función:** Cierre diario de inventario por área.

**Lógica principal:**
- Apertura, entradas, cierre físico
- Items críticos por área
- Conteos y ajustes

---

### 3.6 Transferencias (`/dashboard/transferencias`)

**Función:** Mover stock entre áreas.

**Lógica principal:**
- Requisición: Área origen → Área destino
- Estados: PENDING → DISPATCHED → RECEIVED
- Trazabilidad de quién despachó y quién recibió

---

### 3.7 Requisiciones

**Función:** Solicitar insumos de un área a otra.

**Lógica principal:**
- Solicitud → Aprobación → Despacho → Recepción
- Múltiples ítems por requisición

---

### 3.8 Recetas (`/dashboard/recetas`)

**Función:** Definir recetas con insumos y porciones.

**Lógica principal:**
- **Ingredientes:** Item, cantidad, unidad
- **Costo:** Calculado por ingredientes (costo unitario × cantidad)
- **Descargo:** Al vender un producto del menú, se descuenta según la receta
- **Sub-recetas:** Recetas que usan otras recetas como ingredientes

---

### 3.9 Menú y Modificadores (`/dashboard/menu`)

**Función:** Productos del menú y opciones (modificadores).

**Lógica principal:**
- **MenuCategory** → **MenuItem** (productos)
- **Modificadores:** Grupos (ej. "Tamaño") con opciones (ej. "Grande", +$2)
- Los modificadores pueden tener ajuste de precio
- Un ítem puede tener varios grupos de modificadores

---

### 3.10 Producción (`/dashboard/produccion`)

**Función:** Órdenes de producción (elaborar sub-recetas o productos).

**Lógica principal:**
- Crear orden → Descontar ingredientes → Aumentar producto terminado
- Estados: PENDING, IN_PROGRESS, COMPLETED

---

### 3.11 Proteínas (`/dashboard/proteinas`)

**Función:** Procesamiento de carnes (ej. cortar, marinar).

**Lógica principal:**
- Entrada de materia prima → Procesamiento → Salida (cortes, subproductos)
- Plantillas de procesamiento reutilizables

---

### 3.12 Compras (`/dashboard/compras`)

**Función:** Órdenes de compra a proveedores.

**Lógica principal:**
- Crear orden → Recibir → Registrar en inventario
- Proveedores y ítems por proveedor

---

### 3.13 Costos (`/dashboard/costos`)

**Función:** Historial de costos, importación, análisis.

**Lógica principal:**
- CostHistory por ítem
- Costo promedio ponderado en compras
- Importación desde Excel

---

### 3.14 Préstamos (`/dashboard/prestamos`)

**Función:** Préstamos de inventario entre áreas o a terceros.

**Lógica principal:**
- Registrar préstamo → Devolución
- Trazabilidad de quién prestó y quién devolvió

---

### 3.15 Auditorías (`/dashboard/inventario/auditorias`)

**Función:** Conteos físicos y ajustes por diferencia.

**Lógica principal:**
- Crear auditoría → Conteo → Resolver diferencias
- Historial de auditorías

---

### 3.16 Cargar Ventas (`/dashboard/ventas/cargar`)

**Función:** Registrar ventas manuales (ej. de otro sistema o históricas).

**Lógica principal:**
- Ingreso manual de ventas con método de pago
- Descargo de inventario asociado

---

### 3.17 Comandera Cocina (`/kitchen`)

**Función:** Pantalla para cocina con órdenes pendientes.

**Lógica principal:**
- Ver órdenes en tiempo real
- Estados: PENDING, PREPARING, READY
- API para actualizar estado

---

### 3.18 Usuarios y Roles (`/dashboard/usuarios`, `/dashboard/config/roles`)

**Función:** Gestión de usuarios y permisos.

**Roles principales:**
| Rol | Descripción |
|-----|-------------|
| OWNER | Acceso total |
| AUDITOR | Solo lectura |
| ADMIN_MANAGER | Gestión administrativa |
| OPS_MANAGER | Operaciones y producción |
| CHEF | Recetas, producción, inventario |
| AREA_LEAD | Jefe de área |
| CASHIER_RESTAURANT | POS Restaurante |
| CASHIER_DELIVERY | POS Delivery |
| KITCHEN_CHEF | Comandera cocina |

**Autenticación:** JWT en cookie, sesión 24h. PIN de 4–6 dígitos para autorizaciones rápidas (descuentos, anulaciones).

---

## 4. Modelo de datos (resumen)

- **User, Area, Branch** – Usuarios y estructura
- **InventoryItem, InventoryLocation, InventoryMovement** – Inventario
- **Recipe, RecipeIngredient, ProductionOrder** – Recetas y producción
- **MenuCategory, MenuItem, MenuModifierGroup, MenuModifier** – Menú
- **SalesOrder, SalesOrderItem** – Ventas
- **OpenTab, PaymentSplit, TableOrStation, ServiceZone** – POS Restaurante (mesas y cuentas)
- **Requisition, RequisitionItem** – Requisiciones
- **PurchaseOrder, Supplier** – Compras
- **DailyInventory, InventoryAudit, InventoryLoan** – Cierres, auditorías, préstamos
- **AuditLog** – Trazabilidad de cambios

---

## 5. Reglas de negocio importantes

1. **10% servicio:** Solo en sala principal (RESTAURANT). Opcional. Se guarda en `PaymentSplit.splitLabel` con marcador `| +10% serv`
2. **Descuento divisas:** 33.33% cuando paga en efectivo o Zelle
3. **Delivery fee:** $4.50 normal, $3 en divisas
4. **Correlativo mesa:** `tabCode` (TAB-YYYY-MM-DD-NNN) para facturas de restaurante
5. **Apertura caja:** Una vez al día, localStorage con fecha
6. **Control anti-fraude:** No imprimir factura sin registrar venta; delivery sin imprimir antes de confirmar

---

## 6. Archivos clave

| Módulo | Archivos principales |
|--------|----------------------|
| POS | `pos.actions.ts`, `pos/restaurante/page.tsx`, `pos/delivery/page.tsx` |
| Ventas | `sales.actions.ts`, `sales/page.tsx` |
| Inventario | `inventory.service.ts`, `inventory.actions.ts` |
| Recetas | `recipe.actions.ts` |
| Menú | `menu` (Prisma models), modificadores |
| Arqueo/Excel | `arqueo-excel-utils.ts`, `export-z-report.ts`, `api/arqueo/route.ts` |
| Auth | `auth.ts`, `permissions.ts` |

---

*Documento generado para dar contexto a otros modelos o proyectos que trabajen con este sistema.*
