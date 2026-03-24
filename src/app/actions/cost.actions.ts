'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/auth';

/**
 * SHANKLISH CARACAS ERP - Cost Actions
 * 
 * Server Actions para gestión de costos y precios de compra
 */

interface CostImportItem {
    row: number;
    date: string;
    category: string;
    productName: string;
    unit: string;
    quantity: number;
    supplier: string;
    currency: 'USD' | 'BS';
    unitCost: number;
    totalCost: number;
    matchedItemId?: string;
    status: 'MATCHED' | 'NOT_FOUND' | 'INVALID';
}

interface CostImportPreviewResult {
    success: boolean;
    message: string;
    items?: CostImportItem[];
    summary?: {
        total: number;
        matched: number;
        notFound: number;
        invalid: number;
    };
}

// ============================================================================
// PARSE COST EXCEL
// ============================================================================

/**
 * Parsea el archivo COSTO.xlsx y hace matching con items existentes
 * Columnas esperadas: Fecha, Día, Semana, Código, Categoría, Producto, Unidad, Cantidad, Proveedor, Moneda, Precio Unit, Total, Costo Unit
 */
export async function parseCostUploadAction(
    fileBase64: string
): Promise<CostImportPreviewResult> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        // Decode Base64 and read Excel
        const buffer = Buffer.from(fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON (array of arrays)
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length < 2) {
            return { success: false, message: 'El archivo está vacío o no tiene datos' };
        }

        // Get all inventory items for matching
        const allItems = await prisma.inventoryItem.findMany({
            where: { isActive: true },
            select: { id: true, name: true, sku: true, baseUnit: true, category: true },
        });

        // Normalize function for matching
        const normalize = (s: string) => s?.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() || '';

        const parsedItems: CostImportItem[] = [];
        let matched = 0, notFound = 0, invalid = 0;

        // Skip header row, process data rows
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length < 10) continue;

            // Parse columns based on COSTO.xlsx structure
            // [0]=Fecha, [1]=Día, [2]=Semana, [3]=Código, [4]=Categoría, [5]=Producto, 
            // [6]=Unidad, [7]=Cantidad, [8]=Proveedor, [9]=Moneda, [10]=PrecioUnit, [11]=Total, [12]=CostoUnit
            const dateRaw = row[0];
            const category = row[4]?.toString() || '';
            const productName = row[5]?.toString() || '';
            const unit = row[6]?.toString() || '';
            const quantity = parseFloat(row[7]) || 0;
            const supplier = row[8]?.toString() || '';
            const currencyRaw = row[9]?.toString().toUpperCase() || 'BS';
            const unitCostRaw = row[12] || row[10]; // Preferir CostoUnit, si no PrecioUnit

            // Parse currency
            const currency: 'USD' | 'BS' = currencyRaw.includes('$') ? 'USD' : 'BS';

            // Parse unit cost (remove $ symbol and parse)
            let unitCost = 0;
            if (unitCostRaw) {
                const costStr = unitCostRaw.toString().replace(/[$,]/g, '').trim();
                unitCost = parseFloat(costStr) || 0;
            }

            // Parse date
            let dateStr = '';
            if (dateRaw) {
                if (typeof dateRaw === 'number') {
                    // Excel serial date
                    const date = XLSX.SSF.parse_date_code(dateRaw);
                    dateStr = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                } else {
                    dateStr = dateRaw.toString();
                }
            }

            // Skip invalid rows
            if (!productName || unitCost <= 0) {
                invalid++;
                continue;
            }

            // Match with inventory items
            const normalizedName = normalize(productName);
            let matchedItem = allItems.find(item => {
                const itemNorm = normalize(item.name);
                return itemNorm === normalizedName ||
                    itemNorm.includes(normalizedName) ||
                    normalizedName.includes(itemNorm);
            });

            const status = matchedItem ? 'MATCHED' : 'NOT_FOUND';
            if (matchedItem) matched++;
            else notFound++;

            parsedItems.push({
                row: i + 1,
                date: dateStr,
                category,
                productName,
                unit,
                quantity,
                supplier,
                currency,
                unitCost,
                totalCost: quantity * unitCost,
                matchedItemId: matchedItem?.id,
                status,
            });
        }

        return {
            success: true,
            message: `Parseados ${parsedItems.length} registros de costos`,
            items: parsedItems,
            summary: {
                total: parsedItems.length,
                matched,
                notFound,
                invalid,
            },
        };
    } catch (error) {
        console.error('Error parsing cost upload:', error);
        return { success: false, message: `Error al procesar archivo: ${error}` };
    }
}

// ============================================================================
// PROCESS COST IMPORT
// ============================================================================

