'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { getCaracasDayRange } from '@/lib/datetime';
import { checkActionPermission } from '@/lib/permissions/action-guard';
import { PERM } from '@/lib/constants/permissions-registry';

export interface SalesFilter {
    startDate?: Date;
    endDate?: Date;
    orderType?: string;
}

export interface ZReportData {
    period: string;
    totalOrders: number;
    ordersByType: {
        restaurant: number;
        delivery: number;
        pickup: number;
        pedidosya: number;
        wink: number;
        evento: number;
        tablePong: number;
    };

    // Ventas
    grossTotal: number;        // suma de subtotales (antes de descuento)
    totalDiscounts: number;    // suma de descuentos
    netTotal: number;          // grossTotal - totalDiscounts
    totalServiceFee: number;   // +10% servicio acumulado de mesas
    totalTips: number;         // propinas voluntarias totales del día
    tipCount: number;          // número de transacciones de propina
    totalCollected: number;    // dinero real que entró en caja

    discountBreakdown: {
        divisas: number;
        cortesias: number;
        other: number;
    };

    // Arqueo por método de pago (sobre totalCollected)
    paymentBreakdown: {
        cash: number;       // Efectivo USD
        zelle: number;
        card: number;       // Punto PDV
        mobile: number;     // Pago Móvil
        transfer: number;   // Transferencia
        external: number;   // PedidosYA (PY)
        other: number;
    };

    ordersByStatus: Record<string, number>;
}

/**
 * Historial de ventas.
 * @param date  Fecha en formato "YYYY-MM-DD" (timezone Caracas). Si se omite, usa hoy.
 *              Cuando se pasa una fecha, se filtra en BD para ese día completo
 *              y no se aplica límite de registros.
 */
