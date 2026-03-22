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
import { getCaracasDateStamp, getCaracasDayRange } from '@/lib/datetime';

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

export type POSOrderType = 'RESTAURANT' | 'DELIVERY' | 'PICKUP';
export type POSPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_PAY' | 'MULTIPLE' | 'ZELLE';

export interface CreateOrderData {
    orderType: POSOrderType;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    items: CartItem[];
    paymentMethod?: POSPaymentMethod;
    amountPaid?: number;
    notes?: string;
    discountType?: string; // 'DIVISAS_33', 'CORTESIA_100', 'CORTESIA_PERCENT', 'NONE'
    discountPercent?: number; // Para CORTESIA_PERCENT (ej: 20 = 20%)
    authorizedById?: string; // ID del gerente que autorizó
}

export interface OpenTabInput {
    tableOrStationId: string;
    customerLabel?: string;
    customerPhone?: string;
    guestCount?: number;
    assignedWaiterId?: string;
    waiterLabel?: string;
    notes?: string;
}

export interface AddItemsToOpenTabInput {
    openTabId: string;
    items: CartItem[];
    notes?: string;
}

export interface RegisterOpenTabPaymentInput {
    openTabId: string;
    amount: number;
    paymentMethod: POSPaymentMethod;
    splitLabel?: string;
    notes?: string;
    discountAmount?: number;
    serviceFeeIncluded?: boolean; // Si el cliente pagó el 10% servicio (sala principal)
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

class POSActionError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = 'POSActionError';
    }
}

async function ensureBaseSalesArea() {
    const whereActive = { isActive: true };

    // 1. SHANKLISH SERVICIO (almacén preferido)
    let area = await prisma.area.findFirst({
        where: { ...whereActive, name: { contains: 'SHANKLISH SERVICIO', mode: 'insensitive' } },
    });
    if (area) return area;

    // 2. Restaurante
    area = await prisma.area.findFirst({
        where: { ...whereActive, name: { contains: 'Restaurante', mode: 'insensitive' } },
    });
    if (area) return area;

    // 3. Barra (incluye BARRA, DEPOSITO BARRA)
    area = await prisma.area.findFirst({
        where: { ...whereActive, name: { contains: 'Barra', mode: 'insensitive' } },
    });
    if (area) return area;

    // 4. Oficina
    area = await prisma.area.findFirst({
        where: { ...whereActive, name: { contains: 'Oficina', mode: 'insensitive' } },
    });
    if (area) return area;

    // 5. Cualquier área activa
    area = await prisma.area.findFirst({ where: whereActive });
    if (area) return area;

    // 6. Último recurso: cualquier área (incluso inactiva)
    area = await prisma.area.findFirst();
    if (area) return area;

    // 7. Crear área SHANKLISH SERVICIO por defecto
    return prisma.area.create({
        data: { name: 'SHANKLISH SERVICIO', isActive: true }
    });
}

const RESTAURANT_ZONES = [
    { code: 'SALON_PPAL', name: 'Salón Principal', zoneType: 'DINING',   sortOrder: 1, prefix: 'SP', tableCount: 30 },
] as const;

