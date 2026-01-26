/**
 * SHANKLISH CARACAS ERP - Seed Data
 * 
 * Datos iniciales realistas para desarrollo y testing
 * Ejecutar con: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Iniciando seed de Shanklish Caracas ERP...\n');

    // ============================================================================
    // 1. ÁREAS
    // ============================================================================
    console.log('📍 Creando áreas...');

    const areas = await Promise.all([
        prisma.area.upsert({
            where: { name: 'Cocina Principal' },
            update: {},
            create: { name: 'Cocina Principal', description: 'Área principal de producción' },
        }),
        prisma.area.upsert({
            where: { name: 'Almacén Seco' },
            update: {},
            create: { name: 'Almacén Seco', description: 'Almacenamiento de insumos secos' },
        }),
        prisma.area.upsert({
            where: { name: 'Cuarto Frío' },
            update: {},
            create: { name: 'Cuarto Frío', description: 'Refrigeración y congelación' },
        }),
    ]);

    const [cocinaPrincipal, almacenSeco, cuartoFrio] = areas;

    // ============================================================================
    // 2. USUARIOS
    // ============================================================================
    console.log('👥 Creando usuarios...');

    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@shanklish.com' },
        update: {},
        create: {
            email: 'admin@shanklish.com',
            passwordHash: '$2b$10$placeholder', // En producción usar bcrypt
            firstName: 'Omar',
            lastName: 'Admin',
            role: 'OWNER',
            phone: '+58 412 1234567',
        },
    });

    const chefUser = await prisma.user.upsert({
        where: { email: 'chef@shanklish.com' },
        update: {},
        create: {
            email: 'chef@shanklish.com',
            passwordHash: '$2b$10$placeholder',
            firstName: 'Carlos',
            lastName: 'Chef',
            role: 'CHEF',
            areaId: cocinaPrincipal.id,
        },
    });

    // ============================================================================
    // 3. PROVEEDORES
    // ============================================================================
    console.log('🏪 Creando proveedores...');

    const proveedorLacteos = await prisma.supplier.upsert({
        where: { id: 'supplier-lacteos' },
        update: {},
        create: {
            id: 'supplier-lacteos',
            name: 'Lácteos del Valle',
            contactName: 'María González',
            phone: '+58 414 9876543',
            email: 'ventas@lacteoselvalle.com',
            taxId: 'J-12345678-9',
        },
    });

    const proveedorCarnes = await prisma.supplier.upsert({
        where: { id: 'supplier-carnes' },
        update: {},
        create: {
            id: 'supplier-carnes',
            name: 'Carnicería Premium',
            contactName: 'José Rodríguez',
            phone: '+58 412 5551234',
            taxId: 'J-98765432-1',
        },
    });

    const proveedorEspecias = await prisma.supplier.upsert({
        where: { id: 'supplier-especias' },
        update: {},
        create: {
            id: 'supplier-especias',
            name: 'Especias Arabia',
            contactName: 'Ahmed Hassan',
            phone: '+58 416 7778899',
            email: 'pedidos@especiasarabia.com',
        },
    });

    // ============================================================================
    // 4. INSUMOS BASE (RAW_MATERIAL)
    // ============================================================================
    console.log('📦 Creando insumos base...');

    // LECHE (se compra en sacos/sachets pero se usa en litros)
    const leche = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-LECHE-001' },
        update: {},
        create: {
            sku: 'INS-LECHE-001',
            name: 'Leche Entera',
            description: 'Leche entera pasteurizada para elaboración de quesos',
            type: 'RAW_MATERIAL',
            baseUnit: 'L',           // Se almacena en litros
            purchaseUnit: 'UNIT',    // Se compra por saco/unidad
            conversionRate: 20,      // 1 saco = 20 litros
            minimumStock: 100,
            reorderPoint: 50,
            shelfLifeDays: 7,
            storageTemp: 'Refrigerado',
            category: 'Lácteos',
            primarySupplierId: proveedorLacteos.id,
        },
    });

    // SAL
    const sal = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-SAL-001' },
        update: {},
        create: {
            sku: 'INS-SAL-001',
            name: 'Sal Fina',
            description: 'Sal fina de mesa para sazonado',
            type: 'RAW_MATERIAL',
            baseUnit: 'KG',
            purchaseUnit: 'KG',
            conversionRate: 1,
            minimumStock: 10,
            reorderPoint: 5,
            storageTemp: 'Ambiente',
            category: 'Condimentos',
        },
    });

    // ZA'ATAR
    const zaatar = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-ZAATAR-001' },
        update: {},
        create: {
            sku: 'INS-ZAATAR-001',
            name: "Za'atar",
            description: 'Mezcla de especias árabes (tomillo, sumac, sésamo)',
            type: 'RAW_MATERIAL',
            baseUnit: 'KG',
            purchaseUnit: 'KG',
            conversionRate: 1,
            minimumStock: 5,
            reorderPoint: 2,
            storageTemp: 'Ambiente',
            category: 'Especias',
            primarySupplierId: proveedorEspecias.id,
        },
    });

    // CARNE
    const carne = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-CARNE-001' },
        update: {},
        create: {
            sku: 'INS-CARNE-001',
            name: 'Carne de Res Molida',
            description: 'Carne de res molida magra para kibbe y hamburguesas',
            type: 'RAW_MATERIAL',
            baseUnit: 'KG',
            purchaseUnit: 'KG',
            conversionRate: 1,
            minimumStock: 20,
            reorderPoint: 10,
            shelfLifeDays: 3,
            storageTemp: 'Refrigerado',
            category: 'Carnes',
            primarySupplierId: proveedorCarnes.id,
        },
    });

    // Insumos adicionales necesarios para las recetas
    const trigoBurgol = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-BURGOL-001' },
        update: {},
        create: {
            sku: 'INS-BURGOL-001',
            name: 'Trigo Burgol',
            description: 'Trigo bulgur fino para kibbe',
            type: 'RAW_MATERIAL',
            baseUnit: 'KG',
            minimumStock: 10,
            storageTemp: 'Ambiente',
            category: 'Granos',
        },
    });

    const cebolla = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-CEBOLLA-001' },
        update: {},
        create: {
            sku: 'INS-CEBOLLA-001',
            name: 'Cebolla Blanca',
            description: 'Cebolla blanca fresca',
            type: 'RAW_MATERIAL',
            baseUnit: 'KG',
            minimumStock: 5,
            shelfLifeDays: 14,
            storageTemp: 'Ambiente',
            category: 'Vegetales',
        },
    });

    const aceite = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-ACEITE-001' },
        update: {},
        create: {
            sku: 'INS-ACEITE-001',
            name: 'Aceite Vegetal',
            description: 'Aceite vegetal para fritura',
            type: 'RAW_MATERIAL',
            baseUnit: 'L',
            minimumStock: 20,
            storageTemp: 'Ambiente',
            category: 'Aceites',
        },
    });

    const merey = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-MEREY-001' },
        update: {},
        create: {
            sku: 'INS-MEREY-001',
            name: 'Merey (Semillas)',
            description: 'Semillas de merey/marañón para topping',
            type: 'RAW_MATERIAL',
            baseUnit: 'KG',
            minimumStock: 2,
            storageTemp: 'Ambiente',
            category: 'Frutos Secos',
        },
    });

    const panHamburguesa = await prisma.inventoryItem.upsert({
        where: { sku: 'INS-PAN-001' },
        update: {},
        create: {
            sku: 'INS-PAN-001',
            name: 'Pan de Hamburguesa',
            description: 'Pan brioche para hamburguesas',
            type: 'RAW_MATERIAL',
            baseUnit: 'UNIT',
            minimumStock: 50,
            shelfLifeDays: 5,
            storageTemp: 'Ambiente',
            category: 'Panadería',
        },
    });

    // ============================================================================
    // 5. SUB-RECETAS (Productos intermedios)
    // ============================================================================
    console.log('🧀 Creando sub-recetas (productos intermedios)...');

    // CUAJADA BASE (Item)
    const cuajadaBase = await prisma.inventoryItem.upsert({
        where: { sku: 'SUB-CUAJADA-001' },
        update: {},
        create: {
            sku: 'SUB-CUAJADA-001',
            name: 'Cuajada Base',
            description: 'Cuajada fresca base para elaboración de quesos',
            type: 'SUB_RECIPE',
            baseUnit: 'KG',
            minimumStock: 5,
            shelfLifeDays: 5,
            storageTemp: 'Refrigerado',
            category: 'Productos Intermedios',
        },
    });

    // Receta de Cuajada Base
    const recetaCuajada = await prisma.recipe.upsert({
        where: { outputItemId: cuajadaBase.id },
        update: {},
        create: {
            outputItemId: cuajadaBase.id,
            name: 'Cuajada Base',
            description: 'Proceso de cuajado de leche para base de quesos',
            instructions: '1. Calentar leche a 35°C\n2. Agregar sal\n3. Agregar cuajo\n4. Dejar reposar 45 min\n5. Cortar y drenar suero',
            outputQuantity: 2,     // 10L de leche producen 2kg de cuajada
            outputUnit: 'KG',
            yieldPercentage: 95,   // 5% de pérdida en el proceso
            prepTimeMinutes: 15,
            cookTimeMinutes: 0,
            restTimeMinutes: 45,
            isApproved: true,
            createdById: adminUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date(),
        },
    });

    // Ingredientes de Cuajada Base
    await prisma.recipeIngredient.createMany({
        skipDuplicates: true,
        data: [
            {
                recipeId: recetaCuajada.id,
                ingredientItemId: leche.id,
                quantity: 10,
                unit: 'L',
                wastePercentage: 0,
                sortOrder: 1,
            },
            {
                recipeId: recetaCuajada.id,
                ingredientItemId: sal.id,
                quantity: 0.02,
                unit: 'KG',
                wastePercentage: 0,
                sortOrder: 2,
            },
        ],
    });

    // BOLA DE SHANKLISH SECO (Item)
    const shanklishSeco = await prisma.inventoryItem.upsert({
        where: { sku: 'SUB-SHANK-001' },
        update: {},
        create: {
            sku: 'SUB-SHANK-001',
            name: 'Bola de Shanklish Seco',
            description: "Queso shanklish curado con za'atar, listo para servir",
            type: 'SUB_RECIPE',
            baseUnit: 'UNIT',      // Por bola individual
            minimumStock: 20,
            shelfLifeDays: 30,
            storageTemp: 'Refrigerado',
            category: 'Quesos',
        },
    });

    // Receta de Shanklish Seco
    const recetaShanklish = await prisma.recipe.upsert({
        where: { outputItemId: shanklishSeco.id },
        update: {},
        create: {
            outputItemId: shanklishSeco.id,
            name: 'Bola de Shanklish Seco',
            description: "Proceso de maduración y curado del queso con za'atar",
            instructions: "1. Formar bolas de 80g con cuajada\n2. Salar por fuera\n3. Secar 3 días\n4. Cubrir con za'atar\n5. Madurar 7 días",
            outputQuantity: 25,    // De 2kg de cuajada salen ~25 bolas de 80g
            outputUnit: 'UNIT',
            yieldPercentage: 90,   // Pérdida por secado
            prepTimeMinutes: 30,
            restTimeMinutes: 10080, // 7 días en minutos
            isApproved: true,
            createdById: adminUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date(),
        },
    });

    await prisma.recipeIngredient.createMany({
        skipDuplicates: true,
        data: [
            {
                recipeId: recetaShanklish.id,
                ingredientItemId: cuajadaBase.id,  // Usa la sub-receta anterior (recursivo)
                quantity: 2,
                unit: 'KG',
                wastePercentage: 5,
                sortOrder: 1,
            },
            {
                recipeId: recetaShanklish.id,
                ingredientItemId: zaatar.id,
                quantity: 0.3,
                unit: 'KG',
                wastePercentage: 10,
                notes: 'Para cubrir cada bola',
                sortOrder: 2,
            },
            {
                recipeId: recetaShanklish.id,
                ingredientItemId: sal.id,
                quantity: 0.05,
                unit: 'KG',
                wastePercentage: 0,
                sortOrder: 3,
            },
        ],
    });

    // MASA DE KIBBE (Item)
    const masaKibbe = await prisma.inventoryItem.upsert({
        where: { sku: 'SUB-KIBBE-001' },
        update: {},
        create: {
            sku: 'SUB-KIBBE-001',
            name: 'Masa de Kibbe',
            description: 'Masa base de carne y trigo para kibbe',
            type: 'SUB_RECIPE',
            baseUnit: 'KG',
            minimumStock: 5,
            shelfLifeDays: 2,
            storageTemp: 'Refrigerado',
            category: 'Masas',
        },
    });

    // Receta de Masa de Kibbe
    const recetaMasaKibbe = await prisma.recipe.upsert({
        where: { outputItemId: masaKibbe.id },
        update: {},
        create: {
            outputItemId: masaKibbe.id,
            name: 'Masa de Kibbe',
            description: 'Masa tradicional libanesa de carne y trigo burgol',
            instructions: '1. Remojar burgol 30 min\n2. Moler carne 2 veces\n3. Mezclar con burgol escurrido\n4. Agregar cebolla rallada\n5. Condimentar\n6. Procesar hasta obtener pasta homogénea',
            outputQuantity: 2.5,
            outputUnit: 'KG',
            yieldPercentage: 98,
            prepTimeMinutes: 45,
            isApproved: true,
            createdById: chefUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date(),
        },
    });

    await prisma.recipeIngredient.createMany({
        skipDuplicates: true,
        data: [
            {
                recipeId: recetaMasaKibbe.id,
                ingredientItemId: carne.id,
                quantity: 1.5,
                unit: 'KG',
                wastePercentage: 5,
                notes: 'Carne magra, sin grasa visible',
                sortOrder: 1,
            },
            {
                recipeId: recetaMasaKibbe.id,
                ingredientItemId: trigoBurgol.id,
                quantity: 0.5,
                unit: 'KG',
                wastePercentage: 0,
                sortOrder: 2,
            },
            {
                recipeId: recetaMasaKibbe.id,
                ingredientItemId: cebolla.id,
                quantity: 0.3,
                unit: 'KG',
                wastePercentage: 15,
                notes: 'Rallada finamente',
                sortOrder: 3,
            },
            {
                recipeId: recetaMasaKibbe.id,
                ingredientItemId: sal.id,
                quantity: 0.025,
                unit: 'KG',
                wastePercentage: 0,
                sortOrder: 4,
            },
        ],
    });

    // ============================================================================
    // 6. PRODUCTOS FINALES (FINISHED_GOOD)
    // ============================================================================
    console.log('🍽️ Creando productos finales...');

    // SHANKLISH CON MEREY
    const shanklishMerey = await prisma.inventoryItem.upsert({
        where: { sku: 'PROD-SHANK-MEREY-001' },
        update: {},
        create: {
            sku: 'PROD-SHANK-MEREY-001',
            name: 'Shanklish con Merey',
            description: 'Plato de shanklish desmenuzado con topping de merey tostado',
            type: 'FINISHED_GOOD',
            baseUnit: 'PORTION',
            category: 'Platos Principales',
        },
    });

    const recetaShanklishMerey = await prisma.recipe.upsert({
        where: { outputItemId: shanklishMerey.id },
        update: {},
        create: {
            outputItemId: shanklishMerey.id,
            name: 'Shanklish con Merey',
            description: 'Presentación final del shanklish con merey',
            instructions: '1. Desmenuzar 1 bola de shanklish\n2. Agregar aceite de oliva\n3. Tostar merey\n4. Decorar encima\n5. Servir con pan árabe',
            outputQuantity: 1,
            outputUnit: 'PORTION',
            yieldPercentage: 100,
            prepTimeMinutes: 5,
            isApproved: true,
            createdById: chefUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date(),
        },
    });

    await prisma.recipeIngredient.createMany({
        skipDuplicates: true,
        data: [
            {
                recipeId: recetaShanklishMerey.id,
                ingredientItemId: shanklishSeco.id, // Usa sub-receta
                quantity: 1,
                unit: 'UNIT',
                wastePercentage: 0,
                sortOrder: 1,
            },
            {
                recipeId: recetaShanklishMerey.id,
                ingredientItemId: merey.id,
                quantity: 0.03,
                unit: 'KG',
                wastePercentage: 5,
                notes: 'Tostado al momento',
                sortOrder: 2,
            },
        ],
    });

    // KIBBE FRITO
    const kibbeFrito = await prisma.inventoryItem.upsert({
        where: { sku: 'PROD-KIBBE-001' },
        update: {},
        create: {
            sku: 'PROD-KIBBE-001',
            name: 'Kibbe Frito',
            description: 'Croquetas de kibbe fritas doradas',
            type: 'FINISHED_GOOD',
            baseUnit: 'UNIT',
            category: 'Frituras',
        },
    });

    const recetaKibbeFrito = await prisma.recipe.upsert({
        where: { outputItemId: kibbeFrito.id },
        update: {},
        create: {
            outputItemId: kibbeFrito.id,
            name: 'Kibbe Frito (Unidad)',
            description: 'Kibbe frito individual',
            instructions: '1. Formar croqueta de 60g\n2. Rellenar si aplica\n3. Freír a 180°C por 4 min\n4. Escurrir y servir',
            outputQuantity: 40,     // De 2.5kg masa salen ~40 unidades
            outputUnit: 'UNIT',
            yieldPercentage: 92,    // Pérdida por fritura
            prepTimeMinutes: 10,
            cookTimeMinutes: 4,
            isApproved: true,
            createdById: chefUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date(),
        },
    });

    await prisma.recipeIngredient.createMany({
        skipDuplicates: true,
        data: [
            {
                recipeId: recetaKibbeFrito.id,
                ingredientItemId: masaKibbe.id, // Usa sub-receta
                quantity: 2.5,
                unit: 'KG',
                wastePercentage: 3,
                sortOrder: 1,
            },
            {
                recipeId: recetaKibbeFrito.id,
                ingredientItemId: aceite.id,
                quantity: 0.5,
                unit: 'L',
                wastePercentage: 0,
                notes: 'Para fritura profunda',
                sortOrder: 2,
            },
        ],
    });

    // ARAB BURGER
    const arabBurger = await prisma.inventoryItem.upsert({
        where: { sku: 'PROD-ARABBURG-001' },
        update: {},
        create: {
            sku: 'PROD-ARABBURG-001',
            name: 'Arab Burger',
            description: 'Hamburguesa estilo árabe con carne especiada',
            type: 'FINISHED_GOOD',
            baseUnit: 'UNIT',
            category: 'Hamburguesas',
        },
    });

    const recetaArabBurger = await prisma.recipe.upsert({
        where: { outputItemId: arabBurger.id },
        update: {},
        create: {
            outputItemId: arabBurger.id,
            name: 'Arab Burger',
            description: 'Hamburguesa con carne especiada estilo árabe',
            instructions: '1. Formar medallón de 150g de carne condimentada\n2. Cocinar a la plancha\n3. Armar con pan, vegetales y salsas\n4. Servir',
            outputQuantity: 1,
            outputUnit: 'UNIT',
            yieldPercentage: 95,
            prepTimeMinutes: 5,
            cookTimeMinutes: 8,
            isApproved: true,
            createdById: chefUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date(),
        },
    });

    await prisma.recipeIngredient.createMany({
        skipDuplicates: true,
        data: [
            {
                recipeId: recetaArabBurger.id,
                ingredientItemId: carne.id,
                quantity: 0.15,
                unit: 'KG',
                wastePercentage: 10,
                notes: 'Condimentada con 7 especias',
                sortOrder: 1,
            },
            {
                recipeId: recetaArabBurger.id,
                ingredientItemId: panHamburguesa.id,
                quantity: 1,
                unit: 'UNIT',
                wastePercentage: 0,
                sortOrder: 2,
            },
            {
                recipeId: recetaArabBurger.id,
                ingredientItemId: zaatar.id,
                quantity: 0.005,
                unit: 'KG',
                wastePercentage: 0,
                notes: 'Espolvorear encima',
                sortOrder: 3,
            },
        ],
    });

    // ============================================================================
    // 7. HISTORIAL DE COSTOS
    // ============================================================================
    console.log('💰 Creando histórico de costos...');

    const costos = [
        { itemId: leche.id, cost: 2.5, reason: 'Precio inicial proveedor' },
        { itemId: sal.id, cost: 0.8, reason: 'Precio inicial' },
        { itemId: zaatar.id, cost: 25, reason: 'Importación Líbano' },
        { itemId: carne.id, cost: 8.5, reason: 'Precio inicial carnicería' },
        { itemId: trigoBurgol.id, cost: 3.2, reason: 'Precio inicial' },
        { itemId: cebolla.id, cost: 1.5, reason: 'Precio mercado' },
        { itemId: aceite.id, cost: 4.0, reason: 'Precio inicial' },
        { itemId: merey.id, cost: 18, reason: 'Precio granel' },
        { itemId: panHamburguesa.id, cost: 0.5, reason: 'Precio panadería' },
    ];

    for (const c of costos) {
        await prisma.costHistory.create({
            data: {
                inventoryItemId: c.itemId,
                costPerUnit: c.cost,
                currency: 'USD',
                reason: c.reason,
                createdById: adminUser.id,
            },
        });
    }

    // ============================================================================
    // 8. STOCK INICIAL
    // ============================================================================
    console.log('📊 Creando stock inicial...');

    const stockInicial = [
        { itemId: leche.id, areaId: cuartoFrio.id, stock: 200 },
        { itemId: sal.id, areaId: almacenSeco.id, stock: 25 },
        { itemId: zaatar.id, areaId: almacenSeco.id, stock: 8 },
        { itemId: carne.id, areaId: cuartoFrio.id, stock: 30 },
        { itemId: trigoBurgol.id, areaId: almacenSeco.id, stock: 15 },
        { itemId: cebolla.id, areaId: almacenSeco.id, stock: 10 },
        { itemId: aceite.id, areaId: almacenSeco.id, stock: 40 },
        { itemId: merey.id, areaId: almacenSeco.id, stock: 5 },
        { itemId: panHamburguesa.id, areaId: almacenSeco.id, stock: 100 },
        { itemId: cuajadaBase.id, areaId: cuartoFrio.id, stock: 8 },
        { itemId: shanklishSeco.id, areaId: cuartoFrio.id, stock: 50 },
        { itemId: masaKibbe.id, areaId: cuartoFrio.id, stock: 10 },
    ];

    for (const s of stockInicial) {
        await prisma.inventoryLocation.upsert({
            where: {
                inventoryItemId_areaId: {
                    inventoryItemId: s.itemId,
                    areaId: s.areaId,
                },
            },
            update: { currentStock: s.stock },
            create: {
                inventoryItemId: s.itemId,
                areaId: s.areaId,
                currentStock: s.stock,
            },
        });
    }

    console.log('\n✅ Seed completado exitosamente!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 Áreas creadas: 3');
    console.log('👥 Usuarios creados: 2');
    console.log('🏪 Proveedores: 3');
    console.log('📦 Insumos base: 9');
    console.log('🧀 Sub-recetas: 3');
    console.log('🍽️ Productos finales: 3');
    console.log('💰 Registros de costos: 9');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
    .catch((e) => {
        console.error('❌ Error en seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
