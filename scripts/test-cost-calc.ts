
import { PrismaClient } from '@prisma/client';
import { calculateRecipeCost } from '../src/server/services/cost.service';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting cost calculation test...');

    // 1. Fetch all recipes
    const recipes = await prisma.recipe.findMany({
        select: { id: true, name: true }
    });

    console.log(`Found ${recipes.length} recipes.`);

    for (const recipe of recipes) {
        console.log(`Calculating cost for: ${recipe.name} (${recipe.id})`);

        try {
            const result = await calculateRecipeCost(prisma, recipe.id);

            if (result) {
                console.log('--- Result ---');
                console.log(`Total Cost: ${result.totalCost}`);
                console.log(`Cost Per Unit: ${result.costPerUnit}`);
                console.log(`Ingredients Cost: ${result.ingredientsCost}`);
                console.log('--------------');
            } else {
                console.log('Failed to calculate cost (null result).');
            }
        } catch (error) {
            console.error(`Error calculating cost for ${recipe.name}:`, error);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
