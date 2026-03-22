const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const recipes = await prisma.recipe.findMany({
        select: {
            id: true,
            name: true,
            isActive: true,
            isApproved: true,
        },
        orderBy: { name: 'asc' }
    });

    console.log('\n=== RECETAS EN BD ===\n');
    recipes.forEach(r => {
        console.log(`${r.isActive ? '✅' : '❌'} ${r.name} | Active: ${r.isActive} | Approved: ${r.isApproved}`);
    });
    console.log(`\nTotal: ${recipes.length} recetas`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
