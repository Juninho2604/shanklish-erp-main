const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCremaAjo() {
    // Buscar el item
    const item = await prisma.inventoryItem.findFirst({
        where: { name: { contains: 'CREMA DE AJO', mode: 'insensitive' } }
    });

    if (!item) {
        console.log('❌ No encontré el item "CREMA DE AJO"');
        await prisma.$disconnect();
        return;
    }

    console.log('Item encontrado:');
    console.log(`  - Nombre: ${item.name}`);
    console.log(`  - Tipo actual: ${item.type}`);
    console.log(`  - Categoría actual: ${item.category}`);

    // Actualizar a SUBRECETA con categoría SALSAS
    const updated = await prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
            type: 'SUBRECETA',  // Cambiado de PRODUCTO
            category: 'SALSAS'
        }
    });

    console.log('\n✅ Actualizado:');
    console.log(`  - Tipo nuevo: ${updated.type}`);
    console.log(`  - Categoría nueva: ${updated.category}`);

    await prisma.$disconnect();
}

fixCremaAjo();
