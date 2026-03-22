
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const folderPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop', 'GERENCIA OPERATIVA PLANILLAS');
const filename = "ORDEN DE COMPRA NO TOCAR.xlsx";

// ----------------------------------------------------------------------------
// HELPER: Normalize Units
// ----------------------------------------------------------------------------
const UNIT_MAP: Record<string, string> = {
    'KG': 'KG', 'KILO': 'KG', 'KILOS': 'KG', 'KILOGRAMO': 'KG',
    'G': 'G', 'GR': 'G', 'GRAMOS': 'G', 'GRAMO': 'G',
    'L': 'L', 'LITRO': 'L', 'LITROS': 'L', 'LT': 'L',
    'ML': 'ML', 'MILILITRO': 'ML',
    'GAL': 'GAL', 'GALON': 'GAL',
    'OZ': 'OZ', 'ONZA': 'OZ',
    'LB': 'LB', 'LIBRA': 'LB',
    'UND': 'UNIT', 'UNI': 'UNIT', 'UNIDAD': 'UNIT', 'UNIDADES': 'UNIT', 'U': 'UNIT',
    'PAQUETE': 'UNIT', 'LATA': 'UNIT', 'BOTELLA': 'UNIT', // Treat packs as units for now unless specified
};

function normalizeUnit(raw: any): string {
    if (!raw) return 'UNIT'; // Default
    const s = raw.toString().trim().toUpperCase().replace('.', '');

    // Direct match
    if (UNIT_MAP[s]) return UNIT_MAP[s];

    // Partial match heuristics
    if (s.startsWith('KG')) return 'KG';
    if (s.startsWith('GR')) return 'G';
    if (s.startsWith('LIT')) return 'L';
    if (s === 'L') return 'L';
    if (s.includes('GAL')) return 'GAL';

    return 'UNIT';
}

async function main() {
    console.log('🚀 Starting Clean & Update Process...');

    const fullPath = path.join(folderPath, filename);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Archivo no encontrado: ${fullPath}`);
        return;
    }

    // 1. CLEANUP TRANSACTIONS
    console.log('🧹 Cleaning up transactions (Loans, Movements)...');
    // Delete in order to avoid FK constraints
    await prisma.inventoryMovement.deleteMany({});
    await prisma.inventoryLoan.deleteMany({});

    // Also clear daily inventory if any
    await prisma.dailyInventoryItem.deleteMany({});
    await prisma.dailyInventory.deleteMany({});

    // Reset Stocks (InventoryLocation)
    // We update them to 0 or delete them. Deleting is cleaner if we want to re-seed.
    console.log('🧹 Resetting stock levels...');
    await prisma.inventoryLocation.deleteMany({});

    console.log('✅ Cleanup complete. Now processing Excel...');

    // 2. READ EXCEL
    const workbook = XLSX.readFile(fullPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Read raw
    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

    console.log(`📊 Found ${data.length} rows.`);

    let currentCategory = 'GENERAL';
    let processedCount = 0;

    // Get "Almacén Principal" ID or create it
    let mainArea = await prisma.area.findFirst({ where: { name: 'Almacén Principal' } });
    if (!mainArea) {
        mainArea = await prisma.area.create({
            data: { name: 'Almacén Principal', isActive: true }
        });
    }

    // Load existing items cache
    const allItems = await prisma.inventoryItem.findMany({ select: { id: true, name: true, sku: true } });
    const itemMap = new Map(allItems.map(i => [i.name.toUpperCase().trim(), i]));
    const existingSkus = new Set(allItems.map(i => i.sku));

    // SKU Counters
    const skuCounters: Record<string, number> = {};

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const colName = row[0]?.toString().trim();      // Col A: Name
        const colQty = row[1];                          // Col B: Quantity
        const colUnit = row[2]?.toString().trim();      // Col C: (New) Unit

        if (!colName) continue;

        // Detect Category
        if (colName.toUpperCase() === 'CATEGORIA' || colName.toUpperCase().startsWith('CATEGORIA')) {
            // Usually the category name is in the NEXT cell or the SAME cell?
            // Previous script user: "if (col0 === 'CATEGORIA' && row[1]) currentCategory = row[1]"
            if (row[1]) {
                currentCategory = row[1].toString().trim().toUpperCase();
                console.log(`📂 Categoría: ${currentCategory}`);
            }
            continue;
        }

        // Skip Headers
        if (colName.toUpperCase() === 'PRODUCTO' ||
            colName.toUpperCase().includes('DESCRIPCION') ||
            colName.toUpperCase() === 'CODIGO') {
            continue;
        }

        // --- Process Item ---
        const name = colName;
        // Parse Unit: prefer Col C, fallback to Col B parsing if C is empty?
        // User said "agregue la columna". So we trust Col C primarily.
        let finalUnit = 'UNIT';
        if (colUnit) {
            finalUnit = normalizeUnit(colUnit);
        } else {
            // Fallback: try to guess from B if it has loose text like "12 kg"
            // But usually B is now just quantity number.
            finalUnit = 'UNIT';
        }

        // Parse Quantity
        const qty = parseFloat(colQty) || 0;

        // === 1. Prepare SKU ===
        // If item exists, keep SKU. If not, generate.
        let sku = '';
        const existingItem = itemMap.get(name.toUpperCase());

        if (existingItem) {
            sku = existingItem.sku;
            // Update Item Definition
            await prisma.inventoryItem.update({
                where: { id: existingItem.id },
                data: {
                    baseUnit: finalUnit,
                    category: currentCategory,
                    isActive: true
                }
            });
        } else {
            // Generate SKU
            const catPrefix = currentCategory.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'GEN');
            let attempts = 0;
            do {
                if (!skuCounters[catPrefix]) skuCounters[catPrefix] = 0;
                skuCounters[catPrefix]++;
                const skuNum = skuCounters[catPrefix].toString().padStart(3, '0');
                sku = `${catPrefix}-${skuNum}`;
                attempts++;
            } while (existingSkus.has(sku) && attempts < 1000);

            // Create Item
            const newItem = await prisma.inventoryItem.create({
                data: {
                    name: name,
                    sku: sku,
                    type: 'RAW_MATERIAL',
                    baseUnit: finalUnit,
                    category: currentCategory,
                    isActive: true
                }
            });
            sku = newItem.sku;
            existingSkus.add(sku);
            // Update map for future reference in this loop (unlikely dupes but good practice)
            itemMap.set(name.toUpperCase(), newItem);
        }

        // === 2. Set Stock ===
        // We deleted all locations, so we just Create.
        // But we need the item ID.
        const currentItem = itemMap.get(name.toUpperCase());
        if (currentItem && qty > 0) {
            await prisma.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: currentItem.id,
                        areaId: mainArea.id
                    }
                },
                create: {
                    inventoryItemId: currentItem.id,
                    areaId: mainArea.id,
                    currentStock: qty
                },
                update: {
                    currentStock: { increment: qty }
                }
            });
        }

        processedCount++;
        if (processedCount % 50 === 0) process.stdout.write('.');
    }

    console.log(`\n✨ Success! Processed ${processedCount} items.`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
