
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔧 Migrando datos existentes...')

    try {
        // Agregar columna itemName si no existe
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "SalesOrderItem" 
            ADD COLUMN IF NOT EXISTS "itemName" TEXT DEFAULT 'Item'
        `);
        console.log('✅ Columna itemName agregada');

        // Agregar columna name a SalesOrderItemModifier si no existe
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "SalesOrderItemModifier" 
            ADD COLUMN IF NOT EXISTS "name" TEXT DEFAULT 'Modificador'
        `);
        console.log('✅ Columna name agregada a modificadores');

        // Actualizar itemName con el nombre real del producto
        await prisma.$executeRawUnsafe(`
            UPDATE "SalesOrderItem" soi
            SET "itemName" = mi.name
            FROM "MenuItem" mi
            WHERE soi."menuItemId" = mi.id
            AND (soi."itemName" IS NULL OR soi."itemName" = 'Item')
        `);
        console.log('✅ itemName actualizado con nombres reales');

        // Actualizar name de modificadores
        await prisma.$executeRawUnsafe(`
            UPDATE "SalesOrderItemModifier" soim
            SET "name" = mm.name
            FROM "MenuModifier" mm
            WHERE soim."modifierId" = mm.id
            AND (soim."name" IS NULL OR soim."name" = 'Modificador')
        `);
        console.log('✅ Nombres de modificadores actualizados');

        // Ahora hacer NOT NULL
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "SalesOrderItem" 
            ALTER COLUMN "itemName" SET NOT NULL
        `);

        await prisma.$executeRawUnsafe(`
            ALTER TABLE "SalesOrderItemModifier" 
            ALTER COLUMN "name" SET NOT NULL
        `);
        console.log('✅ Columnas marcadas como NOT NULL');

        // Hacer modifierId opcional
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "SalesOrderItemModifier" 
            ALTER COLUMN "modifierId" DROP NOT NULL
        `);
        console.log('✅ modifierId ahora es opcional');

    } catch (error: any) {
        console.log('Error (puede ser normal si ya existe):', error.message);
    }

    console.log('\n🎉 Migración completada!');
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
