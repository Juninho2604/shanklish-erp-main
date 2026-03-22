'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

export interface ImportPreviewResult {
    success: boolean;
    message: string;
    items?: {
        row: number;
        itemName: string;
        quantity: number;
        unit: string;
        matchedItemId?: string; // ID if found in DB
        status: 'MATCHED' | 'NOT_FOUND' | 'INVALID';
        shouldRename?: boolean;
        isFuzzyMatch?: boolean;
        category?: string;
    }[];
    allItems?: { id: string; name: string }[];
}


const importItemSchema = z.object({
    matchedItemId: z.string().optional(),
    quantity: z.number(),
    unit: z.string(),
    shouldRename: z.boolean().optional(),
    newName: z.string().optional(),
    category: z.string().optional(),
    itemName: z.string().optional()
});

const processImportSchema = z.object({
    items: z.array(importItemSchema),
    type: z.enum(['ENTRADA_ALMACEN', 'MERMA', 'INVENTARIO_INICIAL'])
});


export async function parseUploadAction(
    fileBase64: string,
    type: 'ENTRADA_ALMACEN' | 'MERMA' | 'INVENTARIO_INICIAL'
): Promise<ImportPreviewResult> {
    try {
        if (!fileBase64 || !fileBase64.includes(',')) {
            throw new Error('Formato de archivo inválido (Base64 corrupto)');
        }

        console.log(`[Import] Decoding file of size: ${fileBase64.length}`);

        // Decode file
        const base64Data = fileBase64.split(',')[1];
        if (!base64Data) throw new Error('No Data URI data found');

        const buffer = Buffer.from(base64Data, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        if (!workbook.SheetNames.length) throw new Error('El archivo Excel no tiene hojas');

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

        console.log(`[Import] Sheet parsed explicitly. Rows: ${data.length}`);

        const items: ImportPreviewResult['items'] = [];

        // Load all items (active or inactive) to prevent duplicates and allow reactivation
        const dbItems = await prisma.inventoryItem.findMany({
            select: { id: true, name: true, sku: true }
        });

        // Normalize helper
        const normalize = (s: string) => s?.toString().trim().toLowerCase();

        if (type === 'ENTRADA_ALMACEN') {
            // Logic for "ENTRADA ALMACEN.xlsx"
            // Starts roughly row 4 (index 3). Col 2 (C) is Name, Col 3 (D) is Qty

            for (let i = 4; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length < 3) continue;

                const rawName = row[2]; // Column C
                const rawQty = row[3]; // Column D

                if (!rawName) continue; // Skip empty rows

                // Try to find match
                const match = dbItems.find(
                    item => normalize(item.name) === normalize(rawName) ||
                        normalize(item.sku) === normalize(rawName)
                );

                const quantity = parseFloat(rawQty);
                const isValidQty = !isNaN(quantity) && quantity > 0;

                items.push({
                    row: i + 1,
                    itemName: rawName,
                    quantity: isValidQty ? quantity : 0,
                    unit: 'UNI', // Default, maybe map from excel later
                    matchedItemId: match?.id,
                    status: match ? (isValidQty ? 'MATCHED' : 'INVALID') : 'NOT_FOUND'
                });
            }
        }
        else if (type === 'MERMA') {
            // Logic for "REGISTRO DE MERMA UTIL.xlsx"
            // Starts row 4 (index 4). Col 1 (B) is Product, Col 2 (C) is Qty
            for (let i = 4; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length < 3) continue;

                const rawName = row[1]; // Column B
                const rawQty = row[2];  // Column C

                if (!rawName) continue;

                const match = dbItems.find(
                    item => normalize(item.name) === normalize(rawName)
                );

                const quantity = parseFloat(rawQty);

                items.push({
                    row: i + 1,
                    itemName: rawName,
                    quantity: isNaN(quantity) ? 0 : quantity,
                    unit: 'UNI',
                    matchedItemId: match?.id,
                    status: match ? 'MATCHED' : 'NOT_FOUND'
                });
            }
        }
        else if (type === 'INVENTARIO_INICIAL') {
            // Logic for "ORDEN DE COMPRA NO TOCAR.xlsx"
            let currentCategory = 'GENERAL';

            for (let i = 0; i < data.length; i++) { // Start from row 0 to detect headers
                const row = data[i];
                if (!row || row.length === 0) continue;

                const col0 = row[0]?.toString().trim();
                const col1 = row[1];

                // Detect Category Header: e.g. ["CATEGORIA", "EMPAQUETADOS", ...]
                if (col0 && col0.toUpperCase() === 'CATEGORIA' && row[1]) {
                    currentCategory = row[1].toString().trim().toUpperCase();
                    continue; // Skip header row
                }

                // Skip Sub-header "PRODUCTO"
                if (col0 === 'PRODUCTO') continue;

                // Valid Item check: must have a name (col0) and a quantity (col1, can be 0)
                if (!col0 || (!col1 && col1 !== 0)) continue;

                const rawName = col0; // Column A
                const rawQty = col1;  // Column B
                const rawUnit = row[4]; // Column E - Unit (Index 4)

                const normalizedRaw = normalize(rawName);

                // 1. Try Exact Match
                let match = dbItems.find(
                    item => normalize(item.name) === normalize(rawName) ||
                        normalize(item.sku) === normalize(rawName)
                );

                let isFuzzy = false;

                // 2. Try Fuzzy Match if no exact match
                if (!match) {
                    let bestDist = Infinity;
                    let bestCandidate = null;
                    const maxDist = 4; // Tolerance
                    for (const item of dbItems) {
                        const dist = levenshteinDistance(normalizedRaw, normalize(item.name));
                        if (dist < bestDist && dist <= maxDist) {
                            bestDist = dist;
                            bestCandidate = item;
                        }
                    }

                    if (bestCandidate) {
                        match = bestCandidate;
                        isFuzzy = true;
                    }
                }

                // Handle numbers and strings like "400 und"
                let quantity = 0;
                let detectedUnit = 'KG'; // Default fallback

                // Extract quantity
                if (typeof rawQty === 'number') {
                    quantity = rawQty;
                } else if (typeof rawQty === 'string') {
                    const parsed = parseFloat(rawQty.replace(',', '.'));
                    if (!isNaN(parsed)) quantity = parsed;
                }

                // Detect Unit
                // Priority 1: Column C (Explicit Unit)
                if (rawUnit) {
                    const u = normalize(rawUnit.toString());
                    if (['und', 'unidad', 'pza', 'pieza', 'u', 'uni'].includes(u)) detectedUnit = 'UNI';
                    else if (['kg', 'kilo', 'kilogramo', 'kgs'].includes(u)) detectedUnit = 'KG';
                    else if (['g', 'gr', 'gramo', 'grs'].includes(u)) detectedUnit = 'GR';
                    else if (['l', 'lt', 'litro', 'lts', 'litros'].includes(u)) detectedUnit = 'LTS';
                    else if (['ml', 'mililitro', 'mls'].includes(u)) detectedUnit = 'ML';
                    else if (['lb', 'libra', 'lbs'].includes(u)) detectedUnit = 'LB';
                    else if (['oz', 'onza', 'ozs'].includes(u)) detectedUnit = 'OZ';
                    else if (['gal', 'galon'].includes(u)) detectedUnit = 'GAL';
                    else detectedUnit = rawUnit.toString().toUpperCase().substring(0, 5); // Fallback to raw
                }
                // Priority 2: Infer from Quantity string if explicitly stated there (e.g. "500 ml")
                else if (typeof rawQty === 'string') {
                    const lowerQty = rawQty.toLowerCase();
                    if (lowerQty.includes('und') || lowerQty.includes('pza') || lowerQty.includes('uni')) detectedUnit = 'UNI';
                    else if (lowerQty.includes('kg') || lowerQty.includes('kilo')) detectedUnit = 'KG';
                    else if (lowerQty.includes('lts') || lowerQty.includes('litro') || lowerQty.includes('lt')) detectedUnit = 'LTS';
                    else if (lowerQty.includes('ml')) detectedUnit = 'ML';
                    else if (lowerQty.includes('gr') || lowerQty.includes('gramo')) detectedUnit = 'GR';
                }

                items.push({
                    row: i + 1,
                    itemName: rawName,
                    quantity: quantity,
                    unit: detectedUnit,
                    matchedItemId: match?.id,
                    status: match ? 'MATCHED' : 'NOT_FOUND',
                    shouldRename: isFuzzy,
                    isFuzzyMatch: isFuzzy,
                    category: currentCategory
                });
            }
        }

        return {
            success: true,
            message: `Procesadas ${items.length} filas`,
            items,
            allItems: dbItems.map(i => ({ id: i.id, name: i.name }))
        };

    } catch (error) {
        console.error('Error parsing excel:', error);
        return {
            success: false,
            message: 'Error al leer el archivo Excel'
        };
    }
}

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

