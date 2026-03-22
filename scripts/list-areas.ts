
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Listing Areas ---');
    const areas = await prisma.area.findMany({
        include: {
            _count: {
                select: { inventoryLocations: true }
            }
        }
    });

    console.table(areas.map(a => ({
        id: a.id,
        name: a.name,
        slug: (a as any).slug || 'N/A',
        isActive: a.isActive,
        locationsCount: a._count.inventoryLocations
    })));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
