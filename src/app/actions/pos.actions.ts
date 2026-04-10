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
import { getNextCorrelativo } from '@/lib/invoice-counter';
import { getStockValidationEnabled } from '@/app/actions/system-config.actions';
import { createReorderBroadcastsAction } from '@/app/actions/purchase.actions';

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
    takeaway?: boolean; // Item para llevar dentro de una mesa
}

export type POSOrderType = 'RESTAURANT' | 'DELIVERY' | 'PICKUP';
export type POSPaymentMethod = 'CASH' | 'CASH_USD' | 'CASH_EUR' | 'CASH_BS' | 'CARD' | 'TRANSFER' | 'MOBILE_PAY' | 'MOVIL_NG' | 'PDV_SHANKLISH' | 'PDV_SUPERFERRO' | 'MULTIPLE' | 'ZELLE' | 'CORTESIA';

export interface PaymentLine {
    method: string;          // CASH | ZELLE | CARD | MOBILE_PAY | TRANSFER | CORTESIA
    amountUSD: number;
    amountBS?: number;
    exchangeRate?: number;
    reference?: string;
}

export interface CreateOrderData {
    orderType: POSOrderType;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    items: CartItem[];
    // Legacy single-method fields (kept for backwards compat)
    paymentMethod?: POSPaymentMethod;
    amountPaid?: number;
    keepChangeAsTip?: boolean;
    tipAtCheckout?: number; // explicit tip amount — reduces stored change accordingly
    // New: multi-method payments
    payments?: PaymentLine[];
    // USD amount eligible for the -33% divisas discount (only used in pago mixto)
    // If not set, the full subtotal gets the -33% when discountType === 'DIVISAS_33'
    divisasUsdAmount?: number;
    notes?: string;
    discountType?: string; // 'DIVISAS_33', 'CORTESIA_100', 'CORTESIA_PERCENT', 'NONE'
    discountPercent?: number;
    authorizedById?: string;
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

function calculateCartTotals(data: Pick<CreateOrderData, 'orderType' | 'items' | 'discountType' | 'discountPercent' | 'amountPaid' | 'divisasUsdAmount'>) {
    const itemsSubtotal = data.items.reduce((sum, item) => sum + item.lineTotal, 0);

    // DELIVERY: $4.5 fee normal, $3 en divisas. Sin 10% servicio.
    if (data.orderType === 'DELIVERY') {
        let subtotal: number;
        let discount: number;
        let total: number;
        let discountReason = '';

        if (data.discountType === 'DIVISAS_33') {
            // Partial divisas: only the USD portion gets -33%
            const divisasBase = data.divisasUsdAmount ?? itemsSubtotal;
            subtotal = itemsSubtotal + DELIVERY_FEE_NORMAL;
            discount = divisasBase / 3 + (DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS);
            total = subtotal - discount;
            discountReason = divisasBase < itemsSubtotal - 0.01
                ? `Pago Mixto Divisas (33.33% sobre $${divisasBase.toFixed(2)}) - Delivery $3`
                : 'Pago en Divisas (33.33%) - Delivery $3';
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
        const divisasBase = data.divisasUsdAmount ?? subtotal;
        discount = divisasBase / 3;
        discountReason = divisasBase < subtotal - 0.01
            ? `Pago Mixto Divisas (33.33% sobre $${divisasBase.toFixed(2)})`
            : 'Pago en Divisas (33.33%)';
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
    return getNextCorrelativo('OPEN_TAB');
}

async function getMenuItemMetadata(menuItemIds: string[]) {
    return prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } }
    });
}

