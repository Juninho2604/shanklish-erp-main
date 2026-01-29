
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🥙 Restaurando Modificadores de Shawarma...');

    // 1. Grupo: Tipo de Pan
    let groupPan = await prisma.menuModifierGroup.findFirst({ where: { name: 'Tipo de Pan' } });
    if (!groupPan) {
        groupPan = await prisma.menuModifierGroup.create({
            data: {
                name: 'Tipo de Pan',
                isRequired: true, minSelections: 1, maxSelections: 1,
                modifiers: {
                    create: [
                        { name: 'Pan Árabe', priceAdjustment: 0 },
                        { name: 'Pan Samoon', priceAdjustment: 0 }
                    ]
                }
            }
        });
        console.log('✅ Grupo Creado: Tipo de Pan');
    }

    // 2. Grupo: Preferencias
    let groupPrefs = await prisma.menuModifierGroup.findFirst({ where: { name: 'Preferencias' } });
    if (!groupPrefs) {
        groupPrefs = await prisma.menuModifierGroup.create({
            data: {
                name: 'Preferencias',
                isRequired: false, minSelections: 0, maxSelections: 10,
                modifiers: {
                    create: [
                        { name: 'Sin Cebolla', priceAdjustment: 0 },
                        { name: 'Sin Tomate', priceAdjustment: 0 },
                        { name: 'Sin Perejil', priceAdjustment: 0 },
                        { name: 'Sin Nabos', priceAdjustment: 0 },
                        { name: 'Sin Salsas', priceAdjustment: 0 },
                        { name: 'Salsa Aparte', priceAdjustment: 0 },
                        { name: 'Extra Ajo', priceAdjustment: 0.5 },
                        { name: 'Extra Picante', priceAdjustment: 0 }
                    ]
                }
            }
        });
        console.log('✅ Grupo Creado: Preferencias');
    }

    // 3. Vincular a TODOS los Shawarmas/Shakifels
    const items = await prisma.menuItem.findMany({
        where: {
            OR: [
                { name: { contains: 'Shawarma', mode: 'insensitive' } },
                { name: { contains: 'Shakifel', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`📋 Vinculando a ${items.length} productos...`);

    for (const item of items) {
        // Vinculación Pan
        try {
            await prisma.menuItemModifierGroup.upsert({
                where: { menuItemId_modifierGroupId: { menuItemId: item.id, modifierGroupId: groupPan.id } },
                create: { menuItemId: item.id, modifierGroupId: groupPan.id },
                update: {}
            });
        } catch (e) { }

        // Vinculación Preferencias
        try {
            await prisma.menuItemModifierGroup.upsert({
                where: { menuItemId_modifierGroupId: { menuItemId: item.id, modifierGroupId: groupPrefs.id } },
                create: { menuItemId: item.id, modifierGroupId: groupPrefs.id },
                update: {}
            });
        } catch (e) { }
    }
    console.log('🏁 Restauración completada.');
}

main().finally(() => prisma.$disconnect());
