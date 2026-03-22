const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetInventory() {
    console.log('Reseteando inventario...');

    const result = await prisma.inventoryLocation.updateMany({
        data: { currentStock: 0 }
    });

    console.log(`✅ ${result.count} ubicaciones reseteadas a stock 0`);

    await prisma.$disconnect();
}

resetInventory();
