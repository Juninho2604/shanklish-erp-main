const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const items = await prisma.menuItem.findMany();
    const cats = await prisma.menuCategory.findMany();
    console.log('Categories:', cats.map(c => c.name));
    console.log('MenuItems count:', items.length);
    console.log('MenuItems:', items.map(i => i.name));

    const invItems = await prisma.inventoryItem.findMany({ where: { type: 'FINISHED_GOOD' } });
    console.log('Inventory Finished Goods:', invItems.map(i => i.name));
}
run().finally(() => prisma.$disconnect());
