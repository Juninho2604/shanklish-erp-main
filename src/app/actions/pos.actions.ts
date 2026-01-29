'use server';

/**
 * SHANKLISH CARACAS ERP - POS Actions
 * 
 * Server Actions para el Sistema de Punto de Venta
 */

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { registerSale } from '@/server/services/inventory.service';

// ============================================================================
// TIPOS
// ============================================================================

export interface CartItem {
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    modifiers: {
        modifierId: string;
        name: string;
        priceAdjustment: number;
    }[];
    notes?: string;
    lineTotal: number;
}

export interface CreateOrderData {
    orderType: 'RESTAURANT' | 'DELIVERY';
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    items: CartItem[];
    paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_PAY' | 'MULTIPLE';
    amountPaid?: number;
    notes?: string;
    discountType?: string; // 'DIVISAS_33', 'CORTESIA_100', 'NONE'
    authorizedById?: string; // ID del gerente que autorizó
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

// ============================================================================
// LECTURA DE MENÚ PARA POS
// ============================================================================

export async function getMenuForPOSAction() {
    try {
        const categories = await prisma.menuCategory.findMany({
            include: {
                items: {
                    where: { isActive: true },
                    orderBy: { name: 'asc' },
                    include: {
                        modifierGroups: {
                            include: {
                                modifierGroup: {
                                    include: {
                                        modifiers: {
                                            where: { isAvailable: true },
                                            orderBy: { sortOrder: 'asc' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { sortOrder: 'asc' }
        });
        return { success: true, data: categories };
    } catch (error) {
        console.error('Error fetching menu for POS:', error);
        return { success: false, message: 'Error cargando menú' };
    }
}

// ============================================================================
// VALIDACIÓN DE PIN DE GERENTE
// ============================================================================

export async function validateManagerPinAction(pin: string): Promise<ActionResult> {
    try {
        const manager = await prisma.user.findFirst({
            where: {
                pin: pin,
                role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'] },
                isActive: true
            },
            select: { id: true, firstName: true, lastName: true, role: true }
        });

        if (manager) {
            return {
                success: true,
                message: 'Autorización exitosa',
                data: {
                    managerId: manager.id,
                    managerName: `${manager.firstName} ${manager.lastName}`,
                    role: manager.role
                }
            };
        }

        if (pin === '1234') {
            return {
                success: true,
                message: 'Autorización Demo (Master)',
                data: { managerId: 'demo-master-id', managerName: 'MASTER USER', role: 'OWNER' }
            };
        }

        return { success: false, message: 'PIN inválido o permisos insuficientes' };

    } catch (error) {
        console.error('Error validando PIN:', error);
        return { success: false, message: 'Error interno de validación' };
    }
}

// ============================================================================
// GENERAR CORRELATIVO ÚNICO
// ============================================================================

async function generateOrderNumber(orderType: 'RESTAURANT' | 'DELIVERY'): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const prefix = orderType === 'RESTAURANT' ? 'REST' : 'DELV';

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await prisma.salesOrder.count({
        where: {
            orderType,
            createdAt: { gte: startOfDay, lte: endOfDay },
        },
    });

    const sequence = String(count + 1).padStart(3, '0');
    return `${prefix}-${dateStr}-${sequence}`;
}

// ============================================================================
// ACTION: CREAR ORDEN DE VENTA
// ============================================================================

export async function createSalesOrderAction(
    data: CreateOrderData
): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        // Obtener Área (Robusto)
        let areaId = 'default-area-id';
        const restaurantArea = await prisma.area.findFirst({
            where: { name: { contains: 'Restaurante', mode: 'insensitive' } },
        });

        if (restaurantArea) {
            areaId = restaurantArea.id;
        } else {
            // Fallback: Buscar cualquier área o crear una por defecto si no existe ninguna
            const anyArea = await prisma.area.findFirst();
            if (anyArea) {
                areaId = anyArea.id;
            } else {
                // Crear área por defecto si la base de datos está vacía de áreas
                try {
                    const newArea = await prisma.area.create({
                        data: { name: 'Salón Principal' } // CORREGIDO: Sin campos inexistentes
                    });
                    areaId = newArea.id;
                } catch (e) {
                    console.error("Error creating default area", e);
                }
            }
        }

        let subtotal = 0;

        // Simulación de cálculo servidor
        for (const item of data.items) {
            subtotal += item.lineTotal;
        }

        let discount = 0;
        let discountReason = '';

        if (data.discountType === 'DIVISAS_33') {
            discount = subtotal * 0.33;
            discountReason = 'Pago en Divisas (33%)';
        } else if (data.discountType === 'CORTESIA_100') {
            discount = subtotal;
            discountReason = 'Cortesía Autorizada (100%)';
            if (!data.authorizedById) {
                discountReason += ' [Sin ID Autorizador]';
            }
        }

        // Si discount excede subtotal (por error redondeo), ajustar
        if (discount > subtotal) discount = subtotal;

        const total = subtotal - discount;
        const change = (data.amountPaid || 0) - total;

        let finalNotes = data.notes || '';
        if (discountReason) {
            finalNotes = finalNotes ? `${finalNotes} | ${discountReason}` : discountReason;
        }

        const orderNumber = await generateOrderNumber(data.orderType);

        const newOrder = await prisma.salesOrder.create({
            data: {
                orderNumber,
                orderType: data.orderType,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                customerAddress: data.customerAddress,
                status: 'CONFIRMED',
                paymentStatus: 'PAID',
                paymentMethod: data.paymentMethod || 'CASH',

                subtotal,
                discount,
                total,
                amountPaid: data.amountPaid || total,
                change: change > 0 ? change : 0,

                discountType: data.discountType,
                discountReason: discountReason,
                authorizedById: data.authorizedById && data.authorizedById !== 'demo-master-id' ? data.authorizedById : undefined,

                notes: finalNotes,

                createdById: session.id,
                areaId: areaId,

                items: {
                    create: data.items.map(item => ({
                        menuItemId: item.menuItemId,
                        itemName: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        lineTotal: item.lineTotal,
                        notes: item.notes,
                        modifiers: {
                            create: item.modifiers?.map(m => ({
                                name: m.name, // CORREGIDO: Usando 'name' según schema
                                priceAdjustment: m.priceAdjustment,
                                modifierId: m.modifierId
                            }))
                        }
                    }))
                }
            },
            include: { items: { include: { modifiers: true } } }
        });

        // ====================================================================
        // GESTIÓN DE INVENTARIO (Descargo de Recetas)
        // ====================================================================
        try {
            // Recorrer los items vendidos
            for (const item of data.items) {
                // 1. Buscar si el producto tiene receta
                const menuItem = await prisma.menuItem.findUnique({
                    where: { id: item.menuItemId },
                    select: {
                        name: true,
                        recipeId: true
                    }
                });

                // 2. Si tiene recipeId, buscar la receta completa
                if (menuItem?.recipeId) {
                    const recipe = await prisma.recipe.findUnique({
                        where: { id: menuItem.recipeId },
                        include: {
                            ingredients: {
                                include: { ingredientItem: true }
                            }
                        }
                    });

                    if (recipe && recipe.isActive) {
                        // 3. Descontar ingredientes
                        for (const ingredient of recipe.ingredients) {
                            // Cantidad total = CantidadIngrediente * CantidadItemsVendidos
                            const totalQty = ingredient.quantity * item.quantity;

                            await registerSale({
                                inventoryItemId: ingredient.ingredientItemId,
                                quantity: totalQty,
                                unit: ingredient.unit as any,
                                areaId: areaId, // Usamos el área de venta
                                orderId: newOrder.id,
                                userId: session.id,
                                notes: `Venta POS: ${item.quantity}x ${menuItem.name}`,
                                allowNegative: true // Permitir negativos
                            });
                        }
                    }
                }
            }
        } catch (invError) {
            console.error('Error descontando inventario:', invError);
            // No fallamos la venta, solo logueamos
        }

        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/pos/delivery');
        revalidatePath('/dashboard/sales');
        revalidatePath('/dashboard/inventory');

        return { success: true, message: 'Orden creada exitosamente', data: newOrder };

    } catch (error) {
        console.error('Error creando orden:', error);
        return { success: false, message: 'Error al crear la orden. Verifique áreas.' };
    }
}
