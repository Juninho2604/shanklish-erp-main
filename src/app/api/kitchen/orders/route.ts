import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: Obtener órdenes pendientes para cocina
export async function GET() {
    try {
        const orders = await prisma.salesOrder.findMany({
            where: {
                status: {
                    in: ['PENDING', 'CONFIRMED', 'PREPARING']
                },
                createdAt: {
                    // Solo órdenes del día actual
                    gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            },
            include: {
                items: {
                    include: {
                        menuItem: true,
                        modifiers: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc' // Las más antiguas primero
            }
        });

        const formattedOrders = orders.map(order => ({
            id: order.id,
            orderNumber: order.orderNumber,
            orderType: order.orderType,
            customerName: order.customerName,
            status: order.status,
            createdAt: order.createdAt.toISOString(),
            items: order.items.map(item => ({
                name: item.menuItem?.name || item.itemName || 'Item',
                quantity: item.quantity,
                modifiers: item.modifiers.map(mod => ({
                    name: mod.name
                })),
                notes: item.notes
            }))
        }));

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