function requiresKitchenRouting(menuItem: any) {
    if (menuItem?.kitchenRouting === 'NONE') return false;
    // AUTO o cualquier otro valor → siempre va a cocina/barra sin excepción
    // La segmentación cocina/barra se hace en el API por categoría, no aquí
    return true;
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

/**
 * Descarga de inventario por ingredientes de receta.
 *
 * ATOMICIDAD: Todos los decrementos se ejecutan en UNA sola transacción Prisma.
 * Si cualquier operación falla, NINGÚN ingrediente queda descontado (rollback automático).
 * Esto elimina el problema de deducción parcial donde algunos ingredientes bajaban
 * y otros no al producirse un error a mitad del proceso.
 */
async function registerInventoryForCartItems(params: {
    items: CartItem[];
    areaId: string;
    orderId: string;
    userId: string;
}): Promise<void> {
    // ── FASE 1: Lecturas (sin escrituras) ────────────────────────────────────
    // Recopilar todas las operaciones de descuento necesarias antes de escribir.
    type DeductOp = {
        inventoryItemId: string;
        quantity: number;
        unit: string;
        label: string; // Para el campo reason del movimiento
    };

    const ops: DeductOp[] = [];

    for (const cartItem of params.items) {
        const menuItem = await prisma.menuItem.findUnique({
            where: { id: cartItem.menuItemId },
            select: { name: true, recipeId: true },
        });
        if (!menuItem?.recipeId) continue;

        const recipe = await prisma.recipe.findUnique({
            where: { id: menuItem.recipeId },
            include: { ingredients: { select: { ingredientItemId: true, quantity: true, unit: true } } },
        });
        if (!recipe?.isActive) continue;

        for (const ing of recipe.ingredients) {
            ops.push({
                inventoryItemId: ing.ingredientItemId,
                quantity: ing.quantity * cartItem.quantity,
                unit: ing.unit,
                label: `Venta POS: ${cartItem.quantity}x ${menuItem.name}`,
            });
        }
    }

    if (ops.length === 0) return; // Ningún ítem tiene receta activa — nada que descontar

    // ── FASE 2: Escrituras atómicas ───────────────────────────────────────────
    // UNA sola transacción para todos los ingredientes.
    // Si cualquier operación lanza, Prisma hace rollback de TODAS las anteriores.
    await prisma.$transaction(async (tx) => {
        for (const op of ops) {
            // Registrar movimiento de inventario (trazabilidad)
            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: op.inventoryItemId,
                    movementType: 'SALE',
                    quantity: op.quantity,
                    unit: op.unit,
                    reason: `Venta — Orden: ${params.orderId}`,
                    notes: op.label,
                    salesOrderId: params.orderId,
                    createdById: params.userId,
                },
            });

            // Decrementar stock (upsert por si el registro de ubicación no existe aún)
            await tx.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: op.inventoryItemId,
                        areaId: params.areaId,
                    },
                },
                create: {
                    inventoryItemId: op.inventoryItemId,
                    areaId: params.areaId,
                    currentStock: -op.quantity, // Negativo intencional — allowNegative
                },
                update: {
                    currentStock: { decrement: op.quantity },
                },
            });
        }
    });

    // Fire-and-forget: detectar items bajo reorden y crear BroadcastMessages.
    // No bloqueamos la venta si esto falla.
    void createReorderBroadcastsAction().catch(err =>
        console.error('[pos] reorder broadcast check failed:', err)
    );
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
                            where: {
                                modifierGroup: { isActive: true }
                            },
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
// HELPERS DE HASHING DE PIN
// Usa Web Crypto API (globalThis.crypto.subtle) — disponible en Node 18+
// (requerido por Next.js 14) y en el browser. Sin imports de Node ni
// dependencias nuevas. Tipado por la lib "dom" ya configurada en tsconfig.
//
// Formato almacenado: "saltHex:hashHex"  (PBKDF2-SHA256, 100k iteraciones)
// Transición: si el valor almacenado no contiene ':', se trata como PIN
// legado en texto plano para no romper PINs existentes durante la migración.
// Usar hashPin() al crear/actualizar PINs para migrar gradualmente.
// ============================================================================

