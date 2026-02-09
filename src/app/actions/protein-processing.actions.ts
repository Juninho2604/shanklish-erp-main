'use server';

/**
 * SHANKLISH CARACAS ERP - Protein Processing Actions
 * 
 * Server Actions para procesamiento y desposte de proteínas
 * - Registrar procesamiento de proteínas (res, pollo, cerdo, etc.)
 * - Agregar subproductos/cortes resultantes
 * - Calcular rendimiento y desperdicio
 * - Actualizar inventario con los cortes resultantes
 */

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { getSession } from '@/lib/auth';

// ============================================================================
// TIPOS
// ============================================================================

export interface SubProductInput {
    name: string;
    weight: number;
    units: number;
    unitType: string;
    outputItemId?: string;
    notes?: string;
}

export interface CreateProteinProcessingInput {
    processDate: Date;
    sourceItemId: string;
    supplierId?: string;
    supplierName?: string;
    frozenWeight: number;
    drainedWeight: number;
    areaId: string;
    notes?: string;
    subProducts: SubProductInput[];
}

// ============================================================================
// ACTION: OBTENER ITEMS DE PROTEÍNA DISPONIBLES
// ============================================================================

export async function getProteinItemsAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                // Filtrar items de proteínas (por categoría o nombre)
                OR: [
                    { category: { contains: 'PROTEINA', mode: 'insensitive' } },
                    { category: { contains: 'CARNE', mode: 'insensitive' } },
                    { category: { contains: 'POLLO', mode: 'insensitive' } },
                    { category: { contains: 'CERDO', mode: 'insensitive' } },
                    { category: { contains: 'RES', mode: 'insensitive' } },
                    { category: { contains: 'PESCADO', mode: 'insensitive' } },
                    { name: { contains: 'RES', mode: 'insensitive' } },
                    { name: { contains: 'POLLO', mode: 'insensitive' } },
                    { name: { contains: 'CERDO', mode: 'insensitive' } },
                    { name: { contains: 'LOMO', mode: 'insensitive' } },
                    { name: { contains: 'COSTILLA', mode: 'insensitive' } },
                    { name: { contains: 'PECHUGA', mode: 'insensitive' } },
                    { name: { contains: 'MUSLO', mode: 'insensitive' } },
                    { type: 'RAW_MATERIAL' }
                ]
            },
            orderBy: { name: 'asc' }
        });

        return items.map(item => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            category: item.category,
            baseUnit: item.baseUnit
        }));
    } catch (error) {
        console.error('Error en getProteinItemsAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER ÁREAS PARA PROCESAMIENTO
// ============================================================================

export async function getProcessingAreasAction() {
    try {
        const areas = await prisma.area.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });

        return areas;
    } catch (error) {
        console.error('Error en getProcessingAreasAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER PROVEEDORES
// ============================================================================

export async function getSuppliersAction() {
    try {
        const suppliers = await prisma.supplier.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });

        return suppliers.map(s => ({
            id: s.id,
            name: s.name,
            code: s.code
        }));
    } catch (error) {
        console.error('Error en getSuppliersAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: CREAR PROCESAMIENTO DE PROTEÍNA
// ============================================================================

export async function createProteinProcessingAction(
    input: CreateProteinProcessingInput
): Promise<{ success: boolean; message: string; processingId?: string; code?: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        // Generar código único
        const year = new Date().getFullYear();
        const count = await prisma.proteinProcessing.count({
            where: {
                code: { startsWith: `PROT-${year}` }
            }
        });
        const code = `PROT-${year}-${String(count + 1).padStart(3, '0')}`;

        // Calcular totales
        const totalSubProducts = input.subProducts.reduce((sum, sp) => sum + sp.weight, 0);
        const wasteWeight = input.drainedWeight - totalSubProducts;
        const wastePercentage = input.drainedWeight > 0
            ? (wasteWeight / input.drainedWeight) * 100
            : 0;
        const yieldPercentage = input.frozenWeight > 0
            ? (totalSubProducts / input.frozenWeight) * 100
            : 0;

        const result = await prisma.$transaction(async (tx) => {
            // Crear el registro de procesamiento
            const processing = await tx.proteinProcessing.create({
                data: {
                    code,
                    processDate: input.processDate,
                    sourceItemId: input.sourceItemId,
                    supplierId: input.supplierId,
                    supplierName: input.supplierName,
                    frozenWeight: input.frozenWeight,
                    drainedWeight: input.drainedWeight,
                    totalSubProducts,
                    wasteWeight: Math.max(0, wasteWeight),
                    wastePercentage: Math.max(0, wastePercentage),
                    yieldPercentage,
                    status: 'DRAFT',
                    areaId: input.areaId,
                    notes: input.notes,
                    createdById: session.id,
                    subProducts: {
                        create: input.subProducts.map((sp, index) => ({
                            name: sp.name,
                            weight: sp.weight,
                            units: sp.units,
                            unitType: sp.unitType,
                            outputItemId: sp.outputItemId || null,
                            notes: sp.notes,
                            sortOrder: index
                        }))
                    }
                }
            });

            return processing;
        }, { timeout: 60000 });

        console.log('🥩 PROCESAMIENTO CREADO:', {
            code: result.code,
            pesoCongelado: input.frozenWeight,
            pesoEscurrido: input.drainedWeight,
            subproductos: input.subProducts.length,
            rendimiento: `${yieldPercentage.toFixed(1)}%`
        });

        revalidatePath('/dashboard/proteinas');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Procesamiento ${code} creado exitosamente`,
            processingId: result.id,
            code: result.code
        };
    } catch (error) {
        console.error('Error en createProteinProcessingAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al crear procesamiento'
        };
    }
}

// ============================================================================
// ACTION: OBTENER LISTA DE PROCESAMIENTOS
// ============================================================================

export async function getProteinProcessingsAction(filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
}) {
    try {
        const where: any = {};

        if (filters?.status) {
            where.status = filters.status;
        }
        if (filters?.startDate || filters?.endDate) {
            where.processDate = {};
            if (filters.startDate) where.processDate.gte = filters.startDate;
            if (filters.endDate) where.processDate.lte = filters.endDate;
        }

        const processings = await prisma.proteinProcessing.findMany({
            where,
            include: {
                sourceItem: {
                    select: { name: true, sku: true }
                },
                supplier: {
                    select: { name: true }
                },
                createdBy: {
                    select: { firstName: true, lastName: true }
                },
                area: {
                    select: { name: true }
                },
                _count: {
                    select: { subProducts: true }
                }
            },
            orderBy: { processDate: 'desc' }
        });

        return processings.map(p => ({
            id: p.id,
            code: p.code,
            processDate: p.processDate,
            sourceItem: p.sourceItem.name,
            supplier: p.supplier?.name || p.supplierName || '-',
            frozenWeight: p.frozenWeight,
            drainedWeight: p.drainedWeight,
            totalSubProducts: p.totalSubProducts,
            wasteWeight: p.wasteWeight,
            wastePercentage: p.wastePercentage,
            yieldPercentage: p.yieldPercentage,
            status: p.status,
            area: p.area.name,
            createdBy: `${p.createdBy.firstName} ${p.createdBy.lastName}`,
            subProductsCount: p._count.subProducts
        }));
    } catch (error) {
        console.error('Error en getProteinProcessingsAction:', error);
        return [];
    }
}

// ============================================================================
// ACTION: OBTENER DETALLE DE UN PROCESAMIENTO
// ============================================================================

export async function getProteinProcessingByIdAction(id: string) {
    try {
        const processing = await prisma.proteinProcessing.findUnique({
            where: { id },
            include: {
                sourceItem: true,
                supplier: true,
                area: true,
                createdBy: {
                    select: { firstName: true, lastName: true }
                },
                completedBy: {
                    select: { firstName: true, lastName: true }
                },
                subProducts: {
                    include: {
                        outputItem: {
                            select: { id: true, name: true, sku: true }
                        }
                    },
                    orderBy: { sortOrder: 'asc' }
                }
            }
        });

        return processing;
    } catch (error) {
        console.error('Error en getProteinProcessingByIdAction:', error);
        return null;
    }
}

// ============================================================================
// ACTION: COMPLETAR PROCESAMIENTO (Agregar al inventario)
// ============================================================================

export async function completeProteinProcessingAction(
    processingId: string
): Promise<{ success: boolean; message: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        const processing = await prisma.proteinProcessing.findUnique({
            where: { id: processingId },
            include: {
                sourceItem: true,
                area: true,
                subProducts: {
                    include: { outputItem: true }
                }
            }
        });

        if (!processing) {
            return { success: false, message: 'Procesamiento no encontrado' };
        }

        if (processing.status === 'COMPLETED') {
            return { success: false, message: 'Este procesamiento ya fue completado' };
        }

        await prisma.$transaction(async (tx) => {
            // 1. Descontar la proteína original del inventario
            const sourceLocation = await tx.inventoryLocation.findFirst({
                where: {
                    inventoryItemId: processing.sourceItemId,
                    areaId: processing.areaId
                }
            });

            if (sourceLocation) {
                await tx.inventoryLocation.update({
                    where: { id: sourceLocation.id },
                    data: {
                        currentStock: { decrement: processing.frozenWeight }
                    }
                });

                // Crear movimiento de salida
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: processing.sourceItemId,
                        movementType: 'PRODUCTION',
                        quantity: -processing.frozenWeight,
                        unit: processing.sourceItem.baseUnit,
                        documentType: 'PROTEIN_PROCESSING',
                        referenceNumber: processing.code, // Usamos el código legible
                        notes: `Desposte: ${processing.code}`,
                        createdById: session.id
                    }
                });
            }

            // 2. Agregar los subproductos al inventario
            for (const subProduct of processing.subProducts) {
                if (subProduct.outputItemId && subProduct.outputItem) {
                    // Buscar o crear ubicación de inventario
                    let location = await tx.inventoryLocation.findFirst({
                        where: {
                            inventoryItemId: subProduct.outputItemId,
                            areaId: processing.areaId
                        }
                    });

                    if (location) {
                        await tx.inventoryLocation.update({
                            where: { id: location.id },
                            data: {
                                currentStock: { increment: subProduct.weight }
                            }
                        });
                    } else {
                        await tx.inventoryLocation.create({
                            data: {
                                inventoryItemId: subProduct.outputItemId,
                                areaId: processing.areaId,
                                currentStock: subProduct.weight
                            }
                        });
                    }

                    // Crear movimiento de entrada
                    await tx.inventoryMovement.create({
                        data: {
                            inventoryItemId: subProduct.outputItemId,
                            movementType: 'PRODUCTION',
                            quantity: subProduct.weight,
                            unit: subProduct.unitType,
                            documentType: 'PROTEIN_PROCESSING',
                            referenceNumber: processing.code,
                            notes: `Subproducto de desposte: ${processing.code} - ${subProduct.name}`,
                            createdById: session.id
                        }
                    });
                }
            }

            // 3. Marcar procesamiento como completado
            await tx.proteinProcessing.update({
                where: { id: processingId },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    completedById: session.id
                }
            });
        }, { timeout: 60000 });

        console.log('✅ PROCESAMIENTO COMPLETADO:', processing.code);

        revalidatePath('/dashboard/proteinas');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Procesamiento ${processing.code} completado. Inventario actualizado.`
        };
    } catch (error) {
        console.error('Error en completeProteinProcessingAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al completar procesamiento'
        };
    }
}

// ============================================================================
// ACTION: CANCELAR PROCESAMIENTO
// ============================================================================

export async function cancelProteinProcessingAction(
    processingId: string,
    reason: string
): Promise<{ success: boolean; message: string }> {
    const session = await getSession();
    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        const processing = await prisma.proteinProcessing.findUnique({
            where: { id: processingId }
        });

        if (!processing) {
            return { success: false, message: 'Procesamiento no encontrado' };
        }

        if (processing.status === 'COMPLETED') {
            return { success: false, message: 'No se puede cancelar un procesamiento completado' };
        }

        await prisma.proteinProcessing.update({
            where: { id: processingId },
            data: {
                status: 'CANCELLED',
                notes: processing.notes
                    ? `${processing.notes}\n\nCANCELADO: ${reason}`
                    : `CANCELADO: ${reason}`
            }
        });

        revalidatePath('/dashboard/proteinas');

        return {
            success: true,
            message: 'Procesamiento cancelado'
        };
    } catch (error) {
        console.error('Error en cancelProteinProcessingAction:', error);
        return {
            success: false,
            message: 'Error al cancelar procesamiento'
        };
    }
}

// ============================================================================
// ACTION: OBTENER ESTADÍSTICAS DE PROCESAMIENTO
// ============================================================================

export async function getProteinProcessingStatsAction(startDate?: Date, endDate?: Date) {
    try {
        const where: any = {
            status: 'COMPLETED'
        };

        if (startDate || endDate) {
            where.processDate = {};
            if (startDate) where.processDate.gte = startDate;
            if (endDate) where.processDate.lte = endDate;
        }

        const processings = await prisma.proteinProcessing.findMany({
            where,
            include: {
                sourceItem: true
            }
        });

        // Calcular estadísticas
        const totalProcessings = processings.length;
        const totalFrozenWeight = processings.reduce((sum, p) => sum + p.frozenWeight, 0);
        const totalDrainedWeight = processings.reduce((sum, p) => sum + p.drainedWeight, 0);
        const totalSubProducts = processings.reduce((sum, p) => sum + p.totalSubProducts, 0);
        const totalWaste = processings.reduce((sum, p) => sum + p.wasteWeight, 0);
        const avgYield = processings.length > 0
            ? processings.reduce((sum, p) => sum + p.yieldPercentage, 0) / processings.length
            : 0;
        const avgWaste = processings.length > 0
            ? processings.reduce((sum, p) => sum + p.wastePercentage, 0) / processings.length
            : 0;

        // Agrupar por tipo de proteína
        const byProteinType = processings.reduce((acc, p) => {
            const name = p.sourceItem.name;
            if (!acc[name]) {
                acc[name] = { count: 0, totalWeight: 0, avgYield: 0, yields: [] as number[] };
            }
            acc[name].count++;
            acc[name].totalWeight += p.frozenWeight;
            acc[name].yields.push(p.yieldPercentage);
            return acc;
        }, {} as Record<string, { count: number; totalWeight: number; avgYield: number; yields: number[] }>);

        // Calcular promedios
        Object.keys(byProteinType).forEach(key => {
            const yields = byProteinType[key].yields;
            byProteinType[key].avgYield = yields.reduce((a, b) => a + b, 0) / yields.length;
        });

        return {
            totalProcessings,
            totalFrozenWeight,
            totalDrainedWeight,
            totalSubProducts,
            totalWaste,
            avgYield,
            avgWaste,
            byProteinType
        };
    } catch (error) {
        console.error('Error en getProteinProcessingStatsAction:', error);
        return {
            totalProcessings: 0,
            totalFrozenWeight: 0,
            totalDrainedWeight: 0,
            totalSubProducts: 0,
            totalWaste: 0,
            avgYield: 0,
            avgWaste: 0,
            byProteinType: {}
        };
    }
}