export async function getSalesHistoryAction(date?: string) {
    const guard = await checkActionPermission(PERM.EXPORT_SALES);
    if (!guard.ok) return { success: false, message: guard.message, orders: [] };

    try {
        // Calcular rango del día en timezone Caracas
        const queryDate = date ? new Date(date + 'T12:00:00') : new Date();
        const { start: startOfDay, end: endOfDay } = getCaracasDayRange(queryDate);

        const orders = await prisma.salesOrder.findMany({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
            orderBy: { createdAt: 'desc' },
            include: {
                authorizedBy: { select: { firstName: true, lastName: true } },
                createdBy: { select: { firstName: true, lastName: true } },
                voidedBy: { select: { firstName: true, lastName: true } },
                openTab: { select: { tabCode: true, customerLabel: true, customerPhone: true, runningSubtotal: true, runningDiscount: true, runningTotal: true, paymentSplits: { select: { splitLabel: true, paymentMethod: true, paidAmount: true } } } },
                orderPayments: { select: { method: true, amountUSD: true, amountBS: true, exchangeRate: true } },
                items: {
                    include: {
                        modifiers: { select: { name: true, priceAdjustment: true } }
                    }
                }
            }
        });

        // Agrupar órdenes RESTAURANT por openTabId (misma mesa = una sola venta)
        const byTab = new Map<string | null, typeof orders>();
        for (const o of orders) {
            const key = o.orderType === 'RESTAURANT' && o.openTabId ? o.openTabId : null;
            if (key === null) {
                byTab.set(`single-${o.id}`, [o]);
            } else {
                const existing = byTab.get(key) || [];
                existing.push(o);
                byTab.set(key, existing);
            }
        }

        // Construir lista: una fila por mesa (consolidada) o por orden individual
        const result: any[] = [];
        const seenTabs = new Set<string>();
        for (const o of orders) {
            if (o.orderType === 'RESTAURANT' && o.openTabId && !seenTabs.has(o.openTabId)) {
                seenTabs.add(o.openTabId);
                const group = byTab.get(o.openTabId) || [o];
                const sorted = [...group].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                const tab = first.openTab;
                const total = tab?.runningTotal ?? sorted.reduce((s, x) => s + x.total, 0);
                const subtotal = tab?.runningSubtotal ?? sorted.reduce((s, x) => s + x.subtotal, 0);
                const discount = tab?.runningDiscount ?? sorted.reduce((s, x) => s + x.discount, 0);
                const allItems = sorted.flatMap(x => (x.items || []).map((it: any) => ({
                    ...it,
                    itemName: it.itemName,
                    lineTotal: it.lineTotal,
                    quantity: it.quantity,
                    unitPrice: it.unitPrice,
                    modifiers: (it.modifiers || []).map((m: any) => m.name)
                })));
                const splits = tab?.paymentSplits || [];
                // Solo considerar el 10% servicio si se registró un pago con ese concepto.
                // Si no hay splits (tab abierta / sin cobrar), no asumir servicio.
                const serviceFeeIncluded = splits.length > 0
                    ? splits.some((s: { splitLabel?: string }) => (s.splitLabel || '').includes('| +10% serv'))
                    : false;
                const totalFactura = serviceFeeIncluded ? total * 1.1 : total;
                const totalCobrado = splits.reduce((s: number, sp: { paidAmount?: number }) => s + (sp.paidAmount || 0), 0) || totalFactura;
                const servicioAmount = serviceFeeIncluded ? total * 0.1 : 0;
                const propina = Math.max(0, totalCobrado - totalFactura);
                const paymentBreakdown = splits.map((sp: { paymentMethod?: string | null; paidAmount?: number }) => ({
                    method: sp.paymentMethod || 'CASH',
                    amount: sp.paidAmount || 0
                }));
                if (paymentBreakdown.length === 0 && totalFactura > 0) {
                    paymentBreakdown.push({ method: first.paymentMethod || 'CASH', amount: totalCobrado });
                }
                result.push({
                    id: `tab-${o.openTabId}`,
                    _consolidated: true,
                    orderType: 'RESTAURANT',
                    serviceFeeIncluded,
                    totalFactura,
                    totalCobrado,
                    totalProductos: total,
                    servicioAmount,
                    propina,
                    paymentBreakdown,
                    _orderIds: sorted.map(x => x.id),
                    orderNumber: tab?.tabCode || first.orderNumber,
                    orderNumbers: sorted.map(x => x.orderNumber),
                    createdAt: last.createdAt,
                    customerName: tab?.customerLabel || first.customerName,
                    customerPhone: tab?.customerPhone || first.customerPhone,
                    createdBy: last.createdBy,
                    paymentMethod: first.paymentMethod,
                    subtotal,
                    discount,
                    total,
                    items: allItems,
                    orders: sorted,
                    status: sorted.some(x => x.status === 'CANCELLED') ? 'CANCELLED' : first.status,
                    voidReason: sorted.find(x => x.voidReason)?.voidReason,
                    voidedAt: sorted.find(x => x.voidedAt)?.voidedAt,
                    voidedBy: sorted.find(x => x.voidedBy)?.voidedBy,
                });
            } else if (!o.openTabId || o.orderType !== 'RESTAURANT') {
                const ordTotal = o.total || 0;
                const amountPaid = o.amountPaid || ordTotal;
                const change = o.change || 0;
                // netReceived = lo que efectivamente ingresó a caja (excluye el vuelto entregado)
                const netReceived = amountPaid - change;
                // Propina = excedente retenido voluntariamente (keepChangeAsTip)
                const propina = Math.max(0, netReceived - ordTotal);
                // Desglose de pagos: usar SalesOrderPayment para pagos mixtos
                const mixedLines = o.orderPayments || [];
                const paymentBreakdown = mixedLines.length > 0
                    ? mixedLines.map(p => ({ method: p.method, amount: p.amountUSD, amountBS: p.amountBS ?? undefined, exchangeRate: p.exchangeRate ?? undefined }))
                    : [{ method: o.paymentMethod || 'CASH', amount: netReceived }];
                result.push({
                    ...o,
                    _consolidated: false,
                    totalFactura: ordTotal,
                    totalCobrado: netReceived,
                    totalProductos: ordTotal,
                    servicioAmount: 0,
                    propina,
                    paymentBreakdown,
                });
            }
        }
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { success: true, data: result };
    } catch (error) {
        console.error('Error fetching sales:', error);
        return { success: false, message: 'Error cargando historial' };
    }
}