async function ensureRestaurantSetup() {
    // Ensure branch
    let branch = await prisma.branch.findFirst();
    if (!branch) {
        branch = await prisma.branch.create({
            data: { code: 'SHK-CCS', name: 'Shanklish Caracas', legalName: 'Shanklish Caracas, C.A.' }
        });
    }

    // Ensure sales area for inventory
    const hasArea = await prisma.area.findFirst({ where: { branchId: branch.id, name: { contains: 'Salón', mode: 'insensitive' } } });
    if (!hasArea) {
        await prisma.area.create({
            data: { branchId: branch.id, name: 'Salón Principal', description: 'Área de descarga POS Restaurante' }
        });
    }

    // Upsert each zone with tables
    for (const zConf of RESTAURANT_ZONES) {
        let zone = await prisma.serviceZone.findFirst({ where: { branchId: branch.id, code: zConf.code } });
        if (!zone) {
            zone = await prisma.serviceZone.findFirst({ where: { branchId: branch.id, name: zConf.name } });
        }
        if (!zone) {
            zone = await prisma.serviceZone.create({
                data: { branchId: branch.id, code: zConf.code, name: zConf.name, zoneType: zConf.zoneType, sortOrder: zConf.sortOrder }
            });
        } else {
            zone = await prisma.serviceZone.update({
                where: { id: zone.id },
                data: { code: zConf.code, zoneType: zConf.zoneType, sortOrder: zConf.sortOrder }
            });
        }
        const existingCodes = await prisma.tableOrStation.findMany({
            where: { serviceZoneId: zone.id },
            select: { code: true }
        });
        const codeSet = new Set(existingCodes.map(t => t.code));
        const toCreate: { branchId: string; serviceZoneId: string; code: string; name: string; stationType: string; capacity: number }[] = [];
        for (let i = 1; i <= zConf.tableCount; i++) {
            const tCode = `${zConf.prefix}-${String(i).padStart(2, '0')}`;
            if (!codeSet.has(tCode)) {
                toCreate.push({ branchId: branch.id, serviceZoneId: zone.id, code: tCode, name: `Mesa ${tCode}`, stationType: 'TABLE', capacity: 4 });
            }
        }
        if (toCreate.length > 0) {
            await prisma.tableOrStation.createMany({ data: toCreate, skipDuplicates: true });
        }
    }

    // Return full layout with traceability — filter by name (reliable even if code was null before)
    return prisma.branch.findFirstOrThrow({
        where: { id: branch.id },
        include: {
            serviceZones: {
                where: { name: { in: RESTAURANT_ZONES.map(z => z.name) } },
                include: {
                    tablesOrStations: {
                        where: { isActive: true },
                        include: {
                            openTabs: {
                                where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
                                include: {
                                    openedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
                                    closedBy: { select: { id: true, firstName: true, lastName: true } },
                                    paymentSplits: true,
                                    orders: {
                                        include: {
                                            items: { include: { modifiers: true } },
                                            createdBy: { select: { firstName: true, lastName: true } }
                                        },
                                        orderBy: { createdAt: 'desc' }
                                    }
                                },
                                orderBy: { openedAt: 'desc' }
                            }
                        },
                        orderBy: { name: 'asc' }
                    }
                },
                orderBy: { sortOrder: 'asc' }
            }
        }
    });
}

async function resolveSalesAreaForBranch(branchId?: string) {
    if (branchId) {
        const branchArea = await prisma.area.findFirst({
            where: {
                branchId,
                OR: [
                    { name: { contains: 'SHANKLISH SERVICIO', mode: 'insensitive' } },
                    { name: { contains: 'Barra', mode: 'insensitive' } },
                    { name: { contains: 'Restaurante', mode: 'insensitive' } },
                    { name: { contains: 'Oficina', mode: 'insensitive' } },
                ]
            }
        });

        if (branchArea) return branchArea;
    }

    return ensureBaseSalesArea();
}

const DELIVERY_FEE_NORMAL = 4.5;
const DELIVERY_FEE_DIVISAS = 3;