function hexToUint8Array(hex: string): Uint8Array {
    const pairs = hex.match(/.{2}/g) ?? [];
    return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

function uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function pbkdf2Hex(pin: string, saltHex: string): Promise<string> {
    const salt = hexToUint8Array(saltHex);
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const hashBuf = await globalThis.crypto.subtle.deriveBits(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: 'PBKDF2', salt: salt as any, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        256,
    );
    return uint8ArrayToHex(new Uint8Array(hashBuf));
}

export async function hashPin(pin: string): Promise<string> {
    const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const saltHex = uint8ArrayToHex(saltBytes);
    const hashHex = await pbkdf2Hex(pin, saltHex);
    return `${saltHex}:${hashHex}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
    try {
        if (stored.includes(':')) {
            // Formato hasheado: "saltHex:hashHex"
            const colonIdx = stored.indexOf(':');
            const saltHex = stored.slice(0, colonIdx);
            const storedHash = stored.slice(colonIdx + 1);
            if (!saltHex || !storedHash) return false;
            const derived = await pbkdf2Hex(pin, saltHex);
            return derived === storedHash;
        }
        // Legado: PIN en texto plano (período de transición)
        return pin === stored;
    } catch {
        return false;
    }
}

// ============================================================================
// VALIDACIÓN DE PIN DE GERENTE
// ============================================================================

export async function validateManagerPinAction(pin: string): Promise<ActionResult> {
    try {
        if (!pin || pin.length < 4) {
            return { success: false, message: 'PIN debe tener al menos 4 dígitos' };
        }

        const candidates = await prisma.user.findMany({
            where: {
                role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'] },
                isActive: true,
                pin: { not: null },
            },
            select: { id: true, firstName: true, lastName: true, role: true, pin: true },
        });

        for (const candidate of candidates) {
            if (candidate.pin && await verifyPin(pin, candidate.pin)) {
                return {
                    success: true,
                    message: 'Autorización exitosa',
                    data: {
                        managerId: candidate.id,
                        managerName: `${candidate.firstName} ${candidate.lastName}`,
                        role: candidate.role,
                    },
                };
            }
        }

        return { success: false, message: 'PIN inválido o permisos insuficientes' };

    } catch (error) {
        console.error('Error validando PIN:', error);
        return { success: false, message: 'Error interno de validación' };
    }
}

// ============================================================================
// VALIDACIÓN DE PIN DE CAJERA (incluye roles de cajera + gerencia)
// Usado para autorizar anulaciones y operaciones sensibles de caja
// ============================================================================

export async function validateCashierPinAction(pin: string): Promise<ActionResult> {
    try {
        if (!pin || pin.length < 4) {
            return { success: false, message: 'PIN debe tener al menos 4 dígitos' };
        }

        const candidates = await prisma.user.findMany({
            where: {
                role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AREA_LEAD', 'CASHIER_RESTAURANT', 'CASHIER_DELIVERY'] },
                isActive: true,
                pin: { not: null },
            },
            select: { id: true, firstName: true, lastName: true, role: true, pin: true },
        });

        for (const candidate of candidates) {
            if (candidate.pin && await verifyPin(pin, candidate.pin)) {
                return {
                    success: true,
                    message: 'Autorización exitosa',
                    data: {
                        managerId: candidate.id,
                        managerName: `${candidate.firstName} ${candidate.lastName}`,
                        role: candidate.role,
                    },
                };
            }
        }

        return { success: false, message: 'PIN inválido o sin permisos para esta operación' };

    } catch (error) {
        console.error('Error validando PIN cajera:', error);
        return { success: false, message: 'Error interno de validación' };
    }
}

// ============================================================================
// GENERAR CORRELATIVO ÚNICO
// ============================================================================

async function generateOrderNumber(orderType: POSOrderType): Promise<string> {
    const channel = orderType === 'RESTAURANT' ? 'RESTAURANT'
        : orderType === 'PICKUP' ? 'PICKUP'
        : 'DELIVERY';
    return getNextCorrelativo(channel);
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
                        paymentMethod: data.payments && data.payments.length > 0
                            ? (data.payments.length === 1 ? data.payments[0].method : 'MULTIPLE')
                            : (data.paymentMethod || 'CASH'),
                        kitchenStatus: 'SENT',
                        sentToKitchenAt: new Date(),

                        subtotal,
                        discount,
                        total,
                        amountPaid: data.payments && data.payments.length > 0
                            ? data.payments.reduce((s, p) => s + p.amountUSD, 0)
                            : (data.amountPaid || total),
                        change: data.keepChangeAsTip ? 0
                            : (data.tipAtCheckout && data.tipAtCheckout > 0)
                                ? Math.max(0, change - data.tipAtCheckout)
                                : (change > 0 ? change : 0),

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
        // REGISTRAR LÍNEAS DE PAGO MIXTO
        // ====================================================================
        if (data.payments && data.payments.length > 0) {
            await prisma.salesOrderPayment.createMany({
                data: data.payments.map(p => ({
                    salesOrderId: newOrder!.id,
                    method: p.method,
                    amountUSD: p.amountUSD,
                    amountBS: p.amountBS,
                    exchangeRate: p.exchangeRate,
                    reference: p.reference,
                })),
            });
        }

        // ====================================================================
        // GESTIÓN DE INVENTARIO (Descargo de Recetas — atómico)
        // ====================================================================
        try {
            await registerInventoryForCartItems({
                items: data.items,
                areaId,
                orderId: newOrder.id,
                userId: session.id
            });
        } catch (invError) {
            // La venta ocurrió — no revertimos la orden.
            // Pero marcamos la orden con un flag visible para auditoría
            // para que el gerente pueda aplicar el descuento manualmente.
            console.error('[INVENTORY] Descargo falló para orden', newOrder.id, invError);
            try {
                await prisma.salesOrder.update({
                    where: { id: newOrder.id },
                    data: {
                        notes: `[⚠️ DESCARGO INVENTARIO PENDIENTE — Revisar manualmente]${newOrder.notes ? ' | ' + newOrder.notes : ''}`,
                    },
                });
            } catch { /* best effort */ }
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
// ACTION: REGISTRAR PROPINA COLECTIVA
// ============================================================================

/**
 * Records a collective (post-payment) tip as a zero-total sales order.
 * total=0, amountPaid=tipAmount → Z report picks it up as tip correctly.
 */
export async function recordCollectiveTipAction(data: {
    tipAmount: number;
    paymentMethod: string;
    note?: string;
}): Promise<ActionResult> {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        const salesArea = await ensureBaseSalesArea();

        let order;
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                if (attempt > 0) await new Promise(r => setTimeout(r, Math.random() * 80 + 20));
                const orderNumber = await generateOrderNumber('PICKUP');
                order = await prisma.salesOrder.create({
                    data: {
                        orderNumber,
                        orderType: 'PICKUP',
                        customerName: 'PROPINA COLECTIVA',
                        status: 'CONFIRMED',
                        serviceFlow: 'DIRECT_SALE',
                        sourceChannel: 'POS_RESTAURANT',
                        paymentStatus: 'PAID',
                        paymentMethod: data.paymentMethod,
                        kitchenStatus: 'SENT',
                        sentToKitchenAt: new Date(),
                        subtotal: 0,
                        discount: 0,
                        total: 0,
                        amountPaid: data.tipAmount,
                        change: 0,
                        notes: data.note || 'Propina colectiva',
                        createdById: session.id,
                        areaId: salesArea.id,
                    },
                });
                break;
            } catch (err) {
                if (isOrderNumberUniqueError(err) && attempt < 9) continue;
                throw err;
            }
        }

        if (!order) throw new Error('No se pudo registrar la propina');

        revalidatePath('/dashboard/sales');
        return { success: true, message: 'Propina registrada', data: order };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
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

        // Stock validation — controlled via SystemConfig 'pos_stock_validation_enabled'
        const stockValidation = await getStockValidationEnabled();
        if (stockValidation) {
            await validateComponentStockAvailability({
                items: data.items,
                areaId: salesArea.id,
                menuMap,
            });
        }

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
            console.error('[INVENTORY] Descargo falló para tab order', createdOrder.id, invError);
            try {
                await prisma.salesOrder.update({
                    where: { id: createdOrder.id },
                    data: {
                        notes: `[⚠️ DESCARGO INVENTARIO PENDIENTE — Revisar manualmente]${createdOrder.notes ? ' | ' + createdOrder.notes : ''}`,
                    },
                });
            } catch { /* best effort */ }
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
        if (!cashierPin || cashierPin.length < 4) {
            return { success: false, message: 'PIN debe tener al menos 4 dígitos' };
        }

        const authCandidates = await prisma.user.findMany({
            where: {
                role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AREA_LEAD'] },
                isActive: true,
                pin: { not: null },
            },
            select: { id: true, firstName: true, lastName: true, role: true, pin: true },
        });

        let authorizer: { id: string; firstName: string; lastName: string; role: string } | null = null;
        for (const candidate of authCandidates) {
            if (candidate.pin && await verifyPin(cashierPin, candidate.pin)) {
                authorizer = candidate;
                break;
            }
        }

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
        const branch = await prisma.branch.findFirst({ where: { isActive: true } });
        if (!branch) return { success: false, message: 'Sin sucursal', data: [] };
        const waiters = await prisma.waiter.findMany({
            where: { branchId: branch.id, isActive: true },
            orderBy: { firstName: 'asc' },
            select: { id: true, firstName: true, lastName: true },
        });
        return { success: true, message: 'Mesoneros cargados', data: waiters };
    } catch {
        return { success: false, message: 'Error cargando mesoneros', data: [] };
    }
}
