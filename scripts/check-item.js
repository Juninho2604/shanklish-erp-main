const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkItem() {
    const item = await prisma.inventoryItem.findFirst({
        where: { name: { contains: 'CREMA DE AJO', mode: 'insensitive' } }
    });

    console.log('Estado actual en base de datos:');
    console.log(JSON.stringify(item, null, 2));

    await prisma.$disconnect();
}

checkItem();
