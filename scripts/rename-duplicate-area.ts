
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log('Renombrando áreas para identificar duplicados...');

    // 1. Asegurar nombre del área principal de sistema
    const systemArea = await prisma.area.findUnique({ where: { id: 'area-restaurante' } });
    if (systemArea) {
        await prisma.area.update({
            where: { id: 'area-restaurante' },
            data: { name: 'Restaurante Principal' }
        });
        console.log('✅ "area-restaurante" renombrado a "Restaurante Principal"');
    }

    // 2. Buscar otros restaurantes y etiquetarlos
    const others = await prisma.area.findMany({
        where: {
            name: { contains: 'Restaurante', mode: 'insensitive' },
            id: { not: 'area-restaurante' }
        }
    });

    for (const area of others) {
        if (!area.name.includes('Legacy')) {
            await prisma.area.update({
                where: { id: area.id },
                data: { name: `${area.name} (Duplicado)` }
            });
            console.log(`⚠️ Renombrado duplicado [${area.id}] a "${area.name} (Duplicado)"`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
