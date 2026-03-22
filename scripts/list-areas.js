const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAreas() {
    const areas = await prisma.area.findMany({
        select: { id: true, name: true }
    });
    console.log('Áreas disponibles:');
    areas.forEach(a => console.log(`  - "${a.name}" (${a.id})`));
    await prisma.$disconnect();
}

listAreas();
