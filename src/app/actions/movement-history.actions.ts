'use server';

import prisma from '@/server/db';

export interface MovementHistoryFilters {
    month: number; // 1-12
    year: number;
    movementType?: string;
    itemName?: string;
}

export async function getMonthlyMovementsAction(filters: MovementHistoryFilters) {
    try {
        const startDate = new Date(filters.year, filters.month - 1, 1);
        const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59);

        const whereClause: any = {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        };

        if (filters.movementType) {
            whereClause.movementType = filters.movementType;
        }

        if (filters.itemName) {
            whereClause.inventoryItem = {
                name: { contains: filters.itemName, mode: 'insensitive' },
            };
        }

        const movements = await prisma.inventoryMovement.findMany({
            where: whereClause,
            include: {
                inventoryItem: {
                    select: { name: true, sku: true, baseUnit: true },
                },
                createdBy: {
                    select: { firstName: true, lastName: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const data = movements.map(m => ({
            id: m.id,
            date: m.createdAt.toISOString(),
            type: m.movementType,
            itemName: m.inventoryItem.name,
            itemSku: m.inventoryItem.sku,
            baseUnit: m.inventoryItem.baseUnit,
            quantity: Number(m.quantity),
            unit: m.unit,
            unitCost: m.unitCost ? Number(m.unitCost) : null,
            totalCost: m.totalCost ? Number(m.totalCost) : null,
            reason: m.reason || '',
            notes: m.notes || '',
            referenceNumber: m.referenceNumber || '',
            createdBy: `${m.createdBy.firstName} ${m.createdBy.lastName}`,
        }));

        // Summary
        const summary = {
            totalMovements: data.length,
            totalPurchaseCost: data
                .filter(m => m.type === 'PURCHASE')
                .reduce((sum, m) => sum + (m.totalCost || 0), 0),
            byType: data.reduce((acc, m) => {
                acc[m.type] = (acc[m.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
        };

        return { success: true, data, summary };
    } catch (error) {
        console.error('Error fetching monthly movements:', error);
        return { success: false, data: [], summary: null, message: 'Error al cargar movimientos' };
    }
}

export async function getMovementTypesAction() {
    try {
        const types = await prisma.inventoryMovement.findMany({
            select: { movementType: true },
            distinct: ['movementType'],
        });
        return types.map(t => t.movementType);
    } catch (error) {
        return [];
    }
}
