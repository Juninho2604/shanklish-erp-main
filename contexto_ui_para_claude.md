# Contexto de Interfaz de Usuario (UI) - ERP Sport Bar "Table Pong"

Este archivo describe con precisión las capturas de pantalla de la interfaz del sistema para que Claude u otras herramientas sin visión puedan entender el layout y las opciones disponibles.

## Layout General
El sistema tiene una disposición clásica de Dashboard:
- **Barra Lateral Izquierda (Sidebar):** Contiene el menú principal de navegación con el logo "Table Pong | ERP Sport Bar" arriba, y perfil de usuario abajo.
- **Top Bar:** Muestra la sección actual (Ej: "Módulo de Operaciones"), un ícono de campana (notificaciones), barra de búsqueda ("Buscar... Ctrl+K") y la fecha actual ("martes, 24 de marzo").
- **Área Principal (Content):** Muestra el contenido de la pestaña seleccionada.

## Desglose de la Barra Lateral (Sidebar)

### Sección: OPERACIONES
- Dashboard
- Inventario Diario
- **Inventario** (Sección expandible, actualmente abierta)
  - Auditorías
  - **Ciclos de inventario** (Actualmente seleccionado, resaltado)
  - Transferencias
  - Historial Mensual
- Préstamos
- Recetas
- Producción
- Costos
- Compras
- Menú
- Aliados Comerciales
- POS Sport Bar
- POS Deck VIP

### Sección: ADMINISTRACIÓN
- Usuarios
- Roles y Permisos
- Almacenes
- Tasa de Cambio
- Módulos por Usuario
- Anuncios gerencia
- SKU Studio

### Footer del Sidebar
- Perfil del usuario actual:
  - Nombre: "Admin Tab..."
  - Rol: "Dueño" (en un badge morado claro).
  - Íconos de acción: Una llave dorada 🔑 y una puerta 🚪 (probablemente para cerrar sesión o configuraciones de acceso).

## Área Principal: "Ciclos de inventario" (Ruta: /dashboard/inventario/ciclos)
En la parte superior hay un breadcrumb: <- Inventario | Auditorías | Inventario diario.

**Título de la página:** Ciclos de inventario
**Descripción:** "Un ciclo agrupa un período (semanal, quincenal o mensual). Al cerrar el ciclo, el sistema guarda una foto del stock en cada almacén (ítem x área). Ventas, transferencias, auditorías y movimientos siguen en el historial, puedes consultarlos por fecha en los reportes habituales."

### Tarjeta Principal: Ciclo abierto
- Tiene un borde de color mostaza/naranja claro.
- **Título interior:** Ciclo abierto
- **Detalles:** 
  - Semana 22-03 al 29-03
  - Tipo: WEEKLY - Inicio: 22/3/2026, 3:30:11 a. m.
- **Formulario:**
  - Label: "NOTAS AL CERRAR (OPCIONAL)"
  - Input text: placeholder "Ej: Corte domingo noche"
  - Botón (naranja, full width dentro del form): "Cerrar ciclo y guardar snapshot"

### Tabla de "Historial de ciclos" (Debajo de la tarjeta)
Columnas:
1. **Nombre:** "Semana 22-03 al 29-03"
2. **Tipo:** "WEEKLY"
3. **Cierre:** "— abierto —"
4. **Filas snapshot:** "0"
5. **Acción:** Link/Botón verde "Ver detalle"

# MÁS PANTALLAS (Segunda Tanda)

## 1. Módulo: Anuncios gerencia
Ruta/Sección destacada en sidebar: ADMINISTRACIÓN > Anuncios gerencia
**Título principal:** Anuncios a gerencia
**Descripción:** "Los mensajes activos aparecen en 🔔 (esquina superior derecha) para todos los usuarios del dashboard."

**Tarjeta 1: Nuevo comunicado**
- Campo de texto: TÍTULO
- Área de texto: MENSAJE
- Botón (naranja, alineado a la izquierda): Publicar

**Tarjeta 2: Historial**
- Contenido actual: "Sin mensajes aún" (Empty state)

## 2. Módulo: SKU Studio
Ruta/Sección destacada en sidebar: ADMINISTRACIÓN > SKU Studio
**Título principal:** SKU Studio
**Descripción:** "Creación guiada de productos con familias y plantillas. Solo dueño o admin Table Pong. Pensado para restaurantes con alta rotación de carta."

