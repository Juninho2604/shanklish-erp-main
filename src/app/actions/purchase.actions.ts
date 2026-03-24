'use server';

/**
 * SHANKLISH CARACAS ERP - Purchase Order Actions
 * 
 * Server Actions para gestión de Órdenes de Compra
 * - Configuración masiva de stock mínimo / punto de reorden
 * - Generación automática basada en stock mínimo
 * - Vista por categoría
 * - Recepción parcial vinculada a OC
 * - Entrada excepcional independiente
 */

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { getSession } from '@/lib/auth';

// ============================================================================
// TIPOS
// ============================================================================

export interface LowStockItem {
    id: string;
    name: string;
    sku: string;
    category: string | null;
    baseUnit: string;
    currentStock: number;
    minimumStock: number;
    reorderPoint: number;
    suggestedQuantity: number;
    isCritical: boolean;
}

export interface CreatePurchaseOrderInput {
    orderName?: string;
    supplierId?: string;
    expectedDate?: Date;
    notes?: string;
    items: {
        inventoryItemId: string;
        quantityOrdered: number;
        unit: string;
        unitPrice?: number;
    }[];
}

export interface ReceiveItemInput {
    purchaseOrderItemId: string;
    quantityReceived: number;
    unitCost?: number;
}

export interface StockConfigItem {
    id: string;
    minimumStock: number;
    reorderPoint: number;
}

// ============================================================================
// ACTION: CONFIGURAR STOCK MÍNIMO EN LOTE
// ============================================================================

/**
 * Actualiza minimumStock y reorderPoint para múltiples items a la vez.
 * Esto es necesario para que el sistema de alertas de stock bajo funcione.
 */
