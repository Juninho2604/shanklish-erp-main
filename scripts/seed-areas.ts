
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🏗️ Verificando áreas del sistema...');

    // 1. Restaurante
    let restArea = await prisma.area.findFirst({
        where: { name: { contains: 'Restaurante', mode: 'insensitive' } }
    });

    if (!restArea) {
        console.log('⚠️ Área "Restaurante" no encontrada. Creando...');
        restArea = await prisma.area.create({
            data: {
                name: 'Salón Principal (Restaurante)',
                isActive: true
            }
        });
        console.log('✅ Área Restaurante creada:', restArea.id);
    } else {
        console.log('✅ Área Restaurante ya existe:', restArea.id);
    }

    // 2. Delivery
    const delivArea = await prisma.area.findFirst({
        where: { name: { contains: 'Delivery', mode: 'insensitive' } }
    });

    if (!delivArea) {
        await prisma.area.create({
            data: {
                name: 'Zona Delivery',
                isActive: true
            }
        });
        console.log('✅ Área Delivery creada.');
    }

    console.log('🏁 Reparación de áreas completada.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
