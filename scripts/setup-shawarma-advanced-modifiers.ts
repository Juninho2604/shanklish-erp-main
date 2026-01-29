
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🥙 Configurando Modificadores Avanzados de Shawarma...');

    // 1. Definir Modificadores de Estilo (Full Proteína) por Tamaño
    // No podemos usar un solo modificador porque el precio varia.
    // Crearemos 3 grupos especificos o modifiers especificos.
    // Estrategia: Crear modificadores sueltos y asignarlos dinamicamente.

    // Vamos a crear Grupos ESPECIFICOS por tamaño para el "Estilo Full Proteina"
    // Porque un ModifierGroup se asigna a un Item.

    const sizes = [
        { key: '250', name: 'Pequeño', price: 1.0 },
        { key: '350', name: 'Mediano', price: 2.0 },
        { key: '500', name: 'Grande', price: 4.0 },
    ];

    const styleGroups = {};

    for (const size of sizes) {
        const groupName = `Estilo (Shawarma ${size.name})`;
        let group = await prisma.menuModifierGroup.findFirst({ where: { name: groupName } });

        if (!group) {
            group = await prisma.menuModifierGroup.create({
                data: {
                    name: groupName,
                    minSelections: 0, maxSelections: 1, isRequired: false,
                    modifiers: {
                        create: [
                            { name: '🔥 FULL PROTEÍNA (Solo Carne/Pollo)', priceAdjustment: size.price },
                        ]
                    }
                }
            });
        } else {
            // Asegurar precio correcto si ya existe
            const mod = await prisma.menuModifier.findFirst({ where: { groupId: group.id, name: { contains: 'FULL' } } });
            if (mod) await prisma.menuModifier.update({ where: { id: mod.id }, data: { priceAdjustment: size.price } });
        }
        styleGroups[size.key] = group.id;
    }

    // 2. Grupo Global: Mix & Match (Sustitución de Proteína)
    let mixGroup = await prisma.menuModifierGroup.findFirst({ where: { name: 'Sustitución de Proteína' } });
    if (!mixGroup) {
        mixGroup = await prisma.menuModifierGroup.create({
            data: {
                name: 'Sustitución de Proteína',
                description: 'Sustituye parte de la base para mantener el peso',
                minSelections: 0, maxSelections: 3, isRequired: false,
                modifiers: {
                    create: [
                        { name: 'Con Kibbe Crudo', priceAdjustment: 0 },
                        { name: 'Con Kibbe Frito', priceAdjustment: 0 },
                        { name: 'Con Falafel', priceAdjustment: 0 },
                        { name: 'Con Kafta', priceAdjustment: 0 }
                    ]
                }
            }
        });
    }

    // 3. Grupo Global: Salsas y Extras (Gratis)
    // Actualizamos el grupo 'Preferencias' creado antes para asegurar precios 0
    let prefGroup = await prisma.menuModifierGroup.findFirst({ where: { name: 'Preferencias' } });
    if (prefGroup) {
        // Actualizar todos los modifiers de este grupo a 0
        await prisma.menuModifier.updateMany({
            where: { groupId: prefGroup.id },
            data: { priceAdjustment: 0 }
        });
        // Asegurar que estén las opciones de Salsas extras si faltan
        const extras = ['Extra Salsa de Ajo', 'Extra Salsa Picante', 'Mucha Salsa', 'Poca Salsa'];
        for (const extra of extras) {
            const exists = await prisma.menuModifier.findFirst({ where: { groupId: prefGroup.id, name: extra } });
            if (!exists) {
                await prisma.menuModifier.create({
                    data: { name: extra, priceAdjustment: 0, groupId: prefGroup.id }
                });
            }
        }
    }

    // 4. Asignar a los Productos
    const items = await prisma.menuItem.findMany({
        where: {
            OR: [
                { name: { contains: 'Shawarma', mode: 'insensitive' } },
                { name: { contains: 'Shakifel', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`🎯 Procesando ${items.length} Shawarmas...`);

    for (const item of items) {
        // Asignar MixGroup y PrefGroup (Siempre)
        if (mixGroup) {
            await prisma.menuItemModifierGroup.upsert({
                where: { menuItemId_modifierGroupId: { menuItemId: item.id, modifierGroupId: mixGroup.id } },
                create: { menuItemId: item.id, modifierGroupId: mixGroup.id },
                update: {}
            });
        }

        // Asignar Estilo Full Proteina SEGUN TAMAÑO
        let sizeKey = null;
        if (item.name.includes('250')) sizeKey = '250';
        else if (item.name.includes('350')) sizeKey = '350';
        else if (item.name.includes('500')) sizeKey = '500';

        if (sizeKey && styleGroups[sizeKey]) {
            const groupId = styleGroups[sizeKey];
            await prisma.menuItemModifierGroup.upsert({
                where: { menuItemId_modifierGroupId: { menuItemId: item.id, modifierGroupId: groupId } },
                create: { menuItemId: item.id, modifierGroupId: groupId },
                update: {}
            });
            console.log(`   + ${item.name}: Asignado Full Proteína ($${sizes.find(s => s.key === sizeKey).price})`);
        }
    }

    console.log('✅ Configuración Avanzada Completada.');
}

main().finally(() => prisma.$disconnect());
