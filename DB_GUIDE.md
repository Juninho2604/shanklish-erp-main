# 📚 Guía de Base de Datos - Shanklish ERP

Esta guía te ayudará a navegar por tus datos en **Prisma Studio**.

## 👥 Usuarios y Seguridad
### `User`
Contiene a todo el personal con acceso al sistema.
- **role**: Define permisos. `OWNER` (Dueño), `ADMIN_MANAGER` (Gerente), `TOREADOR` (Cajero/Mesero - a veces llamado CHEF en el sistema antiguo).
- **pin**: Código numérico para autorizar descuentos y anulaciones (Solo gerentes).

---

## 💰 Ventas y Caja
### `SalesOrder` (Orden de Venta)
Es la tabla más importante para el flujo de caja. Cada fila representa una operación de venta (factura).
- **orderNumber**: El número visible en el recibo (Ej: `REST-1001`).
- **status**: Estado actual (`PENDING`, `CONFIRMED`, `CANCELLED`).
- **paymentMethod**: Cómo pagaron (`CASH`, `CARD`, `MOBILE_PAY`, `TRANSFER`).
- **discountType**: Si hubo descuento (`DIVISAS_33`, `CORTESIA_100`).
- **items**: Relación a los productos vendidos en esta orden.

### `SalesOrderItem` (Items Vendidos)
El desglose de cada orden. Si una orden tiene 3 platos, habrá 3 filas aquí vinculadas a esa orden.
- **itemName**: Nombre del producto al momento de la venta.
- **modifiers**: Relación con los modificadores elegidos (Ej: "Sin cebolla", "Queso Feta").

---

## 🍽️ Gestión de Menú
### `MenuItem` (Productos)
Tu catálogo de productos.
- **price**: Precio base en dólares.
- **isActive**: Si `false`, no aparece en el POS.
- **sku**: Código interno (útil para inventario).

### `MenuModifierGroup` (Grupos de Opciones)
Define las preguntas que hace el POS al seleccionar un producto.
- **Ejemplo**: Para "Tabla x1", habrá grupos como "Elige 3 Principales", "Elige 2 Cremas".
- **minSelections / maxSelections**: Reglas de cuántas opciones debe elegir el cliente.

### `MenuModifier` (Opciones)
Las respuestas posibles a los grupos.
- Ej: "Hummus", "Babaganoush", "Falafel".

---

## 📦 Inventario (Avanzado)
### `InventoryItem`
Ingredientes brutos (Harina, Aceite, Garbanzos).

### `Recipe` (Recetas)
Conecta `MenuItem` con `InventoryItem`. Define cuánto se descuenta del inventario al vender un plato.