export async function processImportAction(
    items: { matchedItemId?: string; quantity: number; unit: string; shouldRename?: boolean; newName?: string; category?: string; itemName?: string }[],
    type: 'ENTRADA_ALMACEN' | 'MERMA' | 'INVENTARIO_INICIAL',
    areaId?: string // NEW: Optional area ID, defaults to Almacén Principal
) {
    const session = await getSession();
    if (!session?.id) return { success: false, message: 'No autorizado' };
    const userId = session.id;

    // 1. Input Validation
    const validation = processImportSchema.safeParse({ items, type });
    if (!validation.success) {
        console.error("Validation Error:", validation.error);
        return { success: false, message: 'Datos de importación inválidos o corruptos' };
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const movementType = (type === 'ENTRADA_ALMACEN' || type === 'INVENTARIO_INICIAL') ? 'PURCHASE' : 'WASTE';

            // FIX: If areaId provided, use it. Otherwise find "Almacén Principal" by name
            let targetArea;
            if (areaId) {
                targetArea = await tx.area.findUnique({ where: { id: areaId } });
            }

            // Fallback to Almacén Principal if not found or not provided
            if (!targetArea) {
                targetArea = await tx.area.findFirst({
                    where: { name: { contains: 'ALMACEN PRINCIPAL', mode: 'insensitive' } }
                });
            }

            // Final fallback to first area (shouldn't happen in normal use)
            if (!targetArea) {
                targetArea = await tx.area.findFirst();
            }

            if (!targetArea) {
                throw new Error('No se encontró ningún área para registrar el inventario');
            }

            const existingLocations = await tx.inventoryLocation.findMany({
                where: { areaId: targetArea.id }
            });
            const locMap = new Map(existingLocations.map(l => [l.inventoryItemId, l]));

            let processedCount = 0;

            for (const item of items) {
                // If it's a NEW item (no matched ID) and we are in Master Load (INVENTARIO_INICIAL), CREATE IT
                let targetItemId = item.matchedItemId;

                if (!targetItemId && type === 'INVENTARIO_INICIAL' && item.itemName) {
                    // Create new item
                    const categoryPrefix = item.category?.substring(0, 3).toUpperCase() || 'GEN';
                    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                    const sku = `${categoryPrefix}-${randomSuffix}`;

                    const newItem = await tx.inventoryItem.create({
                        data: {
                            name: item.itemName,
                            sku: sku,
                            type: 'RAW_MATERIAL', // Default
                            baseUnit: item.unit,
                            category: item.category || 'GENERAL',
                            isActive: true
                        }
                    });
                    targetItemId = newItem.id;
                }

                if (!targetItemId || item.quantity < 0) continue;

                // Rename logic ... create movement logic ...
                // Update existing item (Reactivate, Rename, Update Master Data)
                if (targetItemId && item.matchedItemId) {
                    const updateData: any = { isActive: true };

                    if (item.shouldRename && item.newName) {
                        updateData.name = item.newName;
                    }

                    // For Master Load, update Category and Unit from the file/preview
                    if (type === 'INVENTARIO_INICIAL') {
                        if (item.category) updateData.category = item.category;
                        if (item.unit) updateData.baseUnit = item.unit;
                    }

                    await tx.inventoryItem.update({
                        where: { id: item.matchedItemId },
                        data: updateData
                    });
                }

                if (item.quantity > 0) {
                    // 1. Create movement
                    await tx.inventoryMovement.create({
                        data: {
                            inventoryItemId: targetItemId,
                            movementType: movementType as any,
                            quantity: item.quantity,
                            unit: item.unit, // Needs better mapping
                            createdById: userId,
                            reason: `Importación masiva: ${type}`
                        }
                    });

                    // 2. Update stock
                    if (targetArea) {
                        const loc = locMap.get(targetItemId);

                        const current = loc?.currentStock || 0;
                        const change = type === 'ENTRADA_ALMACEN' || type === 'INVENTARIO_INICIAL' ? item.quantity : -item.quantity;

                        await tx.inventoryLocation.upsert({
                            where: {
                                inventoryItemId_areaId: {
                                    inventoryItemId: targetItemId,
                                    areaId: targetArea.id
                                }
                            },
                            create: {
                                inventoryItemId: targetItemId,
                                areaId: targetArea.id,
                                currentStock: Math.max(0, change)
                            },
                            update: {
                                currentStock: Math.max(0, current + change)
                            }
                        });
                    }

                    processedCount++;
                }
            }
            return processedCount;
        }, { timeout: 120000 });

        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard');
        return { success: true, message: `Importados ${result} items exitosamente` };

    } catch (error: any) {
        console.error('Error importing data:', error);
        return { success: false, message: `Error al guardar: ${error.message || 'Desconocido'}` };
    }
}
