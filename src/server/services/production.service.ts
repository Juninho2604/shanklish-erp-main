/**
 * SHANKLISH CARACAS ERP - Production Service
 * 
 * Gestión de órdenes de producción:
 * - Crear orden de producción
 * - Finalizar producción (suma producto, resta ingredientes)
 * - Calcular requerimientos de ingredientes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tipos locales
type ProductionOrderStatus = 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type UnitOfMeasure = 'KG' | 'G' | 'L' | 'ML' | 'UNIT' | 'PORTION';

// ============================================================================
// TIPOS
// ============================================================================

export interface CreateProductionOrderInput {
    recipeId: string;
    plannedQuantity: number;
    unit: UnitOfMeasure;
    scheduledDate?: Date;
    priority?: number;
    notes?: string;
    userId: string;
}

export interface ProductionOrderResult {
    success: boolean;
    message: string;
    orderId?: string;
    orderNumber?: string;
}

export interface IngredientRequirement {
    itemId: string;
    itemName: string;
    requiredQuantity: number;    // Cantidad neta necesaria
    grossQuantity: number;       // Cantidad bruta (con merma)
    unit: string;
    availableStock: number;
    sufficient: boolean;
    deficit: number;
}

export interface CompleteProductionInput {
    productionOrderId: string;
    actualQuantity: number;      // Cantidad real producida
    areaId: string;              // Área donde queda el producto
    ingredientAreaId: string;    // Área de donde salen los ingredientes
    notes?: string;
    userId: string;
}

export interface CompleteProductionResult {
    success: boolean;
    message: string;
    productionOrder?: {
        id: string;
        orderNumber: string;
        actualQuantity: number;
        actualYield: number;
    };
    ingredientsConsumed?: {
        itemName: string;
        quantity: number;
        unit: string;
    }[];
    productAdded?: {
        itemName: string;
        quantity: number;
        unit: string;
    };
}

// ============================================================================
// CREAR ORDEN DE PRODUCCIÓN
// ============================================================================

/**
 * Crea una nueva orden de producción basada en una receta
 */
