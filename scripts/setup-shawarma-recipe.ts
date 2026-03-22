import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🥙 Configurando Receta del Shawarma Mixto... v2');

    // 1. Buscar el item de menú "Shawarma Mixto"
    // Probamos buscar por SKU exacto si existe, o por nombre
    let menuItem = await prisma.menuItem.findFirst({
        where: { name: { contains: 'Mixto', mode: 'insensitive' } }
    });

    if (!menuItem) {
        console.log('⚠️ No encontré el "Shawarma Mixto". Creando uno de prueba...');
        // Crear categoría "Shawarmas" si hace falta
        const cat = await prisma.menuCategory.upsert({
            where: { id: 'cat-shawarmas' }, // Intentar usar ID fijo si es posible, o buscar
            update: {},
            create: { name: 'Shawarmas de Prueba', sortOrder: 10 }
        });

        menuItem = await prisma.menuItem.create({
            data: {
                name: 'Shawarma Mixto (Test)',
                sku: 'SH-MIX-TEST',
                categoryId: cat.id,
                price: 12.00,
                isAvailable: true
            }
        });
    }
    console.log(`✅ MenuItem: ${menuItem.name}`);

    // 2. Definir Insumos Requeridos
    const insumos = [
        { name: 'Pan de Shawarma', unit: 'UNIT', quantity: 1, type: 'RAW_MATERIAL' },
        { name: 'Pollo Marinado (Crudo)', unit: 'G', quantity: 80, type: 'RAW_MATERIAL' },
        { name: 'Carne Marinada (Cruda)', unit: 'G', quantity: 80, type: 'RAW_MATERIAL' },
        { name: 'Salsa de Ajo', unit: 'G', quantity: 30, type: 'SUB_RECIPE' }, // Podria ser raw
        { name: 'Tabule', unit: 'G', quantity: 80, type: 'SUB_RECIPE' },
        { name: 'Vegetales Salteados (Mix)', unit: 'G', quantity: 20, type: 'RAW_MATERIAL' },
    ];

    // 3. Crear Items de Inventario para los Ingredientes
    console.log('🔹 Creando Insumos...');

    // Crear el item "Virtual" que representa el producto terminado en Inventario
    // (Necesario porque la tabla Recipe requiere un outputItemId)
    const outputItem = await prisma.inventoryItem.upsert({
        where: { sku: 'INV-SH-MIXTO' },
        update: {},
        create: {
            sku: 'INV-SH-MIXTO',
            name: 'Shawarma Mixto (Terminado)',
            type: 'FINISHED_GOOD',
            baseUnit: 'UNIT',
            category: 'Productos Terminados'
        }
    });

    // Crear receta
    // Primero, limpiar receta previa para este output
    await prisma.recipe.deleteMany({ where: { outputItemId: outputItem.id } });

    const recipe = await prisma.recipe.create({
        data: {
            name: 'Receta POS Shawarma Mixto',
            outputItemId: outputItem.id,
            outputQuantity: 1,
            outputUnit: 'UNIT',
            isActive: true,
            version: 1
        }
    });

    // Crear y vincular ingredientes
    for (const item of insumos) {
        // Crear InventoryItem
        const invItem = await prisma.inventoryItem.upsert({
            where: { sku: `INV-${item.name.replace(/\s+/g, '-').toUpperCase()}` },
            update: {},
            create: {
                sku: `INV-${item.name.replace(/\s+/g, '-').toUpperCase()}`,
                name: item.name,
                baseUnit: item.unit,
                type: item.type,
                category: 'Ingredientes Shawarma',
            }
        });

        // Add to Recipe
        await prisma.recipeIngredient.create({
            data: {
                recipeId: recipe.id,
                ingredientItemId: invItem.id,
                quantity: item.quantity,
                unit: item.unit
            }
        });
        console.log(`   + Ingrediente: ${item.quantity}${item.unit} de ${item.name}`);
    }

    // 4. VINCULAR LA RECETA AL MENU ITEM
    await prisma.menuItem.update({
        where: { id: menuItem.id },
        data: { recipeId: recipe.id }
    });

    console.log(`✅ Receta ID ${recipe.id} vinculada al MenuItem ${menuItem.name}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