/**
 * Procesa los costos parseados y los registra en CostHistory
 */
export async function processCostImportAction(
    items: { matchedItemId: string; unitCost: number; currency: string; supplier?: string }[]
): Promise<{ success: boolean; message: string; count?: number }> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        // Filter only matched items
        const validItems = items.filter(item => item.matchedItemId && item.unitCost > 0);

        if (validItems.length === 0) {
            return { success: false, message: 'No hay items válidos para procesar' };
        }

        // Group by matchedItemId to get the latest cost per item
        const latestCostByItem = new Map<string, { unitCost: number; currency: string; supplier?: string }>();
        for (const item of validItems) {
            latestCostByItem.set(item.matchedItemId, {
                unitCost: item.unitCost,
                currency: item.currency,
                supplier: item.supplier,
            });
        }

        // Transaction to update costs
        const result = await prisma.$transaction(async (tx) => {
            let updatedCount = 0;

            for (const [itemId, costData] of Array.from(latestCostByItem)) {
                // Close current cost (set effectiveTo)
                await tx.costHistory.updateMany({
                    where: {
                        inventoryItemId: itemId,
                        effectiveTo: null,
                    },
                    data: {
                        effectiveTo: new Date(),
                    },
                });

                // Create new cost record
                await tx.costHistory.create({
                    data: {
                        inventoryItemId: itemId,
                        costPerUnit: costData.unitCost,
                        currency: costData.currency === 'USD' ? 'USD' : 'VES',
                        reason: costData.supplier ? `Importación desde Excel - Proveedor: ${costData.supplier}` : 'Importación desde Excel',
                        createdById: session.id,
                    },
                });

                updatedCount++;
            }

            return updatedCount;
        });

        revalidatePath('/dashboard/costos');
        revalidatePath('/dashboard/inventario');

        return {
            success: true,
            message: `Actualizados ${result} costos exitosamente`,
            count: result,
        };
    } catch (error) {
        console.error('Error processing cost import:', error);
        return { success: false, message: `Error al procesar costos: ${error}` };
    }
}

// ============================================================================
// GET COSTS
// ============================================================================

/**
 * Obtiene los costos actuales de todos los items de inventario
 */
export async function getCurrentCostsAction(): Promise<{
    success: boolean;
    message: string;
    items?: {
        id: string;
        name: string;
        sku: string;
        category: string;
        baseUnit: string;
        currentCost: number | null;
        currency: string;
        lastUpdated: Date | null;
    }[];
}> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                type: 'RAW_MATERIAL',
            },
            include: {
                costHistory: {
                    where: { effectiveTo: null },
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1,
                },
            },
            orderBy: { name: 'asc' },
        });

        return {
            success: true,
            message: 'Costos cargados',
            items: items.map(item => ({
                id: item.id,
                name: item.name,
                sku: item.sku || '',
                category: item.category || '',
                baseUnit: item.baseUnit,
                currentCost: item.costHistory[0]?.costPerUnit ?? null,
                currency: item.costHistory[0]?.currency ?? 'USD',
                lastUpdated: item.costHistory[0]?.effectiveFrom ?? null,
            })),
        };
    } catch (error) {
        console.error('Error getting costs:', error);
        return { success: false, message: `Error: ${error}` };
    }
}

/**
 * Actualiza el costo de un item individual
 */
export async function updateItemCostAction(
    itemId: string,
    newCost: number,
    currency: string,
    reason?: string
): Promise<{ success: boolean; message: string }> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, message: 'No autorizado' };
        }

        // Close current cost
        await prisma.costHistory.updateMany({
            where: {
                inventoryItemId: itemId,
                effectiveTo: null,
            },
            data: {
                effectiveTo: new Date(),
            },
        });

        // Create new cost record
        await prisma.costHistory.create({
            data: {
                inventoryItemId: itemId,
                costPerUnit: newCost,
                currency: currency === 'USD' ? 'USD' : 'VES',
                reason: reason || 'Actualización manual',
                createdById: session.id,
            },
        });

        revalidatePath('/dashboard/costos');

        return { success: true, message: 'Costo actualizado' };
    } catch (error) {
        console.error('Error updating cost:', error);
        return { success: false, message: `Error: ${error}` };
    }
}

// ============================================================================
// MARGEN POR PLATO
// ============================================================================

export type MarginStatus = 'COMPLETE' | 'PARTIAL_COSTS' | 'NO_RECIPE' | 'EMPTY_RECIPE';

