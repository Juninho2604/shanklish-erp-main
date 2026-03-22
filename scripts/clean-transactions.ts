
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.log('\n⚠️  ADVERTENCIA DE SEGURIDAD ⚠️');
    console.log('Este script ELIMINARÁ PERMANENTEMENTE todos los movimientos de transacción.');
    console.log('Se mantendrán: Usuarios, Recetas, Insumos, Áreas y Proveedores.');
    console.log('Se eliminarán: Ventas, Órdenes, Movimientos de Stock, Inventarios Diarios.\n');

    rl.question('¿Estás seguro que deseas continuar? Escribe "BORRAR DATOS" para confirmar: ', async (answer) => {
        if (answer !== 'BORRAR DATOS') {
            console.log('Operación cancelada.');
            process.exit(0);
        }

        try {
            console.log('\nIniciando limpieza...');

            // Usamos transacción para asegurar consistencia
            await prisma.$transaction(async (tx) => {

                // 1. Eliminar modificadores de items de venta
                console.log('Eliminando detalles de venta...');
                await tx.salesOrderItemModifier.deleteMany({});
                await tx.salesOrderItem.deleteMany({});

                // 2. Eliminar movimientos de inventario vinculados a ventas
                // (Prisma debería manejar esto si hay cascade, pero aseguramos)

                // 3. Eliminar ventas
                console.log('Eliminando órdenes de venta...');
                await tx.salesOrder.deleteMany({});

                // 4. Eliminar órdenes de producción
                console.log('Eliminando órdenes de producción...');
                await tx.productionOrder.deleteMany({});

                // 5. Eliminar requisiciones/transferencias
                console.log('Eliminando requisiciones...');
                await tx.requisitionItem.deleteMany({});
                await tx.requisition.deleteMany({});

                // 6. Eliminar inventarios diarios
                console.log('Eliminando tomas de inventario...');
                await tx.dailyInventoryItem.deleteMany({});
                await tx.dailyInventory.deleteMany({});

                // 7. Eliminar TODOS los movimientos de inventario
                console.log('Eliminando historial de movimientos...');
                await tx.inventoryMovement.deleteMany({});

                // 8. Eliminar historial de costos (Opcional, pero recomendado para empezar fresh)
                console.log('Eliminando historial de costos...');
                await tx.costHistory.deleteMany({});

                // 9. Resetear stock actual a 0 en todas las ubicaciones
                console.log('Reseteando niveles de stock a 0...');
                await tx.inventoryLocation.updateMany({
                    data: {
                        currentStock: 0,
                        lastCountDate: null
                    }
                });

                console.log('Limpieza completada exitosamente.');
            });

        } catch (error) {
            console.error('Error durante la limpieza:', error);
        } finally {
            await prisma.$disconnect();
            process.exit(0);
        }
    });
}

main();
