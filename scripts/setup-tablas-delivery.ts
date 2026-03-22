
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🍱 Configurando Tablas Especiales (x1, x2, x4)...');

    // 1. Definir las Tablas y sus reglas
    const tablaDefs = [
        {
            name: 'Tabla x1',
            desc: '3 principales, 2 cremas (75g), 1 shanklish (75g), 1 ensalada (75g), pan',
            numPrincipales: 3,
            numCremas: 2,
            numEnsaladas: 1
        },
        {
            name: 'Tabla x2',
            desc: '3 principales, 2 cremas (125g), 1 shanklish (125g), 1 ensalada (125g), pan',
            numPrincipales: 3,
            numCremas: 2,
            numEnsaladas: 1
        },
        {
            name: 'Tabla x4',
            desc: '3 principales, 4 cremas (250g), 2 shanklish (250g), 1 ensalada (250g), pan',
            numPrincipales: 3,
            numCremas: 4,
            numEnsaladas: 1
        }
    ];

    // Opciones Disponibles
    const opcionesPrincipales = [
        'Falafel', 'Kibbe Frito', 'Tabaquitos Repollo', 'Tabaquitos Uva', 'Arroz con Pollo'
    ];

    const opcionesCremas = [
        'Hummus', 'Babaganoush', 'Labneh', 'Crema de Pimentón'
    ];

    const opcionesEnsaladas = [
        'Tabule', 'Fattoush'
    ];

    // Buscar o Crear Categoría "Tablas y Combos"
    let cat = await prisma.menuCategory.findFirst({
        where: { name: { contains: 'Tablas', mode: 'insensitive' } }
    });

    if (!cat) {
        cat = await prisma.menuCategory.create({
            data: { name: 'Tablas y Combos', sortOrder: 1, isActive: true }
        });
    }

    // Procesar cada Tabla
    for (const def of tablaDefs) {
        console.log(`\n🔧 Procesando: ${def.name}`);

        // 1. Buscar o Crear Item
        let item = await prisma.menuItem.findFirst({
            where: { name: { contains: def.name, mode: 'insensitive' } }
        });

        if (!item) {
            item = await prisma.menuItem.create({
                data: {
                    name: def.name,
                    description: def.desc,
                    price: 25,
                    categoryId: cat.id,
                    isActive: true,
                    sku: `TABLA-${def.name.split('x')[1]}`
                }
            });
        } else {
            await prisma.menuItem.update({
                where: { id: item.id },
                data: { description: def.desc, isActive: true }
            });
        }

        // 2. LIMPIEZA: Identificar grupos actuales a través de la tabla pivote y eliminarlos
        // Primero borramos la relación pivote
        const relations = await prisma.menuItemModifierGroup.findMany({
            where: { menuItemId: item.id }
        });

        // Borramos relaciones
        await prisma.menuItemModifierGroup.deleteMany({
            where: { menuItemId: item.id }
        });

        // Opcional: Podríamos borrar los grupos huérfanos, pero por seguridad solo borramos relaciones ahora

        // 3. Crear Nuevos Grupos y Relacionarlos
        const groupsToCreate = [
            {
                name: `Principales (${def.name})`,
                min: def.numPrincipales,
                max: def.numPrincipales,
                opts: opcionesPrincipales
            },
            {
                name: `Cremas (${def.name})`,
                min: def.numCremas,
                max: def.numCremas,
                opts: opcionesCremas
            },
            {
                name: `Ensalada (${def.name})`,
                min: def.numEnsaladas,
                max: def.numEnsaladas,
                opts: opcionesEnsaladas
            }
        ];

        for (const gDef of groupsToCreate) {
            // Crear Grupo
            const group = await prisma.menuModifierGroup.create({
                data: {
                    name: gDef.name,
                    minSelections: gDef.min,
                    maxSelections: gDef.max,
                    isRequired: true,
                    modifiers: {
                        create: gDef.opts.map(opt => ({ name: opt, priceAdjustment: 0 }))
                    }
                }
            });

            // Crear Relación Pivote
            await prisma.menuItemModifierGroup.create({
                data: {
                    menuItemId: item.id,
                    modifierGroupId: group.id
                }
            });
        }

        console.log('   ✅ Configuración completada con pivotes.');
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
