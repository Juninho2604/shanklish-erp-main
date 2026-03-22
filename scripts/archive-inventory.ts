
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Archiving all inventory items (setting isActive = false)...');

    try {
        const result = await prisma.inventoryItem.updateMany({
            data: {
                isActive: false
            }
        });

        console.log(`Successfully archived ${result.count} items.`);

        // Optional: Reset stock to 0? The user said "clean master". 
        // Usually "Master" refers to the definitions (Item table).
        // The Import process handles stock update (upsert).
        // But if we want a true clean state, we might want to clear old stock records too?
        // Let's stick to deactivating items. The stock records (Location) will stay but be associated with inactive items.

    } catch (error) {
        console.error('Error archiving inventory:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
