const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetDB() {
    console.log('Iniciando proceso de limpieza y reseteo de la base de datos...');

    try {
        // 1. ELIMINAR SISTEMA DE POS / VENTAS
        console.log('Eliminando ventas y detalles...');
        await prisma.salesOrderItemModifier.deleteMany();
        await prisma.salesOrderItem.deleteMany();
        await prisma.salesOrder.deleteMany();

        // 2. ELIMINAR INVENTARIOS DIARIOS
        console.log('Eliminando cierres e inventarios diarios...');
        await prisma.dailyInventoryItem.deleteMany();
        await prisma.dailyInventory.deleteMany();

        // 3. ELIMINAR MOVIMIENTOS Y PRÉSTAMOS
        console.log('Eliminando prestamos y logs de movimientos...');
        await prisma.inventoryMovement.deleteMany();
        await prisma.inventoryLoan.deleteMany();

        // 4. ELIMINAR ÓRDENES DE PRODUCCIÓN
        console.log('Eliminando ordenes de produccion...');
        await prisma.productionOrder.deleteMany();

        // 5. ELIMINAR PROCESAMIENTO DE PROTEÍNAS
        console.log('Eliminando procesamiento de proteinas...');
        await prisma.proteinSubProduct.deleteMany();
        await prisma.proteinProcessing.deleteMany();

        // 6. ELIMINAR AUDITORÍAS
        console.log('Eliminando auditorias...');
        // Some schemas might have InventoryAuditItem instead of auditItems ... let's try to delete them
        if (prisma.inventoryAuditItem) {
            await prisma.inventoryAuditItem.deleteMany();
        }
        if (prisma.inventoryAudit) {
            await prisma.inventoryAudit.deleteMany();
        }

        // 7. ELIMINAR REQUISICIONES / TRANSFERENCIAS
        console.log('Eliminando transferencias/requisiciones...');
        if (prisma.requisitionItem) {
            await prisma.requisitionItem.deleteMany();
        }
        if (prisma.requisition) {
            await prisma.requisition.deleteMany();
        }

        // 8. ELIMINAR COMPRAS (PURCHASE ORDERS) si existen
        console.log('Eliminando ordenes de compra...');
        if (prisma.purchaseOrderItem) {
            await prisma.purchaseOrderItem.deleteMany();
        }
        if (prisma.purchaseOrder) {
            await prisma.purchaseOrder.deleteMany();
        }

        // 9. RESETEAR STOCK A 0 EN TODAS LAS UBICACIONES
        console.log('Reseteando stock a 0 en todas las areas...');
        await prisma.inventoryLocation.updateMany({
            data: {
                currentStock: 0,
                lastCountDate: null
            }
        });

        // 10. AJUSTAR EL AGUA MINERAL (Botellones de 18 Lts)
        console.log('Ajustando articulo: Agua Mineral...');
        const aguas = await prisma.inventoryItem.findMany({
            where: { name: { contains: 'Agua', mode: 'insensitive' } }
        });

        if (aguas.length > 0) {
            const aguaMineral = aguas.find(a => a.name.toLowerCase().includes('mineral')) || aguas[0];

            console.log(`Encontrado item de agua: ${aguaMineral.name} (SKU: ${aguaMineral.sku})`);

            // Actualizar para que baseUnit sea Litros, purchaseUnit Botellón y la conversión sea 18
            await prisma.inventoryItem.update({
                where: { id: aguaMineral.id },
                data: {
                    name: 'Agua Mineral (Botellón de 18 LTS)',
                    baseUnit: 'L',
                    purchaseUnit: 'BOTELLON',
                    conversionRate: 18,
                    description: 'Agua extraída de botellones. 1 Botellón = 18 Litros'
                }
            });
            console.log('Agua mineral ajustada a 18 Lts por botellón.');
        } else {
            console.log('No se encontró "Agua" en el inventario.');
        }

        console.log('======================================================');
        console.log('RESETEO COMPLETADO: El sistema está limpio y listo para producción a partir de hoy.');
        console.log('======================================================');
    } catch (error) {
        console.error('Error durante el reseteo:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetDB();