export interface ArqueoSaleRow {
    orderType: 'RESTAURANT' | 'PICKUP' | 'DELIVERY' | 'PEDIDOSYA';
    description: string;
    correlativo: string;
    total: number;
    paymentBreakdown: {
        cashUsd: number;
        cashEur: number;
        cashBs: number;
        zelle: number;
        cardPdVShanklish: number;
        cardPdVSuperferro: number;
        mobileShanklish: number;
        mobileNour: number;
    };
    serviceFee: number;
}

export async function getSalesForArqueoAction(date: Date): Promise<{ success: boolean; data?: ArqueoSaleRow[]; message?: string }> {
    const guard = await checkActionPermission(PERM.EXPORT_SALES);
    if (!guard.ok) return { success: false, message: guard.message };

    try {
        // Usar rango en timezone Caracas (UTC-4) para capturar el día completo
        const { start: startOfDay, end: endOfDay } = getCaracasDayRange(date);

        const orders = await prisma.salesOrder.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: { not: 'CANCELLED' }
            },
            orderBy: { createdAt: 'asc' },
            include: {
                orderPayments: { select: { method: true, amountUSD: true } },
                openTab: {
                    select: {
                        tabCode: true,
                        customerLabel: true,
                        runningTotal: true,
                        tableOrStation: { select: { name: true } },
                        paymentSplits: { select: { paymentMethod: true, paidAmount: true, splitLabel: true } }
                    }
                }
            }
        });

        const byTab = new Map<string, typeof orders>();
        for (const o of orders) {
            if (o.orderType === 'RESTAURANT' && o.openTabId) {
                const existing = byTab.get(o.openTabId) || [];
                existing.push(o);
                byTab.set(o.openTabId, existing);
            }
        }

        const result: ArqueoSaleRow[] = [];
        const seenTabs = new Set<string>();

        for (const o of orders) {
            if (o.orderType === 'RESTAURANT' && o.openTabId && !seenTabs.has(o.openTabId)) {
                seenTabs.add(o.openTabId);
                const group = byTab.get(o.openTabId) || [o];
                const tab = group[0].openTab;
                const total = tab?.runningTotal ?? group.reduce((s, x) => s + x.total, 0);
                const tableName = tab?.tableOrStation?.name || 'MESA';
                const customerName = tab?.customerLabel || '';
                const description = `${tableName} ${customerName}`.trim() || tableName;

                const breakdown = { cashUsd: 0, cashEur: 0, cashBs: 0, zelle: 0, cardPdVShanklish: 0, cardPdVSuperferro: 0, mobileShanklish: 0, mobileNour: 0 };
                const splits = tab?.paymentSplits || [];
                let serviceFee = 0;
                const hasService = splits.length > 0 && splits.some((s: { splitLabel?: string }) => (s.splitLabel || '').includes('| +10% serv'));
                const totalFactura = hasService ? total * 1.1 : total;
                const totalCobrado = splits.length > 0
                    ? splits.reduce((s: number, sp: { paidAmount?: number }) => s + (sp.paidAmount || 0), 0)
                    : totalFactura;

                if (splits.length > 0) {
                    for (const s of splits) {
                        const pm = (s.paymentMethod || '').toUpperCase();
                        const amt = s.paidAmount || 0;
                        if (pm === 'CASH' || pm === 'CASH_USD') breakdown.cashUsd += amt;
                        else if (pm === 'CASH_EUR') breakdown.cashEur += amt;
                        else if (pm === 'CASH_BS') breakdown.cashBs += amt;
                        else if (pm === 'ZELLE') breakdown.zelle += amt;
                        else if (pm === 'CARD' || pm === 'BS_POS' || pm === 'PDV_SHANKLISH') breakdown.cardPdVShanklish += amt;
                        else if (pm === 'PDV_SUPERFERRO' || pm === 'TRANSFER') breakdown.cardPdVSuperferro += amt;
                        else if (pm === 'MOBILE_PAY' || pm === 'PAGO_MOVIL' || pm === 'MOVIL_NG') breakdown.mobileShanklish += amt;
                        // MULTIPLE, CORTESIA → silently excluded
                    }
                    serviceFee = hasService ? total * 0.1 : 0;
                } else {
                    const pm = (group[0].paymentMethod || '').toUpperCase();
                    if (pm === 'CASH' || pm === 'CASH_USD') breakdown.cashUsd = total;
                    else if (pm === 'CASH_EUR') breakdown.cashEur = total;
                    else if (pm === 'CASH_BS') breakdown.cashBs = total;
                    else if (pm === 'ZELLE') breakdown.zelle = total;
                    else if (pm === 'CARD' || pm === 'BS_POS' || pm === 'PDV_SHANKLISH') breakdown.cardPdVShanklish = total;
                    else if (pm === 'PDV_SUPERFERRO' || pm === 'TRANSFER') breakdown.cardPdVSuperferro = total;
                    else if (pm === 'MOBILE_PAY' || pm === 'PAGO_MOVIL' || pm === 'MOVIL_NG') breakdown.mobileShanklish = total;
                    // MULTIPLE, CORTESIA → silently excluded
                }

                result.push({
                    orderType: 'RESTAURANT',
                    description,
                    correlativo: tab?.tabCode || group[0].orderNumber || '',
                    total: totalCobrado,
                    paymentBreakdown: breakdown,
                    serviceFee
                });
            } else if (o.orderType !== 'RESTAURANT' || !o.openTabId) {
                const breakdown = { cashUsd: 0, cashEur: 0, cashBs: 0, zelle: 0, cardPdVShanklish: 0, cardPdVSuperferro: 0, mobileShanklish: 0, mobileNour: 0 };
                const addLine = (pm: string, amt: number) => {
                    const k = (pm || '').toUpperCase();
                    if (k === 'CASH' || k === 'CASH_USD') breakdown.cashUsd += amt;
                    else if (k === 'CASH_EUR') breakdown.cashEur += amt;
                    else if (k === 'CASH_BS') breakdown.cashBs += amt;
                    else if (k === 'ZELLE') breakdown.zelle += amt;
                    else if (k === 'CARD' || k === 'BS_POS' || k === 'PDV_SHANKLISH') breakdown.cardPdVShanklish += amt;
                    else if (k === 'PDV_SUPERFERRO' || k === 'TRANSFER' || k === 'BANK_TRANSFER') breakdown.cardPdVSuperferro += amt;
                    else if (k === 'MOBILE_PAY' || k === 'PAGO_MOVIL' || k === 'MOVIL_NG') breakdown.mobileShanklish += amt;
                    // MULTIPLE, CORTESIA, unknown → silently excluded
                };
                const mixedLines = (o as any).orderPayments as { method: string; amountUSD: number }[] | undefined;
                if (mixedLines && mixedLines.length > 0) {
                    for (const p of mixedLines) addLine(p.method, p.amountUSD);
                } else {
                    addLine(o.paymentMethod || '', o.total);
                }

                const ot = (o.orderType || '').toUpperCase();
                const sc = (o.sourceChannel || '').toUpperCase();
                const isPedidosYa = ot === 'PEDIDOSYA' || sc === 'POS_PEDIDOSYA';
                const isDelivery = ot === 'DELIVERY';
                const typeLabel = isPedidosYa ? 'PedidosYA' : isDelivery ? 'Delivery' : 'Pickup';
                const description = `${typeLabel}: ${o.customerName || 'Cliente'}`;

                result.push({
                    orderType: isPedidosYa ? 'PEDIDOSYA' : isDelivery ? 'DELIVERY' : 'PICKUP',
                    description,
                    correlativo: o.orderNumber || '',
                    total: o.total,
                    paymentBreakdown: breakdown,
                    serviceFee: 0
                });
            }
        }

        return { success: true, data: result };
    } catch (error) {
        console.error('Error fetching sales for arqueo:', error);
        return { success: false, message: 'Error cargando ventas para arqueo' };
    }
}