export async function updateStockLevelsAction(
    items: StockConfigItem[]
): Promise<{ success: boolean; message: string; updatedCount?: number }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        // Actualizar en lotes paralelos (evita timeout de transacción en BD remota)
        const BATCH_SIZE = 10;
        let updatedCount = 0;

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(item =>
                    prisma.inventoryItem.update({
                        where: { id: item.id },
                        data: {
                            minimumStock: item.minimumStock,
                            reorderPoint: item.reorderPoint
                        }
                    })
                )
            );
            updatedCount += batch.length;
        }

        revalidatePath('/dashboard/compras');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Se actualizaron ${updatedCount} productos correctamente`,
            updatedCount
        };
    } catch (error) {
        console.error('Error en updateStockLevelsAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al actualizar niveles de stock'
        };
    }
}

// ============================================================================
// ACTION: OBTENER TODOS LOS ITEMS CON SU CONFIGURACIÓN DE STOCK
// ============================================================================

/**
 * Obtiene todos los items de materia prima con su stock actual,
 * mínimo y punto de reorden para configuración masiva.
 */
export async function getAllItemsWithStockConfigAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                type: 'RAW_MATERIAL'
            },
            include: {
                stockLevels: true
            },
            orderBy: [
                { category: 'asc' },
                { name: 'asc' }
            ]
        });

        return items.map(item => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            category: item.category || 'Sin Categoría',
            baseUnit: item.baseUnit,
            currentStock: item.stockLevels.reduce((sum, loc) => sum + loc.currentStock, 0),
            minimumStock: item.minimumStock,
            reorderPoint: item.reorderPoint,
            isCritical: item.isCritical
        }));
    } catch (error) {
        console.error('Error en getAllItemsWithStockConfigAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER ITEMS CON STOCK BAJO (PARA GENERAR ORDEN AUTOMÁTICA)
// ============================================================================

/**
 * Obtiene todos los items que están por debajo del punto de reorden
 * o del stock mínimo. Calcula la cantidad sugerida a pedir.
 */
export async function getLowStockItemsAction(): Promise<LowStockItem[]> {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                type: 'RAW_MATERIAL'
            },
            include: {
                stockLevels: true
            },
            orderBy: [
                { category: 'asc' },
                { name: 'asc' }
            ]
        });

        const lowStockItems: LowStockItem[] = [];

        for (const item of items) {
            const totalStock = item.stockLevels.reduce((sum, loc) => sum + loc.currentStock, 0);

            const isBelowReorder = item.reorderPoint > 0 && totalStock < item.reorderPoint;
            const isBelowMinimum = item.minimumStock > 0 && totalStock < item.minimumStock;

            if (isBelowReorder || isBelowMinimum) {
                // Cantidad sugerida: llegar al punto de reorden + 20% buffer
                const targetStock = Math.max(item.reorderPoint, item.minimumStock * 1.5);
                const suggestedQty = Math.max(0, targetStock - totalStock);

                const roundedQty = item.baseUnit === 'UNIT'
                    ? Math.ceil(suggestedQty)
                    : parseFloat(suggestedQty.toFixed(2));

                lowStockItems.push({
                    id: item.id,
                    name: item.name,
                    sku: item.sku,
                    category: item.category,
                    baseUnit: item.baseUnit,
                    currentStock: totalStock,
                    minimumStock: item.minimumStock,
                    reorderPoint: item.reorderPoint,
                    suggestedQuantity: roundedQty,
                    isCritical: totalStock <= 0 || (item.minimumStock > 0 && totalStock <= item.minimumStock * 0.25)
                });
            }
        }

        // Ordenar: críticos primero, luego por ratio
        lowStockItems.sort((a, b) => {
            if (a.isCritical && !b.isCritical) return -1;
            if (!a.isCritical && b.isCritical) return 1;
            const aRatio = a.currentStock / (a.minimumStock || 1);
            const bRatio = b.currentStock / (b.minimumStock || 1);
            return aRatio - bRatio;
        });

        return lowStockItems;
    } catch (error) {
        console.error('Error en getLowStockItemsAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER TODOS LOS ITEMS PARA ORDEN MANUAL
// ============================================================================

export async function getAllItemsForPurchaseAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                type: 'RAW_MATERIAL'
            },
            include: {
                stockLevels: true
            },
            orderBy: [
                { category: 'asc' },
                { name: 'asc' }
            ]
        });

        return items.map(item => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            category: item.category,
            baseUnit: item.baseUnit,
            currentStock: item.stockLevels.reduce((sum, loc) => sum + loc.currentStock, 0),
            minimumStock: item.minimumStock,
            reorderPoint: item.reorderPoint
        }));
    } catch (error) {
        console.error('Error en getAllItemsForPurchaseAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: CREAR ORDEN DE COMPRA
// ============================================================================

export async function createPurchaseOrderAction(
    input: CreatePurchaseOrderInput
): Promise<{ success: boolean; message: string; orderId?: string; orderNumber?: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        // Generar número de orden
        const year = new Date().getFullYear();
        const count = await prisma.purchaseOrder.count({
            where: {
                orderNumber: { startsWith: `OC-${year}` }
            }
        });
        const orderNumber = `OC-${year}-${String(count + 1).padStart(4, '0')}`;

        // Calcular totales
        let subtotal = 0;
        const itemsData = input.items.map(item => {
            const price = item.unitPrice || 0;
            const total = item.quantityOrdered * price;
            subtotal += total;
            return {
                inventoryItemId: item.inventoryItemId,
                quantityOrdered: item.quantityOrdered,
                unit: item.unit,
                unitPrice: price,
                totalPrice: total
            };
        });

        const order = await prisma.purchaseOrder.create({
            data: {
                orderNumber,
                orderName: input.orderName?.trim() || null,
                supplierId: input.supplierId || null,
                expectedDate: input.expectedDate,
                notes: input.notes,
                subtotal,
                totalAmount: subtotal,
                createdById: session.id,
                items: {
                    create: itemsData
                }
            }
        });

        revalidatePath('/dashboard/compras');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Orden ${orderNumber} creada exitosamente`,
            orderId: order.id,
            orderNumber: order.orderNumber
        };
    } catch (error) {
        console.error('Error en createPurchaseOrderAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al crear orden de compra'
        };
    }
}

// ============================================================================
// ACTION: OBTENER ÓRDENES DE COMPRA
// ============================================================================

