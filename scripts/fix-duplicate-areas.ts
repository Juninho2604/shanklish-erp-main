
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Cleaning Duplicate Areas ---');

    // Areas to cleanup: 'ALMACEN PRINCIPAL' (0 locations)
    // Area to keep: 'Almacén Principal' (has locations) or 'cml5njsit0000f6ansg22q36m'

    // 1. Find the GOOD area (ensure it exists)
    const goodArea = await prisma.area.findFirst({
        where: { name: 'Almacén Principal', isActive: true }
    });

    if (!goodArea) {
        console.error('❌ Could not find the active Almacén Principal');
        return;
    }
    console.log(`✅ Keeping Area: ${goodArea.name} (${goodArea.id})`);

    // 2. Find the BAD areas (Duplicates/Caps)
    const badAreas = await prisma.area.findMany({
        where: {
            OR: [
                { name: 'ALMACEN PRINCIPAL' }, // All caps
                { name: { contains: 'Duplicado' } }
            ],
            NOT: { id: goodArea.id }
        },
        include: { inventoryLocations: true }
    });

    console.log(`🔍 Found ${badAreas.length} bad areas.`);

    for (const bad of badAreas) {
        console.log(`Processing Bad Area: ${bad.name} (${bad.id}) - Locations: ${bad.inventoryLocations.length}`);

        // Move locations if any (unlikely per previous check, but safe to do)
        for (const loc of bad.inventoryLocations) {
            // Check if good area already has this item
            const existingLoc = await prisma.inventoryLocation.findUnique({
                where: {
                    inventoryItemId_areaId: {
                        inventoryItemId: loc.inventoryItemId,
                        areaId: goodArea.id
                    }
                }
            });

            if (existingLoc) {
                // Add stock to good area
                await prisma.inventoryLocation.update({
                    where: { id: existingLoc.id },
                    data: { currentStock: { increment: loc.currentStock } }
                });
                // Delete old loc
                await prisma.inventoryLocation.delete({ where: { id: loc.id } });
            } else {
                // Move loc to good area
                await prisma.inventoryLocation.update({
                    where: { id: loc.id },
                    data: { areaId: goodArea.id }
                });
            }
        }

        // Delete the Bad Area
        try {
            await prisma.area.delete({ where: { id: bad.id } });
            console.log(`🗑️ Deleted Area: ${bad.name}`);
        } catch (e: any) {
            console.error(`⚠️ Could not delete area ${bad.name}: ${e.message}`);
            // Force deactivate if can't delete (due to relations?)
            await prisma.area.update({ where: { id: bad.id }, data: { isActive: false, name: `${bad.name} (Archived)` } });
        }
    }

    console.log('✨ Cleanup Done');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
