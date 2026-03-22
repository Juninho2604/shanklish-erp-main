
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    await prisma.menuItem.update({ where: { sku: 'TABLA-X1' }, data: { price: 25.00 } });
    await prisma.menuItem.update({ where: { sku: 'TABLA-X2' }, data: { price: 60.00 } });
    await prisma.menuItem.update({ where: { sku: 'TABLA-X4' }, data: { price: 120.00 } });
    console.log('✅ Precios de tablas actualizados: x1=$25, x2=$60, x4=$120');
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
