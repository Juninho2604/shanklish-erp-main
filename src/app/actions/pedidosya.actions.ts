'use server';

import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { getCaracasDateStamp } from '@/lib/datetime';
import { revalidatePath } from 'next/cache';

export interface PedidosYAItem {
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    modifiers: { modifierId: string; name: string; priceAdjustment: number }[];
    notes?: string;
    lineTotal: number;
}

export interface CreatePedidosYAOrderData {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    items: PedidosYAItem[];
    notes?: string;
    externalOrderId?: string; // ID del pedido en PedidosYA (si lo tienen)
}

async function generatePYAOrderNumber(): Promise<string> {
    const dateStr = getCaracasDateStamp();
    const prefix = `PYA-${dateStr}-`;
    const lastOrder = await prisma.salesOrder.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
    });
    let nextSeq = 1;
    if (lastOrder) {
        const parts = lastOrder.orderNumber.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export async function createPedidosYAOrderAction(data: CreatePedidosYAOrderData) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        // Obtener área de ventas base
        let salesArea = await prisma.area.findFirst({ where: { name: { contains: 'Ventas' } } });
        if (!salesArea) salesArea = await prisma.area.findFirst();
        if (!salesArea) return { success: false, message: 'No hay área configurada' };

        const subtotal = data.items.reduce((s, i) => s + i.lineTotal, 0);
        const orderNumber = await generatePYAOrderNumber();

        const notes = [
            data.externalOrderId ? `PedidosYA #${data.externalOrderId}` : '',
            data.notes || '',
        ].filter(Boolean).join(' | ') || 'PedidosYA';

        const order = await prisma.salesOrder.create({
            data: {
                orderNumber,
                orderType: 'PEDIDOSYA',
                customerName: data.customerName || 'PedidosYA',
                customerPhone: data.customerPhone || null,
                customerAddress: data.customerAddress || null,
                status: 'CONFIRMED',
                serviceFlow: 'DIRECT_SALE',
                sourceChannel: 'POS_PEDIDOSYA',
                paymentStatus: 'PAID',
                paymentMethod: 'EXTERNAL',
                kitchenStatus: 'SENT',
                sentToKitchenAt: new Date(),
                subtotal,
                discount: 0,
                total: subtotal,
                amountPaid: subtotal,
                change: 0,
                notes,
                createdById: session.id,
                areaId: salesArea.id,
                items: {
                    create: data.items.map(item => ({
                        menuItemId: item.menuItemId,
                        itemName: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        lineTotal: item.lineTotal,
                        modifiers: {
                            create: item.modifiers.map(m => ({
                                modifierId: m.modifierId,
                                name: m.name,
                                priceAdjustment: m.priceAdjustment,
                            }))
                        },
                    }))
                }
            },
            include: { items: { include: { modifiers: true } } }
        });

        // Descargar inventario por recetas (igual que POS Delivery)
        try {
            for (const item of order.items) {
                if (!item.menuItemId) continue;
                const menuItem = await prisma.menuItem.findUnique({
                    where: { id: item.menuItemId },
                    select: { recipeId: true, name: true }
                });
                if (!menuItem?.recipeId) continue;
                const recipe = await prisma.recipe.findUnique({
                    where: { id: menuItem.recipeId },
                    include: { ingredients: { include: { ingredientItem: true } } }
                });
                if (!recipe?.isActive) continue;
                for (const ingredient of recipe.ingredients) {
                    await prisma.inventoryMovement.create({
                        data: {
                            inventoryItemId: ingredient.ingredientItemId,
                            areaId: salesArea.id,
                            movementType: 'SALE',
                            quantity: -(ingredient.quantity * item.quantity),
                            unit: ingredient.unit,
                            notes: `PedidosYA ${order.orderNumber}: ${item.quantity}x ${menuItem.name}`,
                            createdById: session.id,
                        }
                    });
                }
            }
        } catch (invErr) {
            console.error('Error al descargar inventario PedidosYA:', invErr);
        }

        revalidatePath('/dashboard/sales');
        return { success: true, data: { orderNumber: order.orderNumber, id: order.id } };
    } catch (error) {
        console.error('Error creando orden PedidosYA:', error);
        return { success: false, message: 'Error al registrar pedido' };
    }
}