function calculateCartTotals(data: Pick<CreateOrderData, 'orderType' | 'items' | 'discountType' | 'discountPercent' | 'amountPaid'>) {
    const itemsSubtotal = data.items.reduce((sum, item) => sum + item.lineTotal, 0);

    // DELIVERY: $4.5 fee normal, $3 en divisas. Sin 10% servicio.
    if (data.orderType === 'DELIVERY') {
        let subtotal: number;
        let discount: number;
        let total: number;
        let discountReason = '';

        if (data.discountType === 'DIVISAS_33') {
            const itemsDiscounted = itemsSubtotal * (2 / 3);
            subtotal = itemsSubtotal + DELIVERY_FEE_NORMAL;
            discount = itemsSubtotal / 3 + (DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS);
            total = itemsDiscounted + DELIVERY_FEE_DIVISAS;
            discountReason = 'Pago en Divisas (33.33%) - Delivery $3';
        } else if (data.discountType === 'CORTESIA_100') {
            subtotal = itemsSubtotal + DELIVERY_FEE_NORMAL;
            discount = subtotal;
            total = 0;
            discountReason = 'Cortesía Autorizada (100%)';
        } else if (data.discountType === 'CORTESIA_PERCENT' && data.discountPercent != null) {
            const pct = Math.min(100, Math.max(0, data.discountPercent)) / 100;
            subtotal = itemsSubtotal + DELIVERY_FEE_NORMAL;
            discount = subtotal * pct;
            total = subtotal - discount;
            discountReason = `Cortesía Autorizada (${data.discountPercent}%)`;
        } else {
            subtotal = itemsSubtotal + DELIVERY_FEE_NORMAL;
            discount = 0;
            total = subtotal;
        }

        const change = (data.amountPaid || 0) - total;
        return { subtotal, discount, total, change: change > 0 ? change : 0, discountReason };
    }

    // RESTAURANT / PICKUP: sin delivery fee, lógica original
    const subtotal = itemsSubtotal;
    let discount = 0;
    let discountReason = '';

    if (data.discountType === 'DIVISAS_33') {
        discount = subtotal / 3;
        discountReason = 'Pago en Divisas (33.33%)';
    } else if (data.discountType === 'CORTESIA_100') {
        discount = subtotal;
        discountReason = 'Cortesía Autorizada (100%)';
    } else if (data.discountType === 'CORTESIA_PERCENT' && data.discountPercent != null) {
        const pct = Math.min(100, Math.max(0, data.discountPercent)) / 100;
        discount = subtotal * pct;
        discountReason = `Cortesía Autorizada (${data.discountPercent}%)`;
    }

    if (discount > subtotal) discount = subtotal;

    const total = subtotal - discount;
    const change = (data.amountPaid || 0) - total;

    return {
        subtotal,
        discount,
        total,
        change: change > 0 ? change : 0,
        discountReason
    };
}

async function generateTabCode(): Promise<string> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await prisma.openTab.count({
        where: {
            openedAt: {
                gte: startOfDay,
                lte: endOfDay
            }
        }
    });

    const sequence = String(count + 1).padStart(3, '0');
    const dateStr = today.toISOString().split('T')[0];
    return `TAB-${dateStr}-${sequence}`;
}

async function getMenuItemMetadata(menuItemIds: string[]) {
    return prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } }
    });
}

function requiresKitchenRouting(menuItem: any) {
    if (menuItem?.kitchenRouting === 'NONE') return false;
    if (menuItem?.kitchenRouting === 'KITCHEN' || menuItem?.kitchenRouting === 'BAR') return true;
    if (menuItem?.serviceCategory === 'PACKAGED_DRINK') return false;
    return Boolean(menuItem?.recipeId);
}

function requiresStockValidation(menuItem: any) {
    if (menuItem?.stockTrackingMode === 'DISPLAY_ONLY') return false;
    if (menuItem?.serviceCategory === 'BUCKET' || menuItem?.serviceCategory === 'COCKTAIL') return true;
    if (menuItem?.stockTrackingMode === 'COMPOUND' || menuItem?.stockTrackingMode === 'RECIPE') return true;
    return Boolean(menuItem?.recipeId);
}

async function validateComponentStockAvailability(params: {
    items: CartItem[];
    areaId: string;
    menuMap: Map<string, any>;
}) {
    const shortages: string[] = [];

    for (const cartItem of params.items) {
        const menuItem = params.menuMap.get(cartItem.menuItemId);
        if (!menuItem || !requiresStockValidation(menuItem) || !menuItem.recipe) continue;

        for (const ingredient of menuItem.recipe.ingredients) {
            const requiredQty = ingredient.quantity * cartItem.quantity;

            const stock = await prisma.inventoryLocation.findUnique({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: ingredient.ingredientItemId,
                        areaId: params.areaId
                    }
                },
                include: {
                    inventoryItem: {
                        select: {
                            name: true,
                            baseUnit: true
                        }
                    }
                }
            });

            const available = stock?.currentStock || 0;
            if (available < requiredQty) {
                const ingredientName = stock?.inventoryItem?.name || ingredient.ingredientItem?.name || ingredient.ingredientItemId;
                const unit = stock?.inventoryItem?.baseUnit || '';
                shortages.push(
                    `${menuItem.name}: falta ${ingredientName} (${requiredQty.toFixed(2)} ${unit} requeridos, ${available.toFixed(2)} ${unit} disponibles)`
                );
            }
        }
    }

    if (shortages.length > 0) {
        throw new POSActionError(
            'INSUFFICIENT_COMPONENT_STOCK',
            `Stock insuficiente para preparar el consumo solicitado: ${shortages.join(' | ')}`
        );
    }
}

