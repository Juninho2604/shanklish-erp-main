/**
 * SHANKLISH ERP - Script de Reset e Importación de Inventario Inicial
 * 
 * Este script:
 * 1. Borra todos los movimientos, auditorías, préstamos
 * 2. Pone todo el stock a 0
 * 3. Carga el inventario de Almacén Principal desde Excel
 * 4. Carga el inventario de Centro de Producción desde Excel
 * 
 * USO: npx ts-node scripts/reset-and-import-inventory.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rutas de archivos
const folderPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop', 'GERENCIA OPERATIVA PLANILLAS');
const ALMACEN_FILE = "INVENTARIO GENERAL ALMACEN PRINCIPAL.xlsx";
const PRODUCCION_FILE = "INVENTARIO GENERAL CENTRO DE PRODUCCION.xlsx";

// Helper para normalizar unidades
const UNIT_MAP: Record<string, string> = {
    'KG': 'KG', 'KILO': 'KG', 'KILOS': 'KG', 'KILOGRAMO': 'KG',
    'G': 'G', 'GR': 'G', 'GRAMOS': 'G', 'GRAMO': 'G', 'GRS': 'G',
    'L': 'L', 'LITRO': 'L', 'LITROS': 'L', 'LT': 'L', 'LTS': 'L',
    'ML': 'ML', 'MILILITRO': 'ML', 'MLS': 'ML',
    'GAL': 'GAL', 'GALON': 'GAL',
    'OZ': 'OZ', 'ONZA': 'OZ', 'OZS': 'OZ',
    'LB': 'LB', 'LIBRA': 'LB', 'LBS': 'LB',
    'UND': 'UNIT', 'UNI': 'UNIT', 'UNIDAD': 'UNIT', 'UNIDADES': 'UNIT', 'U': 'UNIT',
    'PAQUETE': 'UNIT', 'LATA': 'UNIT', 'BOTELLA': 'UNIT',
};

function normalizeUnit(raw: any): string {
    if (!raw) return 'UNIT';
    const s = raw.toString().trim().toUpperCase().replace('.', '');
    if (UNIT_MAP[s]) return UNIT_MAP[s];
    if (s.startsWith('KG')) return 'KG';
    if (s.startsWith('GR')) return 'G';
    if (s.startsWith('LIT') || s.startsWith('LT')) return 'L';
    if (s === 'L') return 'L';
    if (s.includes('GAL')) return 'GAL';
    return 'UNIT';
}

function normalize(s: string): string {
    return s?.toString().trim().toLowerCase() || '';
}

interface ExcelRow {
    name: string;
    quantity: number;
    unit: string;
    category: string;
}

function parseExcelFile(filepath: string): ExcelRow[] {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Archivo no encontrado: ${filepath}`);
        return [];
    }

    const workbook = XLSX.readFile(filepath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

    const items: ExcelRow[] = [];
    let currentCategory = 'GENERAL';

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const col0 = row[0]?.toString().trim();
        const col1 = row[1];
        const col4 = row[4]?.toString().trim(); // Unidad en columna E

        if (!col0) continue;

        // Detectar categoría
        if (col0.toUpperCase() === 'CATEGORIA' && row[1]) {
            currentCategory = row[1].toString().trim().toUpperCase();
            continue;
        }

        // Saltar headers
        if (col0.toUpperCase() === 'PRODUCTO' ||
            col0.toUpperCase().includes('DESCRIPCION') ||
            col0.toUpperCase() === 'CODIGO') {
            continue;
        }

        // Parsear cantidad
        let quantity = 0;
        if (typeof col1 === 'number') {
            quantity = col1;
        } else if (typeof col1 === 'string') {
            // Manejar casos como "110 und" o "800 und"
            const match = col1.match(/^[\d.,]+/);
            if (match) {
                quantity = parseFloat(match[0].replace(',', '.'));
            }
        }

        // Saltar items con "?" como cantidad
        if (col1 === '?' || isNaN(quantity)) {
            continue;
        }

        // Detectar unidad
        let unit = normalizeUnit(col4);
        if (!col4 && typeof col1 === 'string') {
            // Intentar extraer de la cantidad (ej: "500 ml")
            const lowerQty = col1.toLowerCase();
            if (lowerQty.includes('und') || lowerQty.includes('uni')) unit = 'UNIT';
            else if (lowerQty.includes('kg')) unit = 'KG';
            else if (lowerQty.includes('lts') || lowerQty.includes('lt')) unit = 'L';
            else if (lowerQty.includes('ml')) unit = 'ML';
            else if (lowerQty.includes('gr')) unit = 'G';
        }

        items.push({
            name: col0,
            quantity: quantity,
            unit: unit,
            category: currentCategory
        });
    }

    return items;
}

async function main() {
    console.log('🚀 INICIANDO RESET E IMPORTACIÓN DE INVENTARIO');
    console.log('================================================\n');

    // ============================================================
    // FASE 1: LIMPIEZA TOTAL
    // ============================================================
    console.log('🧹 FASE 1: Limpiando historial de inventario...\n');

    // Eliminar en orden para evitar FK constraints
    const deletedReqItems = await prisma.requisitionItem.deleteMany({});
    console.log(`  ✓ ${deletedReqItems.count} items de requisición eliminados`);

    const deletedReqs = await prisma.requisition.deleteMany({});
    console.log(`  ✓ ${deletedReqs.count} requisiciones eliminadas`);

    const deletedMovements = await prisma.inventoryMovement.deleteMany({});
    console.log(`  ✓ ${deletedMovements.count} movimientos eliminados`);

    const deletedAuditItems = await prisma.inventoryAuditItem.deleteMany({});
    console.log(`  ✓ ${deletedAuditItems.count} items de auditoría eliminados`);

    const deletedAudits = await prisma.inventoryAudit.deleteMany({});
    console.log(`  ✓ ${deletedAudits.count} auditorías eliminadas`);

    const deletedLoans = await prisma.inventoryLoan.deleteMany({});
    console.log(`  ✓ ${deletedLoans.count} préstamos eliminados`);

    const deletedDailyItems = await prisma.dailyInventoryItem.deleteMany({});
    const deletedDaily = await prisma.dailyInventory.deleteMany({});
    console.log(`  ✓ ${deletedDaily.count} inventarios diarios eliminados`);

    const deletedProdOrders = await prisma.productionOrder.deleteMany({});
    console.log(`  ✓ ${deletedProdOrders.count} órdenes de producción eliminadas`);

    // Poner todo el stock a 0
    const resetLocations = await prisma.inventoryLocation.deleteMany({});
    console.log(`  ✓ ${resetLocations.count} ubicaciones de stock eliminadas (stock en 0)`);

    console.log('\n✅ Limpieza completada.\n');

    // ============================================================
    // FASE 2: OBTENER/CREAR ÁREAS
    // ============================================================
    console.log('🏢 FASE 2: Verificando áreas...\n');

    // Almacén Principal
    let almacenPrincipal = await prisma.area.findFirst({
        where: { name: { contains: 'ALMACEN PRINCIPAL', mode: 'insensitive' } }
    });
    if (!almacenPrincipal) {
        almacenPrincipal = await prisma.area.findFirst({
            where: { name: { contains: 'Principal', mode: 'insensitive' } }
        });
    }
    if (!almacenPrincipal) {
        almacenPrincipal = await prisma.area.create({
            data: { name: 'Almacén Principal', isActive: true }
        });
        console.log('  ✓ Área "Almacén Principal" creada');
    } else {
        console.log(`  ✓ Área encontrada: ${almacenPrincipal.name} (${almacenPrincipal.id})`);
    }

    // Centro de Producción
    let centroProduccion = await prisma.area.findFirst({
        where: {
            OR: [
                { name: { contains: 'PRODUCCION', mode: 'insensitive' } },
                { name: { contains: 'PRODUCCIÓN', mode: 'insensitive' } }
            ]
        }
    });
    if (!centroProduccion) {
        centroProduccion = await prisma.area.create({
            data: { name: 'Centro de Producción', isActive: true }
        });
        console.log('  ✓ Área "Centro de Producción" creada');
    } else {
        console.log(`  ✓ Área encontrada: ${centroProduccion.name} (${centroProduccion.id})`);
    }

    console.log('');

    // ============================================================
    // FASE 3: CARGAR INVENTARIO DE ALMACÉN PRINCIPAL
    // ============================================================
    const almacenPath = path.join(folderPath, ALMACEN_FILE);
    console.log(`📦 FASE 3: Cargando inventario de Almacén Principal...`);
    console.log(`   Archivo: ${almacenPath}\n`);

    const almacenItems = parseExcelFile(almacenPath);
    console.log(`   ${almacenItems.length} items encontrados en el archivo\n`);

    await importInventory(almacenItems, almacenPrincipal.id, 'Almacén Principal');

    // ============================================================
    // FASE 4: CARGAR INVENTARIO DE CENTRO DE PRODUCCIÓN
    // ============================================================
    const produccionPath = path.join(folderPath, PRODUCCION_FILE);
    console.log(`\n🏭 FASE 4: Cargando inventario de Centro de Producción...`);
    console.log(`   Archivo: ${produccionPath}\n`);

    const produccionItems = parseExcelFile(produccionPath);
    console.log(`   ${produccionItems.length} items encontrados en el archivo\n`);

    await importInventory(produccionItems, centroProduccion.id, 'Centro de Producción');

    // ============================================================
    // RESUMEN FINAL
    // ============================================================
    console.log('\n================================================');
    console.log('✨ IMPORTACIÓN COMPLETADA EXITOSAMENTE');
    console.log('================================================');

    const totalLocations = await prisma.inventoryLocation.count();
    const totalItems = await prisma.inventoryItem.count();
    console.log(`\n📊 Resumen:`);
    console.log(`   - Items en catálogo: ${totalItems}`);
    console.log(`   - Ubicaciones con stock: ${totalLocations}`);
    console.log(`\n🎯 El sistema está listo para operar desde hoy.`);
}

async function importInventory(items: ExcelRow[], areaId: string, areaName: string) {
    // Cargar cache de items existentes
    const allItems = await prisma.inventoryItem.findMany({
        select: { id: true, name: true, sku: true }
    });
    const itemMap = new Map(allItems.map(i => [normalize(i.name), i]));
    const existingSkus = new Set(allItems.map(i => i.sku));
    const skuCounters: Record<string, number> = {};

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of items) {
        const normalizedName = normalize(item.name);
        let existingItem = itemMap.get(normalizedName);

        // Intentar match por SKU también
        if (!existingItem) {
            existingItem = allItems.find(i => normalize(i.sku) === normalizedName);
        }

        let itemId: string;

        if (existingItem) {
            // Item existe, actualizar categoría y unidad
            await prisma.inventoryItem.update({
                where: { id: existingItem.id },
                data: {
                    baseUnit: item.unit,
                    category: item.category,
                    isActive: true
                }
            });
            itemId = existingItem.id;
            updated++;
        } else {
            // Crear nuevo item
            const catPrefix = item.category.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'GEN';
            let sku = '';
            let attempts = 0;
            do {
                if (!skuCounters[catPrefix]) skuCounters[catPrefix] = 0;
                skuCounters[catPrefix]++;
                sku = `${catPrefix}-${skuCounters[catPrefix].toString().padStart(3, '0')}`;
                attempts++;
            } while (existingSkus.has(sku) && attempts < 1000);

            try {
                const newItem = await prisma.inventoryItem.create({
                    data: {
                        name: item.name,
                        sku: sku,
                        type: 'RAW_MATERIAL',
                        baseUnit: item.unit,
                        category: item.category,
                        isActive: true
                    }
                });
                itemId = newItem.id;
                existingSkus.add(sku);
                itemMap.set(normalizedName, newItem);
                created++;
            } catch (err) {
                console.log(`   ⚠️ Error creando item: ${item.name}`);
                skipped++;
                continue;
            }
        }

        // Crear ubicación con stock (solo si cantidad > 0)
        if (item.quantity > 0) {
            await prisma.inventoryLocation.upsert({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: itemId,
                        areaId: areaId
                    }
                },
                create: {
                    inventoryItemId: itemId,
                    areaId: areaId,
                    currentStock: item.quantity,
                    lastCountDate: new Date()
                },
                update: {
                    currentStock: item.quantity,
                    lastCountDate: new Date()
                }
            });
        }
    }

    console.log(`   📝 ${areaName}:`);
    console.log(`      - Nuevos items creados: ${created}`);
    console.log(`      - Items actualizados: ${updated}`);
    if (skipped > 0) console.log(`      - Items omitidos: ${skipped}`);
}

main()
    .catch(e => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
