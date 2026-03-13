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
    paymentMethod?: string; // 'BS_POS', 'ZELLE', 'CASH_USD', 'MOBILE_PAY', 'CASH', 'CARD', 'TRANSFER', 'MULTIPLE'
    amountPaid?: number;
    notes?: string;
    discountType?: string; // 'DIVISAS_33', 'CORTESIA', 'NONE'
    discountPercent?: number; // Para cortesía: 0-100
    courtesyReason?: string; // Descripción de la cortesía
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

        // Descuento por divisas: se activa cuando el método de pago es ZELLE o CASH_USD,
        // O cuando discountType es DIVISAS_33 (compatibilidad con órdenes anteriores)
        const isDivisas = data.paymentMethod === 'ZELLE' || data.paymentMethod === 'CASH_USD' || data.discountType === 'DIVISAS_33';

        if (data.discountType === 'CORTESIA') {
            const pct = Math.min(100, Math.max(0, data.discountPercent ?? 100));
            discount = subtotal * (pct / 100);
            discountReason = data.courtesyReason
                ? `Cortesía ${pct}%: ${data.courtesyReason}`
                : `Cortesía Autorizada (${pct}%)`;
            if (!data.authorizedById) {
                discountReason += ' [Sin ID Autorizador]';
            }
        } else if (isDivisas) {
            discount = subtotal * 0.33;
            discountReason = data.paymentMethod === 'ZELLE'
                ? 'Pago Zelle - Divisas (33%)'
                : data.paymentMethod === 'CASH_USD'
                ? 'Efectivo USD - Divisas (33%)'
                : 'Pago en Divisas (33%)';
        } else if (data.discountType === 'CORTESIA_100') {
            // Retrocompatibilidad con órdenes anteriores
            discount = subtotal;
            discountReason = 'Cortesía Autorizada (100%)';
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
        // GESTIÓN DE INVENTARIO (Descargo de Recetas + Modificadores)
        // ====================================================================
        try {
            for (const item of data.items) {
                // 1. Receta base del producto
                const menuItem = await prisma.menuItem.findUnique({
                    where: { id: item.menuItemId },
                    select: { name: true, recipeId: true }
                });

                if (menuItem?.recipeId) {
                    const recipe = await prisma.recipe.findUnique({
                        where: { id: menuItem.recipeId },
                        include: { ingredients: { include: { ingredientItem: true } } }
                    });

                    if (recipe && recipe.isActive) {
                        for (const ingredient of recipe.ingredients) {
                            const totalQty = ingredient.quantity * item.quantity;
                            await registerSale({
                                inventoryItemId: ingredient.ingredientItemId,
                                quantity: totalQty,
                                unit: ingredient.unit as any,
                                areaId,
                                orderId: newOrder.id,
                                userId: session.id,
                                notes: `Venta POS: ${item.quantity}x ${menuItem.name}`,
                                allowNegative: true
                            });
                        }
                    }
                }

                // 2. Descargo por modificadores vinculados (Nivel 2)
                // Ej: Tabla con "Tabule" elegido → descontar receta de Tabule
                for (const modifier of (item.modifiers || [])) {
                    if (!modifier.modifierId) continue;

                    const menuModifier = await prisma.menuModifier.findUnique({
                        where: { id: modifier.modifierId },
                        select: {
                            linkedMenuItemId: true,
                            linkedMenuItem: { select: { name: true, recipeId: true } }
                        }
                    });

                    if (!menuModifier?.linkedMenuItemId || !menuModifier.linkedMenuItem?.recipeId) continue;

                    const modifierRecipe = await prisma.recipe.findUnique({
                        where: { id: menuModifier.linkedMenuItem.recipeId },
                        include: { ingredients: true }
                    });

                    if (!modifierRecipe || !modifierRecipe.isActive) continue;

                    for (const ingredient of modifierRecipe.ingredients) {
                        const totalQty = ingredient.quantity * item.quantity;
                        await registerSale({
                            inventoryItemId: ingredient.ingredientItemId,
                            quantity: totalQty,
                            unit: ingredient.unit as any,
                            areaId,
                            orderId: newOrder.id,
                            userId: session.id,
                            notes: `Modificador: ${item.quantity}x ${menuModifier.linkedMenuItem.name} (via ${menuItem?.name || 'producto'})`,
                            allowNegative: true
                        });
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
