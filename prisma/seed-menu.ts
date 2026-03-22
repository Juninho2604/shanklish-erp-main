
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATEGORIES = [
    { id: 'cat-1', name: 'Shawarmas', description: 'Nuestros shawarmas tradicionales' },
    { id: 'cat-2', name: 'Bebidas', description: 'Refrescos y aguas' },
    { id: 'cat-3', name: 'Postres', description: 'Dulces árabes' },
    { id: 'cat-4', name: 'Complementos', description: 'Acompañantes' },
]

const ITEMS = [
    // Shawarmas
    { id: 'item-1', categoryId: 'cat-1', sku: 'SHWRM-POLLO', name: 'Shawarma de Pollo', price: 8.00 },
    { id: 'item-2', categoryId: 'cat-1', sku: 'SHWRM-CARNE', name: 'Shawarma de Carne', price: 9.00 },
    { id: 'item-3', categoryId: 'cat-1', sku: 'SHWRM-MIXTO', name: 'Shawarma Mixto', price: 10.00 },
    { id: 'item-4', categoryId: 'cat-1', sku: 'SHWRM-FALAFEL', name: 'Shawarma de Falafel', price: 7.50 },
    // Bebidas
    { id: 'item-5', categoryId: 'cat-2', sku: 'BEB-PEPSI', name: 'Pepsi Lata', price: 1.50 },
    { id: 'item-6', categoryId: 'cat-2', sku: 'BEB-7UP', name: '7UP Lata', price: 1.50 },
    { id: 'item-7', categoryId: 'cat-2', sku: 'BEB-AGUA', name: 'Agua Mineral', price: 1.00 },
    { id: 'item-8', categoryId: 'cat-2', sku: 'BEB-LIMONADA', name: 'Limonada con Menta', price: 3.00 },
    // Postres
    { id: 'item-9', categoryId: 'cat-3', sku: 'POST-PISTACHO', name: 'Helado de Pistacho', price: 4.00 },
    { id: 'item-10', categoryId: 'cat-3', sku: 'POST-BAKLAVA', name: 'Baklava', price: 3.50 },
    // Complementos
    { id: 'item-11', categoryId: 'cat-4', sku: 'COMP-TABULE', name: 'Tabulé', price: 3.00 },
    { id: 'item-12', categoryId: 'cat-4', sku: 'COMP-HUMMUS', name: 'Hummus', price: 3.50 },
    { id: 'item-13', categoryId: 'cat-4', sku: 'COMP-PAPAS', name: 'Papas Fritas', price: 2.50 },
]

const MODIFIERS = [
    { id: 'mod-1', name: 'Con Tabulé', priceAdjustment: 0 },
    { id: 'mod-2', name: 'Con Vegetales Salteados', priceAdjustment: 0 },
    { id: 'mod-3', name: 'Sin Cebolla', priceAdjustment: 0 },
    { id: 'mod-4', name: 'Extra Salsa', priceAdjustment: 0.50 },
    { id: 'mod-5', name: 'Extra Carne', priceAdjustment: 2.00 },
]

async function main() {
    console.log('🌱 Iniciando seed de Menú...')

    // 1. Crear grupo de modificadores base (General)
    const modifierGroup = await prisma.menuModifierGroup.upsert({
        where: { id: 'group-general' },
        update: {},
        create: {
            id: 'group-general',
            name: 'Opciones Generales',
            maxSelections: 99,
        }
    })

    // 2. Crear modificadores
    for (const mod of MODIFIERS) {
        await prisma.menuModifier.upsert({
            where: { id: mod.id },
            update: {
                name: mod.name,
                priceAdjustment: mod.priceAdjustment
            },
            create: {
                id: mod.id,
                groupId: modifierGroup.id,
                name: mod.name,
                priceAdjustment: mod.priceAdjustment
            }
        })
    }

    // 3. Crear Categorías
    for (const cat of CATEGORIES) {
        await prisma.menuCategory.upsert({
            where: { id: cat.id },
            update: {
                name: cat.name,
                description: cat.description
            },
            create: {
                id: cat.id,
                name: cat.name,
                description: cat.description
            }
        })
    }

    // 4. Crear Items
    for (const item of ITEMS) {
        // Verificar si existe por SKU primero
        const existingItem = await prisma.menuItem.findUnique({
            where: { sku: item.sku }
        });

        if (existingItem) {
            await prisma.menuItem.update({
                where: { id: existingItem.id },
                data: {
                    name: item.name,
                    price: item.price,
                    categoryId: item.categoryId // Actualizar categoría si cambió el ID mock
                }
            })
        } else {
            await prisma.menuItem.create({
                data: {
                    id: item.id,
                    sku: item.sku,
                    name: item.name,
                    price: item.price,
                    categoryId: item.categoryId
                }
            })
        }
    }

    console.log('✅ Menú cargado exitosamente')
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