/**
 * Reporte Z (cierre de caja).
 * @param date  Fecha en formato "YYYY-MM-DD". Si se omite, usa hoy.
 */
export async function getDailyZReportAction(date?: string): Promise<{ success: boolean; data?: ZReportData; message?: string }> {
    try {
        const today = date ? new Date(date + 'T12:00:00') : new Date();
        // Usar rango en timezone Caracas (UTC-4) para capturar el día completo
        const { start: startOfDay, end: endOfDay } = getCaracasDayRange(today);

        const orders = await prisma.salesOrder.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status:    { notIn: ['CANCELLED'] },
            },
            include: {
                orderPayments: { select: { method: true, amountUSD: true } },
                openTab: {
                    select: {
                        runningSubtotal: true,
                        runningDiscount: true,
                        runningTotal:    true,
                        paymentSplits: {
                            where:  { status: 'PAID' },
                            select: { paymentMethod: true, paidAmount: true, splitLabel: true },
                        },
                    },
                },
            },
        });

        type OrderRow = typeof orders[number];
        type Split = { paymentMethod: string | null; paidAmount: number; splitLabel: string };

        // ── helpers (arrow functions to avoid strict-mode fn declaration issues) ──
        const pay = { cash: 0, card: 0, transfer: 0, mobile: 0, zelle: 0, external: 0, other: 0 };
        const addPayment = (pm: string | null | undefined, amt: number) => {
            const k = (pm ?? '').toUpperCase();
            if      (k === 'CASH' || k === 'CASH_USD' || k === 'CASH_EUR')                              pay.cash     += amt;
            else if (k === 'ZELLE')                                                                      pay.zelle    += amt;
            else if (k === 'CARD' || k === 'BS_POS' || k === 'PDV_SHANKLISH' || k === 'PDV_SUPERFERRO') pay.card     += amt;
            else if (k === 'MOBILE_PAY' || k === 'PAGO_MOVIL' || k === 'MOVIL_NG')                      pay.mobile   += amt;
            else if (k === 'TRANSFER' || k === 'BANK_TRANSFER')                                          pay.transfer += amt;
            else if (k === 'PY')                                                                         pay.external += amt;
            else                                                                                         pay.other    += amt;
        };

        const disc = { divisas: 0, cortesias: 0, other: 0 };
        const addDiscount = (o: OrderRow) => {
            if (o.discount <= 0) return;
            if      (o.discountType === 'DIVISAS_33')                                                              disc.divisas   += o.discount;
            else if (o.discountType === 'CORTESIA_100' || o.discountType === 'CORTESIA_PERCENT' || o.discountType === 'CORTESIA') disc.cortesias += o.discount;
            else                                                                                                disc.other     += o.discount;
        };

        // ── group RESTAURANT+openTab orders by tab ────────────────────────────
        const tabGroups = new Map<string, OrderRow[]>();
        const tabOrderIds = new Set<string>();
        for (const o of orders) {
            if (o.openTabId && o.orderType === 'RESTAURANT') {
                tabOrderIds.add(o.id);
                const g = tabGroups.get(o.openTabId) ?? [];
                g.push(o);
                tabGroups.set(o.openTabId, g);
            }
        }
        const nonTabOrders = orders.filter(o => !tabOrderIds.has(o.id));

        let grossTotal      = 0;
        let totalDiscounts  = 0;
        let totalServiceFee = 0;
        let totalTips       = 0;
        let tipCount        = 0;
        const byType = { restaurant: 0, delivery: 0, pickup: 0, pedidosya: 0, wink: 0, evento: 0, tablePong: 0 };

        // ── process tab groups (mesas) ────────────────────────────────────────
        for (const group of Array.from(tabGroups.values())) {
            const tab      = group[0].openTab!;
            const subtotal = tab.runningSubtotal;
            const discount = tab.runningDiscount;
            const netProds = tab.runningTotal;      // subtotal - discount

            grossTotal     += subtotal;
            totalDiscounts += discount;
            for (const o of group) addDiscount(o);
            byType.restaurant++;

            const splits: Split[]  = (tab.paymentSplits ?? []) as Split[];
            const hasService = splits.some((s: Split) => (s.splitLabel ?? '').includes('| +10% serv'));
            const serviceFee = hasService ? netProds * 0.1 : 0;
            totalServiceFee += serviceFee;

            const totalFactura = netProds + serviceFee;
            const totalCobrado = splits.length > 0
                ? splits.reduce((acc: number, sp: Split) => acc + (sp.paidAmount ?? 0), 0)
                : totalFactura;
            const tabTip = Math.max(0, totalCobrado - totalFactura);
            totalTips += tabTip;
            if (tabTip > 0) tipCount++;

            if (splits.length > 0) {
                for (const s of splits) addPayment(s.paymentMethod, s.paidAmount ?? 0);
            } else {
                addPayment(group[0].paymentMethod, totalCobrado);
            }
        }

        // ── process non-tab orders (delivery / pickup / pedidosya / directo) ──
        for (const o of nonTabOrders) {
            grossTotal     += o.subtotal;
            totalDiscounts += o.discount;
            addDiscount(o);

            const amountPaid = o.amountPaid || o.total;
            // netReceived = lo que quedó en caja (excluye vuelto devuelto)
            const netReceived = amountPaid - (o.change || 0);
            const orderTip = (o.change === 0 && amountPaid > o.total)
                ? Math.max(0, amountPaid - o.total) : 0;
            totalTips += orderTip;
            if (orderTip > 0) tipCount++;
            // Para pagos mixtos usar las líneas de SalesOrderPayment; si no, método único
            const mixedLines = (o as any).orderPayments as { method: string; amountUSD: number }[] | undefined;
            if (mixedLines && mixedLines.length > 0) {
                for (const p of mixedLines) addPayment(p.method, p.amountUSD);
            } else {
                addPayment(o.paymentMethod, netReceived);
            }

            const ot = (o.orderType || '').toUpperCase();
            const sc = (o.sourceChannel || '').toUpperCase();
            if      (ot === 'DELIVERY')                          byType.delivery++;
            else if (ot === 'PEDIDOSYA' || sc === 'POS_PEDIDOSYA') byType.pedidosya++;
            else if (ot === 'PICKUP')                            byType.pickup++;
            else if (ot === 'WINK' || sc === 'WINK')             byType.wink++;
            else if (ot === 'EVENTO' || sc === 'EVENTO')         byType.evento++;
            else if (ot === 'TABLE_PONG' || sc === 'TABLE_PONG') byType.tablePong++;
            else                                                 byType.restaurant++;
        }

        const netTotal       = grossTotal - totalDiscounts;
        const totalCollected = netTotal + totalServiceFee + totalTips;

        return {
            success: true,
            data: {
                period:         today.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }),
                totalOrders:    tabGroups.size + nonTabOrders.length,
                ordersByType:   byType,
                grossTotal,
                totalDiscounts,
                netTotal,
                totalServiceFee,
                totalTips,
                tipCount,
                totalCollected,
                discountBreakdown: disc,
                paymentBreakdown:  pay,
                ordersByStatus:    {},
            },
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
    const guard = await checkActionPermission(PERM.VOID_ORDER);
    if (!guard.ok) return { success: false, message: guard.message };

    try {
        const { user } = guard;

        // 1. Obtener orden con items + modificadores
        const order = await prisma.salesOrder.findUnique({
            where: { id: params.orderId },
            include: {
                items: {
                    include: {
                        menuItem: { select: { recipeId: true, name: true } },
                        modifiers: { select: { modifierId: true, name: true } }
                    }
                }
            }
        });

        if (!order) return { success: false, message: 'Orden no encontrada' };
        if (order.status === 'CANCELLED') return { success: false, message: 'Esta orden ya está anulada' };

        // Helper: restaurar ingredientes de una receta al stock
        const restoreRecipe = async (recipeId: string, qty: number, label: string) => {
            const recipe = await prisma.recipe.findUnique({
                where: { id: recipeId },
                include: { ingredients: true }
            });
            if (!recipe || !recipe.isActive) return;

            for (const ingredient of recipe.ingredients) {
                const totalQty = ingredient.quantity * qty;
                await prisma.inventoryMovement.create({
                    data: {
                        inventoryItemId: ingredient.ingredientItemId,
                        movementType: 'ADJUSTMENT_IN',
                        quantity: totalQty,
                        unit: ingredient.unit as any,
                        notes: `Anulación ${order.orderNumber}: ${label}`,
                        reason: `Anulado por ${params.authorizedByName}: ${params.voidReason}`,
                        createdById: user.id,
                    }
                });
                await prisma.inventoryLocation.upsert({
                    where: { inventoryItemId_areaId: { inventoryItemId: ingredient.ingredientItemId, areaId: order.areaId } },
                    update: { currentStock: { increment: totalQty } },
                    create: { inventoryItemId: ingredient.ingredientItemId, areaId: order.areaId, currentStock: totalQty }
                });
            }
        };

        // 2. Revertir inventario (receta base + modificadores vinculados)
        try {
            for (const item of order.items) {
                // 2a. Receta base
                if (item.menuItem?.recipeId) {
                    await restoreRecipe(item.menuItem.recipeId, item.quantity, `${item.quantity}x ${item.menuItem.name}`);
                }

                // 2b. Modificadores vinculados (Nivel 2)
                for (const modifier of (item.modifiers || [])) {
                    if (!modifier.modifierId) continue;
                    const menuModifier = await prisma.menuModifier.findUnique({
                        where: { id: modifier.modifierId },
                        select: { linkedMenuItem: { select: { name: true, recipeId: true } } }
                    });
                    if (menuModifier?.linkedMenuItem?.recipeId) {
                        await restoreRecipe(
                            menuModifier.linkedMenuItem.recipeId,
                            item.quantity,
                            `modificador ${modifier.name} (${item.menuItem?.name})`
                        );
                    }
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

// ============================================================================
// REPORTE DE CIERRE DEL DÍA
// ============================================================================

export interface EndOfDaySummary {
    date: string;
    // Ventas netas por canal (en USD)
    byChannel: {
        restaurant: number;
        delivery: number;
        pickup: number;
        pedidosya: number;
        wink: number;
        evento: number;
        tablePong: number;
    };
    // Conteo de órdenes/mesas por canal
    countByChannel: {
        restaurant: number;
        delivery: number;
        pickup: number;
        pedidosya: number;
        wink: number;
        evento: number;
        tablePong: number;
    };
    totalUSD: number;         // total cobrado (neto)
    totalDiscounts: number;   // total descuentos
    totalServiceFee: number;  // total 10% servicio
    propinas: number;         // propinas/excedentes
    propinaCount: number;     // número de transacciones de propina
    // Desglose por tipo de moneda
    receivedInDivisas: number; // CASH, CASH_USD, CASH_EUR, ZELLE
    receivedInBs: number;      // CARD, MOBILE, TRANSFER, CASH_BS, etc. (en USD equiv)
    pctDivisas: number;        // % del total cobrado en divisas
    pctBs: number;             // % del total cobrado en Bs
    // Conteos
    totalInvoices: number;
    invoicesCancelled: number;
}

/**
 * Resumen de cierre del día por canal + desglose divisas vs Bs.
 * @param date  Fecha "YYYY-MM-DD" en timezone Caracas. Si se omite, usa hoy.
 */
export async function getEndOfDaySummaryAction(date?: string): Promise<{ success: boolean; data?: EndOfDaySummary; message?: string }> {
    try {
        const today = date ? new Date(date + 'T12:00:00') : new Date();
        const { start: startOfDay, end: endOfDay } = getCaracasDayRange(today);

        const orders = await prisma.salesOrder.findMany({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
            include: {
                orderPayments: { select: { method: true, amountUSD: true } },
                openTab: {
                    select: {
                        runningTotal: true,
                        runningSubtotal: true,
                        runningDiscount: true,
                        paymentSplits: {
                            where: { status: 'PAID' },
                            select: { paymentMethod: true, paidAmount: true, splitLabel: true },
                        },
                    },
                },
            },
        });

        // Divisas methods (get 33% discount)
        const DIVISAS_METHODS = new Set(['CASH', 'CASH_USD', 'CASH_EUR', 'ZELLE']);

        const byChannel = { restaurant: 0, delivery: 0, pickup: 0, pedidosya: 0, wink: 0, evento: 0, tablePong: 0 };
        const countByChannel = { restaurant: 0, delivery: 0, pickup: 0, pedidosya: 0, wink: 0, evento: 0, tablePong: 0 };
        let totalUSD = 0;
        let totalDiscounts = 0;
        let totalServiceFee = 0;
        let propinas = 0;
        let propinaCount = 0;
        let receivedInDivisas = 0;
        let receivedInBs = 0;
        let totalInvoices = 0;
        let invoicesCancelled = 0;

        // Group RESTAURANT+openTab orders by tab
        const tabGroups = new Map<string, typeof orders>();
        const tabOrderIds = new Set<string>();
        for (const o of orders) {
            if (o.openTabId && o.orderType === 'RESTAURANT') {
                tabOrderIds.add(o.id);
                const g = tabGroups.get(o.openTabId) ?? [];
                g.push(o);
                tabGroups.set(o.openTabId, g);
            }
        }

        // Helper: classify channel
        const getChannel = (orderType: string, sourceChannel?: string | null): keyof typeof byChannel => {
            const t = (orderType || '').toUpperCase();
            const s = (sourceChannel || '').toUpperCase();
            if (t === 'PEDIDOSYA' || s === 'POS_PEDIDOSYA') return 'pedidosya';
            if (t === 'DELIVERY') return 'delivery';
            if (t === 'WINK' || s === 'WINK') return 'wink';
            if (t === 'EVENTO' || s === 'EVENTO') return 'evento';
            if (t === 'TABLE_PONG' || s === 'TABLE_PONG') return 'tablePong';
            if (t === 'PICKUP') return 'pickup';
            return 'restaurant';
        };

        // Helper: classify payment as divisas vs Bs
        const classifyPayment = (method: string, amount: number) => {
            if (DIVISAS_METHODS.has((method || '').toUpperCase())) {
                receivedInDivisas += amount;
            } else {
                receivedInBs += amount;
            }
        };

        // Process tab groups
        for (const group of Array.from(tabGroups.values())) {
            const cancelled = group.every(o => o.status === 'CANCELLED');
            if (cancelled) { invoicesCancelled++; continue; }
            totalInvoices++;

            const tab = group[0].openTab!;
            const netProds = tab.runningTotal;
            const discount = tab.runningSubtotal - tab.runningTotal;

            const splits = (tab.paymentSplits ?? []) as { paymentMethod: string | null; paidAmount: number; splitLabel: string }[];
            const hasService = splits.some(s => (s.splitLabel ?? '').includes('| +10% serv'));
            const serviceFee = hasService ? netProds * 0.1 : 0;
            const totalFactura = netProds + serviceFee;
            const totalCobrado = splits.length > 0
                ? splits.reduce((acc, sp) => acc + (sp.paidAmount ?? 0), 0)
                : totalFactura;

            totalDiscounts += discount;
            totalServiceFee += serviceFee;
            const tabPropina = Math.max(0, totalCobrado - totalFactura);
            propinas += tabPropina;
            if (tabPropina > 0) propinaCount++;
            totalUSD += totalCobrado;

            byChannel.restaurant += totalCobrado;
            countByChannel.restaurant++;

            if (splits.length > 0) {
                for (const s of splits) classifyPayment(s.paymentMethod ?? '', s.paidAmount ?? 0);
            } else {
                classifyPayment(group[0].paymentMethod ?? '', totalCobrado);
            }
        }

        // Process non-tab orders
        const nonTabOrders = orders.filter(o => !tabOrderIds.has(o.id));
        for (const o of nonTabOrders) {
            if (o.status === 'CANCELLED') { invoicesCancelled++; continue; }
            totalInvoices++;

            const amountPaid = o.amountPaid || o.total;
            const netReceived = amountPaid - (o.change || 0);
            const tip = (o.change === 0 && amountPaid > o.total) ? Math.max(0, amountPaid - o.total) : 0;

            totalDiscounts += o.discount;
            propinas += tip;
            if (tip > 0) propinaCount++;
            totalUSD += netReceived;

            const ch = getChannel(o.orderType, o.sourceChannel);
            byChannel[ch] += netReceived;
            countByChannel[ch]++;

            const mixedLines = (o as any).orderPayments as { method: string; amountUSD: number }[] | undefined;
            if (mixedLines && mixedLines.length > 0) {
                for (const p of mixedLines) classifyPayment(p.method, p.amountUSD);
            } else {
                classifyPayment(o.paymentMethod ?? '', netReceived);
            }
        }

        const pctDivisas = totalUSD > 0 ? (receivedInDivisas / totalUSD) * 100 : 0;
        const pctBs = totalUSD > 0 ? (receivedInBs / totalUSD) * 100 : 0;

        return {
            success: true,
            data: {
                date: today.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }),
                byChannel,
                countByChannel,
                totalUSD,
                totalDiscounts,
                totalServiceFee,
                propinas,
                propinaCount,
                receivedInDivisas,
                receivedInBs,
                pctDivisas,
                pctBs,
                totalInvoices,
                invoicesCancelled,
            },
        };
    } catch (error) {
        console.error('Error generating end-of-day summary:', error);
        return { success: false, message: 'Error generando resumen de cierre' };
    }
}
