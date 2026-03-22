'use server';

/**
 * SHANKLISH CARACAS ERP - Inventory Actions (Versión Real con Prisma)
 * 
 * Server Actions para gestión de inventario conectado a PostgreSQL
 */

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';

// Tipos locales
type UnitOfMeasure = 'KG' | 'G' | 'L' | 'ML' | 'UNIT' | 'PORTION';

// ============================================================================
// TIPOS
// ============================================================================

export interface EntradaMercanciaInput {
    inventoryItemId: string;
    quantity: number;
    unit: string;
    unitCost: number;
    currency?: string;
    supplierId?: string;
    areaId: string;
    referenceNumber?: string;    // Número de nota de entrega
    documentUrl?: string;        // URL de imagen subida
    documentType?: string;       // "nota_entrega", "factura"
    notes?: string;
    userId: string;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: {
        movementId?: string;
        newStock?: number;
        previousCost?: number;
        newCostPerUnit?: number;
        quantityAdded?: number;
    };
}

// ============================================================================
// CONVERSIONES DE UNIDAD
// ============================================================================

// Configuración de conversiones por item (en producción, esto vendría de la BD)
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
    // Leche: 1 saco/unidad = 20 litros
    'ins-leche': { 'UNIT': 20 },
    'INS-LECHE-001': { 'UNIT': 20 },
};

function getConversionRate(itemId: string, itemSku: string, fromUnit: string): number {
    const byId = UNIT_CONVERSIONS[itemId]?.[fromUnit];
    const bySku = UNIT_CONVERSIONS[itemSku]?.[fromUnit];
    return byId || bySku || 1;
}

// ============================================================================
// ACTION: REGISTRAR ENTRADA DE MERCANCÍA
// ============================================================================

export async function registrarEntradaMercancia(
    input: EntradaMercanciaInput
): Promise<ActionResult> {
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
            return { success: false, message: 'Insumo no encontrado en el sistema' };
        }

        const area = await prisma.area.findUnique({ where: { id: input.areaId } });
        const areaName = area ? area.name : 'Almacén Desconocido';

        // 2. Convertir cantidad a unidad base si es diferente
        const conversionRate = getConversionRate(item.id, item.sku, input.unit);
        const quantityInBaseUnit = input.quantity * conversionRate;

        // 3. Calcular costo total
        const totalCost = input.quantity * input.unitCost;

        // 4. Obtener stock y costo actual
        const currentStock = item.stockLevels[0]?.currentStock
            ? Number(item.stockLevels[0].currentStock)
            : 0;
        const currentCostRecord = item.costHistory[0];
        const previousCost = currentCostRecord ? Number(currentCostRecord.costPerUnit) : 0;

        // 5. Calcular nuevo costo promedio ponderado
        // Formula: (stockActual × costoActual + cantidadNueva × costoNuevo) / stockTotal
        const newTotalStock = currentStock + quantityInBaseUnit;
        const weightedCost = newTotalStock > 0
            ? ((currentStock * previousCost) + (quantityInBaseUnit * input.unitCost)) / newTotalStock
            : input.unitCost;

        // 5.5. Asegurar un userId válido (Fallback para desarrollo)
        let finalUserId = input.userId;
        const userExists = await prisma.user.findUnique({ where: { id: input.userId } });
        if (!userExists) {
            console.warn(`⚠️ Usuario ${input.userId} no encontrado. Buscando fallback...`);
            const adminUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
            if (adminUser) {
                finalUserId = adminUser.id;
                console.log(`✅ Usando usuario fallback: ${adminUser.email} (${adminUser.id})`);
            } else {
                throw new Error('No existe ningún usuario ADMIN en la base de datos para asignar la operación.');
            }
        }

        // 6. Ejecutar transacción atómica
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
                    // referenceNumber: input.referenceNumber, // TODO: Descomentar tras regenerate exitoso
                    // documentUrl: input.documentUrl,
                    // documentType: input.documentType || 'nota_entrega',
                    notes: input.notes,
                    reason: `Entrada mercancía: ${input.quantity} ${input.unit} (${areaName})${input.referenceNumber ? ` - Ref: ${input.referenceNumber}` : ''}`,
                    createdById: finalUserId,
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
                    lastCountDate: new Date(),
                },
                create: {
                    inventoryItemId: input.inventoryItemId,
                    areaId: input.areaId,
                    currentStock: quantityInBaseUnit,
                    lastCountDate: new Date(),
                },
            });

            // Cerrar costo anterior (si existe) y crear nuevo
            if (currentCostRecord) {
                await tx.costHistory.update({
                    where: { id: currentCostRecord.id },
                    data: { effectiveTo: new Date() },
                });
            }

            // Crear nuevo registro de costo
            const newCostRecord = await tx.costHistory.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    costPerUnit: weightedCost,
                    currency: input.currency || 'USD',
                    reason: `Entrada mercancía${input.referenceNumber ? ` - Nota: ${input.referenceNumber}` : ''} - Costo promedio ponderado`,
                    createdById: finalUserId,
                },
            });

            return {
                movement,
                newStock: Number(stockLocation.currentStock),
                newCostPerUnit: weightedCost,
            };
        });

        // 7. Log para auditoría
        console.log('📦 ENTRADA REGISTRADA:', {
            item: item.name,
            sku: item.sku,
            cantidadOriginal: `${input.quantity} ${input.unit}`,
            cantidadBase: `${quantityInBaseUnit} ${item.baseUnit}`,
            costoAnterior: previousCost.toFixed(4),
            costoNuevo: weightedCost.toFixed(4),
            cambio: previousCost !== weightedCost ? `${((weightedCost - previousCost) / previousCost * 100).toFixed(2)}%` : 'Sin cambio',
            referencia: input.referenceNumber || 'N/A',
            documento: input.documentUrl ? 'Adjunto' : 'Sin documento',
        });

        // 8. Revalidar páginas afectadas
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/inventario/entrada');

        // 9. Construir mensaje de respuesta
        let message = `✅ Entrada registrada: +${quantityInBaseUnit} ${item.baseUnit} de ${item.name}`;
        if (previousCost !== weightedCost && previousCost > 0) {
            const cambio = ((weightedCost - previousCost) / previousCost * 100).toFixed(1);
            message += ` | Costo actualizado: $${previousCost.toFixed(2)} → $${weightedCost.toFixed(2)} (${cambio}%)`;
        }

        return {
            success: true,
            message,
            data: {
                movementId: result.movement.id,
                newStock: result.newStock,
                previousCost,
                newCostPerUnit: result.newCostPerUnit,
                quantityAdded: quantityInBaseUnit,
            },
        };

    } catch (error) {
        console.error('❌ Error en registrarEntradaMercancia:', error);
        return {
            success: false,
            message: error instanceof Error
                ? `Error: ${error.message} \nStack: ${error.stack}`
                : 'Error desconocido al registrar entrada',
        };
    } finally {
        console.log('🏁 Fin proceso entrada');
    }
}

