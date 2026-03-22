
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const folderPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop', 'GERENCIA OPERATIVA PLANILLAS');
const filename = "ORDEN DE COMPRA NO TOCAR.xlsx";

function getUnitFromQuantity(qty: any): string {
    if (!qty) return 'UND';
    const s = qty.toString().toLowerCase();
    if (s.includes('kg') || s.includes('kilo')) return 'KG';
    if (s.includes('gr') || s.includes('gramo')) return 'GR';
    if (s.includes('lts') || s.includes('litro') || s.includes('l.')) return 'LTS';
    if (s.includes('ml')) return 'ML';
    if (s.includes('galon')) return 'GALON';
    if (s.includes('lb')) return 'LB';
    if (s.includes('oz')) return 'OZ';
    return 'UND';
}

function normalize(s: string) {
    return s?.toString().trim().replace(/\s+/g, ' ').toUpperCase();
}

async function main() {
    console.log('--- SEEDING MASTER INVENTORY FROM EXCEL ---');
    const fullPath = path.join(folderPath, filename);

    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Archivo no encontrado: ${fullPath}`);
        return;
    }

    const workbook = XLSX.readFile(fullPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Use range 0 to get all rows
    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

    console.log(`Leídas ${data.length} filas.`);

    let currentCategory = 'GENERAL';
    let processedCount = 0;

    // Cache existing items to avoid DB spam if possible, or just upsert.
    // Upsert is safer.

    // Load all existing SKUs to avoid collisions
    const allItems = await prisma.inventoryItem.findMany({ select: { sku: true } });
    const existingSkus = new Set(allItems.map(i => i.sku ? i.sku.toUpperCase() : ''));

    // Map for SKU Sequences: { 'CAT': 1 }
    const skuCounters: Record<string, number> = {};

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const col0 = row[0]?.toString().trim();
        const col1 = row[1]; // Stock/Unit info

        if (!col0) continue;

        // 1. Detect Category
        if (col0.toUpperCase() === 'CATEGORIA' && row[1]) {
            currentCategory = row[1].toString().trim().toUpperCase();
            console.log(`👉 Nueva Categoría: ${currentCategory}`);
            continue;
        }

        // 2. Skip Headers
        if (col0.toUpperCase() === 'PRODUCTO' || col0.toUpperCase().includes('SOLICITUD')) {
            continue;
        }

        // 3. Process Item
        const itemName = col0;
        const rawUnitStr = col1; // e.g. "12 kg" or just "12"
        const finalUnit = getUnitFromQuantity(rawUnitStr);

        // Generate SKU
        const catPrefix = currentCategory.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'GEN');

        let sku = '';
        let attempts = 0;
        do {
            if (!skuCounters[catPrefix]) skuCounters[catPrefix] = 0;
            skuCounters[catPrefix]++;
            const skuNum = skuCounters[catPrefix].toString().padStart(3, '0');
            sku = `${catPrefix}-${skuNum}`;
            attempts++;
        } while (existingSkus.has(sku) && attempts < 1000);

        if (existingSkus.has(sku)) {
            // Fallback to random if stuck
            sku = `${catPrefix}-${Math.floor(Math.random() * 10000)}`;
        }

        existingSkus.add(sku); // Reserve it

        // Upsert
        // We search by Name to see if it exists (Active or Inactive)
        // If exists, we update Category, Unit, SKU (maybe?), and Reactivate.
        // We do NOT touch stock (currentStock).

        try {
            // Find first by name to get ID if exists
            const existing = await prisma.inventoryItem.findFirst({
                where: { name: itemName }
            });

            if (existing) {
                // Update
                await prisma.inventoryItem.update({
                    where: { id: existing.id },
                    data: {
                        isActive: true,
                        category: currentCategory,
                        baseUnit: finalUnit,
                        // Update SKU only if generic? 
                        // Let's force update SKU to normalize it to our new system, OR keep old if user prefers?
                        // User said "replace master". I'll update SKU to be consistent.
                        sku: sku
                    }
                });
                // console.log(`🔄 Actualizado: ${itemName} (${finalUnit})`);
            } else {
                // Create
                await prisma.inventoryItem.create({
                    data: {
                        name: itemName,
                        sku: sku,
                        type: 'RAW_MATERIAL',
                        baseUnit: finalUnit,
                        category: currentCategory,
                        isActive: true
                    }
                });
                // console.log(`✨ Creado: ${itemName} (${finalUnit})`);
            }
            processedCount++;
            if (processedCount % 20 === 0) process.stdout.write('.');

        } catch (err: any) {
            console.error(`Error procesando ${itemName}: ${err.message}`);
        }
    }

    console.log(`\n✅ Proceso completado. ${processedCount} items procesados.`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
