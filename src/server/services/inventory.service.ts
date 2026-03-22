/**
 * SHANKLISH CARACAS ERP - Inventory Service
 * 
 * Gestión de movimientos de inventario:
 * - Compras (entradas de proveedor)
 * - Ajustes de inventario
 * - Salidas por venta
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tipos locales (en vez de importar de Prisma)
type MovementType = 'PURCHASE' | 'SALE' | 'PRODUCTION_IN' | 'PRODUCTION_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER' | 'WASTE';
type UnitOfMeasure = 'KG' | 'G' | 'L' | 'ML' | 'UNIT' | 'PORTION';

// ============================================================================
// TIPOS
// ============================================================================

export interface PurchaseInput {
    inventoryItemId: string;
    quantity: number;
    unit: UnitOfMeasure;
    unitCost: number;
    currency?: string;
    supplierId?: string;
    areaId: string;         // A qué área llega el producto
    notes?: string;
    userId: string;         // Quién registra (Omar, Nahomy)
}

export interface PurchaseResult {
    success: boolean;
    message: string;
    movement?: {
        id: string;
        quantity: number;
        totalCost: number;
    };
    newStock?: number;
    newCostPerUnit?: number;
}

export interface SaleInput {
    inventoryItemId: string;
    quantity: number;
    unit: UnitOfMeasure;
    areaId: string;
    orderId?: string;       // ID de orden de venta (futuro: Wink)
    notes?: string;
    userId: string;
    allowNegative?: boolean;
}

export interface SaleResult {
    success: boolean;
    message: string;
    movement?: {
        id: string;
        quantity: number;
    };
    newStock?: number;
    insufficientStock?: boolean;
}

export interface AdjustmentInput {
    inventoryItemId: string;
    quantity: number;        // Positivo = entrada, negativo = salida
    unit: UnitOfMeasure;
    reason: string;
    areaId: string;
    userId: string;
}

// ============================================================================
// REGISTRO DE COMPRAS (ENTRADAS)
// ============================================================================

/**
 * Registra una compra/entrada de inventario
 * 
 * Proceso:
 * 1. Valida que el item existe
 * 2. Convierte unidades si es necesario
 * 3. Crea movimiento de inventario
 * 4. Actualiza stock en la ubicación
 * 5. Actualiza historial de costos (promedio ponderado)
 */
