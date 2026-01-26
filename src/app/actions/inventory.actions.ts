'use server';

/**
 * SHANKLISH CARACAS ERP - Inventory Actions
 * 
 * Server Actions para gestión de inventario desde el frontend
 */

import { revalidatePath } from 'next/cache';

// En producción, importar de los services reales:
// import { registerPurchase, registerSale, registerAdjustment } from '@/server/services/inventory.service';

// ============================================================================
// TIPOS
// ============================================================================

export interface PurchaseFormData {
    inventoryItemId: string;
    quantity: number;
    unit: string;
    unitCost: number;
    supplierId?: string;
    areaId: string;
    notes?: string;
}

export interface SaleFormData {
    inventoryItemId: string;
    quantity: number;
    unit: string;
    areaId: string;
    orderId?: string;
    notes?: string;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

// ============================================================================
// MOCK: Simulación de operaciones para desarrollo sin DB
// ============================================================================

// Stock simulado (en producción viene de DB)
const mockStockData: Record<string, number> = {
    'ins-leche': 45,
    'ins-sal': 25,
    'ins-zaatar': 1.5,
    'ins-carne': 8,
    'ins-burgol': 15,
    'ins-cebolla': 10,
    'ins-aceite': 12,
    'ins-merey': 5,
    'ins-pan': 100,
    'sub-cuajada': 8,
    'sub-shanklish': 50,
    'sub-masa-kibbe': 3,
};

// Costos simulados
const mockCostData: Record<string, number> = {
    'ins-leche': 2.5,
    'ins-sal': 0.8,
    'ins-zaatar': 25,
    'ins-carne': 8.5,
    'ins-burgol': 3.2,
    'ins-cebolla': 1.5,
    'ins-aceite': 4.0,
    'ins-merey': 18,
    'ins-pan': 0.5,
};

// Conversiones de unidad
const CONVERSIONS: Record<string, Record<string, number>> = {
    'ins-leche': { 'UNIT': 20 }, // 1 saco = 20 litros
};

// ============================================================================
// ACTION: REGISTRAR COMPRA
// ============================================================================

export async function registerPurchaseAction(
    formData: PurchaseFormData,
    userId: string = 'user-admin'
): Promise<ActionResult> {
    try {
        // Simular delay de red
        await new Promise(resolve => setTimeout(resolve, 500));

        const { inventoryItemId, quantity, unit, unitCost, areaId, notes } = formData;

        // Convertir a unidad base si aplica
        let quantityInBase = quantity;
        const conversion = CONVERSIONS[inventoryItemId]?.[unit];
        if (conversion) {
            quantityInBase = quantity * conversion;
        }

        // Actualizar stock mock
        const currentStock = mockStockData[inventoryItemId] || 0;
        const newStock = currentStock + quantityInBase;
        mockStockData[inventoryItemId] = newStock;

        // Calcular nuevo costo promedio ponderado
        const currentCost = mockCostData[inventoryItemId] || 0;
        const newCost = currentStock > 0
            ? ((currentStock * currentCost) + (quantityInBase * unitCost)) / newStock
            : unitCost;
        mockCostData[inventoryItemId] = newCost;

        // Log para desarrollo
        console.log('📦 COMPRA REGISTRADA:', {
            item: inventoryItemId,
            cantidad: `${quantity} ${unit}`,
            enBase: `${quantityInBase}`,
            costoUnit: unitCost,
            nuevoStock: newStock,
            nuevoCosto: newCost.toFixed(4),
        });

        // Revalidar páginas afectadas
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Compra registrada: +${quantityInBase} unidades. Nuevo stock: ${newStock.toFixed(2)}`,
            data: {
                newStock,
                newCostPerUnit: newCost,
                quantityAdded: quantityInBase,
            },
        };

    } catch (error) {
        console.error('Error en registerPurchaseAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al registrar compra',
        };
    }
}

// ============================================================================
// ACTION: REGISTRAR VENTA (Para integración futura con Wink)
// ============================================================================

export async function registerSaleAction(
    formData: SaleFormData,
    userId: string = 'user-admin'
): Promise<ActionResult> {
    try {
        await new Promise(resolve => setTimeout(resolve, 300));

        const { inventoryItemId, quantity, areaId, orderId } = formData;

        // Verificar stock
        const currentStock = mockStockData[inventoryItemId] || 0;
        if (currentStock < quantity) {
            return {
                success: false,
                message: `Stock insuficiente. Disponible: ${currentStock}`,
            };
        }

        // Decrementar stock
        const newStock = currentStock - quantity;
        mockStockData[inventoryItemId] = newStock;

        console.log('💵 VENTA REGISTRADA:', {
            item: inventoryItemId,
            cantidad: quantity,
            nuevoStock: newStock,
            orden: orderId,
        });

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Venta registrada: -${quantity} unidades. Stock restante: ${newStock.toFixed(2)}`,
            data: { newStock },
        };

    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al registrar venta',
        };
    }
}

// ============================================================================
// ACTION: PROCESAR VENTA DESDE WINK/WEB (Endpoint preparado)
// ============================================================================

export interface WinkOrderItem {
    productSku: string;
    quantity: number;
}

export interface WinkOrder {
    orderId: string;
    items: WinkOrderItem[];
    customerName?: string;
    createdAt: string;
}

/**
 * Procesa una orden de Wink/Web
 * Descuenta ingredientes del inventario según las recetas
 */
export async function processWinkOrderAction(
    order: WinkOrder
): Promise<ActionResult> {
    try {
        console.log('🛒 PROCESANDO ORDEN WINK:', order.orderId);

        const results: { sku: string; success: boolean; message: string }[] = [];

        for (const item of order.items) {
            // En producción:
            // 1. Buscar producto por SKU
            // 2. Obtener receta del producto
            // 3. Calcular ingredientes necesarios × cantidad
            // 4. Decrementar cada ingrediente del inventario

            // Mock: Solo registrar
            console.log(`  - ${item.quantity}x ${item.productSku}`);
            results.push({
                sku: item.productSku,
                success: true,
                message: `Procesado ${item.quantity} unidades`,
            });
        }

        revalidatePath('/dashboard');

        return {
            success: true,
            message: `Orden ${order.orderId} procesada: ${order.items.length} productos`,
            data: { results },
        };

    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error procesando orden',
        };
    }
}

// ============================================================================
// ACTION: OBTENER STOCK ACTUAL (Para UI)
// ============================================================================

export async function getStockAction(
    inventoryItemId: string
): Promise<ActionResult> {
    const stock = mockStockData[inventoryItemId] ?? 0;
    const cost = mockCostData[inventoryItemId] ?? 0;

    return {
        success: true,
        message: 'Stock obtenido',
        data: {
            currentStock: stock,
            costPerUnit: cost,
        },
    };
}
