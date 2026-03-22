'use server';

/**
 * SHANKLISH CARACAS ERP - Production Actions
 * 
 * Server Actions para gestión de producción conectadas a Prisma
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/server/db';
import { getSession } from '@/lib/auth';

// ============================================================================
// TIPOS
// ============================================================================

export interface QuickProductionFormData {
    recipeId: string;
    actualQuantity: number;
    areaId: string; // Área donde se produce (ej: Centro de Producción)
    notes?: string;
}

export interface ProductionActionResult {
    success: boolean;
    message: string;
    data?: {
        orderNumber?: string;
        productAdded?: { name: string; quantity: number; unit: string };
        ingredientsConsumed?: { name: string; quantity: number; unit: string }[];
        actualYield?: number;
    };
}

export interface IngredientRequirement {
    itemId: string;
    itemName: string;
    required: number;
    gross: number;
    unit: string;
    available: number;
    sufficient: boolean;
}

// ============================================================================
// ACTION: OBTENER RECETAS DISPONIBLES PARA PRODUCCIÓN
// ============================================================================

export async function getProductionRecipesAction() {
    try {
        const recipes = await prisma.recipe.findMany({
            where: { isActive: true },
            include: {
                outputItem: {
                    select: { name: true, type: true, baseUnit: true }
                },
                ingredients: true
            },
            orderBy: { name: 'asc' }
        });

        return recipes.map(recipe => ({
            id: recipe.id,
            name: recipe.name,
            outputItemId: recipe.outputItemId,
            outputItemName: recipe.outputItem.name,
            outputItemType: recipe.outputItem.type,
            outputQuantity: Number(recipe.outputQuantity),
            outputUnit: recipe.outputUnit,
            yieldPercentage: Number(recipe.yieldPercentage),
            ingredientCount: recipe.ingredients.length,
        }));
    } catch (error) {
        console.error('Error fetching recipes:', error);
        return [];
    }
}

// ============================================================================
// ACTION: CALCULAR REQUERIMIENTOS DE INGREDIENTES
// ============================================================================

export async function calculateRequirementsAction(
    recipeId: string,
    quantity: number,
    areaId: string
): Promise<{ success: boolean; requirements: IngredientRequirement[] }> {
    try {
        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
            include: {
                ingredients: {
                    include: {
                        ingredientItem: {
                            include: {
                                stockLevels: {
                                    where: { areaId }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!recipe) {
            return { success: false, requirements: [] };
        }

        const scaleFactor = quantity / Number(recipe.outputQuantity);

        const requirements: IngredientRequirement[] = recipe.ingredients.map(ing => {
            const required = Number(ing.quantity) * scaleFactor;
            const wastePercent = Number(ing.wastePercentage) || 0;
            const gross = wastePercent < 100
                ? required / (1 - wastePercent / 100)
                : required;

            // Stock disponible en el área especificada
            const stockLevel = ing.ingredientItem.stockLevels[0];
            const available = stockLevel ? Number(stockLevel.currentStock) : 0;

            return {
                itemId: ing.ingredientItemId,
                itemName: ing.ingredientItem.name,
                required: parseFloat(required.toFixed(4)),
                gross: parseFloat(gross.toFixed(4)),
                unit: ing.unit,
                available: parseFloat(available.toFixed(3)),
                sufficient: available >= gross,
            };
        });

        return { success: true, requirements };
    } catch (error) {
        console.error('Error calculating requirements:', error);
        return { success: false, requirements: [] };
    }
}

// ============================================================================
// ACTION: PRODUCCIÓN RÁPIDA (REAL - CONECTADO A BD)
// ============================================================================

export async function quickProductionAction(
    formData: QuickProductionFormData
): Promise<ProductionActionResult> {
    try {
        const session = await getSession();
        if (!session?.id) {
            return { success: false, message: 'No autorizado' };
        }
        const userId = session.id;

        // 1. Obtener receta con ingredientes
        const recipe = await prisma.recipe.findUnique({
            where: { id: formData.recipeId },
            include: {
                outputItem: true,
                ingredients: {
                    include: {
                        ingredientItem: {
                            include: {
                                stockLevels: {
                                    where: { areaId: formData.areaId }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!recipe) {
            return { success: false, message: 'Receta no encontrada' };
        }

        const scaleFactor = formData.actualQuantity / Number(recipe.outputQuantity);

        // 2. Verificar stock disponible
        const ingredientsToConsume: { itemId: string; name: string; quantity: number; unit: string; stockLevelId: string }[] = [];
        const stockErrors: string[] = [];

        for (const ing of recipe.ingredients) {
            const required = Number(ing.quantity) * scaleFactor;
            const wastePercent = Number(ing.wastePercentage) || 0;
            const grossQty = wastePercent < 100
                ? required / (1 - wastePercent / 100)
                : required;

            const stockLevel = ing.ingredientItem.stockLevels[0];
            const currentStock = stockLevel ? Number(stockLevel.currentStock) : 0;

            if (currentStock < grossQty) {
                stockErrors.push(`${ing.ingredientItem.name}: necesario ${grossQty.toFixed(3)}, disponible ${currentStock.toFixed(3)}`);
            } else if (stockLevel) {
                ingredientsToConsume.push({
                    itemId: ing.ingredientItemId,
                    name: ing.ingredientItem.name,
                    quantity: parseFloat(grossQty.toFixed(4)),
                    unit: ing.unit,
                    stockLevelId: stockLevel.id
                });
            }
        }

        if (stockErrors.length > 0) {
            return {
                success: false,
                message: `Stock insuficiente:\n${stockErrors.join('\n')}`,
            };
        }

        // 3. Generar número de orden
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.productionOrder.count({
            where: {
                createdAt: {
                    gte: new Date(today.setHours(0, 0, 0, 0))
                }
            }
        });
        const orderNumber = `PROD-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        // 4. Ejecutar transacción
        const result = await prisma.$transaction(async (tx) => {
            // 4a. Crear orden de producción
            const productionOrder = await tx.productionOrder.create({
                data: {
                    orderNumber,
                    recipeId: formData.recipeId,
                    outputItemId: recipe.outputItemId,
                    plannedQuantity: formData.actualQuantity,
                    actualQuantity: formData.actualQuantity,
                    unit: recipe.outputUnit,
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    notes: formData.notes,
                    createdById: userId,
                    actualYieldPercentage: Number(recipe.yieldPercentage),
                }
            });

            // 4b. Descontar ingredientes del área de producción
            for (const ing of ingredientsToConsume) {
                // Actualizar stock
                await tx.inventoryLocation.update({
                    where: { id: ing.stockLevelId },
                    data: {
                        currentStock: { decrement: ing.quantity }
                    }
                });

                // Crear movimiento de salida (consumo)
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: ing.itemId,
                        movementType: 'PRODUCTION_OUT',
                        quantity: -ing.quantity,
                        unit: ing.unit,
                        reason: `Producción: ${recipe.name}`,
                        notes: `Orden: ${orderNumber}`,
                        createdById: userId,
                    }
                });
            }

            // 4c. Sumar producto terminado al área de producción
            // Buscar o crear el InventoryLocation para el producto
            let outputStock = await tx.inventoryLocation.findUnique({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: recipe.outputItemId,
                        areaId: formData.areaId
                    }
                }
            });

            if (outputStock) {
                await tx.inventoryLocation.update({
                    where: { id: outputStock.id },
                    data: {
                        currentStock: { increment: formData.actualQuantity }
                    }
                });
            } else {
                await tx.inventoryLocation.create({
                    data: {
                        inventoryItemId: recipe.outputItemId,
                        areaId: formData.areaId,
                        currentStock: formData.actualQuantity
                    }
                });
            }

            // Crear movimiento de entrada (producción)
            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: recipe.outputItemId,
                    movementType: 'PRODUCTION_IN',
                    quantity: formData.actualQuantity,
                    unit: recipe.outputUnit,
                    reason: `Producción: ${recipe.name}`,
                    notes: `Orden: ${orderNumber}`,
                    createdById: userId,
                }
            });

            return productionOrder;
        });

        // 5. Revalidar páginas
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/produccion');

        return {
            success: true,
            message: `¡Producción completada! Orden: ${result.orderNumber}`,
            data: {
                orderNumber: result.orderNumber,
                productAdded: {
                    name: recipe.outputItem.name,
                    quantity: formData.actualQuantity,
                    unit: recipe.outputUnit,
                },
                ingredientsConsumed: ingredientsToConsume.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit
                })),
                actualYield: Number(recipe.yieldPercentage),
            },
        };

    } catch (error) {
        console.error('Error en quickProductionAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al registrar producción',
        };
    }
}

// ============================================================================
// ACTION: OBTENER HISTORIAL DE PRODUCCIONES
// ============================================================================

export async function getProductionHistoryAction(filters?: {
    limit?: number;
    status?: string;
}) {
    try {
        const orders = await prisma.productionOrder.findMany({
            where: filters?.status ? { status: filters.status } : {},
            take: filters?.limit || 50,
            orderBy: { createdAt: 'desc' },
            include: {
                recipe: {
                    select: { name: true }
                },
                createdBy: {
                    select: { firstName: true, lastName: true }
                }
            }
        });

        return orders.map(order => ({
            id: order.id,
            orderNumber: order.orderNumber,
            recipeName: order.recipe.name,
            plannedQuantity: Number(order.plannedQuantity),
            actualQuantity: order.actualQuantity ? Number(order.actualQuantity) : null,
            unit: order.unit,
            status: order.status,
            createdBy: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
            createdAt: order.createdAt,
            completedAt: order.completedAt,
            notes: order.notes,
        }));
    } catch (error) {
        console.error('Error fetching production history:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER ÁREAS DISPONIBLES PARA PRODUCCIÓN
// ============================================================================

export async function getProductionAreasAction() {
    try {
        const areas = await prisma.area.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });
        return areas;
    } catch (error) {
        console.error('Error fetching areas:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER ITEMS DE INVENTARIO PARA PRODUCCIÓN MANUAL
// ============================================================================

export async function getProductionItemsAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                type: true,
                baseUnit: true,
                category: true,
            },
            orderBy: { name: 'asc' }
        });
        return items;
    } catch (error) {
        console.error('Error fetching items:', error);
        return [];
    }
}

// ============================================================================
// ACTION: PRODUCCIÓN MANUAL (SIN RECETA)
// ============================================================================

export interface ManualProductionFormData {
    outputItemId: string;
    outputQuantity: number;
    outputUnit: string;
    areaId: string;
    ingredients: {
        itemId: string;
        quantity: number;
        unit: string;
    }[];
    notes?: string;
}

export async function manualProductionAction(
    formData: ManualProductionFormData
): Promise<ProductionActionResult> {
    try {
        const session = await getSession();
        if (!session?.id) {
            return { success: false, message: 'No autorizado' };
        }
        const userId = session.id;

        // Obtener info del producto de salida
        const outputItem = await prisma.inventoryItem.findUnique({
            where: { id: formData.outputItemId }
        });
        if (!outputItem) {
            return { success: false, message: 'Producto de salida no encontrado' };
        }

        // Verificar stock de ingredientes
        const ingredientsToConsume: { itemId: string; name: string; quantity: number; unit: string; stockLevelId: string }[] = [];
        const stockErrors: string[] = [];

        for (const ing of formData.ingredients) {
            const item = await prisma.inventoryItem.findUnique({
                where: { id: ing.itemId },
                include: {
                    stockLevels: {
                        where: { areaId: formData.areaId }
                    }
                }
            });

            if (!item) {
                stockErrors.push(`Item no encontrado: ${ing.itemId}`);
                continue;
            }

            const stockLevel = item.stockLevels[0];
            const currentStock = stockLevel ? Number(stockLevel.currentStock) : 0;

            if (currentStock < ing.quantity) {
                stockErrors.push(`${item.name}: necesario ${ing.quantity.toFixed(3)}, disponible ${currentStock.toFixed(3)}`);
            } else if (stockLevel) {
                ingredientsToConsume.push({
                    itemId: ing.itemId,
                    name: item.name,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    stockLevelId: stockLevel.id
                });
            } else {
                stockErrors.push(`${item.name}: no tiene stock en esta área`);
            }
        }

        if (stockErrors.length > 0) {
            return {
                success: false,
                message: `Stock insuficiente:\n${stockErrors.join('\n')}`,
            };
        }

        // Generar número de orden
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.productionOrder.count({
            where: {
                createdAt: {
                    gte: new Date(today.getFullYear(), today.getMonth(), today.getDate())
                }
            }
        });
        const orderNumber = `PROD-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        // Buscar o crear una receta temporal para esta producción manual
        // Usamos la primera receta que tenga este outputItemId, o creamos una genérica
        let recipeId: string;
        const existingRecipe = await prisma.recipe.findFirst({
            where: { outputItemId: formData.outputItemId, isActive: true }
        });

        if (existingRecipe) {
            recipeId = existingRecipe.id;
        } else {
            // Crear una receta genérica para poder vincular la producción
            const newRecipe = await prisma.recipe.create({
                data: {
                    name: `Producción manual: ${outputItem.name}`,
                    outputItemId: formData.outputItemId,
                    outputQuantity: formData.outputQuantity,
                    outputUnit: formData.outputUnit,
                    yieldPercentage: 100,
                    isApproved: true,
                    isActive: true,
                    createdById: userId,
                }
            });
            recipeId = newRecipe.id;
        }

        // Ejecutar transacción
        const result = await prisma.$transaction(async (tx) => {
            // Crear orden de producción
            const productionOrder = await tx.productionOrder.create({
                data: {
                    orderNumber,
                    recipeId,
                    outputItemId: formData.outputItemId,
                    plannedQuantity: formData.outputQuantity,
                    actualQuantity: formData.outputQuantity,
                    unit: formData.outputUnit,
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    notes: formData.notes || `Producción manual`,
                    createdById: userId,
                    actualYieldPercentage: 100,
                }
            });

            // Descontar ingredientes
            for (const ing of ingredientsToConsume) {
                await tx.inventoryLocation.update({
                    where: { id: ing.stockLevelId },
                    data: { currentStock: { decrement: ing.quantity } }
                });

                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: ing.itemId,
                        movementType: 'PRODUCTION_OUT',
                        quantity: -ing.quantity,
                        unit: ing.unit,
                        reason: `Producción manual: ${outputItem.name}`,
                        notes: `Orden: ${orderNumber}`,
                        createdById: userId,
                    }
                });
            }

            // Sumar producto terminado
            let outputStock = await tx.inventoryLocation.findUnique({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: formData.outputItemId,
                        areaId: formData.areaId
                    }
                }
            });

            if (outputStock) {
                await tx.inventoryLocation.update({
                    where: { id: outputStock.id },
                    data: { currentStock: { increment: formData.outputQuantity } }
                });
            } else {
                await tx.inventoryLocation.create({
                    data: {
                        inventoryItemId: formData.outputItemId,
                        areaId: formData.areaId,
                        currentStock: formData.outputQuantity
                    }
                });
            }

            // Movimiento de entrada
            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: formData.outputItemId,
                    movementType: 'PRODUCTION_IN',
                    quantity: formData.outputQuantity,
                    unit: formData.outputUnit,
                    reason: `Producción manual: ${outputItem.name}`,
                    notes: `Orden: ${orderNumber}`,
                    createdById: userId,
                }
            });

            return productionOrder;
        });

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/produccion');

        return {
            success: true,
            message: `¡Producción manual completada! Orden: ${result.orderNumber}`,
            data: {
                orderNumber: result.orderNumber,
                productAdded: {
                    name: outputItem.name,
                    quantity: formData.outputQuantity,
                    unit: formData.outputUnit,
                },
                ingredientsConsumed: ingredientsToConsume.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit
                })),
            },
        };
    } catch (error) {
        console.error('Error en manualProductionAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al registrar producción manual',
        };
    }
}

// ============================================================================
// ACTION: EDITAR ORDEN DE PRODUCCIÓN (notas)
// ============================================================================

export async function updateProductionOrderAction(
    orderId: string,
    data: { notes?: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const session = await getSession();
        if (!session?.id) {
            return { success: false, message: 'No autorizado' };
        }

        await prisma.productionOrder.update({
            where: { id: orderId },
            data: {
                notes: data.notes,
            }
        });

        revalidatePath('/dashboard/produccion');

        return { success: true, message: 'Orden actualizada correctamente' };
    } catch (error) {
        console.error('Error updating production order:', error);
        return { success: false, message: 'Error al actualizar la orden' };
    }
}

// ============================================================================
// ACTION: ELIMINAR / CANCELAR ORDEN DE PRODUCCIÓN
// ============================================================================

export async function deleteProductionOrderAction(
    orderId: string
): Promise<{ success: boolean; message: string }> {
    try {
        const session = await getSession();
        if (!session?.id) {
            return { success: false, message: 'No autorizado' };
        }

        // Solo permitir cancelar, no borrar (para mantener historial)
        await prisma.productionOrder.update({
            where: { id: orderId },
            data: {
                status: 'CANCELLED',
                notes: 'Cancelado por el usuario',
            }
        });

        revalidatePath('/dashboard/produccion');

        return { success: true, message: 'Orden cancelada correctamente' };
    } catch (error) {
        console.error('Error deleting production order:', error);
        return { success: false, message: 'Error al cancelar la orden' };
    }
}
