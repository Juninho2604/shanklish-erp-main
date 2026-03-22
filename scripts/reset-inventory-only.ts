/**
 * SHANKLISH ERP - Script de Reset de Inventario
 * 
 * Este script SOLO limpia el historial:
 * 1. Borra todos los movimientos de inventario
 * 2. Borra auditorías
 * 3. Borra préstamos
 * 4. Borra requisiciones/transferencias
 * 5. Borra órdenes de producción
 * 6. Pone todo el stock a 0
 * 
 * NO BORRA: Items del catálogo, recetas, usuarios, áreas
 * 
 * USO: npx ts-node scripts/reset-inventory-only.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 INICIANDO RESET DE INVENTARIO');
    console.log('================================\n');
    console.log('⚠️  ATENCIÓN: Esto pondrá TODO el stock en 0');
    console.log('    Los items, recetas y usuarios se mantienen.\n');

    // ============================================================
    // LIMPIEZA TOTAL DE TRANSACCIONES
    // ============================================================

    console.log('🧹 Limpiando transacciones...\n');

    // Eliminar en orden para evitar FK constraints
    const deletedReqItems = await prisma.requisitionItem.deleteMany({});
    console.log(`  ✓ ${deletedReqItems.count} items de requisición eliminados`);

    const deletedReqs = await prisma.requisition.deleteMany({});
    console.log(`  ✓ ${deletedReqs.count} requisiciones/transferencias eliminadas`);

    const deletedMovements = await prisma.inventoryMovement.deleteMany({});
    console.log(`  ✓ ${deletedMovements.count} movimientos de inventario eliminados`);

    const deletedAuditItems = await prisma.inventoryAuditItem.deleteMany({});
    console.log(`  ✓ ${deletedAuditItems.count} items de auditoría eliminados`);

    const deletedAudits = await prisma.inventoryAudit.deleteMany({});
    console.log(`  ✓ ${deletedAudits.count} auditorías eliminadas`);

    const deletedLoans = await prisma.inventoryLoan.deleteMany({});
    console.log(`  ✓ ${deletedLoans.count} préstamos eliminados`);

    const deletedDailyItems = await prisma.dailyInventoryItem.deleteMany({});
    console.log(`  ✓ ${deletedDailyItems.count} items de inventario diario eliminados`);

    const deletedDaily = await prisma.dailyInventory.deleteMany({});
    console.log(`  ✓ ${deletedDaily.count} inventarios diarios eliminados`);

    const deletedProdOrders = await prisma.productionOrder.deleteMany({});
    console.log(`  ✓ ${deletedProdOrders.count} órdenes de producción eliminadas`);

    // Eliminar ubicaciones (esto pone stock en 0)
    const deletedLocations = await prisma.inventoryLocation.deleteMany({});
    console.log(`  ✓ ${deletedLocations.count} ubicaciones de stock eliminadas`);

    // ============================================================
    // RESUMEN
    // ============================================================
    console.log('\n================================');
    console.log('✨ RESET COMPLETADO EXITOSAMENTE');
    console.log('================================');

    const totalItems = await prisma.inventoryItem.count({ where: { isActive: true } });
    const totalRecipes = await prisma.recipe.count({ where: { isActive: true } });
    const totalAreas = await prisma.area.count({ where: { isActive: true } });
    const totalUsers = await prisma.user.count({ where: { isActive: true } });

    console.log(`\n📊 Estado del sistema:`);
    console.log(`   - Items en catálogo: ${totalItems}`);
    console.log(`   - Recetas activas: ${totalRecipes}`);
    console.log(`   - Áreas: ${totalAreas}`);
    console.log(`   - Usuarios: ${totalUsers}`);
    console.log(`   - Stock en todas las ubicaciones: 0`);
    console.log(`\n🎯 Ahora pueden cargar el inventario inicial desde:`);
    console.log(`   Dashboard → Inventario → Importar Excel`);
}

main()
    .catch(e => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
