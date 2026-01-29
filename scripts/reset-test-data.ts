/**
 * RESET DE DATOS DE PRUEBA
 * 
 * Este script limpia todos los datos transaccionales de prueba
 * manteniendo la estructura base (items, áreas, recetas, menú, usuarios)
 * 
 * Ejecutar: npx tsx scripts/reset-test-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 RESET DE DATOS DE PRUEBA - Shanklish ERP');
    console.log('='.repeat(50));

    // 1. Eliminar Ventas y relacionados
    console.log('\n📦 Eliminando datos de ventas...');
    const deletedOrderItemModifiers = await prisma.salesOrderItemModifier.deleteMany({});
    console.log(`   - SalesOrderItemModifier: ${deletedOrderItemModifiers.count} registros`);

    const deletedOrderItems = await prisma.salesOrderItem.deleteMany({});
    console.log(`   - SalesOrderItem: ${deletedOrderItems.count} registros`);

    const deletedOrders = await prisma.salesOrder.deleteMany({});
    console.log(`   - SalesOrder: ${deletedOrders.count} registros`);

    // 2. Eliminar Movimientos de Inventario
    console.log('\n📊 Eliminando movimientos de inventario...');
    const deletedMovements = await prisma.inventoryMovement.deleteMany({});
    console.log(`   - InventoryMovement: ${deletedMovements.count} registros`);

    // 3. Eliminar Requisiciones (Transferencias)
    console.log('\n🔄 Eliminando requisiciones/transferencias...');
    const deletedReqItems = await prisma.requisitionItem.deleteMany({});
    console.log(`   - RequisitionItem: ${deletedReqItems.count} registros`);

    const deletedReqs = await prisma.requisition.deleteMany({});
    console.log(`   - Requisition: ${deletedReqs.count} registros`);

    // 4. Eliminar Inventarios Diarios
    console.log('\n📅 Eliminando inventarios diarios...');
    const deletedDailyItems = await prisma.dailyInventoryItem.deleteMany({});
    console.log(`   - DailyInventoryItem: ${deletedDailyItems.count} registros`);

    const deletedDaily = await prisma.dailyInventory.deleteMany({});
    console.log(`   - DailyInventory: ${deletedDaily.count} registros`);

    // 5. Eliminar Órdenes de Producción
    console.log('\n🏭 Eliminando órdenes de producción...');
    const deletedProdOrders = await prisma.productionOrder.deleteMany({});
    console.log(`   - ProductionOrder: ${deletedProdOrders.count} registros`);

    // 6. Resetear stocks a 0
    console.log('\n📉 Reseteando stocks a 0...');
    const resetStocks = await prisma.inventoryLocation.updateMany({
        data: {
            currentStock: 0,
            lastCountDate: null
        }
    });
    console.log(`   - InventoryLocation: ${resetStocks.count} registros actualizados a stock 0`);

    // Resumen
    console.log('\n' + '='.repeat(50));
    console.log('✅ RESET COMPLETADO');
    console.log('\n📋 Datos mantenidos:');

    const itemCount = await prisma.inventoryItem.count();
    const areaCount = await prisma.area.count();
    const userCount = await prisma.user.count();
    const recipeCount = await prisma.recipe.count();
    const menuItemCount = await prisma.menuItem.count();
    const categoryCount = await prisma.menuCategory.count();

    console.log(`   - InventoryItem: ${itemCount}`);
    console.log(`   - Area: ${areaCount}`);
    console.log(`   - User: ${userCount}`);
    console.log(`   - Recipe: ${recipeCount}`);
    console.log(`   - MenuItem: ${menuItemCount}`);
    console.log(`   - MenuCategory: ${categoryCount}`);

    console.log('\n🚀 Base de datos lista para cargar inventarios iniciales!');
}

main()
    .catch((e) => {
        console.error('❌ Error durante reset:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
