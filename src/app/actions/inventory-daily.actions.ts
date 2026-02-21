'use server';

import prisma from '@/server/db';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

// ============================================================================
// OBTENER INVENTARIO DIARIO (Sincronizado con Transferencias y Producciones)
// ============================================================================
export async function getDailyInventoryAction(dateStr: string, areaId: string) {
    try {
        const date = new Date(dateStr);
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // 1. Buscar inventario diario existente
        let daily = await prisma.dailyInventory.findUnique({
            where: { date_areaId: { date: startOfDay, areaId: areaId } },
            include: {
                area: true,
                items: {
                    include: { inventoryItem: true },
                    orderBy: { inventoryItem: { name: 'asc' } }
                }
            }
        });

        // 2. Obtener ITEMS CRÍTICOS POR ÁREA (tabla nueva)
        const areaCriticals = await prisma.areaCriticalItem.findMany({
            where: { areaId },
            include: { inventoryItem: true }
        });
        const criticalItems = areaCriticals.map(ac => ac.inventoryItem).filter(i => i.isActive);

        // 3. CALCULAR ENTRADAS Y SALIDAS SEGÚN EL ÁREA
        // ── Transferencias donde ESTA ÁREA es DESTINO (entradas) ──
        const inboundRequisitions = await prisma.requisition.findMany({
            where: {
                targetAreaId: areaId,
                status: 'COMPLETED',
                updatedAt: { gte: startOfDay, lte: endOfDay }
            },
            include: { items: true }
        });
        const entriesFromTransfers = new Map<string, number>();
        for (const req of inboundRequisitions) {
            for (const item of req.items) {
                const current = entriesFromTransfers.get(item.inventoryItemId) || 0;
                entriesFromTransfers.set(item.inventoryItemId, current + (item.dispatchedQuantity || 0));
            }
        }

        // ── Transferencias donde ESTA ÁREA es ORIGEN (salidas) ──
        const outboundRequisitions = await prisma.requisition.findMany({
            where: {
                sourceAreaId: areaId,
                status: 'COMPLETED',
                updatedAt: { gte: startOfDay, lte: endOfDay }
            },
            include: { items: true }
        });
        const salesFromTransfers = new Map<string, number>();
        for (const req of outboundRequisitions) {
            for (const item of req.items) {
                const current = salesFromTransfers.get(item.inventoryItemId) || 0;
                salesFromTransfers.set(item.inventoryItemId, current + (item.dispatchedQuantity || 0));
            }
        }

        // ── Producciones completadas hoy (entradas para Centro de Producción) ──
        const completedProductions = await prisma.proteinProcessing.findMany({
            where: {
                areaId: areaId,
                status: 'COMPLETED',
                completedAt: { gte: startOfDay, lte: endOfDay }
            },
            include: { subProducts: true }
        });
        const entriesFromProduction = new Map<string, number>();
        for (const proc of completedProductions) {
            for (const sub of proc.subProducts) {
                if (sub.outputItemId) {
                    const current = entriesFromProduction.get(sub.outputItemId) || 0;
                    entriesFromProduction.set(sub.outputItemId, current + sub.weight);
                }
            }
        }

        // ── Combinar: Entradas = transferencias entrantes + producciones ──
        const combinedEntries = new Map<string, number>();
        for (const [id, qty] of Array.from(entriesFromTransfers.entries())) {
            combinedEntries.set(id, (combinedEntries.get(id) || 0) + qty);
        }
        for (const [id, qty] of Array.from(entriesFromProduction.entries())) {
            combinedEntries.set(id, (combinedEntries.get(id) || 0) + qty);
        }

        // ── Salidas automáticas = transferencias salientes ──
        // (Las ventas manuales se agregan por separado con processManualSalesAction)
        const combinedSales = new Map<string, number>();
        for (const [id, qty] of Array.from(salesFromTransfers.entries())) {
            combinedSales.set(id, (combinedSales.get(id) || 0) + qty);
        }

        // 4. CREAR O SINCRONIZAR
        if (!daily) {
            // Buscar día anterior para arrastre automático
            const yesterday = new Date(startOfDay);
            yesterday.setDate(yesterday.getDate() - 1);
            const prevDaily = await prisma.dailyInventory.findUnique({
                where: { date_areaId: { date: yesterday, areaId } },
                include: { items: true }
            });
            const prevMap = new Map(prevDaily?.items.map((i: any) => [i.inventoryItemId, i.finalCount]) || []);

            daily = await prisma.dailyInventory.create({
                data: {
                    date: startOfDay,
                    areaId,
                    status: 'DRAFT',
                    items: {
                        create: criticalItems.map((item: any) => ({
                            inventoryItemId: item.id,
                            unit: item.baseUnit,
                            initialCount: prevMap.get(item.id) || 0,
                            finalCount: 0,
                            entries: combinedEntries.get(item.id) || 0,
                            sales: combinedSales.get(item.id) || 0,
                            theoreticalStock: 0,
                            variance: 0
                        }))
                    }
                },
                include: { area: true, items: { include: { inventoryItem: true } } }
            });
        } else if (daily.status !== 'CLOSED') {
            // ── SYNC 1: Agregar items críticos nuevos que no están en el reporte ──
            const existingItemIds = new Set(daily.items.map((i: any) => i.inventoryItemId));
            const missingCriticals = criticalItems.filter((ci: any) => !existingItemIds.has(ci.id));

            if (missingCriticals.length > 0) {
                await prisma.dailyInventoryItem.createMany({
                    data: missingCriticals.map((item: any) => ({
                        dailyInventoryId: daily!.id,
                        inventoryItemId: item.id,
                        unit: item.baseUnit,
                        initialCount: 0,
                        finalCount: 0,
                        entries: combinedEntries.get(item.id) || 0,
                        sales: combinedSales.get(item.id) || 0,
                        theoreticalStock: 0,
                        variance: 0
                    }))
                });
            }

            // ── SYNC 2: Remover items que YA NO son críticos para esta área ──
            const criticalIds = new Set(criticalItems.map((ci: any) => ci.id));
            const nonCriticalDailyItems = daily.items.filter((i: any) => !criticalIds.has(i.inventoryItemId));

            if (nonCriticalDailyItems.length > 0) {
                await prisma.dailyInventoryItem.deleteMany({
                    where: { id: { in: nonCriticalDailyItems.map((i: any) => i.id) } }
                });
            }

            // ── SYNC 3: Actualizar entradas y salidas automáticas ──
            daily = await prisma.dailyInventory.findUnique({
                where: { id: daily.id },
                include: {
                    area: true,
                    items: {
                        include: { inventoryItem: true },
                        orderBy: { inventoryItem: { name: 'asc' } }
                    }
                }
            });

            if (daily) {
                for (const item of daily.items) {
                    const newEntries = combinedEntries.get(item.inventoryItemId) || 0;
                    // Para las salidas, mantenemos las ventas manuales ya guardadas y sumamos las automáticas
                    const autoSales = combinedSales.get(item.inventoryItemId) || 0;
                    // Si ya tiene ventas manuales cargadas (de POS), las sumamos a las automáticas
                    const manualSales = item.sales || 0;
                    // Solo actualizamos si el item NO tiene ventas manuales previas
                    const finalSales = autoSales > 0 ? autoSales : manualSales;

                    if (item.entries !== newEntries || (autoSales > 0 && item.sales !== autoSales)) {
                        await prisma.dailyInventoryItem.update({
                            where: { id: item.id },
                            data: {
                                entries: newEntries,
                                ...(autoSales > 0 ? { sales: finalSales } : {})
                            }
                        });
                    }
                }

                // Recargar final
                daily = await prisma.dailyInventory.findUnique({
                    where: { id: daily.id },
                    include: {
                        area: true,
                        items: {
                            include: { inventoryItem: true },
                            orderBy: { inventoryItem: { name: 'asc' } }
                        }
                    }
                });
            }
        }

        return { success: true, data: daily };

    } catch (error) {
        console.error('Error getting daily inventory:', error);
        return { success: false, message: 'Error cargando inventario diario' };
    }
}

