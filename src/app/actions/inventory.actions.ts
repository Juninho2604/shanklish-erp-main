'use server';

import { prisma } from '@/server/db';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

export async function createQuickItem(data: {
    name: string;
    unit: string;
    type: string;
    categoryId?: string;
    userId: string;
    cost?: number;
    // Nuevos campos para stock inicial durante creación en transferencias
    sourceAreaId?: string;   // Área donde está actualmente el producto
    initialStock?: number;   // Stock total que hay en esa área ahora mismo
    isFinalProduct?: boolean; // Si es FINISHED_GOOD → también crear stub de receta
}) {
    try {
        // Generate a SKU
        const skuPrefix = data.name.substring(0, 3).toUpperCase().replace(/\s/g, '');
        const count = await prisma.inventoryItem.count();
        const sku = `${skuPrefix}-${String(count + 1).padStart(4, '0')}`;

        // Create the item
        const item = await prisma.inventoryItem.create({
            data: {
                name: data.name,
                sku: sku,
                type: data.type,
                baseUnit: data.unit,
                category: data.categoryId,
                isActive: true,
                description: 'Creado en flujo de transferencia (migración)',
            },
        });

        // Si se indicó área de origen + stock inicial → crear InventoryLocation y movimiento ADJUSTMENT_IN
        if (data.sourceAreaId && data.initialStock && data.initialStock > 0) {
            // Crear o actualizar la ubicación del inventario en esa área
            await prisma.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: item.id,
                        areaId: data.sourceAreaId
                    }
                },
                create: {
                    inventoryItemId: item.id,
                    areaId: data.sourceAreaId,
                    currentStock: data.initialStock,
                    lastCountDate: new Date(),
                },
                update: {
                    currentStock: data.initialStock,
                    lastCountDate: new Date(),
                }
            });

            // Registrar movimiento de entrada inicial
            await prisma.inventoryMovement.create({
                data: {
                    inventoryItemId: item.id,
                    movementType: 'ADJUSTMENT_IN',
                    quantity: data.initialStock,
                    unit: data.unit,
                    reason: 'Stock inicial — Creado durante transferencia (migración)',
                    notes: `Producto nuevo. Stock inicial registrado en el área de origen.`,
                    createdById: data.userId,
                }
            });
        }

        // Si es producto terminado (FINISHED_GOOD) → crear stub de receta vacía
        if (data.type === 'FINISHED_GOOD' || data.isFinalProduct) {
            try {
                const recipe = await prisma.recipe.create({
                    data: {
                        name: data.name,
                        description: `Receta de ${data.name} — completar ingredientes`,
                        outputItemId: item.id,
                        outputQuantity: 1,
                        outputUnit: data.unit,
                        yieldPercentage: 100,
                        isApproved: true,
                        createdById: data.userId,
                    }
                });
                console.log(`Receta stub creada para ${data.name}: ${recipe.id}`);
            } catch (recipeErr) {
                console.warn('No se pudo crear receta stub:', recipeErr);
            }
        }

        // If cost is provided, add an initial cost history
        if (data.cost && data.cost > 0) {
            await prisma.costHistory.create({
                data: {
                    inventoryItemId: item.id,
                    costPerUnit: data.cost,
                    createdById: data.userId,
                    reason: 'Costo Inicial (Creación Rápida)',
                    effectiveFrom: new Date(),
                }
            });
        }

        revalidatePath('/dashboard/inventario/entrada');
        revalidatePath('/dashboard/transferencias');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/compras');
        revalidatePath('/dashboard/proteinas');
        revalidatePath('/dashboard/recetas');

        return { success: true, message: 'Item creado exitosamente', item };
    } catch (error) {
        console.error('Error creating quick item:', error);
        return { success: false, message: 'Error al crear el item' };
    }
}

export async function getInventoryListAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: { isActive: true },
            include: {
                stockLevels: true,
                costHistory: {
                    where: { effectiveTo: null },
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1
                }
            },
            orderBy: { name: 'asc' }
        });

        return items.map(item => ({
            ...item,
            currentStock: item.stockLevels.reduce((acc, level) => acc + Number(level.currentStock), 0),
            stockByArea: item.stockLevels.map(sl => ({ areaId: sl.areaId, quantity: Number(sl.currentStock) })),
            costPerUnit: item.costHistory[0] ? Number(item.costHistory[0].costPerUnit) : 0
        }));
    } catch (error) {
        console.error('Error getting inventory list:', error);
        return [];
    }
}

export async function getAreasAction() {
    try {
        return await prisma.area.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });
    } catch (error) {
        console.error('Error getting areas:', error);
        return [];
    }
}

export async function updateInventoryItemAction(id: string, data: any) {
    try {
        await prisma.inventoryItem.update({
            where: { id },
            data: {
                name: data.name,
                sku: data.sku,
                category: data.category,
                baseUnit: data.baseUnit,
                minimumStock: data.minimumStock,
                reorderPoint: data.reorderPoint
            }
        });
        revalidatePath('/dashboard/inventario');
        return { success: true, message: 'Ítem actualizado correctamente' };
    } catch (error) {
        console.error('Error updating item:', error);
        return { success: false, message: 'Error al actualizar el ítem' };
    }
}

export async function deleteInventoryItemAction(id: string) {
    try {
        const session = await getSession();
        if (!session?.id) return { success: false, message: 'No autorizado' };

        const allowedRoles = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'];
        if (!allowedRoles.includes(session.role)) {
            return {
                success: false,
                message: 'No tienes permisos para eliminar productos. Se requiere rol Gerencial.'
            };
        }

        // Verificar si tiene transacciones históricas importantes antes de 'eliminar'
        // Por ahora haremos Soft Delete (isActive = false)
        await prisma.inventoryItem.update({
            where: { id },
            data: { isActive: false }
        });

        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/inventario/entrada');
        return { success: true, message: 'Ítem eliminado correctamente' };
    } catch (error) {
        console.error('Error deleting item:', error);
        return { success: false, message: 'Error al eliminar el ítem' };
    }
}

export async function getInventoryHistoryAction(filters?: {
    type?: 'INCOMING' | 'OUTGOING' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER_IN' | 'TRANSFER_OUT';
    limit?: number;
}) {
    try {
        const movements = await prisma.inventoryMovement.findMany({
            where: {
                ...(filters?.type ? { movementType: filters.type } : {}),
            },
            take: filters?.limit || 100,
            orderBy: { createdAt: 'desc' },
            include: {
                inventoryItem: {
                    select: { name: true, sku: true, baseUnit: true }
                },
                createdBy: {
                    select: { firstName: true, lastName: true }
                }
            }
        });

        return movements;
    } catch (error) {
        console.error('Error fetching inventory history:', error);
        return [];
    }
}