export async function registerPurchase(input: PurchaseInput): Promise<PurchaseResult> {
    try {
        // 1. Obtener item y validar
        const item = await prisma.inventoryItem.findUnique({
            where: { id: input.inventoryItemId },
            include: {
                stockLevels: {
                    where: { areaId: input.areaId },
                },
                costHistory: {
                    where: { effectiveTo: null },
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1,
                },
            },
        });

        if (!item) {
            return { success: false, message: 'Item de inventario no encontrado' };
        }

        // 2. Convertir cantidad a unidad base si es diferente
        let quantityInBaseUnit = input.quantity;
        if (input.unit !== item.baseUnit && item.conversionRate) {
            // Si la unidad de compra es diferente, convertir
            quantityInBaseUnit = input.quantity * Number(item.conversionRate);
        }

        // 3. Calcular costo total
        const totalCost = input.quantity * input.unitCost;

        // 4. Calcular nuevo costo promedio ponderado
        const currentCost = item.costHistory[0];
        const currentStock = item.stockLevels[0]?.currentStock || 0;
        const currentCostPerUnit = currentCost ? Number(currentCost.costPerUnit) : 0;

        // Promedio ponderado: (stockActual * costoActual + cantidadNueva * costoNuevo) / stockTotal
        const newTotalStock = Number(currentStock) + quantityInBaseUnit;
        const weightedCost = newTotalStock > 0
            ? ((Number(currentStock) * currentCostPerUnit) + (quantityInBaseUnit * input.unitCost)) / newTotalStock
            : input.unitCost;

        // 5. Ejecutar transacción
        const result = await prisma.$transaction(async (tx) => {
            // Crear movimiento de inventario
            const movement = await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    movementType: 'PURCHASE',
                    quantity: quantityInBaseUnit,
                    unit: item.baseUnit,
                    unitCost: input.unitCost,
                    totalCost: totalCost,
                    notes: input.notes,
                    reason: `Compra: ${input.quantity} ${input.unit}`,
                    createdById: input.userId,
                },
            });

            // Actualizar o crear stock en ubicación
            const stockLocation = await tx.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: input.inventoryItemId,
                        areaId: input.areaId,
                    },
                },
                update: {
                    currentStock: {
                        increment: quantityInBaseUnit,
                    },
                },
                create: {
                    inventoryItemId: input.inventoryItemId,
                    areaId: input.areaId,
                    currentStock: quantityInBaseUnit,
                },
            });

            // Cerrar costo anterior y crear nuevo
            if (currentCost) {
                await tx.costHistory.update({
                    where: { id: currentCost.id },
                    data: { effectiveTo: new Date() },
                });
            }

            await tx.costHistory.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    costPerUnit: weightedCost,
                    currency: input.currency || 'USD',
                    reason: `Compra - Nuevo costo promedio ponderado`,
                    createdById: input.userId,
                },
            });

            return {
                movement,
                newStock: Number(stockLocation.currentStock),
                newCostPerUnit: weightedCost,
            };
        });

        return {
            success: true,
            message: `Compra registrada: +${quantityInBaseUnit} ${item.baseUnit} de ${item.name}`,
            movement: {
                id: result.movement.id,
                quantity: quantityInBaseUnit,
                totalCost,
            },
            newStock: result.newStock,
            newCostPerUnit: result.newCostPerUnit,
        };

    } catch (error) {
        console.error('Error registrando compra:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

// ============================================================================
// REGISTRO DE VENTAS (SALIDAS)
// ============================================================================

/**
 * Registra una venta/salida de inventario
 * 
 * Preparado para integración futura con Wink/Web
 */
export async function registerSale(input: SaleInput): Promise<SaleResult> {
    try {
        // 1. Obtener item y stock actual
        const item = await prisma.inventoryItem.findUnique({
            where: { id: input.inventoryItemId },
            include: {
                stockLevels: {
                    where: { areaId: input.areaId },
                },
                costHistory: {
                    where: { effectiveTo: null },
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1,
                },
            },
        });

        if (!item) {
            return { success: false, message: 'Item de inventario no encontrado' };
        }

        const currentStock = item.stockLevels[0]?.currentStock || 0;

        // 2. Verificar stock suficiente (si no se permiten negativos)
        if (!input.allowNegative && Number(currentStock) < input.quantity) {
            return {
                success: false,
                message: `Stock insuficiente. Disponible: ${currentStock} ${item.baseUnit}`,
                insufficientStock: true,
            };
        }

        // 3. Obtener costo actual para COGS
        const unitCost = item.costHistory[0] ? Number(item.costHistory[0].costPerUnit) : 0;
        const totalCost = input.quantity * unitCost;

        // 4. Ejecutar transacción
        const result = await prisma.$transaction(async (tx) => {
            // Crear movimiento de inventario
            const movement = await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    movementType: 'SALE',
                    quantity: input.quantity,
                    unit: input.unit,
                    unitCost: unitCost,
                    totalCost: totalCost,
                    notes: input.notes,
                    reason: input.orderId ? `Venta - Orden: ${input.orderId}` : 'Venta directa',
                    createdById: input.userId,
                },
            });

            // Decrementar stock
            const stockLocation = await tx.inventoryLocation.update({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: input.inventoryItemId,
                        areaId: input.areaId,
                    },
                },
                data: {
                    currentStock: {
                        decrement: input.quantity,
                    },
                },
            });

            return { movement, newStock: Number(stockLocation.currentStock) };
        });

        return {
            success: true,
            message: `Venta registrada: -${input.quantity} ${input.unit} de ${item.name}`,
            movement: {
                id: result.movement.id,
                quantity: input.quantity,
            },
            newStock: result.newStock,
        };

    } catch (error) {
        console.error('Error registrando venta:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

// ============================================================================
// AJUSTE DE INVENTARIO
// ============================================================================

/**
 * Registra un ajuste de inventario (merma, conteo físico, etc.)
 */
export async function registerAdjustment(input: AdjustmentInput): Promise<PurchaseResult> {
    try {
        const item = await prisma.inventoryItem.findUnique({
            where: { id: input.inventoryItemId },
            include: {
                stockLevels: {
                    where: { areaId: input.areaId },
                },
            },
        });

        if (!item) {
            return { success: false, message: 'Item de inventario no encontrado' };
        }

        const movementType: MovementType = input.quantity >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        const absQuantity = Math.abs(input.quantity);

        // Verificar stock suficiente para salidas
        if (input.quantity < 0) {
            const currentStock = Number(item.stockLevels[0]?.currentStock || 0);
            if (currentStock < absQuantity) {
                return { success: false, message: 'Stock insuficiente para el ajuste' };
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            const movement = await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    movementType,
                    quantity: absQuantity,
                    unit: input.unit,
                    reason: input.reason,
                    createdById: input.userId,
                },
            });

            const stockLocation = await tx.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: input.inventoryItemId,
                        areaId: input.areaId,
                    },
                },
                update: {
                    currentStock: input.quantity >= 0
                        ? { increment: absQuantity }
                        : { decrement: absQuantity },
                },
                create: {
                    inventoryItemId: input.inventoryItemId,
                    areaId: input.areaId,
                    currentStock: input.quantity >= 0 ? absQuantity : 0,
                },
            });

            return { movement, newStock: Number(stockLocation.currentStock) };
        });

        return {
            success: true,
            message: `Ajuste registrado: ${input.quantity >= 0 ? '+' : ''}${input.quantity} ${input.unit}`,
            movement: {
                id: result.movement.id,
                quantity: absQuantity,
                totalCost: 0,
            },
            newStock: result.newStock,
        };

    } catch (error) {
        console.error('Error en ajuste:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

// ============================================================================
// CONSULTAS
// ============================================================================

/**
 * Obtener stock total de un item en todas las ubicaciones
 */
export async function getTotalStock(inventoryItemId: string): Promise<number> {
    const result = await prisma.inventoryLocation.aggregate({
        where: { inventoryItemId },
        _sum: { currentStock: true },
    });
    return Number(result._sum.currentStock || 0);
}

/**
 * Obtener historial de movimientos de un item
 */
export async function getItemMovements(
    inventoryItemId: string,
    limit: number = 50
) {
    return prisma.inventoryMovement.findMany({
        where: { inventoryItemId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
            createdBy: {
                select: { firstName: true, lastName: true },
            },
        },
    });
}