// ============================================================================
// GUARDAR CONTEOS Y CALCULAR VARIACIÓN
// ============================================================================
export async function saveDailyInventoryCountsAction(dailyId: string, itemsData: any[]) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        for (const item of itemsData) {
            const initial = parseFloat(item.initialCount) || 0;
            const entries = parseFloat(item.entries) || 0;
            const finalCount = parseFloat(item.finalCount) || 0;
            const sales = parseFloat(item.sales) || 0;

            // Teórico = Apertura + Entradas - Salidas
            const theoretical = initial + entries - sales;
            // Variación = Cierre real - Teórico
            const variance = finalCount - theoretical;

            await prisma.dailyInventoryItem.update({
                where: { id: item.id },
                data: {
                    initialCount: initial,
                    entries: entries,
                    finalCount: finalCount,
                    sales: sales,
                    theoreticalStock: theoretical,
                    variance: variance,
                    notes: item.notes
                }
            });
        }

        revalidatePath('/dashboard/inventario/diario');
        return { success: true, message: 'Guardado correctamente' };
    } catch (error) {
        console.error('Error saving counts:', error);
        return { success: false, message: 'Error al guardar conteo' };
    }
}

// ============================================================================
// CARGAR VENTAS MANUALES Y EXPLOTAR RECETAS (SOLO RESTAURANTE)
// ============================================================================
export async function getMenuItemsWithRecipesAction() {
    try {
        const items = await prisma.menuItem.findMany({
            where: { isActive: true, recipeId: { not: null } },
            include: { category: true },
            orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }]
        });
        return { success: true, data: items };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function processManualSalesAction(dailyId: string, salesData: { menuItemId: string, quantity: number }[]) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        const daily = await prisma.dailyInventory.findUnique({
            where: { id: dailyId },
            include: { items: true }
        });
        if (!daily) return { success: false, message: 'Inventario no encontrado' };

        // 1. Mapear consumo de ingredientes por cada plato vendido
        const totalConsumption = new Map<string, number>();

        for (const sale of salesData) {
            if (sale.quantity <= 0) continue;

            const menuItem = await prisma.menuItem.findUnique({
                where: { id: sale.menuItemId }
            });

            if (menuItem?.recipeId) {
                const recipe = await prisma.recipe.findUnique({
                    where: { id: menuItem.recipeId },
                    include: { ingredients: true }
                });

                if (recipe) {
                    for (const ing of recipe.ingredients) {
                        const qty = ing.quantity * sale.quantity;
                        const current = totalConsumption.get(ing.ingredientItemId) || 0;
                        totalConsumption.set(ing.ingredientItemId, current + qty);
                    }
                }
            }
        }

        // 2. Actualizar los campos 'sales' de cada item en el inventario diario
        const consumptionEntries = Array.from(totalConsumption.entries());
        for (const [itemId, qty] of consumptionEntries) {
            const dailyItem = daily.items.find((i: any) => i.inventoryItemId === itemId);
            if (dailyItem) {
                await prisma.dailyInventoryItem.update({
                    where: { id: dailyItem.id },
                    data: { sales: qty }
                });
            }
        }

        revalidatePath('/dashboard/inventario/diario');
        return { success: true, message: 'Ventas procesadas y consumo calculado' };
    } catch (error) {
        console.error('Error al procesar ventas manuales:', error);
        return { success: false, message: 'Error procesando ventas' };
    }
}

