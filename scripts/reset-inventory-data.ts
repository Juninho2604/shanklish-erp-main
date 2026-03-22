import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetInventory() {
    console.log('🧹 Iniciando limpieza de historial de inventario...');

    try {
        // 1. Eliminar Movimientos (Historial)
        const deletedMovements = await prisma.inventoryMovement.deleteMany({});
        console.log(`✅ ${deletedMovements.count} movimientos eliminados.`);

        // 2. Eliminar Auditorías (Items y Cabeceras)
        // Cascade should handle items if configured, but deleting manually is safer for visibility
        const deletedAuditItems = await prisma.inventoryAuditItem.deleteMany({});
        console.log(`✅ ${deletedAuditItems.count} items de auditoría eliminados.`);

        const deletedAudits = await prisma.inventoryAudit.deleteMany({});
        console.log(`✅ ${deletedAudits.count} auditorías eliminadas.`);

        // 3. Eliminar Préstamos (Opcional, pero recomendado si es reset total)
        const deletedLoans = await prisma.inventoryLoan.deleteMany({});
        console.log(`✅ ${deletedLoans.count} préstamos eliminados.`);

        // 3.1 Préstamos Items
        // (If separate table exists, check schema. Assuming cascaded or included in logic)

        // 4. Reiniciar Stock a 0 en Ubicaciones
        const updatedLocations = await prisma.inventoryLocation.updateMany({
            data: {
                currentStock: 0,
                lastCountDate: null
            }
        });
        console.log(`✅ Stock reiniciado a 0 en ${updatedLocations.count} ubicaciones.`);

        // 5. Eliminar Inventarios Diarios (Si aplica)
        const deletedDailyItems = await prisma.dailyInventoryItem.deleteMany({});
        const deletedDaily = await prisma.dailyInventory.deleteMany({});
        console.log(`✅ ${deletedDaily.count} reportes diarios eliminados.`);

        console.log('✨ Limpieza completada. El catálogo de ítems y recetas se ha mantenido.');
    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetInventory();