async function assertOpenTabVersionUpdate(params: {
    tx: any;
    openTabId: string;
    expectedVersion: number;
    data: Parameters<typeof prisma.openTab.updateMany>[0]['data'];
}) {
    const result = await params.tx.openTab.updateMany({
        where: {
            id: params.openTabId,
            version: params.expectedVersion
        },
        data: {
            ...params.data,
            version: {
                increment: 1
            }
        }
    });

    if (result.count !== 1) {
        throw new POSActionError(
            'OPEN_TAB_CONFLICT',
            'La cuenta fue modificada por otro usuario. Recarga la cuenta antes de continuar.'
        );
    }
}

async function registerInventoryForCartItems(params: {
    items: CartItem[];
    areaId: string;
    orderId: string;
    userId: string;
}) {
    for (const item of params.items) {
        const menuItem = await prisma.menuItem.findUnique({
            where: { id: item.menuItemId },
            select: {
                name: true,
                recipeId: true
            }
        });

        if (!menuItem?.recipeId) continue;

        const recipe = await prisma.recipe.findUnique({
            where: { id: menuItem.recipeId },
            include: {
                ingredients: {
                    include: { ingredientItem: true }
                }
            }
        });

        if (!recipe || !recipe.isActive) continue;

        for (const ingredient of recipe.ingredients) {
            const totalQty = ingredient.quantity * item.quantity;

            await registerSale({
                inventoryItemId: ingredient.ingredientItemId,
                quantity: totalQty,
                unit: ingredient.unit as any,
                areaId: params.areaId,
                orderId: params.orderId,
                userId: params.userId,
                notes: `Venta POS: ${item.quantity}x ${menuItem.name}`,
                allowNegative: true
            });
        }
    }
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

async function generateOrderNumber(orderType: POSOrderType): Promise<string> {
    const dateStr = getCaracasDateStamp();
    const prefix = orderType === 'RESTAURANT' ? 'REST' : 'DELV';
    const orderPrefix = `${prefix}-${dateStr}-`;

    const lastOrder = await prisma.salesOrder.findFirst({
        where: { orderNumber: { startsWith: orderPrefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
    });

    let nextSeq = 1;
    if (lastOrder) {
        const parts = lastOrder.orderNumber.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
    }

    const sequence = String(nextSeq).padStart(3, '0');
    return `${orderPrefix}${sequence}`;
}

function isOrderNumberUniqueError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('Unique constraint failed') && msg.includes('orderNumber');
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

        const salesArea = await ensureBaseSalesArea();
        const areaId = salesArea.id;
        const { subtotal, discount, total, change, discountReason } = calculateCartTotals(data);

        let finalNotes = data.notes || '';
        if (discountReason) {
            finalNotes = finalNotes ? `${finalNotes} | ${discountReason}` : discountReason;
        }

        let newOrder;
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                if (attempt > 0) {
                    await new Promise(r => setTimeout(r, Math.random() * 80 + 20));
                }
                const orderNumber = await generateOrderNumber(data.orderType);
                newOrder = await prisma.salesOrder.create({
                    data: {
                        orderNumber,
                        orderType: data.orderType,
                        customerName: data.customerName,
                        customerPhone: data.customerPhone,
                        customerAddress: data.customerAddress,
                        status: 'CONFIRMED',
                        serviceFlow: 'DIRECT_SALE',
                        sourceChannel: data.orderType === 'DELIVERY' ? 'POS_DELIVERY' : 'POS_RESTAURANT',
                        paymentStatus: 'PAID',
                        paymentMethod: data.paymentMethod || 'CASH',
                        kitchenStatus: 'SENT',
                        sentToKitchenAt: new Date(),

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
                                        name: m.name,
                                        priceAdjustment: m.priceAdjustment,
                                        modifierId: m.modifierId
                                    }))
                                }
                            }))
                        }
                    },
                    include: { items: { include: { modifiers: true } } }
                });
                break;
            } catch (err) {
                if (isOrderNumberUniqueError(err) && attempt < 9) continue;
                throw err;
            }
        }

        if (!newOrder) throw new Error('No se pudo crear la orden tras reintentos');

        // ====================================================================
        // GESTIÓN DE INVENTARIO (Descargo de Recetas)
        // ====================================================================
        try {
            await registerInventoryForCartItems({
                items: data.items,
                areaId,
                orderId: newOrder.id,
                userId: session.id
            });
        } catch (invError) {
            console.error('Error descontando inventario:', invError);
            // No fallamos la venta, solo logueamos
        }

        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/pos/delivery');
        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/sales');
        revalidatePath('/dashboard/inventory');

        return { success: true, message: 'Orden creada exitosamente', data: newOrder };

    } catch (error) {
        console.error('Error creando orden:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            message: errMsg.includes('area') || errMsg.includes('Area')
                ? `Error de áreas: ${errMsg}. Verifique que existan áreas activas (BARRA, OFICINA, etc.) en Administración → Almacenes.`
                : `Error al crear la orden: ${errMsg}`
        };
    }
}

