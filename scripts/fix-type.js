const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixType() {
    const result = await prisma.inventoryItem.updateMany({
        where: { name: { contains: 'CREMA DE AJO', mode: 'insensitive' } },
        data: { type: 'SUB_RECIPE' }  // Valor correcto que espera la UI
    });

    console.log(`✅ ${result.count} item(s) actualizado(s) a tipo SUB_RECIPE`);

    // Verificar
    const item = await prisma.inventoryItem.findFirst({
        where: { name: { contains: 'CREMA DE AJO', mode: 'insensitive' } }
    });
    console.log(`Verificación: ${item?.name} -> type: ${item?.type}`);

    await prisma.$disconnect();
}

fixType();
