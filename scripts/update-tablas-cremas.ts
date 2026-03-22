
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Actualizando opciones de Cremas para las Tablas...');

    // Lista Maestra de Cremas para Tablas
    const cremas = [
        { name: 'Hummus', priceAdjustment: 0 },
        { name: 'Babaganoush', priceAdjustment: 0 },
        { name: 'Crema de Ajo', priceAdjustment: 0 },
        { name: 'Crema de Pimentón', priceAdjustment: 0 },
        { name: 'Labneh', priceAdjustment: 0 },
        { name: 'Crema Shanklish', priceAdjustment: 0 }, // Especialidad
    ];

    // Buscar los grupos de modificadores de Cremas de todas las tablas
    const groupsToUpdate = await prisma.menuModifierGroup.findMany({
        where: {
            name: { contains: 'Cremas (Tabla' }
        },
        include: { modifiers: true }
    });

    console.log(`📋 Encontrados ${groupsToUpdate.length} grupos de cremas para actualizar.`);

    for (const group of groupsToUpdate) {
        console.log(`🔹 Actualizando grupo: "${group.name}"...`);

        for (const cremaData of cremas) {
            // Verificar si ya existe en el grupo
            const exists = group.modifiers.find(m => m.name === cremaData.name);

            if (!exists) {
                console.log(`   + Agregando "${cremaData.name}" al grupo.`);
                await prisma.menuModifier.create({
                    data: {
                        name: cremaData.name,
                        priceAdjustment: cremaData.priceAdjustment,
                        sortOrder: 0,
                        isAvailable: true,
                        groupId: group.id
                    }
                });
            } else {
                console.log(`   ✓ "${cremaData.name}" ya existe.`);
            }
        }
    }

    console.log('✅ Actualización de Cremas completada.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