export async function createProductionOrder(
    input: CreateProductionOrderInput
): Promise<ProductionOrderResult> {
    try {
        // Obtener receta y validar
        const recipe = await prisma.recipe.findUnique({
            where: { id: input.recipeId },
            include: { outputItem: true },
        });

        if (!recipe) {
            return { success: false, message: 'Receta no encontrada' };
        }

        if (!recipe.isApproved) {
            return { success: false, message: 'La receta no está aprobada' };
        }

        // Generar número de orden
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.productionOrder.count({
            where: {
                createdAt: {
                    gte: new Date(today.setHours(0, 0, 0, 0)),
                },
            },
        });
        const orderNumber = `PROD-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        // Crear orden
        const order = await prisma.productionOrder.create({
            data: {
                orderNumber,
                outputItemId: recipe.outputItemId,
                recipeId: recipe.id,
                plannedQuantity: input.plannedQuantity,
                unit: input.unit,
                status: 'DRAFT',
                priority: input.priority || 0,
                scheduledDate: input.scheduledDate,
                notes: input.notes,
                createdById: input.userId,
            },
        });

        return {
            success: true,
            message: `Orden ${orderNumber} creada para ${input.plannedQuantity} ${input.unit} de ${recipe.outputItem.name}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
        };

    } catch (error) {
        console.error('Error creando orden de producción:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

// ============================================================================
// CALCULAR REQUERIMIENTOS DE INGREDIENTES
// ============================================================================

/**
 * Calcula los ingredientes necesarios para una cantidad de producción
 * Retorna si hay stock suficiente de cada ingrediente
 */
export async function calculateIngredientRequirements(
    recipeId: string,
    quantity: number,
    areaId: string
): Promise<IngredientRequirement[]> {
    // Obtener receta con ingredientes
    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
            ingredients: {
                include: {
                    ingredientItem: {
                        include: {
                            stockLevels: {
                                where: { areaId },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!recipe) return [];

    // Calcular factor de escala
    const recipeOutput = Number(recipe.outputQuantity);
    const scaleFactor = quantity / recipeOutput;

    // Calcular requerimientos por ingrediente
    return recipe.ingredients.map((ing) => {
        const requiredQty = Number(ing.quantity) * scaleFactor;
        const wastePercent = Number(ing.wastePercentage);
        const grossQty = wastePercent < 100
            ? requiredQty / (1 - wastePercent / 100)
            : requiredQty;

        const availableStock = Number(ing.ingredientItem.stockLevels[0]?.currentStock || 0);
        const sufficient = availableStock >= grossQty;
        const deficit = sufficient ? 0 : grossQty - availableStock;

        return {
            itemId: ing.ingredientItem.id,
            itemName: ing.ingredientItem.name,
            requiredQuantity: requiredQty,
            grossQuantity: grossQty,
            unit: ing.unit,
            availableStock,
            sufficient,
            deficit,
        };
    });
}

// ============================================================================
// FINALIZAR PRODUCCIÓN
// ============================================================================

/**
 * Finaliza una orden de producción:
 * 1. Resta ingredientes del inventario
 * 2. Suma producto terminado al inventario
 * 3. Calcula rendimiento real vs esperado
 * 4. Actualiza costo del producto producido
 */
export async function completeProduction(
    input: CompleteProductionInput
): Promise<CompleteProductionResult> {
    try {
        // 1. Obtener orden con receta e ingredientes
        const order = await prisma.productionOrder.findUnique({
            where: { id: input.productionOrderId },
            include: {
                recipe: {
                    include: {
                        outputItem: true,
                        ingredients: {
                            include: {
                                ingredientItem: {
                                    include: {
                                        stockLevels: {
                                            where: { areaId: input.ingredientAreaId },
                                        },
                                        costHistory: {
                                            where: { effectiveTo: null },
                                            take: 1,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                outputItem: true,
            },
        });

        if (!order) {
            return { success: false, message: 'Orden de producción no encontrada' };
        }

        if (order.status === 'COMPLETED') {
            return { success: false, message: 'Esta orden ya fue completada' };
        }

        if (order.status === 'CANCELLED') {
            return { success: false, message: 'Esta orden está cancelada' };
        }

        const recipe = order.recipe;

        // 2. Calcular factor de escala basado en cantidad real
        const recipeOutput = Number(recipe.outputQuantity);
        const scaleFactor = input.actualQuantity / recipeOutput;

        // 3. Verificar stock de ingredientes
        const ingredientsToConsume: {
            itemId: string;
            itemName: string;
            quantity: number;
            unit: string;
            unitCost: number;
            totalCost: number;
        }[] = [];

        let totalIngredientsCost = 0;

        for (const ing of recipe.ingredients) {
            const requiredQty = Number(ing.quantity) * scaleFactor;
            const wastePercent = Number(ing.wastePercentage);
            const grossQty = wastePercent < 100
                ? requiredQty / (1 - wastePercent / 100)
                : requiredQty;

            const availableStock = Number(ing.ingredientItem.stockLevels[0]?.currentStock || 0);

            if (availableStock < grossQty) {
                return {
                    success: false,
                    message: `Stock insuficiente de ${ing.ingredientItem.name}. Necesario: ${grossQty.toFixed(3)}, Disponible: ${availableStock.toFixed(3)}`,
                };
            }

            const unitCost = Number(ing.ingredientItem.costHistory[0]?.costPerUnit || 0);
            const totalCost = grossQty * unitCost;
            totalIngredientsCost += totalCost;

            ingredientsToConsume.push({
                itemId: ing.ingredientItem.id,
                itemName: ing.ingredientItem.name,
                quantity: grossQty,
                unit: ing.unit,
                unitCost,
                totalCost,
            });
        }

        // 4. Calcular rendimiento real
        const expectedQuantity = Number(order.plannedQuantity) * (Number(recipe.yieldPercentage) / 100);
        const actualYield = expectedQuantity > 0
            ? (input.actualQuantity / expectedQuantity) * 100
            : 100;

        // 5. Calcular costo por unidad del producto
        const costPerUnit = input.actualQuantity > 0
            ? totalIngredientsCost / input.actualQuantity
            : 0;

        // 6. Ejecutar transacción
        const result = await prisma.$transaction(async (tx) => {
            // Actualizar estado de la orden
            const updatedOrder = await tx.productionOrder.update({
                where: { id: input.productionOrderId },
                data: {
                    status: 'COMPLETED',
                    actualQuantity: input.actualQuantity,
                    actualYieldPercentage: actualYield,
                    actualCost: totalIngredientsCost,
                    completedAt: new Date(),
                    notes: input.notes,
                },
            });

            // Registrar salida de cada ingrediente
            for (const ing of ingredientsToConsume) {
                // Crear movimiento de salida
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: ing.itemId,
                        movementType: 'PRODUCTION_OUT',
                        quantity: ing.quantity,
                        unit: ing.unit as any,
                        unitCost: ing.unitCost,
                        totalCost: ing.totalCost,
                        reason: `Producción: ${order.orderNumber}`,
                        createdById: input.userId,
                    },
                });

                // Decrementar stock
                await tx.inventoryLocation.update({
                    where: {
                        inventoryItemId_areaId: {
                            inventoryItemId: ing.itemId,
                            areaId: input.ingredientAreaId,
                        },
                    },
                    data: {
                        currentStock: { decrement: ing.quantity },
                    },
                });
            }

            // Registrar entrada del producto terminado
            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: order.outputItemId,
                    movementType: 'PRODUCTION_IN',
                    quantity: input.actualQuantity,
                    unit: order.unit,
                    unitCost: costPerUnit,
                    totalCost: totalIngredientsCost,
                    productionOrderId: order.id,
                    reason: `Producción completada: ${order.orderNumber}`,
                    createdById: input.userId,
                },
            });

            // Actualizar stock del producto
            await tx.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: order.outputItemId,
                        areaId: input.areaId,
                    },
                },
                update: {
                    currentStock: { increment: input.actualQuantity },
                },
                create: {
                    inventoryItemId: order.outputItemId,
                    areaId: input.areaId,
                    currentStock: input.actualQuantity,
                },
            });

            // Actualizar costo del producto (cerrar anterior, crear nuevo)
            const currentCost = await tx.costHistory.findFirst({
                where: {
                    inventoryItemId: order.outputItemId,
                    effectiveTo: null,
                },
            });

            if (currentCost) {
                await tx.costHistory.update({
                    where: { id: currentCost.id },
                    data: { effectiveTo: new Date() },
                });
            }

            await tx.costHistory.create({
                data: {
                    inventoryItemId: order.outputItemId,
                    costPerUnit: costPerUnit,
                    currency: 'USD',
                    isCalculated: true,
                    costBreakdown: {
                        ingredients: ingredientsToConsume.map(i => ({
                            name: i.itemName,
                            quantity: i.quantity,
                            cost: i.totalCost,
                        })),
                        totalIngredients: totalIngredientsCost,
                        laborCost: 0, // TODO: Agregar costo de mano de obra
                        overheadCost: 0,
                    },
                    reason: `Producción: ${order.orderNumber}`,
                    createdById: input.userId,
                },
            });

            return updatedOrder;
        });

        return {
            success: true,
            message: `Producción completada: ${input.actualQuantity} ${order.unit} de ${order.outputItem.name}`,
            productionOrder: {
                id: result.id,
                orderNumber: result.orderNumber,
                actualQuantity: input.actualQuantity,
                actualYield: actualYield,
            },
            ingredientsConsumed: ingredientsToConsume.map(i => ({
                itemName: i.itemName,
                quantity: i.quantity,
                unit: i.unit,
            })),
            productAdded: {
                itemName: order.outputItem.name,
                quantity: input.actualQuantity,
                unit: order.unit,
            },
        };

    } catch (error) {
        console.error('Error completando producción:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

// ============================================================================
// PRODUCCIÓN RÁPIDA (Sin orden previa)
// ============================================================================

/**
 * Registra una producción rápida sin crear orden previa
 * Útil para producciones ad-hoc como la de Víctor
 */
export async function quickProduction(input: {
    recipeId: string;
    actualQuantity: number;
    areaId: string;
    ingredientAreaId: string;
    notes?: string;
    userId: string;
}): Promise<CompleteProductionResult> {
    // 1. Crear orden automática
    const orderResult = await createProductionOrder({
        recipeId: input.recipeId,
        plannedQuantity: input.actualQuantity,
        unit: 'KG', // TODO: Obtener de receta
        userId: input.userId,
    });

    if (!orderResult.success || !orderResult.orderId) {
        return { success: false, message: orderResult.message };
    }

    // 2. Aprobar orden automáticamente
    await prisma.productionOrder.update({
        where: { id: orderResult.orderId },
        data: {
            status: 'APPROVED',
            approvedById: input.userId,
            approvedAt: new Date(),
        },
    });

    // 3. Completar producción
    return completeProduction({
        productionOrderId: orderResult.orderId,
        actualQuantity: input.actualQuantity,
        areaId: input.areaId,
        ingredientAreaId: input.ingredientAreaId,
        notes: input.notes,
        userId: input.userId,
    });
}