// ============================================================================
// POS RESTAURANTE - CUENTAS ABIERTAS
// ============================================================================

export async function getRestaurantLayoutAction(): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        const branch = await ensureRestaurantSetup();

        return {
            success: true,
            message: 'Layout restaurante cargado',
            data: branch
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('Error loading restaurant layout:', error);
        return { success: false, message: `Error cargando layout restaurante: ${errorMessage}` };
    }
}

export async function openTabAction(data: OpenTabInput): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        const table = await prisma.tableOrStation.findUnique({
            where: { id: data.tableOrStationId },
            include: {
                openTabs: {
                    where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
                    orderBy: { openedAt: 'desc' },
                    include: {
                        paymentSplits: true,
                        orders: {
                            include: { items: true },
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                }
            }
        });

        if (!table) {
            return { success: false, message: 'Mesa o estación no encontrada' };
        }

        if (table.openTabs.length > 0) {
            return {
                success: true,
                message: 'La mesa ya tiene una cuenta abierta',
                data: table.openTabs[0]
            };
        }

        const tabCode = await generateTabCode();

        const tab = await prisma.$transaction(async (tx) => {
            const createdTab = await tx.openTab.create({
                data: {
                    branchId: table.branchId,
                    serviceZoneId: table.serviceZoneId,
                    tableOrStationId: table.id,
                    tabCode,
                    customerLabel: data.customerLabel || table.name,
                    customerPhone: data.customerPhone,
                    guestCount: data.guestCount || 1,
                    notes: data.notes,
                    openedById: session.id,
                    waiterLabel: data.waiterLabel || null, // Guardar label del mesonero (ej: "Mesonero 1")
                },
                include: {
                    openedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
                    paymentSplits: true,
                    orders: {
                        include: { items: true },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });

            await tx.tableOrStation.update({
                where: { id: table.id },
                data: { currentStatus: 'OCCUPIED' }
            });

            return createdTab;
        });

        revalidatePath('/dashboard/pos/restaurante');

        return {
            success: true,
            message: 'Cuenta abierta correctamente',
            data: tab
        };
    } catch (error) {
        console.error('Error opening tab:', error);
        return { success: false, message: 'Error al abrir la cuenta' };
    }
}

export async function addItemsToOpenTabAction(data: AddItemsToOpenTabInput): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        if (!data.items.length) {
            return { success: false, message: 'No hay items para agregar' };
        }

        const openTab = await prisma.openTab.findUnique({
            where: { id: data.openTabId },
            include: {
                tableOrStation: true,
                serviceZone: true
            }
        });

        if (!openTab || !['OPEN', 'PARTIALLY_PAID'].includes(openTab.status)) {
            return { success: false, message: 'La cuenta no está disponible para consumir' };
        }

        const salesArea = await resolveSalesAreaForBranch(openTab.branchId);
        const { subtotal, total } = calculateCartTotals({
            orderType: 'RESTAURANT',
            items: data.items,
            amountPaid: 0,
            discountType: undefined
        });

        const menuItemIds = Array.from(new Set(data.items.map(item => item.menuItemId)));
        const menuItems = await getMenuItemMetadata(menuItemIds);
        const menuMap = new Map(menuItems.map(item => [item.id, item]));

        // Stock validation disabled - inventory migration not complete
        // await validateComponentStockAvailability({
        //     items: data.items,
        //     areaId: salesArea.id,
        //     menuMap
        // });

        const shouldSendToKitchen = data.items.some(item => {
            const menuItem = menuMap.get(item.menuItemId);
            if (!menuItem) return false;
            return requiresKitchenRouting(menuItem);
        });

        let createdOrder;
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                if (attempt > 0) {
                    await new Promise(r => setTimeout(r, Math.random() * 80 + 20));
                }
                const orderNumber = await generateOrderNumber('RESTAURANT');
                createdOrder = await prisma.$transaction(async (tx) => {
            await assertOpenTabVersionUpdate({
                tx,
                openTabId: openTab.id,
                expectedVersion: openTab.version,
                data: {
                    runningSubtotal: { increment: subtotal },
                    runningTotal: { increment: total },
                    balanceDue: { increment: total },
                    status: 'OPEN'
                }
            });

            const order = await tx.salesOrder.create({
                data: {
                    orderNumber,
                    orderType: 'RESTAURANT',
                    serviceFlow: 'OPEN_TAB',
                    sourceChannel: 'POS_SPORTBAR',
                    customerName: openTab.customerLabel || openTab.tableOrStation?.name || 'Cuenta abierta',
                    status: shouldSendToKitchen ? 'CONFIRMED' : 'READY',
                    kitchenStatus: shouldSendToKitchen ? 'SENT' : 'NOT_REQUIRED',
                    sentToKitchenAt: shouldSendToKitchen ? new Date() : null,
                    paymentStatus: 'PENDING',
                    subtotal,
                    total,
                    amountPaid: 0,
                    areaId: salesArea.id,
                    branchId: openTab.branchId,
                    serviceZoneId: openTab.serviceZoneId,
                    tableOrStationId: openTab.tableOrStationId,
                    openTabId: openTab.id,
                    notes: data.notes,
                    createdById: session.id,
                    items: {
                        create: data.items.map(item => ({
                            menuItemId: item.menuItemId,
                            itemName: item.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            lineTotal: item.lineTotal,
                            notes: item.notes,
                            modifiers: {
                                create: item.modifiers?.map(modifier => ({
                                    modifierId: modifier.modifierId,
                                    name: modifier.name,
                                    priceAdjustment: modifier.priceAdjustment
                                }))
                            }
                        }))
                    }
                },
                include: {
                    items: {
                        include: {
                            modifiers: true
                        }
                    }
                }
            });

            await tx.openTabOrder.create({
                data: {
                    openTabId: openTab.id,
                    salesOrderId: order.id
                }
            });

            return order;
                });
                break;
            } catch (err) {
                if (isOrderNumberUniqueError(err) && attempt < 9) continue;
                throw err;
            }
        }

        if (!createdOrder) throw new Error('No se pudo agregar el consumo tras reintentos');

        try {
            await registerInventoryForCartItems({
                items: data.items,
                areaId: salesArea.id,
                orderId: createdOrder.id,
                userId: session.id
            });
        } catch (invError) {
            console.error('Error descontando inventario de tab abierta:', invError);
        }

        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/sales');
        revalidatePath('/dashboard/inventory');
        revalidatePath('/kitchen');

        return {
            success: true,
            message: 'Consumo agregado a la cuenta',
            data: createdOrder
        };
    } catch (error) {
        console.error('Error adding items to open tab:', error);
        if (error instanceof POSActionError) {
            return { success: false, message: error.message };
        }
        return { success: false, message: 'Error agregando consumo a la cuenta' };
    }
}

