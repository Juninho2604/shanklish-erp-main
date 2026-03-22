
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔧 Actualizando menú con correcciones...')

    // 1. SEPARAR SHAWARMA CARNE Y MIXTO
    // Primero eliminamos el combinado
    await prisma.menuItem.deleteMany({
        where: { sku: { startsWith: 'SHW-CM-' } }
    }).catch(() => { });

    // Crear Shawarma de Carne (separado)
    const shawarmasCarne = [
        { sku: 'SHW-CARNE-500', name: 'Shawarma Carne 500gr', price: 19.50, categoryId: 'cat-shawarmas' },
        { sku: 'SHW-CARNE-350', name: 'Shawarma Carne 350gr', price: 15.00, categoryId: 'cat-shawarmas' },
        { sku: 'SHW-CARNE-250', name: 'Shawarma Carne 250gr', price: 10.50, categoryId: 'cat-shawarmas' },
    ];

    // Crear Shawarma Mixto (separado)
    const shawarmasMixto = [
        { sku: 'SHW-MIXTO-500', name: 'Shawarma Mixto 500gr', price: 19.50, categoryId: 'cat-shawarmas' },
        { sku: 'SHW-MIXTO-350', name: 'Shawarma Mixto 350gr', price: 15.00, categoryId: 'cat-shawarmas' },
        { sku: 'SHW-MIXTO-250', name: 'Shawarma Mixto 250gr', price: 10.50, categoryId: 'cat-shawarmas' },
    ];

    for (const item of [...shawarmasCarne, ...shawarmasMixto]) {
        await prisma.menuItem.upsert({
            where: { sku: item.sku },
            update: { name: item.name, price: item.price },
            create: item
        });
    }
    console.log('✅ Shawarmas Carne y Mixto separados');

    // 2. CREAR CATEGORÍA COMBOS/TABLAS
    await prisma.menuCategory.upsert({
        where: { id: 'cat-combos' },
        update: {},
        create: {
            id: 'cat-combos',
            name: 'Tablas y Combos',
            description: 'Tablas para compartir y Arma tu Shanklish',
            sortOrder: 0 // Primero en la lista
        }
    });

    // 3. CREAR TABLAS
    const tablas = [
        {
            sku: 'TABLA-X1',
            name: 'Tabla x1',
            price: 35.00, // Precio estimado, ajustar
            categoryId: 'cat-combos',
            description: '3 principales, 2 cremas, 1 shanklish, 1 ensalada y pan'
        },
        {
            sku: 'TABLA-X2',
            name: 'Tabla x2',
            price: 55.00, // Precio estimado
            categoryId: 'cat-combos',
            description: '3 principales, 2 cremas, 1 shanklish, 1 ensalada y pan'
        },
        {
            sku: 'TABLA-X4',
            name: 'Tabla x4',
            price: 85.00, // Precio estimado
            categoryId: 'cat-combos',
            description: '3 principales, 4 cremas, 2 shanklish, 1 ensalada y pan'
        },
    ];

    for (const item of tablas) {
        await prisma.menuItem.upsert({
            where: { sku: item.sku },
            update: { name: item.name, price: item.price },
            create: {
                sku: item.sku,
                name: item.name,
                price: item.price,
                categoryId: item.categoryId,
                description: item.description
            }
        });
    }
    console.log('✅ Tablas creadas');

    // 4. ARMA TU SHANKLISH
    await prisma.menuItem.upsert({
        where: { sku: 'ARMA-SHANKLISH' },
        update: {},
        create: {
            sku: 'ARMA-SHANKLISH',
            name: 'Arma tu Shanklish',
            price: 15.00, // Precio base, ajustar
            categoryId: 'cat-combos',
            description: '1 principal (porción pequeña), 2 opciones (cremas/ensaladas/shanklish) y pan'
        }
    });
    console.log('✅ Arma tu Shanklish creado');

    // 5. CREAR GRUPO DE MODIFICADORES PARA SHAWARMAS
    const shawarmaModGroup = await prisma.menuModifierGroup.upsert({
        where: { id: 'mod-group-shawarma' },
        update: {},
        create: {
            id: 'mod-group-shawarma',
            name: 'Personaliza tu Shawarma',
            isRequired: false,
            maxSelections: 99
        }
    });

    // 6. MODIFICADORES DE SHAWARMA
    const shawarmaModifiers = [
        // Extra Proteína (CON COSTO)
        { id: 'mod-extra-prot-250', name: 'Extra Proteína 250gr', priceAdjustment: 1.00, groupId: shawarmaModGroup.id },
        { id: 'mod-extra-prot-350', name: 'Extra Proteína 350gr', priceAdjustment: 2.00, groupId: shawarmaModGroup.id },
        { id: 'mod-extra-prot-500', name: 'Extra Proteína 500gr', priceAdjustment: 4.00, groupId: shawarmaModGroup.id },

        // Ingredientes adicionales (SIN COSTO pero para inventario)
        { id: 'mod-add-kibbe-crudo', name: '+ Kibbe Crudo', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-add-falafel', name: '+ Falafel', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-add-kibbe-horn', name: '+ Kibbe Horneado', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-add-hummus', name: '+ Hummus', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-add-baba', name: '+ Babaganoush', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-add-muhammara', name: '+ Muhammara', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-add-shanklish', name: '+ Queso Shanklish', priceAdjustment: 0, groupId: shawarmaModGroup.id },

        // Opciones generales
        { id: 'mod-sin-cebolla', name: 'Sin Cebolla', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-sin-vegetales', name: 'Sin Vegetales', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-sin-tabule', name: 'Sin Tabulé', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-extra-salsa', name: 'Extra Salsa', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-con-tabule', name: 'Con Tabulé', priceAdjustment: 0, groupId: shawarmaModGroup.id },
        { id: 'mod-con-vegetales', name: 'Con Vegetales Salteados', priceAdjustment: 0, groupId: shawarmaModGroup.id },
    ];

    for (const mod of shawarmaModifiers) {
        await prisma.menuModifier.upsert({
            where: { id: mod.id },
            update: { name: mod.name, priceAdjustment: mod.priceAdjustment },
            create: mod
        });
    }
    console.log('✅ Modificadores de Shawarma creados');

    console.log('\n🎉 Actualización completada!');
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