export interface DishMargin {
    id: string;
    sku: string;
    name: string;
    categoryName: string;
    price: number;
    recipeCost: number;           // Costo total de ingredientes en USD
    margin: number;               // Precio - Costo
    marginPct: number;            // (Margen / Precio) × 100
    ingredientCount: number;
    missingCostCount: number;     // Cuántos ingredientes no tienen costo registrado
    status: MarginStatus;
}

export interface DishMarginsResult {
    success: boolean;
    data?: DishMargin[];
    summary?: {
        total: number;
        withFullData: number;
        avgMarginPct: number;
        atRisk: number;           // Margen < 30%
        healthy: number;          // Margen >= 50%
        bestDish: string | null;
        worstDish: string | null;
    };
    message?: string;
}

export async function getDishMarginsAction(): Promise<DishMarginsResult> {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };

        // 1. Obtener todos los items de menú activos con categoría
        const menuItems = await prisma.menuItem.findMany({
            where: { isActive: true },
            include: { category: { select: { name: true } } },
            orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
        });

        // 2. Obtener recetas con ingredientes y costos
        const recipeIds = menuItems.map(m => m.recipeId).filter(Boolean) as string[];
        const recipes = recipeIds.length
            ? await prisma.recipe.findMany({
                where: { id: { in: recipeIds }, isActive: true },
                include: {
                    ingredients: {
                        include: {
                            ingredientItem: {
                                include: {
                                    costHistory: {
                                        where: { effectiveTo: null },
                                        orderBy: { effectiveFrom: 'desc' },
                                        take: 1,
                                    },
                                },
                            },
                        },
                    },
                },
            })
            : [];

        const recipeMap = new Map(recipes.map(r => [r.id, r]));

        // 3. Calcular márgenes
        const dishes: DishMargin[] = menuItems.map(item => {
            const price = item.price;

            if (!item.recipeId) {
                return {
                    id: item.id, sku: item.sku, name: item.name,
                    categoryName: item.category.name,
                    price, recipeCost: 0, margin: price, marginPct: 100,
                    ingredientCount: 0, missingCostCount: 0, status: 'NO_RECIPE' as MarginStatus,
                };
            }

            const recipe = recipeMap.get(item.recipeId);
            if (!recipe) {
                return {
                    id: item.id, sku: item.sku, name: item.name,
                    categoryName: item.category.name,
                    price, recipeCost: 0, margin: price, marginPct: 100,
                    ingredientCount: 0, missingCostCount: 0, status: 'NO_RECIPE' as MarginStatus,
                };
            }

            if (recipe.ingredients.length === 0) {
                return {
                    id: item.id, sku: item.sku, name: item.name,
                    categoryName: item.category.name,
                    price, recipeCost: 0, margin: price, marginPct: 100,
                    ingredientCount: 0, missingCostCount: 0, status: 'EMPTY_RECIPE' as MarginStatus,
                };
            }

            let recipeCost = 0;
            let missingCostCount = 0;

            for (const ing of recipe.ingredients) {
                const costRecord = ing.ingredientItem.costHistory[0];
                if (!costRecord) {
                    missingCostCount++;
                } else {
                    recipeCost += Number(costRecord.costPerUnit) * ing.quantity;
                }
            }

            const margin = price - recipeCost;
            const marginPct = price > 0 ? (margin / price) * 100 : 0;
            const status: MarginStatus = missingCostCount > 0 ? 'PARTIAL_COSTS' : 'COMPLETE';

            return {
                id: item.id, sku: item.sku, name: item.name,
                categoryName: item.category.name,
                price, recipeCost, margin, marginPct,
                ingredientCount: recipe.ingredients.length,
                missingCostCount, status,
            };
        });

        // 4. Summary (solo platos con datos completos)
        const complete = dishes.filter(d => d.status === 'COMPLETE');
        const avgMarginPct = complete.length
            ? complete.reduce((s, d) => s + d.marginPct, 0) / complete.length
            : 0;
        const atRisk = complete.filter(d => d.marginPct < 30).length;
        const healthy = complete.filter(d => d.marginPct >= 50).length;
        const sorted = [...complete].sort((a, b) => b.marginPct - a.marginPct);

        return {
            success: true,
            data: dishes.sort((a, b) => a.marginPct - b.marginPct), // menor margen primero
            summary: {
                total: dishes.length,
                withFullData: complete.length,
                avgMarginPct: Math.round(avgMarginPct * 10) / 10,
                atRisk,
                healthy,
                bestDish: sorted[0]?.name ?? null,
                worstDish: sorted[sorted.length - 1]?.name ?? null,
            },
        };
    } catch (error) {
        console.error('[costos] getDishMarginsAction error:', error);
        return { success: false, message: 'Error calculando márgenes' };
    }
}
