
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Ocultando área duplicada...');

    // Buscar área marcada como duplicada
    const duplicate = await prisma.area.findFirst({
        where: {
            name: { contains: '(Duplicado)', mode: 'insensitive' }
        }
    });

    if (duplicate) {
        await prisma.area.update({
            where: { id: duplicate.id },
            data: { isActive: false }
        });
        console.log(`✅ Área "${duplicate.name}" desactivada (isActive: false).`);
    } else {
        console.log('⚠️ No se encontró un área marcada como "(Duplicado)".');
        // Buscar si existe otro RESTAURANTE que no sea el principal
        const other = await prisma.area.findFirst({
            where: {
                name: { contains: 'Restaurante', mode: 'insensitive' },
                id: { not: 'area-restaurante' },
                isActive: true
            }
        });
        if (other && !other.name.includes('Principal')) {
            await prisma.area.update({
                where: { id: other.id },
                data: { isActive: false, name: `${other.name} (Archivado)` }
            });
            console.log(`✅ Área redundante "${other.name}" desactivada y renombrada.`);
        }
    }
}

main().finally(() => prisma.$disconnect());
