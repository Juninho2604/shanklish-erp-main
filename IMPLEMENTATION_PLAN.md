# 🔧 SHANKLISH ERP 3.0 — PLAN DE IMPLEMENTACIÓN DETALLADO

> **Fecha:** 25 de Febrero 2026  
> **Stack:** Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL (AWS RDS) + Tailwind CSS  
> **Despliegue:** Vercel (push a GitHub → deploy automático)  
> **Nota para el modelo:** Cada sección es un problema independiente. Léelas en orden, pero pueden implementarse de forma aislada. Todos los paths son relativos a la raíz del proyecto.

---

## TABLA DE CONTENIDOS

1. [Costeo Dinámico en Procesamiento de Proteínas](#1-costeo-dinámico-en-procesamiento-de-proteínas)
2. [Plantillas de Procesamiento](#2-plantillas-de-procesamiento)
3. [Creación Rápida de Productos en Buscadores](#3-creación-rápida-de-productos-en-buscadores)
4. [Transferencias con Validación Escalonada](#4-transferencias-con-validación-escalonada)
5. [Recepción Directa desde Órdenes de Compra](#5-recepción-directa-desde-órdenes-de-compra)
6. [UI/UX Móvil: Buscadores Amigables](#6-uiux-móvil-buscadores-amigables)
7. [Integración WhatsApp: Parser de Pedidos](#7-integración-whatsapp-parser-de-pedidos)

---

## 1. COSTEO DINÁMICO EN PROCESAMIENTO DE PROTEÍNAS

### Problema
Al completar un procesamiento de proteínas (ej: Lomito → Carne Macerada de Shawarma), el costo del sub-producto **NO** se actualiza automáticamente. Esto significa que el costo de la "Carne de Shawarma" no refleja el costo real del lomito + rendimiento del proceso.

### Archivos Involucrados
| Archivo | Rol |
|---------|-----|
| `src/app/actions/protein-processing.actions.ts` | **MODIFICAR** - Función `completeProteinProcessingAction` (línea 327-462) |
| `src/app/actions/cost.actions.ts` | **CONSULTAR** - Función `updateItemCostAction` (línea 319-360) como referencia |
| `prisma/schema.prisma` | **CONSULTAR** - Modelos `ProteinProcessing` (línea 355), `ProteinSubProduct` (línea 408), `CostHistory` (línea 241) |

### Estado Actual del Código

La función `completeProteinProcessingAction` en `protein-processing.actions.ts` (líneas 327-462) actualmente:
1. ✅ Descuenta la proteína original del inventario (líneas 356-384)
2. ✅ Agrega los sub-productos al inventario (líneas 387-433)
3. ✅ Marca el procesamiento como completado (líneas 436-444)
4. ❌ **NO calcula ni registra el costo de los sub-productos**

El campo `estimatedCost` existe en `ProteinSubProduct` (schema línea 427) pero no se usa.

### Lógica de Costeo a Implementar

```
Fórmula:
  costoTotalMateriaPrima = costoUnitarioLomito × pesoCongelado
  costoPorKgSubproducto = costoTotalMateriaPrima / sumaTotal_pesos_subproductos (proporcional al peso)
  costoUnitarioSubproducto = (peso_subproducto / sumaTotal_pesos_subproductos) × costoTotalMateriaPrima / peso_subproducto
  
Simplificado:
  costoUnitarioSubproducto (por kg) = costoTotalMateriaPrima / totalSubProducts
  
Ejemplo:
  - Lomito cuesta $10/kg, peso congelado: 20kg → Costo total = $200
  - Subproductos: Carne Macerada (15kg), Hueso (3kg), Grasa (2kg) → Total = 20kg
  - Costo por kg de subproducto = $200 / 20kg = $10/kg
  
  Pero el desperdicio se compensa:
  - drainedWeight = 18kg (perdió 2kg de agua)
  - totalSubProducts = 15kg (carne) + 1.5kg (grasa útil) = 16.5kg
  - wasteWeight = 18 - 16.5 = 1.5kg
  
  Entonces el costo REAL por kg de subproducto útil:
  costoRealPorKg = costoTotalMateriaPrima / totalSubProducts = $200 / 16.5 = $12.12/kg
```

### Cambios Exactos en `protein-processing.actions.ts`

Dentro de la función `completeProteinProcessingAction`, **DESPUÉS** del bloque que agrega subproductos al inventario (después de la línea 433 y ANTES de la línea 436 "Marcar procesamiento como completado"), insertar el siguiente bloque:

```typescript
// 2.5 CALCULAR Y REGISTRAR COSTOS DE SUB-PRODUCTOS
// Obtener el costo actual de la materia prima
const sourceCostRecord = await tx.costHistory.findFirst({
    where: {
        inventoryItemId: processing.sourceItemId,
        effectiveTo: null // Costo vigente
    },
    orderBy: { effectiveFrom: 'desc' }
});

if (sourceCostRecord && processing.totalSubProducts > 0) {
    // Costo total de la materia prima usada
    const totalSourceCost = sourceCostRecord.costPerUnit * processing.frozenWeight;
    
    // Distribuir el costo proporcionalmente al peso de cada subproducto
    for (const subProduct of processing.subProducts) {
        if (subProduct.outputItemId && subProduct.weight > 0) {
            // Costo proporcional: (peso del subproducto / peso total subproductos) * costo total
            const proportionalCost = (subProduct.weight / processing.totalSubProducts) * totalSourceCost;
            // Costo por unidad base (KG generalmente)
            const costPerUnit = proportionalCost / subProduct.weight;
            
            // Actualizar estimatedCost en ProteinSubProduct
            await tx.proteinSubProduct.update({
                where: { id: subProduct.id },
                data: { estimatedCost: proportionalCost }
            });
            
            // Cerrar el costo anterior del item
            await tx.costHistory.updateMany({
                where: {
                    inventoryItemId: subProduct.outputItemId,
                    effectiveTo: null
                },
                data: { effectiveTo: new Date() }
            });
            
            // Crear nuevo registro de costo
            await tx.costHistory.create({
                data: {
                    inventoryItemId: subProduct.outputItemId,
                    costPerUnit: parseFloat(costPerUnit.toFixed(4)),
                    currency: sourceCostRecord.currency,
                    isCalculated: true,
                    costBreakdown: JSON.stringify({
                        sourceItemId: processing.sourceItemId,
                        sourceItemName: processing.sourceItem.name,
                        sourceCostPerUnit: sourceCostRecord.costPerUnit,
                        frozenWeight: processing.frozenWeight,
                        totalSourceCost,
                        subProductWeight: subProduct.weight,
                        totalSubProductsWeight: processing.totalSubProducts,
                        processingCode: processing.code,
                        calculatedAt: new Date().toISOString()
                    }),
                    reason: `Costo calculado por procesamiento ${processing.code} (${processing.sourceItem.name} → ${subProduct.name})`,
                    createdById: session.id
                }
            });
        }
    }
}
```

### Notas Importantes
- El campo `isCalculated` ya existe en `CostHistory` (schema línea 248) — usarlo para distinguir costos automáticos de manuales.
- El campo `costBreakdown` ya existe como `String?` (schema línea 249) — guardar JSON con la trazabilidad completa.
- El campo `estimatedCost` ya existe en `ProteinSubProduct` (schema línea 427) — actualizarlo para vista rápida.

---

## 2. PLANTILLAS DE PROCESAMIENTO

### Problema
Al crear un procesamiento, el buscador de sub-productos muestra TODOS los items del inventario. Esto permite combinaciones absurdas como "Lomito → Refresco".

### Solución
Crear un sistema de **Plantillas** que defina qué sub-productos son válidos para cada materia prima.

### Cambios en Base de Datos (`prisma/schema.prisma`)

Agregar estos modelos **al final del archivo** (antes de cerrar):

```prisma
// ============================================================================
// PLANTILLAS DE PROCESAMIENTO DE PROTEÍNAS
// ============================================================================

model ProcessingTemplate {
  id              String   @id @default(cuid())
  name            String   // Ej: "Desposte de Res", "Desposte de Pollo"
  description     String?
  
  // Item fuente (materia prima)
  sourceItemId    String
  sourceItem      InventoryItem @relation("TemplateSource", fields: [sourceItemId], references: [id])
  
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Sub-productos permitidos
  allowedOutputs  ProcessingTemplateOutput[]
  
  @@index([sourceItemId])
}

model ProcessingTemplateOutput {
  id              String   @id @default(cuid())
  templateId      String  
  template        ProcessingTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  
  // Item de salida permitido
  outputItemId    String
  outputItem      InventoryItem @relation("TemplateOutput", fields: [outputItemId], references: [id])
  
  // Peso esperado (referencia para el usuario)
  expectedWeight  Float?     // Peso promedio esperado en KG
  expectedUnits   Int?       // Unidades esperadas
  sortOrder       Int        @default(0)
  
  @@unique([templateId, outputItemId])
  @@index([templateId])
}
```

### IMPORTANTE: Actualizar InventoryItem

En el modelo `InventoryItem` (línea 108-158 del schema), agregar estas dos relaciones nuevas:

```prisma
  // Plantillas de Procesamiento
  templateSources    ProcessingTemplate[]       @relation("TemplateSource")
  templateOutputs    ProcessingTemplateOutput[] @relation("TemplateOutput")
```

### Después de modificar el schema, ejecutar:
```bash
npx prisma db push
# O si prefieres migración formal:
npx prisma migrate dev --name add_processing_templates
```

### Nuevo Server Action: `src/app/actions/protein-processing.actions.ts`

Agregar estas funciones al archivo:

```typescript
// ============================================================================
// ACTION: GESTIÓN DE PLANTILLAS DE PROCESAMIENTO
// ============================================================================

export async function getProcessingTemplatesAction() {
    try {
        const templates = await prisma.processingTemplate.findMany({
            where: { isActive: true },
            include: {
                sourceItem: { select: { id: true, name: true, sku: true } },
                allowedOutputs: {
                    include: {
                        outputItem: { select: { id: true, name: true, sku: true, baseUnit: true } }
                    },
                    orderBy: { sortOrder: 'asc' }
                }
            },
            orderBy: { name: 'asc' }
        });
        return templates;
    } catch (error) {
        console.error('Error en getProcessingTemplatesAction:', error);
        return [];
    }
}

export async function getTemplateBySourceItemAction(sourceItemId: string) {
    try {
        const template = await prisma.processingTemplate.findFirst({
            where: { 
                sourceItemId, 
                isActive: true 
            },
            include: {
                allowedOutputs: {
                    include: {
                        outputItem: { 
                            select: { id: true, name: true, sku: true, baseUnit: true, category: true } 
                        }
                    },
                    orderBy: { sortOrder: 'asc' }
                }
            }
        });
        return template;
    } catch (error) {
        console.error('Error en getTemplateBySourceItemAction:', error);
        return null;
    }
}

export async function createProcessingTemplateAction(input: {
    name: string;
    description?: string;
    sourceItemId: string;
    outputs: { outputItemId: string; expectedWeight?: number; expectedUnits?: number }[];
}): Promise<{ success: boolean; message: string }> {
    const session = await getSession();
    if (!session?.id) return { success: false, message: 'No autorizado' };

    try {
        await prisma.processingTemplate.create({
            data: {
                name: input.name,
                description: input.description,
                sourceItemId: input.sourceItemId,
                allowedOutputs: {
                    create: input.outputs.map((o, i) => ({
                        outputItemId: o.outputItemId,
                        expectedWeight: o.expectedWeight,
                        expectedUnits: o.expectedUnits,
                        sortOrder: i
                    }))
                }
            }
        });

        revalidatePath('/dashboard/proteinas');
        return { success: true, message: 'Plantilla creada exitosamente' };
    } catch (error) {
        console.error('Error creando plantilla:', error);
        return { success: false, message: 'Error al crear plantilla' };
    }
}
```

### Cambios en UI: `src/app/dashboard/proteinas/protein-processing-view.tsx`

En el formulario de creación de procesamiento, cuando el usuario seleccione un `sourceItem`:

1. Llamar a `getTemplateBySourceItemAction(sourceItemId)`
2. Si existe plantilla → filtrar el buscador de sub-productos para mostrar SOLO los `allowedOutputs`
3. Si NO existe plantilla → mostrar todos los items (comportamiento actual) con un aviso: "⚠️ No hay plantilla definida. Se muestran todos los productos."
4. También mostrar opción "Administrar Plantillas" desde la página de proteínas (UI de gestión de plantillas)

---

## 3. CREACIÓN RÁPIDA DE PRODUCTOS EN BUSCADORES

### Problema
No se puede crear un producto nuevo "al vuelo" cuando se está en medio de una transferencia, compra o producción. El usuario tiene que salir del módulo, ir a inventario, crear el producto, y volver.

### Archivos Involucrados
| Archivo | Rol |
|---------|-----|
| `src/components/ui/combobox.tsx` | **MODIFICAR** — Agregar botón "Crear Nuevo" |
| `src/app/actions/inventory.actions.ts` | **YA EXISTE** — Función `createQuickItem` (línea 7-54) |

### Estado Actual

La función `createQuickItem` en `inventory.actions.ts` (líneas 7-54) ya existe y funciona. Genera un SKU automático y crea el item. Lo que falta es **conectarla al combobox**.

### Cambios en `src/components/ui/combobox.tsx`

1. **Agregar nueva prop** `onCreateNew` al componente:

```typescript
interface ComboboxProps {
    items: ComboboxItem[]
    value?: string
    onChange: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    emptyMessage?: string
    className?: string
    modal?: boolean
    // NUEVAS PROPS:
    allowCreate?: boolean  // Habilitar botón de crear nuevo
    onCreateNew?: (searchTerm: string) => void  // Callback cuando quiere crear
    createLabel?: string   // "Crear nuevo producto", etc.
}
```

2. **En la zona de "sin resultados"** (línea 148-151 actual), modificar para mostrar el botón:

```tsx
{filteredItems.length === 0 ? (
    <div className="py-4 text-center">
        <p className="text-sm text-gray-500 mb-2">{emptyMessage}</p>
        {allowCreate && onCreateNew && search.trim() && (
            <button
                type="button"
                onClick={() => {
                    onCreateNew(search.trim())
                    setOpen(false)
                    setSearch("")
                }}
                className="inline-flex items-center gap-2 px-4 py-2 mt-1 text-sm font-medium 
                           text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 
                           dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30
                           transition-colors"
            >
                <Plus className="h-4 w-4" />
                {createLabel || `Crear "${search.trim()}"`}
            </button>
        )}
    </div>
) : (
    // lista normal...
)}
```

3. **También** mostrar el botón al final de la lista cuando hay resultados pero el usuario podría querer algo nuevo:

```tsx
{/* Después de la lista de items filtrados y antes del cierre del div */}
{allowCreate && onCreateNew && search.trim() && filteredItems.length > 0 && (
    <div className="border-t border-gray-200 dark:border-gray-700 p-2">
        <button
            type="button"
            onClick={() => {
                onCreateNew(search.trim())
                setOpen(false)
                setSearch("")
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 
                       dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 
                       rounded-md transition-colors"
        >
            <Plus className="h-4 w-4" />
            Crear nuevo: "{search.trim()}"
        </button>
    </div>
)}
```

4. **Importar** el ícono `Plus` de lucide-react:
```typescript
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react"
```

### Modal de Creación Rápida

Crear un nuevo componente `src/components/ui/quick-create-item-dialog.tsx`:

```tsx
"use client"

import { useState } from "react"
import { createQuickItem } from "@/app/actions/inventory.actions"

interface QuickCreateItemDialogProps {
    open: boolean
    onClose: () => void
    onItemCreated: (item: { id: string; name: string }) => void
    initialName: string
    userId: string
}

const UNIT_OPTIONS = [
    { value: "KG", label: "Kilogramos (KG)" },
    { value: "G", label: "Gramos (G)" },
    { value: "L", label: "Litros (L)" },
    { value: "ML", label: "Mililitros (ML)" },
    { value: "UNIT", label: "Unidades (UNIT)" },
    { value: "PORTION", label: "Porciones (PORTION)" },
]

export function QuickCreateItemDialog({ open, onClose, onItemCreated, initialName, userId }: QuickCreateItemDialogProps) {
    const [name, setName] = useState(initialName)
    const [unit, setUnit] = useState("KG")
    const [type, setType] = useState("RAW_MATERIAL")
    const [loading, setLoading] = useState(false)

    if (!open) return null

    const handleCreate = async () => {
        if (!name.trim()) return
        setLoading(true)
        try {
            const result = await createQuickItem({
                name: name.trim(),
                unit,
                type,
                userId
            })
            if (result.success && result.item) {
                onItemCreated({ id: result.item.id, name: result.item.name })
                onClose()
            }
        } catch (error) {
            console.error('Error creando item:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        // Modal overlay + diálogo con campos Nombre, Unidad, Tipo
        // Botones: Cancelar / Crear y Seleccionar
    )
}
```

### Uso en los módulos (ejemplo en transferencias):

```tsx
<Combobox
    items={inventoryItems}
    value={selectedItem}
    onChange={setSelectedItem}
    placeholder="Buscar producto..."
    allowCreate={true}
    onCreateNew={(searchTerm) => {
        setQuickCreateName(searchTerm)
        setShowQuickCreate(true)
    }}
/>
```

---

## 4. TRANSFERENCIAS CON VALIDACIÓN ESCALONADA

### Problema
Actualmente las transferencias tienen solo 2 estados: PENDING → COMPLETED/REJECTED.  
Se necesita un flujo de 3 pasos donde cada persona pueda "montarse" sobre lo anterior.

### Nuevo Flujo de Estados

```
REQUESTED → DISPATCHED → COMPLETED
(Chef pide) → (Jefe Producción envía) → (Gerente aprueba)
```

### Cambios en Base de Datos (`prisma/schema.prisma`)

#### Modificar `RequisitionItem` (líneas 474-489):

Actualmente tiene:
```prisma
model RequisitionItem {
    id            String      @id @default(cuid())
    requisitionId String
    requisition   Requisition @relation(fields: [requisitionId], references: [id], onDelete: Cascade)
    inventoryItemId String
    inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id])
    quantity      Float       // <-- Este es el "solicitado"
    unit          String
    dispatchedQuantity Float? // <-- Este ya existe pero es el "aprobado"
    @@index([requisitionId])
}
```

Cambiar a:
```prisma
model RequisitionItem {
    id            String      @id @default(cuid())
    requisitionId String
    requisition   Requisition @relation(fields: [requisitionId], references: [id], onDelete: Cascade)
    inventoryItemId String
    inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id])
    
    // Cantidades por etapa
    requestedQuantity  Float        // Lo que pidió el Chef/Jefe de Cocina
    sentQuantity       Float?       // Lo que realmente envió el Jefe de Producción
    receivedQuantity   Float?       // Lo que confirma el Gerente que llegó (= sentQuantity si no hay corrección)
    
    unit          String
    
    // Ahora 'dispatchedQuantity' se reemplaza por sentQuantity,
    // pero mantenerlo por retrocompatibilidad:
    dispatchedQuantity Float?       // DEPRECADO, usar sentQuantity
    
    @@index([requisitionId])
}
```

#### Modificar `Requisition` (líneas 440-472):

Agregar estos campos al modelo:
```prisma
    // Nuevo: Quién envió (Jefe de Producción)
    dispatchedById String?
    dispatchedBy   User?    @relation("RequisitionDispatcher", fields: [dispatchedById], references: [id])
    dispatchedAt   DateTime?
```

**IMPORTANTE:** Si agregas la relación `RequisitionDispatcher`, también debes agregar la relación inversa en el modelo `User` (después de línea 39):
```prisma
    requisitionsDispatched Requisition[] @relation("RequisitionDispatcher")
```

#### Actualizar estados permitidos en `Requisition.status`:

El campo `status` ahora acepta: `REQUESTED`, `DISPATCHED`, `COMPLETED`, `REJECTED`, `CANCELLED`

(Nota: Cambiar `PENDING` por `REQUESTED` en la documentación, pero mantener soporte para `PENDING` por datos históricos)

### Cambios en `src/app/actions/requisition.actions.ts`

#### 1. Modificar `createRequisition` (línea 79):
Cambiar donde dice `quantity: item.quantity` por `requestedQuantity: item.quantity` en el create.  
Cambiar el estado de `'PENDING'` a `'REQUESTED'`.

#### 2. Crear nueva función `dispatchRequisition`:

```typescript
// NUEVO: DESPACHAR REQUISICIÓN (Jefe de Producción)
export async function dispatchRequisition(input: {
    requisitionId: string;
    dispatchedById: string;
    items: { inventoryItemId: string; sentQuantity: number }[];
}): Promise<ActionResult> {
    try {
        const req = await prisma.requisition.findUnique({
            where: { id: input.requisitionId },
            include: { items: true }
        });

        if (!req) return { success: false, message: 'Requisición no encontrada' };
        if (req.status !== 'REQUESTED' && req.status !== 'PENDING') {
            return { success: false, message: 'Esta solicitud ya fue procesada' };
        }

        await prisma.$transaction(async (tx) => {
            // Actualizar estado
            await tx.requisition.update({
                where: { id: input.requisitionId },
                data: {
                    status: 'DISPATCHED',
                    dispatchedById: input.dispatchedById,
                    dispatchedAt: new Date()
                }
            });

            // Actualizar cada item con la cantidad enviada
            for (const item of input.items) {
                await tx.requisitionItem.updateMany({
                    where: {
                        requisitionId: input.requisitionId,
                        inventoryItemId: item.inventoryItemId
                    },
                    data: { sentQuantity: item.sentQuantity }
                });
            }
        });

        revalidatePath('/dashboard/transferencias');
        return { success: true, message: 'Despacho registrado. Pendiente de aprobación gerencial.' };
    } catch (error) {
        console.error('Error dispatching:', error);
        return { success: false, message: 'Error al despachar' };
    }
}
```

#### 3. Modificar `approveRequisition` (línea 133):
- Ahora solo acepta requisiciones en estado `DISPATCHED`
- Usa `sentQuantity` como base para el movimiento de inventario (no `quantity`)
- Registra `receivedQuantity` basada en lo que confirma el gerente
- SOLO roles OWNER, ADMIN_MANAGER, OPS_MANAGER pueden aprobar

### Cambios en UI: `src/app/dashboard/transferencias/transferencias-view.tsx`

La vista debe mostrar 3 columnas para cada item:
| Producto | Solicitado | Enviado | Recibido |
|----------|-----------|---------|----------|
| Carne Macerada | 10 kg | 8 kg | 8 kg ✅ |
| Hummus | 5 kg | 5 kg | - (pendiente) |

Y botones según el rol del usuario:
- **Chef/AREA_LEAD**: Puede editar `requestedQuantity` (crear solicitud)
- **Chef/AREA_LEAD (Producción)**: Ve el botón "Despachar" con campos editables para `sentQuantity`
- **Gerente (OWNER/ADMIN_MANAGER/OPS_MANAGER)**: Ve el botón "Aprobar Transferencia"

---

## 5. RECEPCIÓN DIRECTA DESDE ÓRDENES DE COMPRA

### Problema
Los jefes crean una OC y luego cargan una "Entrada" manual por separado. Es trabajo doble.

### Estado Actual

La funcionalidad de recepción **YA EXISTE** en `purchase.actions.ts`:
- `receivePurchaseOrderItemsAction` (líneas 450-576) — ya recibe items, actualiza stock, registra costos
- El estado de la OC se actualiza a `PARTIAL` o `RECEIVED` correctamente

**Lo que falta es en la UI:**

### Cambios en UI: `src/app/dashboard/compras/purchase-order-view.tsx`

Este archivo tiene ~37,000 bytes. Los cambios son:

1. **Para órdenes en estado `SENT`**: Mostrar un botón grande y prominente "📦 Recibir Mercancía"
2. **Al hacer click**: Abrir un panel/drawer que muestre la lista de items con:
   - Nombre del producto
   - Cantidad pedida
   - Cantidad ya recibida (si parcial)
   - **Input editable** para `cantidadRecibida` (prellenado con la cantidad pedida)
   - Input opcional para `costoUnitario` (si el precio cambió)
3. **Selector de Área**: Dónde se va a almacenar (usar `getAreasForReceivingAction`)
4. **Botón guardar**: Llama a `receivePurchaseOrderItemsAction`

### Restricciones de Roles
- Los roles **CHEF** y **AREA_LEAD** solo deberían ver las OC en estado `SENT` (pendientes de recepción)
- Solo pueden usar el botón "Recibir Mercancía"
- NO pueden crear ni editar OC
- Los gerentes (OWNER, ADMIN_MANAGER, OPS_MANAGER) ven todo

Esto se controla en `roles.ts`. Actualmente el CHEF y AREA_LEAD no tienen el módulo de compras. Debes agregar acceso limitado:

```typescript
// En ROLE_PERMISSIONS:
[UserRole.CHEF]: {
    // ... existente ...
    [SystemModule.OPERATIONS]: ['view'],  // Para ver OC pendientes de recepción
},
[UserRole.AREA_LEAD]: {
    // ... existente ...
    [SystemModule.OPERATIONS]: ['view'],
},
```

---

## 6. UI/UX MÓVIL: BUSCADORES AMIGABLES

### Problema
Los dropdowns/combobox son muy difíciles de usar en el teléfono. Los modales son pequeños, los botones son chicos, y el scroll horizontal en tablas es incómodo.

### Archivos a Modificar
| Archivo | Cambio |
|---------|--------|
| `src/components/ui/combobox.tsx` (208 líneas) | Drawer en móvil en vez de popover |
| Todos los `*-view.tsx` en `/dashboard/` | Responsive design para tablas |
| `tailwind.config.ts` | Sin cambios necesarios |

### Estrategia: Mobile-First Drawer

Modificar `combobox.tsx` para detectar pantalla y cambiar comportamiento:

```typescript
// Dentro del componente Combobox:
const [isMobile, setIsMobile] = React.useState(false)

React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640) // sm breakpoint
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
}, [])
```

#### En DESKTOP (> 640px): Mantener comportamiento actual (dropdown portal)

#### En MÓVIL (< 640px): Usar un **Drawer desde abajo**:

```tsx
// Cuando isMobile === true, el portal renderiza esto:
<div className="fixed inset-0 z-[99999] bg-black/50" onClick={() => setOpen(false)}>
    <div 
        className="fixed bottom-0 left-0 right-0 z-[100000] bg-white dark:bg-gray-900 
                   rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col
                   animate-slide-up"
        onClick={(e) => e.stopPropagation()}
    >
        {/* Handle visual para drag */}
        <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full dark:bg-gray-600" />
        </div>
        
        {/* Búsqueda con input grande para pulgar */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-10 pr-4 py-3 text-base rounded-xl border border-gray-200 
                               bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white
                               focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    autoFocus
                />
            </div>
        </div>
        
        {/* Lista con items más grandes para toque fácil */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {filteredItems.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    onClick={() => handleSelect(item.value)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 rounded-xl text-left
                               hover:bg-amber-50 dark:hover:bg-amber-900/20 active:bg-amber-100
                               transition-colors min-h-[48px]"
                >
                    <Check className={cn("h-5 w-5 shrink-0", 
                        value === item.value ? "text-amber-600 opacity-100" : "opacity-0"
                    )} />
                    <span className="text-base">{item.label}</span>
                </button>
            ))}
        </div>
    </div>
</div>
```

### Animación CSS (agregar en `src/app/globals.css` o equivalente):

```css
@keyframes slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
}
.animate-slide-up {
    animation: slide-up 0.3s ease-out;
}
```

### Cambios Generales para Móvil en las Vistas:

1. **Inputs numéricos**: Agregar `inputMode="decimal"` a todos los `<input type="number">` para activar teclado numérico en iOS/Android.

2. **Tablas**: Convertir a cards apiladas en móvil:
```tsx
{/* Desktop: Tabla normal */}
<div className="hidden md:block">
    <table>...</table>
</div>

{/* Móvil: Cards apiladas */}
<div className="md:hidden space-y-3">
    {items.map(item => (
        <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border">
            <div className="flex justify-between items-start">
                <h3 className="font-medium">{item.name}</h3>
                <span className="text-sm text-gray-500">{item.quantity} {item.unit}</span>
            </div>
            {/* Más detalles en filas */}
        </div>
    ))}
</div>
```

3. **Botones**: Mínimo `min-h-[44px]` para cumplir con las guías de accesibilidad de Apple/Google.

---

## 7. INTEGRACIÓN WHATSAPP: PARSER DE PEDIDOS MARCHADOS

### Problema
El dueño descarga el chat de WhatsApp del grupo del restaurante y quiere que el sistema detecte automáticamente los productos "marchados" (vendidos) y los cruce con el menú.

### Formato de Chat de WhatsApp (exportado como .txt):

```
25/02/2026, 12:34 p.m. - Juan Pérez: Marchado: 3 mixtos, 2 de pollo
25/02/2026, 12:35 p.m. - María López: Marchado: 1 tabla x2, 5 cervezas
25/02/2026, 1:15 p.m. - Juan Pérez: Sale 2 shawarma de carne
25/02/2026, 1:20 p.m. - María López: marchamos 4 limonadas y 1 falafel
```

### Archivos a Crear
| Archivo | Rol |
|---------|-----|
| `src/app/actions/whatsapp-parser.actions.ts` | **NUEVO** — Lógica de parseo y fuzzy matching |
| `src/app/dashboard/ventas/whatsapp-import.tsx` | **NUEVO** — Componente de UI para importar |

### Dependencias Necesarias
`fuse.js` ya está instalado (se usó para OCR en `ocr.actions.ts`).

### Server Action: `src/app/actions/whatsapp-parser.actions.ts`

```typescript
'use server';

import prisma from '@/server/db';
import Fuse from 'fuse.js';

interface ParsedOrder {
    lineNumber: number;
    timestamp: string;
    sender: string;
    rawText: string;
    items: {
        quantity: number;
        searchTerm: string;
        matchedMenuItem?: {
            id: string;
            name: string;
            sku: string;
            confidence: number; // 0-1
        };
    }[];
}

export async function parseWhatsAppChatAction(
    fileContent: string
): Promise<{ success: boolean; message: string; orders?: ParsedOrder[]; summary?: any }> {
    try {
        // 1. Obtener todos los items del menú para matching
        const menuItems = await prisma.menuItem.findMany({
            where: { isActive: true },
            select: { id: true, name: true, sku: true }
        });

        // 2. Configurar Fuse.js para fuzzy matching
        const fuse = new Fuse(menuItems, {
            keys: ['name', 'sku'],
            threshold: 0.4,      // Tolerancia (0 = exacto, 1 = todo)
            includeScore: true,
            minMatchCharLength: 3
        });

        // 3. Parsear cada línea del chat
        const lines = fileContent.split('\n');
        const orders: ParsedOrder[] = [];

        // Regex para detectar líneas de WhatsApp
        // Formato: "DD/MM/YYYY, HH:MM a.m./p.m. - Nombre: mensaje"
        const lineRegex = /^(\d{1,2}\/\d{1,2}\/\d{4}),?\s+(\d{1,2}:\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*-\s*([^:]+):\s*(.+)$/i;

        // Palabras clave que indican un pedido marchado
        const marchKeywords = ['marchado', 'marchamos', 'marcha', 'sale', 'salen', 'va', 'van', 'pedido', 'comanda'];

        // Regex para extraer cantidades + producto
        // Ej: "3 mixtos", "2 de pollo", "1 tabla x2"  
        const itemRegex = /(\d+)\s+(?:de\s+)?([a-záéíóúñü\s]+?)(?:,|$|y\s)/gi;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const match = line.match(lineRegex);
            if (!match) continue;

            const [, date, time, ampm, sender, message] = match;
            const messageLower = message.toLowerCase();

            // Solo procesar líneas que contengan palabras clave de marcha
            const hasMarchKeyword = marchKeywords.some(kw => messageLower.includes(kw));
            if (!hasMarchKeyword) continue;

            // Extraer items del mensaje
            const items: ParsedOrder['items'] = [];
            let itemMatch;

            // Limpiar el mensaje quitando la palabra clave
            let cleanMessage = messageLower;
            marchKeywords.forEach(kw => {
                cleanMessage = cleanMessage.replace(new RegExp(kw + '[:\\s]*', 'gi'), '');
            });

            // Intentar parsear items
            // Formato simple: "3 mixtos, 2 de pollo, 1 tabla"
            const parts = cleanMessage.split(/[,;y]\s*/);

            for (const part of parts) {
                const numMatch = part.trim().match(/^(\d+)\s+(.+)$/);
                if (numMatch) {
                    const qty = parseInt(numMatch[1]);
                    const searchTerm = numMatch[2].trim()
                        .replace(/^de\s+/, '')  // quitar "de "
                        .replace(/\s+/g, ' ');  // normalizar espacios

                    // Fuzzy match con el menú
                    const results = fuse.search(searchTerm);
                    const bestMatch = results[0];

                    items.push({
                        quantity: qty,
                        searchTerm,
                        matchedMenuItem: bestMatch ? {
                            id: bestMatch.item.id,
                            name: bestMatch.item.name,
                            sku: bestMatch.item.sku,
                            confidence: 1 - (bestMatch.score || 0)
                        } : undefined
                    });
                }
            }

            if (items.length > 0) {
                orders.push({
                    lineNumber: i + 1,
                    timestamp: `${date} ${time} ${ampm || ''}`.trim(),
                    sender: sender.trim(),
                    rawText: message,
                    items
                });
            }
        }

        // 4. Generar resumen
        const allItems = orders.flatMap(o => o.items);
        const matchedCount = allItems.filter(i => i.matchedMenuItem).length;
        const totalItems = allItems.length;

        // Agrupar por producto para resumen
        const productSummary: Record<string, { name: string; totalQty: number }> = {};
        for (const item of allItems) {
            const key = item.matchedMenuItem?.id || item.searchTerm;
            const name = item.matchedMenuItem?.name || item.searchTerm;
            if (!productSummary[key]) {
                productSummary[key] = { name, totalQty: 0 };
            }
            productSummary[key].totalQty += item.quantity;
        }

        return {
            success: true,
            message: `Se detectaron ${orders.length} comandas con ${totalItems} items (${matchedCount} coincidencias)`,
            orders,
            summary: {
                totalOrders: orders.length,
                totalItems,
                matchedItems: matchedCount,
                unmatchedItems: totalItems - matchedCount,
                productSummary: Object.values(productSummary)
                    .sort((a, b) => b.totalQty - a.totalQty)
            }
        };

    } catch (error) {
        console.error('Error en parseWhatsAppChatAction:', error);
        return { success: false, message: 'Error al procesar chat de WhatsApp' };
    }
}
```

### Componente de UI

Crear `src/app/dashboard/ventas/whatsapp-import.tsx`:

1. **Zona de carga**: Input de archivo que acepta `.txt` (exportación de WhatsApp)
2. **Preview**: Tabla de "Esto es lo que detecté":
   - Hora | Quién | Texto Original | Producto Detectado ✅❌ | Cantidad
3. **Corrección manual**: Donde no haya match, mostrar un buscador para que elija el producto manualmente
4. **Botón confirmar**: Opción de registrar como producción o como venta

---

## ORDEN DE IMPLEMENTACIÓN SUGERIDO

| Prioridad | Problema | Impacto | Complejidad |
|-----------|----------|---------|-------------|
| 🔴 1º | #3 — Creación Rápida | ALTO (elimina fricción diaria) | BAJA |
| 🔴 2º | #6 — UI Móvil | ALTO (usabilidad diaria) | MEDIA |
| 🟡 3º | #1 — Costeo Dinámico | ALTO (precisión financiera) | MEDIA |
| 🟡 4º | #2 — Plantillas | MEDIO (previene errores) | MEDIA |
| 🟡 5º | #4 — Transferencias | ALTO (optimiza tiempo) | ALTA |
| 🔵 6º | #5 — Recepción OC | MEDIO (reduce duplicación) | BAJA |
| 🔵 7º | #7 — WhatsApp Parser | BAJO (Nice-to-have) | MEDIA |

---

## NOTAS TÉCNICAS GENERALES

### Base de Datos
- Host: `shanklish-db.cbau4e08oxxx.us-east-2.rds.amazonaws.com`
- Después de cualquier cambio en `schema.prisma`, ejecutar: `npx prisma db push`
- Para ver datos: `npx prisma studio`

### Despliegue
- Push a GitHub → Vercel detecta cambios → Build automático
- Variables de entorno en Vercel (ya configuradas)

### Patrón de Código
- Toda lógica de BD va en `src/app/actions/*.ts` (Server Actions)
- Frontend: Client Components con `"use client"`
- Flujo: Frontend → Server Action → Prisma → PostgreSQL

### Autenticación
- `getSession()` de `@/lib/auth` retorna `{ id, role, firstName, lastName }`
- Siempre verificar `session?.id` al inicio de cada action