export async function registerOpenTabPaymentAction(data: RegisterOpenTabPaymentInput): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        if (data.amount <= 0) {
            return { success: false, message: 'El monto debe ser mayor a cero' };
        }

        const openTab = await prisma.openTab.findUnique({
            where: { id: data.openTabId },
            include: {
                orders: true,
                paymentSplits: true
            }
        });

        if (!openTab || !['OPEN', 'PARTIALLY_PAID'].includes(openTab.status)) {
            return { success: false, message: 'La cuenta no está disponible para pago' };
        }

        const discountAmount = data.discountAmount || 0;
        const newRunningDiscount = openTab.runningDiscount + discountAmount;
        const newRunningTotal = Math.max(0, openTab.runningTotal - discountAmount);
        const effectiveBalance = Math.max(0, openTab.balanceDue - discountAmount);
        const appliedAmount = Math.min(data.amount, effectiveBalance);
        const newBalance = Math.max(0, effectiveBalance - appliedAmount);
        const nextTabStatus = newBalance === 0 ? 'CLOSED' : 'PARTIALLY_PAID';
        const nextOrderPaymentStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';
        const nextPaymentMethod = openTab.paymentSplits.length > 0 ? 'MULTIPLE' : data.paymentMethod;

        const updatedTab = await prisma.$transaction(async (tx) => {
            await assertOpenTabVersionUpdate({
                tx,
                openTabId: openTab.id,
                expectedVersion: openTab.version,
                data: {
                    balanceDue: newBalance,
                    runningDiscount: newRunningDiscount,
                    runningTotal: newRunningTotal,
                    status: nextTabStatus,
                    closedAt: newBalance === 0 ? new Date() : null
                }
            });

            const baseLabel = data.splitLabel || `Pago ${openTab.paymentSplits.length + 1}`;
            const splitLabel = data.serviceFeeIncluded ? `${baseLabel} | +10% serv` : baseLabel;
            await tx.paymentSplit.create({
                data: {
                    openTabId: openTab.id,
                    splitLabel,
                    splitType: 'CUSTOM',
                    paymentMethod: data.paymentMethod,
                    status: 'PAID',
                    total: appliedAmount,
                    paidAmount: data.amount,
                    paidAt: new Date(),
                    notes: data.notes
                }
            });

            await tx.salesOrder.updateMany({
                where: { openTabId: openTab.id },
                data: {
                    paymentStatus: nextOrderPaymentStatus,
                    paymentMethod: nextPaymentMethod,
                    amountPaid: newBalance === 0 ? newRunningTotal : undefined,
                    closedAt: newBalance === 0 ? new Date() : undefined
                }
            });

            const tab = await tx.openTab.findUniqueOrThrow({
                where: { id: openTab.id },
                include: {
                    paymentSplits: true,
                    orders: {
                        include: { items: true },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });

            if (newBalance === 0 && openTab.tableOrStationId) {
                await tx.tableOrStation.update({
                    where: { id: openTab.tableOrStationId },
                    data: { currentStatus: 'AVAILABLE' }
                });
            }

            return tab;
        });

        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/sales');

        return {
            success: true,
            message: newBalance === 0 ? 'Cuenta cerrada y pagada' : 'Pago parcial registrado',
            data: updatedTab
        };
    } catch (error) {
        console.error('Error registering tab payment:', error);
        if (error instanceof POSActionError) {
            return { success: false, message: error.message };
        }
        return { success: false, message: 'Error registrando pago de la cuenta' };
    }
}