**Navegación tipo Tabs (pestañas superiores):**
- Nuevo SKU (Activa, color diferente)
- Familias
- Plantillas

**Formulario: Nuevo producto / SKU**
- NOMBRE DEL ÍTEM: (Placeholder: "Ej. Pechuga deshuesada MAP")
- PLANTILLA (OPCIONAL): Botón "Sin plantilla". Subtítulo: "Al elegir plantilla se rellenan tipo, unidad y prefijo; puedes ajustar después con los chips."
- FAMILIA / CATEGORÍA: Menú desplegable (Dropdown) con valor "- Sin familia -"
- TIPO DE INVENTARIO (Botones de selección/Chips): 
  - Materia prima (Seleccionado, color oscuro)
  - Sub receta / compuesto
  - Producto final
- ROL OPERATIVO (OPCIONAL) (Chips):
  - Ninguno (Seleccionado)
  - Insumo base
  - Intermedio
  - Compuesto
  - Final venta
  - Se transforma
- UNIDAD BASE (Chips): KG, G, L, ML, UNIT, PORTION
- SEGUIMIENTO DE STOCK (Chips):
  - Por unidad (Seleccionado)
  - Receta
  - Compuesto
  - Solo display
- Checkbox: Bebida (marca para reportes de bar)
- Inputs de texto paralelos (2 columnas):
  - PREFIJO SKU (OPCIONAL) (Placeholder: "EJ. CARN")
  - COSTO INICIAL (OPCIONAL)
- Botón final de envío: Crear Ítem en Inventario (Oscuro, full width parcial)

## 3. Módulo: Módulos por Usuario
Ruta/Sección destacada en sidebar: ADMINISTRACIÓN > Módulos por Usuario
**Título principal:** Módulos por Usuario
**Descripción:** "Selecciona un usuario para configurar qué módulos del sistema puede ver en su menú. Si usas acceso por rol, el sistema aplica las reglas predeterminadas del rol."

**Layout interno de 2 columnas:**
**Columna izquierda: Usuarios Activos (7)**
Lista de tarjetas de usuarios. Cada tarjeta muestra nombre, correo, ROL (badge gris/blanco) y badge de "personalizado" en amarillo si aplica.
Listado visible:
- Carlos Gebran (OWNER)
- Christian Giaimo (AUDITOR)
- Hender Osorio (ADMIN_MANAGER) - *badge personalizado*
- Admin Table Pong (OWNER)
- Caja1 Table Pong (CASHIER_RESTAURANT) - *badge personalizado*
- Jose Manuel ostos (ADMIN_MANAGER) - *badge personalizado*
- caja 2 table pong (CASHIER_RESTAURANT) - *badge personalizado*

**Columna derecha (Panel de edición):**
- Estado vacío: "Selecciona un usuario de la lista" con borde punteado (dashed).

## 4. Módulo: Almacenes
Ruta/Sección destacada en sidebar: ADMINISTRACIÓN > Almacenes
**Título principal:** Almacenes
**Descripción:** "OFICINA, BARRA, DEPOSITO BARRA, DEPOSITO STORE y más."

**Botones de acción (Superior derecha):**
- Analizar Duplicados (Botón mostaza/naranja)
- + Nuevo Almacén (Botón oscuro)

**Tabla Principal**
Columnas: NOMBRE, DESCRIPCIÓN, ESTADO, ACCIONES
Filas listadas:
- ALMACEN PRINCIPAL | Almacén principal (Comida + Plásticos) | Badge "Inactivo" (rojo claro) | Acción: Activar
- Almacén Principal | Almacén de insumos | Badge "Inactivo" | Acción: Activar
- BARRA | Barra principal | Badge "Inactivo" | Acción: Activar
- BARRA PRINCIPAL | Barra principal | Badge "Activo" (verde claro) | Acción: Desactivar
- Barra Principal | Área de descarga principal del POS sport bar | Badge "Inactivo" | Acción: Activar
- DEPOSITO BARRA | Depósito de barra | Badge "Inactivo" | Acción: Activar
- DEPOSITO STORE | Depósito tienda | Badge "Activo" | Acción: Desactivar
- OFICINA | Oficina principal | Badge "Inactivo" | Acción: Activar