// ============================================================================
// CONSULTAS
// ============================================================================

export async function getInventoryItemsForSelect() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                type: 'RAW_MATERIAL', // Solo insumos base para compras
            },
            select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                purchaseUnit: true,
                conversionRate: true,
                category: true,
                costHistory: {
                    where: { effectiveTo: null },
                    select: { costPerUnit: true },
                    take: 1,
                },
                stockLevels: {
                    select: { currentStock: true },
                },
            },
            orderBy: { name: 'asc' },
        });

        return items.map(item => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            baseUnit: item.baseUnit,
            purchaseUnit: item.purchaseUnit,
            conversionRate: item.conversionRate ? Number(item.conversionRate) : 1,
            category: item.category,
            currentCost: item.costHistory[0]?.costPerUnit
                ? Number(item.costHistory[0].costPerUnit)
                : 0,
            totalStock: item.stockLevels.reduce(
                (sum, loc) => sum + Number(loc.currentStock),
                0
            ),
        }));
    } catch (error) {
        console.error('Error obteniendo items:', error);
        return [];
    }
}

export async function getAreasForSelect() {
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
        console.error('Error obteniendo áreas:', error);
        return [];
    }
}

export async function getRecentMovements(limit: number = 10) {
    try {
        const movements = await prisma.inventoryMovement.findMany({
            where: { movementType: 'PURCHASE' },
            include: {
                inventoryItem: {
                    select: { name: true, sku: true },
                },
                createdBy: {
                    select: { firstName: true, lastName: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return movements.map(m => ({
            id: m.id,
            itemName: m.inventoryItem.name,
            quantity: Number(m.quantity),
            unit: m.unit,
            unitCost: m.unitCost ? Number(m.unitCost) : 0,
            totalCost: m.totalCost ? Number(m.totalCost) : 0,
            referenceNumber: m.referenceNumber,
            documentUrl: m.documentUrl,
            createdBy: `${m.createdBy.firstName} ${m.createdBy.lastName}`,
            createdAt: m.createdAt,
        }));
    } catch (error) {
        console.error('Error obteniendo movimientos:', error);
        return [];
    }
}
