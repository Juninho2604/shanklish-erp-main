import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    // kitchenRouting values
    const kr = await (p.menuItem as any).groupBy({ by: ['kitchenRouting'], _count: true });
    console.log('=== kitchenRouting VALUES ===');
    kr.forEach((r: any) => console.log('  ' + JSON.stringify(r.kitchenRouting) + ' → ' + r._count + ' items'));

    // Items per category
    const items = await p.menuItem.findMany({
        where: { isActive: true },
        select: { name: true, kitchenRouting: true, serviceCategory: true, recipeId: true, category: { select: { name: true } } },
        orderBy: { category: { sortOrder: 'asc' } }
    });
    const byCat: Record<string, any[]> = {};
    for (const i of items) {
        const cat = (i as any).category.name;
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(i);
    }
    console.log('\n=== ITEMS ACTIVOS POR CATEGORÍA ===');
    for (const [cat, arr] of Object.entries(byCat)) {
        console.log(`\n  [${cat}] (${arr.length} items)`);
        arr.slice(0, 4).forEach((i: any) => console.log(`    "${i.name}" routing:${i.kitchenRouting} recipe:${i.recipeId ? 'SI' : 'NO'}`));
        if (arr.length > 4) console.log(`    ... y ${arr.length - 4} más`);
    }

    // Permisos/roles
    const roles = await p.user.groupBy({ by: ['role' as any], _count: true }).catch(() => []);
    console.log('\n=== ROLES DE USUARIOS ===');
    (roles as any[]).forEach((r: any) => console.log('  ' + r.role + ' → ' + r._count));
}

main().catch(console.error).finally(() => p.$disconnect());
