
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const criticalNames = [
    'Carne de shawarma',
    'Pollo de shawarma',
    'Falafel',
    'Kibbe frito',
    'Kibbe horneado', // Cubre 125 y 250
    'Kibbe Mini',
    'Carne de Hamburguesa',
    'Pinchos Pollo',
    'Pincho Carne',
    'Pincho Mixtos',
    'KAFTA',
    'Papas Fritas',
    'Pollo de Arroz',
    'Arroz Libanes',
    'Tomate',
    'Cebolla',
    'Perejil',
    'Trigo',
    'Crema de Garbanzos',
    'Crema de Pimenton',
    'Crema de Berenjena',
    'Carne de Crudo',
    'Proteina Mixta',
    'Sambusak',
    'Queso Shanklish',
    'Nuggets',
    'Tequeños',
    'Pastelitos Carne',
    'Pastelitos Pollo'
];

async function main() {
    console.log('🚨 Marcando items críticos...');

    let count = 0;

    for (const name of criticalNames) {
        // Encontrar items que contengan el nombre (case insensitive)
        const items = await prisma.inventoryItem.findMany({
            where: {
                name: { contains: name, mode: 'insensitive' },
                isActive: true
            }
        });

        if (items.length > 0) {
            console.log(`✅ "${name}" coincide con: [${items.map(i => i.name).join(', ')}]`);
            const update = await prisma.inventoryItem.updateMany({
                where: { id: { in: items.map(i => i.id) } },
                data: { isCritical: true }
            });
            count += update.count;
        } else {
            console.log(`⚠️ "${name}" -> No se encontró ningún item en inventario.`);
        }
    }
    console.log(`\n🏁 Proceso terminado. ${count} items marcados como críticos.`);
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
