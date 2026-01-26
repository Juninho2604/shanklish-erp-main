import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Iniciando seed de datos...');

    // 1. Crear usuario administrador
    const admin = await prisma.user.upsert({
        where: { email: 'admin@shanklish.com' },
        update: {},
        create: {
            email: 'admin@shanklish.com',
            firstName: 'Omar',
            lastName: 'Administrador',
            role: 'OWNER',
            passwordHash: 'temp-hash', // En producción usar bcrypt
        },
    });
    console.log('✅ Usuario admin creado:', admin.email);

    // 2. Crear usuario auditor
    const auditor = await prisma.user.upsert({
        where: { email: 'auditor@shanklish.com' },
        update: {},
        create: {
            email: 'auditor@shanklish.com',
            firstName: 'Christian',
            lastName: 'Auditor',
            role: 'AUDITOR',
            passwordHash: 'temp-hash',
        },
    });
    console.log('✅ Usuario auditor creado:', auditor.email);

    // 3. Crear usuario chef
    const chef = await prisma.user.upsert({
        where: { email: 'victor@shanklish.com' },
        update: {},
        create: {
            email: 'victor@shanklish.com',
            firstName: 'Víctor',
            lastName: 'Chef',
            role: 'CHEF',
            passwordHash: 'temp-hash',
        },
    });
    console.log('✅ Usuario chef creado:', chef.email);

    // 4. Crear áreas
    const almacen = await prisma.area.upsert({
        where: { id: 'area-almacen' },
        update: {},
        create: {
            id: 'area-almacen',
            name: 'Almacén Principal',
            description: 'Almacén de insumos',
        },
    });

    const cocina = await prisma.area.upsert({
        where: { id: 'area-cocina' },
        update: {},
        create: {
            id: 'area-cocina',
            name: 'Cocina',
            description: 'Área de producción',
        },
    });
    console.log('✅ Áreas creadas');

    // 5. Crear insumos base
    const leche = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-LECHE-001' },
        update: {},
        create: {
            sku: 'INS-LECHE-001',
            name: 'Leche Entera',
            description: 'Leche fresca para quesos',
            type: 'RAW_MATERIAL',
            category: 'Lácteos',
            baseUnit: 'L',
            purchaseUnit: 'UNIT',
            conversionRate: 20, // 1 saco = 20 litros
            minimumStock: 50,
            reorderPoint: 100,
        },
    });

    const sal = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-SAL-001' },
        update: {},
        create: {
            sku: 'INS-SAL-001',
            name: 'Sal Fina',
            description: 'Sal de cocina',
            type: 'RAW_MATERIAL',
            category: 'Condimentos',
            baseUnit: 'KG',
            minimumStock: 5,
            reorderPoint: 10,
        },
    });

    const zaatar = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-ZAATAR-001' },
        update: {},
        create: {
            sku: 'INS-ZAATAR-001',
            name: "Za'atar",
            description: 'Mezcla de especias libanesa',
            type: 'RAW_MATERIAL',
            category: 'Especias',
            baseUnit: 'KG',
            minimumStock: 1,
            reorderPoint: 2,
        },
    });
    console.log('✅ Insumos creados');

    // 6. Crear stock inicial
    await prisma.inventoryLocation.upsert({
        where: { inventoryItemId_areaId: { inventoryItemId: leche.id, areaId: almacen.id } },
        update: { currentStock: 200 },
        create: {
            inventoryItemId: leche.id,
            areaId: almacen.id,
            currentStock: 200, // 200 litros
        },
    });

    await prisma.inventoryLocation.upsert({
        where: { inventoryItemId_areaId: { inventoryItemId: sal.id, areaId: almacen.id } },
        update: { currentStock: 25 },
        create: {
            inventoryItemId: sal.id,
            areaId: almacen.id,
            currentStock: 25, // 25 kg
        },
    });

    await prisma.inventoryLocation.upsert({
        where: { inventoryItemId_areaId: { inventoryItemId: zaatar.id, areaId: almacen.id } },
        update: { currentStock: 5 },
        create: {
            inventoryItemId: zaatar.id,
            areaId: almacen.id,
            currentStock: 5, // 5 kg
        },
    });
    console.log('✅ Stock inicial creado');

    // 7. Crear costos iniciales
    await prisma.costHistory.upsert({
        where: { id: 'cost-leche-1' },
        update: {},
        create: {
            id: 'cost-leche-1',
            inventoryItemId: leche.id,
            costPerUnit: 2.50, // $2.50 por litro
            currency: 'USD',
            reason: 'Costo inicial',
            createdById: admin.id,
        },
    });

    await prisma.costHistory.upsert({
        where: { id: 'cost-sal-1' },
        update: {},
        create: {
            id: 'cost-sal-1',
            inventoryItemId: sal.id,
            costPerUnit: 0.80, // $0.80 por kg
            currency: 'USD',
            reason: 'Costo inicial',
            createdById: admin.id,
        },
    });

    await prisma.costHistory.upsert({
        where: { id: 'cost-zaatar-1' },
        update: {},
        create: {
            id: 'cost-zaatar-1',
            inventoryItemId: zaatar.id,
            costPerUnit: 25.00, // $25 por kg
            currency: 'USD',
            reason: 'Costo inicial',
            createdById: admin.id,
        },
    });
    console.log('✅ Costos iniciales creados');

    // 8. Crear sub-receta (Cuajada)
    const cuajada = await prisma.inventoryItem.upsert({
        where: { sku: 'SUB-CUAJADA-001' },
        update: {},
        create: {
            sku: 'SUB-CUAJADA-001',
            name: 'Cuajada Base',
            description: 'Base para shanklish',
            type: 'SUB_RECIPE',
            category: 'Sub-recetas',
            baseUnit: 'KG',
            minimumStock: 5,
            reorderPoint: 10,
        },
    });

    const recetaCuajada = await prisma.recipe.upsert({
        where: { id: 'recipe-cuajada-1' },
        update: {},
        create: {
            id: 'recipe-cuajada-1',
            name: 'Cuajada Base',
            description: 'Cuajada tradicional para shanklish',
            outputItemId: cuajada.id,
            outputQuantity: 2, // Rinde 2 kg
            outputUnit: 'KG',
            yieldPercentage: 95,
            prepTime: 30,
            cookTime: 60,
            isApproved: true,
        },
    });

    // Ingredientes de la cuajada
    await prisma.recipeIngredient.upsert({
        where: { recipeId_ingredientItemId: { recipeId: recetaCuajada.id, ingredientItemId: leche.id } },
        update: {},
        create: {
            recipeId: recetaCuajada.id,
            ingredientItemId: leche.id,
            quantity: 10, // 10 litros de leche
            unit: 'L',
            wastePercentage: 0,
            sortOrder: 1,
        },
    });

    await prisma.recipeIngredient.upsert({
        where: { recipeId_ingredientItemId: { recipeId: recetaCuajada.id, ingredientItemId: sal.id } },
        update: {},
        create: {
            recipeId: recetaCuajada.id,
            ingredientItemId: sal.id,
            quantity: 0.02, // 20g de sal
            unit: 'KG',
            wastePercentage: 0,
            sortOrder: 2,
        },
    });
    console.log('✅ Receta de Cuajada creada');

    console.log('🎉 Seed completado exitosamente!');
}

main()
    .catch((e) => {
        console.error('❌ Error en seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
