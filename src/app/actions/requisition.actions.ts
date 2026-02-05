'use server';

import prisma from '@/server/db';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TIPOS
// ============================================================================

export interface RequisitionItemInput {
    inventoryItemId: string;
    quantity: number;
    unit: string;
}

export interface CreateRequisitionInput {
    requestedById: string;
    targetAreaId: string; // Área que RECIBE
    sourceAreaId?: string; // Área que ENVÍA
    items: RequisitionItemInput[];
    notes?: string;
}

export interface ApproveItemInput {
    inventoryItemId: string;
    dispatchedQuantity: number;
}

export interface ApproveRequisitionInput {
    requisitionId: string;
    processedById: string;
    items: ApproveItemInput[];
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

// ============================================================================
// ACTIONS DE LECTURA
// ============================================================================

export async function getRequisitions(filter: 'ALL' | 'PENDING' | 'COMPLETED' = 'ALL') {
    try {
        const whereClause: any = {};
        if (filter === 'PENDING') whereClause.status = 'PENDING';
        if (filter === 'COMPLETED') whereClause.status = { in: ['APPROVED', 'COMPLETED', 'REJECTED'] };

        const requisitions = await prisma.requisition.findMany({
            where: whereClause,
            include: {
                requestedBy: { select: { firstName: true, lastName: true } },
                processedBy: { select: { firstName: true, lastName: true } },
                targetArea: { select: { name: true } },
                sourceArea: { select: { name: true } },
                items: {
                    include: {
                        inventoryItem: { select: { name: true, sku: true, baseUnit: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
        });

        return { success: true, data: requisitions };
    } catch (error) {
        console.error('Error fetching requisitions:', error);
        return { success: false, message: 'Error al cargar requisiciones', data: [] };
    }
}

// ============================================================================
// ACTIONS DE ESCRITURA
// ============================================================================

// 1. CREAR SOLICITUD
export async function createRequisition(input: CreateRequisitionInput): Promise<ActionResult> {
    try {
        const count = await prisma.requisition.count();
        const code = `REQ-${(count + 1).toString().padStart(4, '0')}`;

        // Buscar un Area Origen por defecto (Almacén Principal) si no viene
        let sourceId = input.sourceAreaId;
        if (!sourceId) {
            const mainWarehouse = await prisma.area.findFirst({
                where: { name: { contains: 'ALMACEN PRINCIPAL', mode: 'insensitive' } }
            });
            sourceId = mainWarehouse?.id;
        }

        // Crear la requisición y sus items
        // Validar usuario (Fallback para desarrollo tras DB Reset)
        let requesterId = input.requestedById;
        const userExists = await prisma.user.findUnique({ where: { id: requesterId } });
        if (!userExists) {
            const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
            if (owner) requesterId = owner.id;
        }

        const requisition = await prisma.requisition.create({
            data: {
                code,
                requestedById: requesterId,
                targetAreaId: input.targetAreaId,
                sourceAreaId: sourceId,
                notes: input.notes,
                status: 'PENDING',
                items: {
                    create: input.items.map(item => ({
                        inventoryItemId: item.inventoryItemId,
                        quantity: item.quantity,
                        unit: item.unit
                    }))
                }
            }
        });

        revalidatePath('/dashboard/transferencias');
        return { success: true, message: `Solicitud ${code} creada exitosamente`, data: requisition };

    } catch (error) {
        console.error('Error creating requisition:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al crear solicitud'
        };
    }
}

// 2. APROBAR Y DESPACHAR
export async function approveRequisition(input: ApproveRequisitionInput): Promise<ActionResult> {
    try {
        // Buscar la requisición para validar
        const req = await prisma.requisition.findUnique({
            where: { id: input.requisitionId },
            include: { items: true }
        });

        if (!req) return { success: false, message: 'Requisición no encontrada' };
        if (req.status !== 'PENDING') return { success: false, message: 'Esta solicitud ya fue procesada' };

        // Si no tenía origen, intentar asignarlo ahora o fallar
        if (!req.sourceAreaId) {
            const mainWarehouse = await prisma.area.findFirst({
                where: { name: { contains: 'ALMACEN PRINCIPAL', mode: 'insensitive' } }
            });
            if (!mainWarehouse) return { success: false, message: 'No hay Almacén Principal definido para despachar' };
            req.sourceAreaId = mainWarehouse.id;
        }

        // Validar usuario aprobador (Fallback)
        let processedById = input.processedById;
        const userExists = await prisma.user.findUnique({ where: { id: processedById } });
        if (!userExists) {
            const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
            if (owner) processedById = owner.id;
        }

        await prisma.$transaction(async (tx) => {
            // 1. Actualizar estado Requisición
            await tx.requisition.update({
                where: { id: input.requisitionId },
                data: {
                    status: 'COMPLETED',
                    processedById: processedById,
                    sourceAreaId: req.sourceAreaId, // Confirmar origen
                    processedAt: new Date(),
                }
            });

            // 2. Procesar Movimientos por Item
            for (const itemInput of input.items) {
                const reqItem = req.items.find(i => i.inventoryItemId === itemInput.inventoryItemId);
                if (!reqItem) continue;

                // Actualizar cantidad real despachada en la requisición
                await tx.requisitionItem.updateMany({
                    where: {
                        requisitionId: input.requisitionId,
                        inventoryItemId: itemInput.inventoryItemId
                    },
                    data: { dispatchedQuantity: itemInput.dispatchedQuantity }
                });

                // Registrar Movimiento SALIDA (Global)
                // Nota: InventoryMovement es global, pero usamos las notas para trazar el origen
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: itemInput.inventoryItemId,
                        movementType: 'TRANSFER_OUT', // Nuevo tipo (o ADJUSTMENT_OUT si no está en enum)
                        quantity: itemInput.dispatchedQuantity,
                        unit: 'UNIT', // Debería venir del item, simplificado aquí
                        createdById: processedById,
                        notes: `Despacho REQ-${req.code} a ${req.targetAreaId}`,
                        reason: 'Transferencia entre Almacenes'
                    }
                });

                // Actualizar Stock en Ubicación ORIGEN (Resta)
                if (req.sourceAreaId) {
                    await tx.inventoryLocation.upsert({
                        where: {
                            inventoryItemId_areaId: {
                                inventoryItemId: itemInput.inventoryItemId,
                                areaId: req.sourceAreaId
                            }
                        },
                        create: {
                            inventoryItemId: itemInput.inventoryItemId,
                            areaId: req.sourceAreaId,
                            currentStock: -itemInput.dispatchedQuantity,
                            lastCountDate: new Date()
                        },
                        update: {
                            currentStock: { decrement: itemInput.dispatchedQuantity },
                            lastCountDate: new Date()
                        }
                    });
                }

                // Actualizar Stock en Ubicación DESTINO (Suma)
                await tx.inventoryLocation.upsert({
                    where: {
                        inventoryItemId_areaId: {
                            inventoryItemId: itemInput.inventoryItemId,
                            areaId: req.targetAreaId
                        }
                    },
                    create: {
                        inventoryItemId: itemInput.inventoryItemId,
                        areaId: req.targetAreaId,
                        currentStock: itemInput.dispatchedQuantity,
                        lastCountDate: new Date()
                    },
                    update: {
                        currentStock: { increment: itemInput.dispatchedQuantity },
                        lastCountDate: new Date()
                    }
                });
            }
        }, { timeout: 120000 });

        revalidatePath('/dashboard/inventario');
        return { success: true, message: 'Transferencia aprobada y ejecutada' };

    } catch (error) {
        console.error('Error approving dispatch:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido al aprobar'
        };
    }
}

// 3. RECHAZAR SOLICITUD
export async function rejectRequisition(requisitionId: string, userId: string): Promise<ActionResult> {
    try {
        // Validar usuario (Fallback)
        let processorId = userId;
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
            if (owner) processorId = owner.id;
        }

        await prisma.requisition.update({
            where: { id: requisitionId },
            data: {
                status: 'REJECTED',
                processedById: processorId,
                processedAt: new Date()
            }
        });

        revalidatePath('/dashboard/transferencias');
        return { success: true, message: 'Solicitud rechazada correctamente' };
    } catch (error) {
        console.error('Error rejecting:', error);
        return { success: false, message: 'Error al rechazar solicitud' };
    }
}

// ============================================================================
// TRANSFERENCIA MASIVA POR CATEGORÍA
// ============================================================================

/**
 * Obtiene categorías disponibles con conteo de items
 */
export async function getCategoriesForTransferAction(): Promise<{
    success: boolean;
    categories?: { name: string; count: number }[];
}> {
    try {
        const items = await prisma.inventoryItem.groupBy({
            by: ['category'],
            where: {
                isActive: true,
                category: { not: null }
            },
            _count: { id: true },
            orderBy: { category: 'asc' }
        });

        return {
            success: true,
            categories: items
                .filter(i => i.category)
                .map(i => ({
                    name: i.category!,
                    count: i._count.id
                }))
        };
    } catch (error) {
        console.error('Error getting categories:', error);
        return { success: false };
    }
}

/**
 * Previsualiza qué items se transferirían por categoría
 */
export async function previewBulkTransferAction(
    category: string,
    sourceAreaId: string
): Promise<{
    success: boolean;
    message: string;
    items?: { id: string; name: string; currentStock: number; unit: string }[];
}> {
    try {
        // Obtener items de la categoría con stock en el área origen
        const locations = await prisma.inventoryLocation.findMany({
            where: {
                areaId: sourceAreaId,
                currentStock: { gt: 0 },
                inventoryItem: {
                    category: { equals: category, mode: 'insensitive' },
                    isActive: true
                }
            },
            include: {
                inventoryItem: { select: { id: true, name: true, baseUnit: true } }
            }
        });

        if (locations.length === 0) {
            return {
                success: false,
                message: `No hay items de categoría "${category}" con stock en el área seleccionada`
            };
        }

        return {
            success: true,
            message: `${locations.length} items encontrados`,
            items: locations.map(loc => ({
                id: loc.inventoryItemId,
                name: loc.inventoryItem.name,
                currentStock: loc.currentStock,
                unit: loc.inventoryItem.baseUnit
            }))
        };
    } catch (error) {
        console.error('Error previewing bulk transfer:', error);
        return { success: false, message: 'Error al previsualizar transferencia' };
    }
}

/**
 * Ejecuta transferencia masiva de TODA una categoría de un área a otra
 * Esto mueve TODO el stock disponible, sin necesidad de aprobación
 */
export async function executeBulkTransferAction(
    category: string,
    sourceAreaId: string,
    targetAreaId: string,
    userId: string,
    excludedItemIds: string[] = []
): Promise<ActionResult> {
    try {
        if (sourceAreaId === targetAreaId) {
            return { success: false, message: 'Origen y destino no pueden ser iguales' };
        }

        // Validar usuario
        let executorId = userId;
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
            if (owner) executorId = owner.id;
        }

        // Obtener items con stock en origen (excluyendo los indicados)
        const locationsToTransfer = await prisma.inventoryLocation.findMany({
            where: {
                areaId: sourceAreaId,
                currentStock: { gt: 0 },
                inventoryItem: {
                    category: { equals: category, mode: 'insensitive' },
                    isActive: true,
                    id: { notIn: excludedItemIds }
                }
            },
            include: {
                inventoryItem: { select: { id: true, name: true, baseUnit: true } }
            }
        });

        if (locationsToTransfer.length === 0) {
            return {
                success: false,
                message: `No hay items de categoría "${category}" con stock en el área origen`
            };
        }

        // Generar código de transferencia
        const count = await prisma.requisition.count();
        const code = `BULK-${(count + 1).toString().padStart(4, '0')}`;

        // Ejecutar transferencia en transacción
        await prisma.$transaction(async (tx) => {
            // Crear requisición como historial
            const req = await tx.requisition.create({
                data: {
                    code,
                    requestedById: executorId,
                    processedById: executorId,
                    sourceAreaId,
                    targetAreaId,
                    status: 'COMPLETED',
                    processedAt: new Date(),
                    notes: `Transferencia masiva de categoría: ${category}`,
                    items: {
                        create: locationsToTransfer.map(loc => ({
                            inventoryItemId: loc.inventoryItemId,
                            quantity: loc.currentStock,
                            unit: loc.inventoryItem.baseUnit,
                            dispatchedQuantity: loc.currentStock
                        }))
                    }
                }
            });

            // Procesar cada item
            for (const loc of locationsToTransfer) {
                const qty = loc.currentStock;

                // Movimiento de salida
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: loc.inventoryItemId,
                        movementType: 'TRANSFER_OUT',
                        quantity: qty,
                        unit: loc.inventoryItem.baseUnit,
                        createdById: executorId,
                        notes: `Transferencia masiva ${code}`,
                        reason: `Categoría ${category} → Destino`
                    }
                });

                // Reducir stock en origen (poner a 0)
                await tx.inventoryLocation.update({
                    where: {
                        inventoryItemId_areaId: {
                            inventoryItemId: loc.inventoryItemId,
                            areaId: sourceAreaId
                        }
                    },
                    data: {
                        currentStock: 0,
                        lastCountDate: new Date()
                    }
                });

                // Sumar stock en destino
                await tx.inventoryLocation.upsert({
                    where: {
                        inventoryItemId_areaId: {
                            inventoryItemId: loc.inventoryItemId,
                            areaId: targetAreaId
                        }
                    },
                    create: {
                        inventoryItemId: loc.inventoryItemId,
                        areaId: targetAreaId,
                        currentStock: qty,
                        lastCountDate: new Date()
                    },
                    update: {
                        currentStock: { increment: qty },
                        lastCountDate: new Date()
                    }
                });
            }
        }, { timeout: 180000 }); // 3 minutes for large transfers

        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/transferencias');

        return {
            success: true,
            message: `✅ Transferencia ${code} completada: ${locationsToTransfer.length} items de "${category}" movidos`,
            data: { code, count: locationsToTransfer.length }
        };

    } catch (error) {
        console.error('Error executing bulk transfer:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al ejecutar transferencia'
        };
    }
}
