import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Categorías que van a BARRA (solo Bebidas)
const BAR_CATEGORIES = ['Bebidas'];

// GET: Obtener órdenes pendientes para cocina o barra
// ?station=kitchen (default) → excluye Bebidas
// ?station=bar              → solo Bebidas
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const station = searchParams.get('station') ?? 'kitchen'; // 'kitchen' | 'bar'
        const isBar = station === 'bar';

        const orders = await prisma.salesOrder.findMany({
            where: {
                status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] },
                kitchenStatus: 'SENT',
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            },
            include: {
                items: {
                    include: {
                        menuItem: { include: { category: true } },
                        modifiers: true
                    }
                },
                tableOrStation: true
            },
            orderBy: { createdAt: 'asc' }
        });

        const formattedOrders = orders
            .map(order => {
                // Filtrar items por estación
                const stationItems = order.items.filter(item => {
                    const catName = item.menuItem?.category?.name ?? '';
                    const isBeverage = BAR_CATEGORIES.includes(catName);
                    return isBar ? isBeverage : !isBeverage;
                });

                if (stationItems.length === 0) return null; // orden sin items para esta estación

                return {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    orderType: order.orderType,
                    customerName: order.customerName,
                    tableName: order.tableOrStation?.name ?? null,
                    status: order.status,
                    createdAt: order.createdAt.toISOString(),
                    items: stationItems.map(item => ({
                        name: item.menuItem?.name || item.itemName || 'Item',
                        quantity: item.quantity,
                        modifiers: item.modifiers.map(mod => ({ name: mod.name })),
                        notes: item.notes
                    }))
                };
            })
            .filter(Boolean);

        return NextResponse.json({ orders: formattedOrders });
    } catch (error) {
        console.error('Error fetching kitchen orders:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

// PATCH: Actualizar estado de orden
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderId, status } = body;

        if (!orderId || !status) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        const order = await prisma.salesOrder.update({
            where: { id: orderId },
            data: { status }
        });

        return NextResponse.json({ success: true, order });
    } catch (error) {
        console.error('Error updating order:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
