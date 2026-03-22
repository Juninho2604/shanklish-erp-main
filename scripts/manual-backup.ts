
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('Iniciando respaldo de datos...');

    // Obtener ruta del escritorio
    const desktopPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop');
    const now = new Date();
    const dateStr = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    const filename = `BACKUP_SHANKLISH_ERP_${dateStr}.json`;
    const fullPath = path.join(desktopPath, filename);

    try {
        // Obtenemos todos los datos relevantes
        const backupData = {
            metadata: {
                date: new Date(),
                version: '1.0',
                note: 'Manual Backup'
            },
            data: {
                users: await prisma.user.findMany(),
                areas: await prisma.area.findMany(),
                inventoryItems: await prisma.inventoryItem.findMany(),
                recipes: await prisma.recipe.findMany({ include: { ingredients: true } }),
                // Incluimos transaccionales aunque estén vacíos por si acaso
                inventoryMovements: await prisma.inventoryMovement.findMany(),
                costHistory: await prisma.costHistory.findMany(),
                dailyInventories: await prisma.dailyInventory.findMany({ include: { items: true } }),
                productionOrders: await prisma.productionOrder.findMany(),
                salesOrders: await prisma.salesOrder.findMany({ include: { items: true } }),
            }
        };

        // Escribir archivo
        fs.writeFileSync(fullPath, JSON.stringify(backupData, null, 2));

        console.log(`✅ Respaldo guardado exitosamente en:\n${fullPath}`);

    } catch (error) {
        console.error('❌ Error creando respaldo:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
