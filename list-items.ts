import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("--- RECETAS ACTUALES ---");
    const recipes = await prisma.recipe.findMany({
        select: { name: true, outputUnit: true, outputQuantity: true }
    });
    console.log(JSON.stringify(recipes, null, 2));

    console.log("\n--- ITEMS SIN RECETA QUE PARECEN PLATOS ---");
    const items = await prisma.inventoryItem.findMany({
        where: {
            isActive: true,
            type: 'FINISHED_GOOD',
            outputRecipes: { none: {} }
        },
        select: { name: true, sku: true, baseUnit: true },
        orderBy: { name: 'asc' }
    });
    console.log(JSON.stringify(items, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
