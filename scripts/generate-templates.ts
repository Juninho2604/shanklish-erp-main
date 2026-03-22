
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('Generando planillas Excel para operación manual...');

    try {
        const desktopPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop');
        const filename = `PLANILLAS_OPERATIVAS_SHANKLISH_29-1-2026.xlsx`;
        const fullPath = path.join(desktopPath, filename);

        // Crear libro
        const wb = XLSX.utils.book_new();

        // 1. HOJA DE INVENTARIO (Con datos reales)
        const items = await prisma.inventoryItem.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });

        const inventoryData = items.map(item => ({
            'SKU (No Tocar)': item.sku,
            'Nombre del Item': item.name,
            'Tipo': item.type,
            'Unidad': item.baseUnit,
            'Conteo Físico (Cantidad)': '', // Espacio para llenar
            'Ubicación/Area': '',
            'Observaciones': ''
        }));

        const wsInventory = XLSX.utils.json_to_sheet(inventoryData);
        // Ajustar ancho de columnas
        wsInventory['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsInventory, "Toma de Inventario");

        // 2. HOJA DE VENTAS (Formato vacío)
        const salesHeaders = [
            { 'Fecha': '', 'Hora': '', 'Mesero/Cajero': '', 'Nombre Plato': '', 'Cantidad': '', 'Mesa/Cliente': '', 'Notas': '' }
        ];
        const wsSales = XLSX.utils.json_to_sheet(salesHeaders);
        wsSales['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsSales, "Registro de Ventas");

        // 3. HOJA DE PRODUCCIÓN (Con lista de recetas para referencia)
        const recipes = await prisma.recipe.findMany({
            where: { isActive: true },
            include: { outputItem: true }
        });

        // Creamos una lista de referencia al lado o en los datos
        const productionData = [
            { 'Fecha': '', 'Responsable': '', 'Nombre Receta': '', 'Unidad': '', 'Cantidad Producida': '', 'Lote/Ref': '' }
        ];

        const wsProduction = XLSX.utils.json_to_sheet(productionData);
        wsProduction['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];

        // Agregar lista de recetas disponibles como referencia visual en la hoja (más abajo)
        XLSX.utils.sheet_add_aoa(wsProduction, [['--- RECETAS DISPONIBLES (REFERENCIA) ---']], { origin: "H1" });
        const recipeList = recipes.map(r => [r.name, r.outputUnit]);
        XLSX.utils.sheet_add_aoa(wsProduction, recipeList, { origin: "H2" });

        XLSX.utils.book_append_sheet(wb, wsProduction, "Ordenes Produccion");

        // 4. HOJA DE MERMAS (Desperdicio)
        const wasteData = [
            { 'Fecha': '', 'Item/Ingrediente': '', 'Cantidad': '', 'Unidad': '', 'Causa (Vencido, Caida, etc)': '', 'Responsable': '' }
        ];
        const wsWaste = XLSX.utils.json_to_sheet(wasteData);
        wsWaste['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsWaste, "Registro de Mermas");

        // Escribir archivo
        XLSX.writeFile(wb, fullPath);

        console.log(`✅ Planillas Excel generadas exitosamente en:\n${fullPath}`);

    } catch (error) {
        console.error('❌ Error generando planillas:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