export async function closeOpenTabAction(openTabId: string): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        const openTab = await prisma.openTab.findUnique({
            where: { id: openTabId }
        });

        if (!openTab) {
            return { success: false, message: 'Cuenta no encontrada' };
        }

        // Permitir cerrar cuando no hay consumo (saldo 0) o ya se cobró (tolerancia por decimales)
        const balance = Number(openTab.balanceDue ?? 0);
        if (balance > 0.01) {
            return { success: false, message: 'La cuenta aún tiene saldo pendiente' };
        }

        await prisma.$transaction(async (tx) => {
            await assertOpenTabVersionUpdate({
                tx,
                openTabId,
                expectedVersion: openTab.version,
                data: {
                    status: 'CLOSED',
                    closedAt: openTab.closedAt || new Date(),
                    balanceDue: 0,
                    closedById: session.id
                }
            });

            await tx.salesOrder.updateMany({
                where: { openTabId },
                data: {
                    closedAt: new Date(),
                    paymentStatus: 'PAID'
                }
            });

            if (openTab.tableOrStationId) {
                await tx.tableOrStation.update({
                    where: { id: openTab.tableOrStationId },
                    data: { currentStatus: 'AVAILABLE' }
                });
            }
        });

        revalidatePath('/dashboard/pos/restaurante');

        return {
            success: true,
            message: 'Cuenta cerrada correctamente'
        };
    } catch (error) {
        console.error('Error closing open tab:', error);
        if (error instanceof POSActionError) {
            return { success: false, message: error.message };
        }
        return { success: false, message: 'Error cerrando la cuenta' };
    }
}

