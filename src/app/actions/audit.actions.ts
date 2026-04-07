'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { getSession } from '@/lib/auth';

export interface CreateAuditInput {
    name: string;
    notes?: string;
    areaId?: string;
    effectiveDate?: string; // ISO date string (YYYY-MM-DD) para auditorías retroactivas
    items: {
        inventoryItemId: string;
        countedStock: number;
    }[];
}

export interface UpdateAuditItemInput {
    itemId: string; // Audit Item ID
    countedStock: number;
    notes?: string;
}

export interface ApproveAuditInput {
    auditId: string;
    areaId?: string; // Optional - if not provided, will use audit's areaId or fallback to Almacén Principal
}

// --- Getters ---

export async function getAuditsAction() {
    try {
        const audits = await prisma.inventoryAudit.findMany({
            include: {
                createdBy: { select: { firstName: true, lastName: true } },
                resolvedBy: { select: { firstName: true, lastName: true } },
                _count: { select: { items: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        return audits;
    } catch (error) {
        console.error('Error fetching audits:', error);
        return [];
    }
}

export async function getAuditAction(id: string) {
    try {
        const audit = await prisma.inventoryAudit.findUnique({
            where: { id },
            include: {
                createdBy: { select: { firstName: true, lastName: true } },
                resolvedBy: { select: { firstName: true, lastName: true } },
                items: {
                    include: {
                        inventoryItem: true
                    },
                    orderBy: { inventoryItem: { name: 'asc' } }
                }
            }
        });
        return audit;
    } catch (error) {
        console.error('Error fetching audit:', error);
        return null;
    }
}

// --- Mutations ---

export async function createAuditAction(input: CreateAuditInput) {
    const session = await getSession();
    if (!session?.id) return { success: false, message: 'No autorizado' };
    const userId = session.id;

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Audit Header
            const audit = await tx.inventoryAudit.create({
                data: {
                    name: input.name,
                    notes: input.notes,
                    areaId: input.areaId,
                    status: 'DRAFT',
                    effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
                    createdById: userId
                }
            });

            // 2. Optimization: Fetch all items in one query
            const itemIds = input.items.map(i => i.inventoryItemId);
            const dbItems = await tx.inventoryItem.findMany({
                where: { id: { in: itemIds } },
                include: {
                    stockLevels: true,
                    costHistory: { orderBy: { effectiveFrom: 'desc' }, take: 1 }
                }
            });

            const dbItemsMap = new Map(dbItems.map(i => [i.id, i]));
            const auditItemsData = [];

            for (const itemInput of input.items) {
                const dbItem = dbItemsMap.get(itemInput.inventoryItemId);
                if (!dbItem) continue;

                let systemStock = 0;
                if (input.areaId) {
                    const loc = dbItem.stockLevels.find(l => l.areaId === input.areaId);
                    systemStock = loc ? loc.currentStock : 0;
                } else {
                    systemStock = dbItem.stockLevels.reduce((acc, loc) => acc + loc.currentStock, 0);
                }

                const costSnapshot = dbItem.costHistory[0]?.costPerUnit || 0;

                auditItemsData.push({
                    auditId: audit.id,
                    inventoryItemId: itemInput.inventoryItemId,
                    systemStock: systemStock,
                    countedStock: itemInput.countedStock,
                    difference: itemInput.countedStock - systemStock,
                    costSnapshot: costSnapshot
                });
            }

            if (auditItemsData.length > 0) {
                await tx.inventoryAuditItem.createMany({
                    data: auditItemsData
                });
            }

            return audit;
        }, { timeout: 30000 });

        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/inventario/auditorias');
        return { success: true, message: 'Auditoría creada correctamente', auditId: result.id };
    } catch (error) {
        console.error('Error creating audit:', error);
        return { success: false, message: `Error al crear auditoría: ${error instanceof Error ? error.message : JSON.stringify(error)}` };
    }
}

export async function updateAuditItemAction(input: UpdateAuditItemInput) {
    const session = await getSession();
    if (!session?.id) return { success: false, message: 'No autorizado' };

    try {
        const item = await prisma.inventoryAuditItem.findUnique({ where: { id: input.itemId }, include: { audit: true } });
        if (!item) return { success: false, message: 'Item no encontrado' };
        if (item.audit.status !== 'DRAFT') return { success: false, message: 'Auditoría cerrada' };

        const difference = input.countedStock - item.systemStock;

        await prisma.inventoryAuditItem.update({
            where: { id: input.itemId },
            data: {
                countedStock: input.countedStock,
                difference: difference,
                notes: input.notes
            }
        });

        revalidatePath(`/dashboard/inventario/auditorias`);
        return { success: true, message: 'Conteo actualizado' };
    } catch (error) {
        console.error('Error updating audit item:', error);
        return { success: false, message: 'Error al actualizar item' };
    }
}

export async function approveAuditAction(input: ApproveAuditInput) {
    const session = await getSession();
    if (!session?.id) return { success: false, message: 'No autorizado' };
    const userId = session.id;

    try {
        // OPTIMIZATION: Get area ID OUTSIDE the transaction to reduce transaction time
        let targetAreaId = input.areaId;
        if (!targetAreaId) {
            // Try exact match first (with accent)
            let mainArea = await prisma.area.findFirst({
                where: { name: 'Almacén Principal' }
            });

            // Fallback: search by partial match without accent
            if (!mainArea) {
                mainArea = await prisma.area.findFirst({
                    where: {
                        OR: [
                            { name: { contains: 'Almacen', mode: 'insensitive' } },
                            { name: { contains: 'Principal', mode: 'insensitive' } }
                        ]
                    }
                });
            }

            // Final fallback: use first available area
            if (!mainArea) {
                mainArea = await prisma.area.findFirst();
            }

            targetAreaId = mainArea?.id;
        }

        if (!targetAreaId) {
            return { success: false, message: 'No se encontró un área destino para los ajustes' };
        }

        const result = await prisma.$transaction(async (tx) => {
            const audit = await tx.inventoryAudit.findUnique({
                where: { id: input.auditId },
                include: { items: true }
            });

            if (!audit) throw new Error("Auditoría no encontrada");
            if (audit.status !== 'DRAFT') throw new Error("La auditoría ya no está en borrador");

            // Use the areaId from audit if available, otherwise use the one we found
            const areaToUse = audit.areaId || targetAreaId;

            await tx.inventoryAudit.update({
                where: { id: input.auditId },
                data: {
                    status: 'APPROVED',
                    resolvedAt: new Date(),
                    resolvedById: userId,
                    areaId: areaToUse // Store the area used
                }
            });

            // === SOPORTE PARA AUDITORÍA RETROACTIVA ===
            // Si la auditoría tiene effectiveDate, buscamos los movimientos que ocurrieron DESPUÉS
            // de esa fecha para sumarlos al stock contado (así no se pierden entradas/transferencias de hoy)
            const isRetroactive = audit.effectiveDate !== null;

            // Calcular movimientos post-auditoría por item (solo si es retroactiva)
            const postAuditMovements: Map<string, number> = new Map();
            if (isRetroactive && audit.effectiveDate) {
                const movements = await tx.inventoryMovement.findMany({
                    where: {
                        createdAt: { gt: audit.effectiveDate },
                        inventoryItemId: { in: audit.items.map(i => i.inventoryItemId) }
                    }
                });
                for (const mov of movements) {
                    const current = postAuditMovements.get(mov.inventoryItemId) || 0;
                    // ADJUSTMENT_IN, PURCHASE, PRODUCTION_IN, TRANSFER_IN suman
                    // ADJUSTMENT_OUT, SALE, PRODUCTION_OUT, TRANSFER_OUT restan
                    const isInbound = ['ADJUSTMENT_IN', 'PURCHASE', 'PRODUCTION_IN', 'PRODUCTION'].includes(mov.movementType) && mov.quantity > 0;
                    const delta = isInbound ? Math.abs(mov.quantity) : -Math.abs(mov.quantity);
                    postAuditMovements.set(mov.inventoryItemId, current + delta);
                }
            }

            // Process items with differences
            for (const item of audit.items) {
                // Para auditoría retroactiva: el stock final = stock contado + movimientos posteriores
                const postMovement = postAuditMovements.get(item.inventoryItemId) || 0;
                const finalStock = isRetroactive ? item.countedStock + postMovement : item.countedStock;

                // Obtener stock actual del sistema para calcular la diferencia real
                const currentLocation = await tx.inventoryLocation.findFirst({
                    where: {
                        inventoryItemId: item.inventoryItemId,
                        areaId: areaToUse!
                    }
                });
                const currentStock = currentLocation?.currentStock || 0;
                const realDifference = finalStock - currentStock;

                if (Math.abs(realDifference) > 0.0001) {
                    const movementType = realDifference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

                    await tx.inventoryMovement.create({
                        data: {
                            inventoryItemId: item.inventoryItemId,
                            movementType: movementType as any,
                            quantity: Math.abs(realDifference),
                            unit: 'UNIT',
                            reason: `Auditoría${isRetroactive ? ' retroactiva' : ''}: ${audit.name}`,
                            notes: isRetroactive
                                ? `Ajuste por auditoría retroactiva. Conteo: ${item.countedStock}, Mov. posteriores: ${postMovement > 0 ? '+' : ''}${postMovement.toFixed(2)}, Stock final: ${finalStock.toFixed(2)}`
                                : `Ajuste automático por aprobación de auditoría #${audit.id}`,
                            createdById: userId,
                            totalCost: item.costSnapshot ? item.costSnapshot * Math.abs(realDifference) : 0
                        }
                    });

                    // Actualizar el stock al valor final calculado
                    await tx.inventoryLocation.upsert({
                        where: {
                            inventoryItemId_areaId: {
                                inventoryItemId: item.inventoryItemId,
                                areaId: areaToUse!
                            }
                        },
                        create: {
                            inventoryItemId: item.inventoryItemId,
                            areaId: areaToUse!,
                            currentStock: finalStock
                        },
                        update: {
                            currentStock: finalStock
                        }
                    });
                }
            }
            return audit;
        }, { timeout: 180000 }); // Increased from 30s to 180s (3 minutes)

        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/inventario/auditorias');
        revalidatePath('/dashboard');
        return { success: true, message: 'Auditoría aprobada y stock actualizado' };

    } catch (error) {
        console.error('Error approving audit:', error);
        return { success: false, message: `Error: ${error instanceof Error ? error.message : 'Desconocido'}` };
    }
}

export async function rejectAuditAction(auditId: string) {
    const session = await getSession();
    if (!session?.id) return { success: false };

    try {
        await prisma.inventoryAudit.update({
            where: { id: auditId },
            data: { status: 'REJECTED' }
        });
        revalidatePath('/dashboard/inventario/auditorias');
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}

export async function voidAuditAction(auditId: string) {
    const session = await getSession();
    if (!session?.id) return { success: false, message: 'Usuario no encontrado' };
    const userId = session.id;

    const allowedRoles = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'];
    if (!allowedRoles.includes(session.role)) {
        return { success: false, message: 'No tienes permisos para anular auditorías (Solo Gerencia/Auditores)' };
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const audit = await tx.inventoryAudit.findUnique({
                where: { id: auditId },
                include: { items: true }
            });

            if (!audit) throw new Error("Auditoría no encontrada");
            if (audit.status !== 'APPROVED') throw new Error("Solo se pueden anular auditorías aprobadas");

            await tx.inventoryAudit.update({
                where: { id: auditId },
                data: {
                    status: 'VOIDED',
                    notes: (audit.notes || '') + `\n[ANULADO] por usuario ${session.firstName || 'Usuario'} el ${new Date().toLocaleString()}`
                }
            });

            for (const item of audit.items) {
                if (Math.abs(item.difference) > 0.0001) {
                    const reversalType = item.difference > 0 ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN';
                    const qty = Math.abs(item.difference);

                    await tx.inventoryMovement.create({
                        data: {
                            inventoryItemId: item.inventoryItemId,
                            movementType: reversalType as any,
                            quantity: qty,
                            unit: 'UNIT',
                            reason: `Anulación Auditoría: ${audit.name}`,
                            notes: `Reversión automática de auditoría #${audit.id}`,
                            createdById: userId,
                            totalCost: item.costSnapshot ? item.costSnapshot * qty : 0
                        }
                    });

                    let targetAreaId = audit.areaId;
                    if (!targetAreaId) {
                        const mainArea = await tx.area.findFirst({ where: { name: 'Almacén Principal' } });
                        if (mainArea) targetAreaId = mainArea.id;
                    }

                    if (targetAreaId) {
                        await tx.inventoryLocation.updateMany({
                            where: {
                                inventoryItemId: item.inventoryItemId,
                                areaId: targetAreaId
                            },
                            data: {
                                currentStock: { increment: -item.difference }
                            }
                        });
                    }
                }
            }
            return audit;
        });

        revalidatePath('/dashboard/inventario/auditorias');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard');
        return { success: true, message: 'Auditoría anulada y stock revertido' };

    } catch (error) {
        console.error('Error voiding audit:', error);
        return { success: false, message: `Error: ${error instanceof Error ? error.message : 'Desconocido'}` };
    }
}

export async function deleteAuditAction(auditId: string) {
    const session = await getSession();
    if (!session?.id) return { success: false };

    try {
        await prisma.inventoryAudit.update({
            where: { id: auditId },
            data: { deletedAt: new Date(), deletedById: session.id }
        });
        revalidatePath('/dashboard/inventario/auditorias');
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}