export async function getPurchaseOrdersAction(status?: string) {
    try {
        const orders = await prisma.purchaseOrder.findMany({
            where: status ? { status } : undefined,
            include: {
                supplier: true,
                createdBy: {
                    select: { firstName: true, lastName: true }
                },
                items: {
                    include: {
                        inventoryItem: {
                            select: { name: true, sku: true, category: true, baseUnit: true }
                        }
                    }
                },
                _count: {
                    select: { items: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return orders.map(order => ({
            id: order.id,
            orderNumber: order.orderNumber,
            orderName: order.orderName,
            status: order.status,
            supplierName: order.supplier?.name || 'Sin proveedor',
            orderDate: order.orderDate,
            expectedDate: order.expectedDate,
            totalAmount: order.totalAmount,
            itemCount: order._count.items,
            createdBy: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
            items: order.items.map(item => ({
                id: item.id,
                inventoryItemId: item.inventoryItemId,
                itemName: item.inventoryItem.name,
                itemSku: item.inventoryItem.sku,
                category: item.inventoryItem.category || 'Sin Categoría',
                baseUnit: item.inventoryItem.baseUnit,
                quantityOrdered: item.quantityOrdered,
                quantityReceived: item.quantityReceived,
                unit: item.unit,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice
            }))
        }));
    } catch (error) {
        console.error('Error en getPurchaseOrdersAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER ORDEN DE COMPRA POR ID
// ============================================================================

export async function getPurchaseOrderByIdAction(orderId: string) {
    try {
        const order = await prisma.purchaseOrder.findUnique({
            where: { id: orderId },
            include: {
                supplier: true,
                createdBy: {
                    select: { firstName: true, lastName: true }
                },
                receivedBy: {
                    select: { firstName: true, lastName: true }
                },
                items: {
                    include: {
                        inventoryItem: {
                            select: { id: true, name: true, sku: true, baseUnit: true, category: true }
                        }
                    }
                }
            }
        });

        return order;
    } catch (error) {
        console.error('Error en getPurchaseOrderByIdAction:', error);
        return null;
    }
}

// ============================================================================
// ACTION: ENVIAR ORDEN DE COMPRA
// ============================================================================

export async function sendPurchaseOrderAction(orderId: string): Promise<{ success: boolean; message: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        await prisma.purchaseOrder.update({
            where: { id: orderId },
            data: { status: 'SENT' }
        });

        revalidatePath('/dashboard/compras');
        return { success: true, message: 'Orden enviada al proveedor' };
    } catch (error) {
        console.error('Error en sendPurchaseOrderAction:', error);
        return { success: false, message: 'Error al enviar orden' };
    }
}

// ============================================================================
// ACTION: RECIBIR ITEMS DE UNA ORDEN DE COMPRA (PARCIAL O TOTAL)
// ============================================================================

export async function receivePurchaseOrderItemsAction(
    orderId: string,
    items: ReceiveItemInput[],
    areaId: string
): Promise<{ success: boolean; message: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        let receivedCount = 0;

        // Procesar item por item (sin transacción interactiva para evitar timeout en BD remota)
        for (const item of items) {
            if (item.quantityReceived <= 0) continue;

            const orderItem = await prisma.purchaseOrderItem.findUnique({
                where: { id: item.purchaseOrderItemId },
                include: { inventoryItem: true }
            });

            if (!orderItem) continue;

            // Actualizar cantidad recibida
            const newReceivedQty = orderItem.quantityReceived + item.quantityReceived;
            await prisma.purchaseOrderItem.update({
                where: { id: item.purchaseOrderItemId },
                data: { quantityReceived: newReceivedQty }
            });

            receivedCount++;

            // Registrar movimiento de inventario
            const unitCost = item.unitCost || orderItem.unitPrice || 0;
            await prisma.inventoryMovement.create({
                data: {
                    inventoryItemId: orderItem.inventoryItemId,
                    movementType: 'PURCHASE',
                    quantity: item.quantityReceived,
                    unit: orderItem.unit,
                    unitCost: unitCost,
                    totalCost: item.quantityReceived * unitCost,
                    createdById: session.id,
                    reason: `Recepción OC - Orden ${orderId.slice(0, 8)}`,
                    referenceNumber: orderId
                }
            });

            // Actualizar stock
            await prisma.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: orderItem.inventoryItemId,
                        areaId: areaId
                    }
                },
                create: {
                    inventoryItemId: orderItem.inventoryItemId,
                    areaId: areaId,
                    currentStock: item.quantityReceived,
                    lastCountDate: new Date()
                },
                update: {
                    currentStock: { increment: item.quantityReceived },
                    lastCountDate: new Date()
                }
            });

            // Actualizar historial de costos si hay costo
            if (unitCost > 0) {
                await prisma.costHistory.create({
                    data: {
                        inventoryItemId: orderItem.inventoryItemId,
                        costPerUnit: unitCost,
                        effectiveFrom: new Date(),
                        reason: 'Actualización por Orden de Compra',
                        createdById: session.id
                    }
                });
            }
        }

        // Actualizar estado de la orden
        const updatedOrder = await prisma.purchaseOrder.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (updatedOrder) {
            const allItemsReceived = updatedOrder.items.every(
                item => item.quantityReceived >= item.quantityOrdered
            );

            const anyItemReceived = updatedOrder.items.some(
                item => item.quantityReceived > 0
            );

            let newStatus = updatedOrder.status;
            if (allItemsReceived) {
                newStatus = 'RECEIVED';
            } else if (anyItemReceived) {
                newStatus = 'PARTIAL';
            }

            await prisma.purchaseOrder.update({
                where: { id: orderId },
                data: {
                    status: newStatus,
                    receivedDate: allItemsReceived ? new Date() : undefined,
                    receivedById: session.id
                }
            });
        }

        revalidatePath('/dashboard/compras');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Se recibieron ${receivedCount} item(s) exitosamente`
        };
    } catch (error) {
        console.error('Error en receivePurchaseOrderItemsAction:', error);
        return { success: false, message: 'Error al recibir mercancía' };
    }
}

// ============================================================================
// ACTION: CANCELAR ORDEN DE COMPRA
// ============================================================================

export async function cancelPurchaseOrderAction(orderId: string): Promise<{ success: boolean; message: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        const order = await prisma.purchaseOrder.findUnique({
            where: { id: orderId }
        });

        if (!order) {
            return { success: false, message: 'Orden no encontrada' };
        }

        if (order.status === 'RECEIVED') {
            return { success: false, message: 'No se puede cancelar una orden ya recibida' };
        }

        await prisma.purchaseOrder.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' }
        });

        revalidatePath('/dashboard/compras');
        return { success: true, message: 'Orden cancelada' };
    } catch (error) {
        console.error('Error en cancelPurchaseOrderAction:', error);
        return { success: false, message: 'Error al cancelar orden' };
    }
}

// ============================================================================
// ACTION: OBTENER PROVEEDORES
// ============================================================================

export async function getSuppliersAction() {
    try {
        const suppliers = await prisma.supplier.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { purchaseOrders: true }
                }
            }
        });

        return suppliers.map(s => ({
            id: s.id,
            name: s.name,
            code: s.code,
            contactName: s.contactName,
            phone: s.phone,
            email: s.email,
            orderCount: s._count.purchaseOrders
        }));
    } catch (error) {
        console.error('Error en getSuppliersAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: CREAR PROVEEDOR
// ============================================================================

export async function createSupplierAction(input: {
    name: string;
    code?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
}): Promise<{ success: boolean; message: string; supplierId?: string }> {
    try {
        const supplier = await prisma.supplier.create({
            data: input
        });

        revalidatePath('/dashboard/compras');
        return {
            success: true,
            message: 'Proveedor creado exitosamente',
            supplierId: supplier.id
        };
    } catch (error) {
        console.error('Error en createSupplierAction:', error);
        return { success: false, message: 'Error al crear proveedor' };
    }
}

// ============================================================================
// ACTION: OBTENER ÁREAS PARA RECEPCIÓN
// ============================================================================

export async function getAreasForReceivingAction() {
    try {
        const areas = await prisma.area.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                description: true,
            },
            orderBy: { name: 'asc' },
        });
        return areas;
    } catch (error) {
        console.error('Error en getAreasForReceivingAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: CREAR ALERTAS DE REORDEN EN BROADCAST (auto o manual)
// ============================================================================

/**
 * Detecta items bajo su punto de reorden y crea BroadcastMessages activos.
 * - No duplica alertas: si ya existe un broadcast activo para ese item, lo omite.
 * - Se puede llamar manualmente desde Compras o automáticamente tras descargo.
 * Retorna el número de alertas nuevas creadas.
 */
export async function createReorderBroadcastsAction(): Promise<{ created: number; skipped: number }> {
    try {
        // Obtener usuario para createdById (requerido por el modelo)
        const session = await getSession();
        // Si no hay sesión activa, buscar el primer OWNER como fallback (ej. llamada fire-and-forget)
        let authorId: string | null = session?.id ?? null;
        if (!authorId) {
            const owner = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true }, select: { id: true } });
            authorId = owner?.id ?? null;
        }
        if (!authorId) return { created: 0, skipped: 0 };

        const lowStockItems = await getLowStockItemsAction();
        if (lowStockItems.length === 0) return { created: 0, skipped: 0 };

        // No duplicar alertas activas del mismo item
        const existingBroadcasts = await prisma.broadcastMessage.findMany({
            where: { isActive: true, title: { startsWith: '🔁 Reorden:' } },
            select: { title: true },
        });
        const existingTitles = new Set(existingBroadcasts.map(b => b.title));

        let created = 0;
        let skipped = 0;

        for (const item of lowStockItems) {
            const title = `🔁 Reorden: ${item.name}`;
            if (existingTitles.has(title)) { skipped++; continue; }

            const severity = item.isCritical ? 'ALERT' : 'WARNING';
            const stockLabel = `${item.currentStock.toFixed(2)} ${item.baseUnit}`;
            const minLabel = item.minimumStock > 0
                ? `mínimo ${item.minimumStock} ${item.baseUnit}`
                : `reorden ${item.reorderPoint} ${item.baseUnit}`;
            const body = `Stock actual: ${stockLabel} (${minLabel}). SKU: ${item.sku}${item.category ? ` · ${item.category}` : ''}`;

            await prisma.broadcastMessage.create({
                data: {
                    title,
                    body,
                    type: severity,
                    targetRoles: JSON.stringify(['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CHEF']),
                    isActive: true,
                    expiresAt: null,
                    createdById: authorId,
                },
            });

            created++;
        }

        return { created, skipped };
    } catch (error) {
        console.error('[compras] createReorderBroadcastsAction error:', error);
        return { created: 0, skipped: 0 };
    }
}

// ============================================================================
// ACTION: EXPORTAR ORDEN DE COMPRA A TEXTO (para WhatsApp/Email)
// ============================================================================

export async function exportPurchaseOrderTextAction(orderId: string): Promise<string> {
    try {
        const order = await prisma.purchaseOrder.findUnique({
            where: { id: orderId },
            include: {
                supplier: true,
                items: {
                    include: {
                        inventoryItem: {
                            select: { name: true, category: true }
                        }
                    }
                }
            }
        });

        if (!order) return '';

        const date = new Date(order.orderDate).toLocaleDateString('es-VE');

        let text = `📋 *ORDEN DE COMPRA*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
        text += `*Número:* ${order.orderNumber}\n`;
        if (order.orderName) {
            text += `*Nombre:* ${order.orderName}\n`;
        }
        text += `*Fecha:* ${date}\n`;
        if (order.supplier) {
            text += `*Proveedor:* ${order.supplier.name}\n`;
        }
        if (order.expectedDate) {
            text += `*Entrega esperada:* ${new Date(order.expectedDate).toLocaleDateString('es-VE')}\n`;
        }

        // Agrupar por categoría
        const byCategory: Record<string, typeof order.items> = {};
        for (const item of order.items) {
            const cat = item.inventoryItem.category || 'Otros';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(item);
        }

        for (const [category, catItems] of Object.entries(byCategory)) {
            text += `\n📦 *${category}:*\n`;
            for (const item of catItems) {
                text += `• ${item.inventoryItem.name}: ${item.quantityOrdered} ${item.unit}\n`;
            }
        }

        text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        text += `*Total Items:* ${order.items.length}\n`;

        if (order.notes) {
            text += `\n📝 *Notas:* ${order.notes}\n`;
        }

        text += `\n_Shanklish Caracas ERP_`;

        return text;
    } catch (error) {
        console.error('Error en exportPurchaseOrderTextAction:', error);
        return '';
    }
}
