import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    // 1. Categorías
    const cats = await p.menuCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    console.log('\n=== CATEGORÍAS DE MENÚ ===');
    cats.forEach(c => console.log(`  [${c.sortOrder}] "${c.name}" active:${c.isActive}`));

    // 2. MenuItem fields relacionados a cocina
    const sample = await p.menuItem.findFirst({
        include: { category: true }
    });
    console.log('\n=== CAMPOS DE MENUITEM (muestra) ===');
    if (sample) console.log(JSON.stringify(Object.keys(sample), null, 2));

    // 3. serviceCategory values existentes
    const scValues = await p.menuItem.groupBy({
        by: ['serviceCategory' as any],
        _count: true
    }).catch(() => null);
    if (scValues) {
        console.log('\n=== serviceCategory VALUES ===');
        (scValues as any[]).forEach(r => console.log(`  "${(r as any).serviceCategory}" → ${r._count} items`));
    }

    // 4. kitchenRequired / sendToKitchen field check
    const allItems = await p.menuItem.findMany({
        select: {
            id: true, name: true,
            ...(('kitchenRequired' in (sample ?? {})) ? { kitchenRequired: true } : {}),
            ...(('sendToKitchen' in (sample ?? {})) ? { sendToKitchen: true } : {}),
            ...(('serviceCategory' in (sample ?? {})) ? { serviceCategory: true } : {} as any),
        } as any,
        take: 200
    });

    // serviceCategoría by category
    const byServiceCat: Record<string, string[]> = {};
    for (const item of allItems as any[]) {
        const sc = item.serviceCategory ?? 'N/A';
        if (!byServiceCat[sc]) byServiceCat[sc] = [];
        byServiceCat[sc].push(item.name);
    }
    console.log('\n=== ITEMS POR serviceCategory ===');
    for (const [sc, names] of Object.entries(byServiceCat)) {
        console.log(`\n  serviceCategory="${sc}" (${names.length} items):`);
        names.slice(0, 8).forEach(n => console.log(`    - ${n}`));
        if (names.length > 8) console.log(`    ... y ${names.length - 8} más`);
    }

    // 5. Estado de órdenes recientes
    const orders = await p.salesOrder.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true, status: true, kitchenStatus: true, orderType: true, createdAt: true }
    });
    console.log('\n=== ÚLTIMAS 10 ÓRDENES ===');
    orders.forEach(o => console.log(`  ${o.orderNumber} | ${o.status} | kitchen:${o.kitchenStatus} | ${o.orderType}`));

    // 6. OpenTabs activas
    const tabs = await p.openTab.findMany({
        where: { status: 'OPEN' },
        include: { tableOrStation: true },
        take: 10
    });
    console.log(`\n=== MESAS ABIERTAS (${tabs.length}) ===`);
    tabs.forEach(t => console.log(`  ${t.tableOrStation?.name ?? 'N/A'} | tab:${t.tabCode} | balance:${t.balanceDue}`));
}

main().catch(console.error).finally(() => p.$disconnect());