// ============================================================================
// CERRAR DÍA
// ============================================================================
export async function closeDailyInventoryAction(dailyId: string) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        await prisma.dailyInventory.update({
            where: { id: dailyId },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
                closedById: session.id
            }
        });

        revalidatePath('/dashboard/inventario/diario');
        return { success: true, message: 'Inventario diario finalizado exitosamente' };
    } catch (error) {
        console.error('Error closing inventory:', error);
        return { success: false, message: 'Error al finalizar' };
    }
}

// ============================================================================
// GESTIONAR LISTA DE CRÍTICOS POR ÁREA
// ============================================================================
export async function searchItemsForCriticalListAction(query: string, areaId: string) {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { sku: { contains: query, mode: 'insensitive' } }
                ]
            },
            orderBy: { name: 'asc' },
            take: 50
        });

        // Agregar info de si es crítico PARA ESTA ÁREA
        const areaCriticals = await prisma.areaCriticalItem.findMany({
            where: { areaId },
            select: { inventoryItemId: true }
        });
        const criticalSet = new Set(areaCriticals.map(ac => ac.inventoryItemId));

        const itemsWithCritical = items.map(item => ({
            ...item,
            isCriticalForArea: criticalSet.has(item.id)
        }));

        return { success: true, data: itemsWithCritical };
    } catch (e) {
        console.error('Error searching items:', e);
        return { success: false, data: [] };
    }
}

export async function toggleItemCriticalStatusAction(itemId: string, isCritical: boolean, areaId: string) {
    try {
        const session = await getSession();
        if (!session || !['OWNER', 'AUDITOR', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
            return { success: false, message: 'Permisos insuficientes' };
        }

        if (isCritical) {
            // Agregar a la lista de críticos de esta área
            await prisma.areaCriticalItem.upsert({
                where: { areaId_inventoryItemId: { areaId, inventoryItemId: itemId } },
                create: { areaId, inventoryItemId: itemId },
                update: {} // Ya existe, no hacer nada
            });
        } else {
            // Remover de la lista de críticos de esta área
            await prisma.areaCriticalItem.deleteMany({
                where: { areaId, inventoryItemId: itemId }
            });
        }

        revalidatePath('/dashboard/inventario/diario');
        return { success: true };
    } catch (e) {
        console.error('Error toggling critical status:', e);
        return { success: false, message: 'Error actualizando item' };
    }
}