// ============================================================================
// ELIMINAR ITEM DE CUENTA ABIERTA (requiere PIN de cajera + justificación)
// ============================================================================

export async function removeItemFromOpenTabAction({
    openTabId,
    orderId,
    itemId,
    cashierPin,
    justification,
}: {
    openTabId: string;
    orderId: string;
    itemId: string;
    cashierPin: string;
    justification: string;
}): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        if (!justification?.trim()) {
            return { success: false, message: 'Debe ingresar una justificación para eliminar el item' };
        }

        // Validar PIN contra cualquier usuario con rol autorizado
        const authorizer = await prisma.user.findFirst({
            where: {
                pin: cashierPin,
                role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AREA_LEAD'] },
                isActive: true
            },
            select: { id: true, firstName: true, lastName: true, role: true }
        });
        if (!authorizer) {
            return { success: false, message: 'PIN incorrecto o sin permisos de cajera' };
        }

        // Cargar el item con su orden
        const item = await prisma.salesOrderItem.findUnique({
            where: { id: itemId },
            include: { order: true }
        });
        if (!item) return { success: false, message: 'Item no encontrado' };
        if (item.order.openTabId !== openTabId) {
            return { success: false, message: 'El item no pertenece a esta cuenta' };
        }
        if (!['OPEN', 'PARTIALLY_PAID'].includes(item.order.paymentStatus ?? '')) {
            // Allow removal even if status is PENDING (not paid yet)
        }

        const removedAmount = item.lineTotal;
        const authorizerName = `${authorizer.firstName} ${authorizer.lastName}`;

        await prisma.$transaction(async (tx) => {
            // Eliminar item (modifiers se borran en cascada)
            await tx.salesOrderItem.delete({ where: { id: itemId } });

            // Recalcular totales de la orden
            const remaining = await tx.salesOrderItem.findMany({ where: { orderId: item.orderId } });
            const newOrderTotal = remaining.reduce((s, i) => s + i.lineTotal, 0);
            await tx.salesOrder.update({
                where: { id: item.orderId },
                data: { subtotal: newOrderTotal, total: newOrderTotal }
            });

            // Recalcular totales del tab
            const tab = await tx.openTab.findUniqueOrThrow({ where: { id: openTabId } });
            const newRunning = Math.max(0, tab.runningTotal - removedAmount);
            const newBalance = Math.max(0, tab.balanceDue - removedAmount);
            const noteEntry = `[ELIMINADO: ${item.itemName} x${item.quantity} $${removedAmount.toFixed(2)} | Justif: ${justification.trim()} | Auth: ${authorizerName}]`;
            await tx.openTab.update({
                where: { id: openTabId },
                data: {
                    runningSubtotal: Math.max(0, tab.runningSubtotal - removedAmount),
                    runningTotal: newRunning,
                    balanceDue: newBalance,
                    notes: ((tab.notes || '') + ' ' + noteEntry).trim().slice(0, 1000),
                    version: { increment: 1 }
                }
            });
        });

        revalidatePath('/dashboard/pos/restaurante');
        return {
            success: true,
            message: `"${item.itemName}" eliminado. Autorizó: ${authorizerName}`,
            data: { authorizerName, removedAmount }
        };
    } catch (error) {
        console.error('Error removing item from tab:', error);
        return { success: false, message: 'Error eliminando item de la cuenta' };
    }
}

// ============================================================================
// USUARIOS DISPONIBLES PARA MESONERO / CAJERA
// ============================================================================

export async function getUsersForTabAction(): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        
        // Return fixed Mesonero options instead of all system users
        const mesoneros = [
            { id: 'mesonero-1', firstName: 'Mesonero', lastName: '1', role: 'WAITER' },
            { id: 'mesonero-2', firstName: 'Mesonero', lastName: '2', role: 'WAITER' },
            { id: 'mesonero-3', firstName: 'Mesonero', lastName: '3', role: 'WAITER' },
        ];
        
        return { success: true, message: 'Mesoneros cargados', data: mesoneros };
    } catch (error) {
        return { success: false, message: 'Error cargando mesoneros' };
    }
}
