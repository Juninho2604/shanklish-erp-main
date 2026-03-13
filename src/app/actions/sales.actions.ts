'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { getSession } from '@/lib/auth';

export interface SalesFilter {
    startDate?: Date;
    endDate?: Date;
    orderType?: string;
}

export interface ZReportData {
    period: string;
    totalOrders: number;
    grossTotal: number;
    totalDiscounts: number;
    discountBreakdown: {
        divisas: number;
        cortesias: number;
        other: number;
    };
    netTotal: number;
    paymentBreakdown: {
        cash: number;
        card: number;
        transfer: number;
        mobile: number;
        zelle: number;
        other: number;
    };
    ordersByStatus: Record<string, number>;
}

export async function getSalesHistoryAction(limit = 100) {
    try {
        const sales = await prisma.salesOrder.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                authorizedBy: { select: { firstName: true, lastName: true } },
                createdBy: { select: { firstName: true, lastName: true } },
                voidedBy: { select: { firstName: true, lastName: true } },
                items: {
                    include: {
                        modifiers: { select: { name: true, priceAdjustment: true } }
                    }
                }
            }
        });
        return { success: true, data: sales };
    } catch (error) {
        console.error('Error fetching sales:', error);
        return { success: false, message: 'Error cargando historial' };
    }
}

export async function getDailyZReportAction(): Promise<{ success: boolean; data?: ZReportData; message?: string }> {
    try {
        const today = new Date();
        const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);

        const todaysOrders = await prisma.salesOrder.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: { not: 'CANCELLED' }
            }
        });

        let grossTotal = 0;
        let totalDiscounts = 0;
        let discountDivisas = 0;
        let discountCortesias = 0;
        let paymentCash = 0;
        let paymentCard = 0;
        let paymentTransfer = 0;
        let paymentMobile = 0;
        let paymentZelle = 0;

        for (const order of todaysOrders) {
            grossTotal += order.subtotal;
            totalDiscounts += order.discount;

            if (order.discountType === 'DIVISAS_33') discountDivisas += order.discount;
            else if (order.discountType === 'CORTESIA_100' || order.discountType === 'CORTESIA') discountCortesias += order.discount;

            const paid = order.total;
            const pm = order.paymentMethod?.toUpperCase() || 'UNKNOWN';

            if (pm === 'CASH' || pm === 'CASH_USD') paymentCash += paid;
            else if (pm === 'CARD' || pm === 'BS_POS') paymentCard += paid;
            else if (pm === 'TRANSFER' || pm === 'BANK_TRANSFER') paymentTransfer += paid;
            else if (pm === 'MOBILE_PAY' || pm === 'PAGO_MOVIL') paymentMobile += paid;
            else if (pm === 'ZELLE') paymentZelle += paid;
            else paymentMobile += paid;
        }

        const netTotal = grossTotal - totalDiscounts;

        return {
            success: true,
            data: {
                period: today.toLocaleDateString(),
                totalOrders: todaysOrders.length,
                grossTotal,
                totalDiscounts,
                discountBreakdown: {
                    divisas: discountDivisas,
                    cortesias: discountCortesias,
                    other: totalDiscounts - discountDivisas - discountCortesias
                },
                netTotal,
                paymentBreakdown: { cash: paymentCash, card: paymentCard, transfer: paymentTransfer, mobile: paymentMobile, zelle: paymentZelle, other: 0 },
                ordersByStatus: {}
            }
        };
    } catch (error) {
        console.error('Error generating Z report:', error);
        return { success: false, message: 'Error generando reporte Z' };
    }
}

// ============================================================================
// ANULACIÓN DE VENTA
// ============================================================================

export async function voidSalesOrderAction(params: {
    orderId: string;
    voidReason: string;
    authorizedById: string;
    authorizedByName: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        // 1. Obtener orden con items
        const order = await prisma.salesOrder.findUnique({
            where: { id: params.orderId },
            include: {
                items: {
                    include: {
                        menuItem: { select: { recipeId: true, name: true } }
                    }
                }
            }
        });

        if (!order) return { success: false, message: 'Orden no encontrada' };
        if (order.status === 'CANCELLED') return { success: false, message: 'Esta orden ya está anulada' };

        // 2. Revertir inventario (devolver ingredientes al stock)
        try {
            for (const item of order.items) {
                if (!item.menuItem?.recipeId) continue;

                const recipe = await prisma.recipe.findUnique({
                    where: { id: item.menuItem.recipeId },
                    include: { ingredients: true }
                });

                if (!recipe || !recipe.isActive) continue;

                for (const ingredient of recipe.ingredients) {
                    const totalQty = ingredient.quantity * item.quantity;

                    await prisma.inventoryMovement.create({
                        data: {
                            inventoryItemId: ingredient.ingredientItemId,
                            movementType: 'ADJUSTMENT_IN',
                            quantity: totalQty,
                            unit: ingredient.unit as any,
                            notes: `Anulación ${order.orderNumber}: ${item.quantity}x ${item.menuItem.name}`,
                            reason: `Anulado por ${params.authorizedByName}: ${params.voidReason}`,
                            createdById: session.id,
                        }
                    });

                    await prisma.inventoryLocation.upsert({
                        where: {
                            inventoryItemId_areaId: {
                                inventoryItemId: ingredient.ingredientItemId,
                                areaId: order.areaId
                            }
                        },
                        update: { currentStock: { increment: totalQty } },
                        create: {
                            inventoryItemId: ingredient.ingredientItemId,
                            areaId: order.areaId,
                            currentStock: totalQty
                        }
                    });
                }
            }
        } catch (invError) {
            console.error('Error revirtiendo inventario en anulación:', invError);
        }

        // 3. Marcar como CANCELLED con trazabilidad completa
        await prisma.salesOrder.update({
            where: { id: params.orderId },
            data: {
                status: 'CANCELLED',
                paymentStatus: 'REFUNDED',
                voidedAt: new Date(),
                voidedById: params.authorizedById !== 'demo-master-id' ? params.authorizedById : undefined,
                voidReason: `[${params.authorizedByName}] ${params.voidReason}`
            }
        });

        revalidatePath('/dashboard/sales');
        revalidatePath('/dashboard/inventory');

        return { success: true, message: `Orden ${order.orderNumber} anulada correctamente` };

    } catch (error) {
        console.error('Error anulando orden:', error);
        return { success: false, message: 'Error interno al anular la orden' };
    }
}
