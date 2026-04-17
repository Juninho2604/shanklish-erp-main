/**
 * Diagnóstico y fix de allowedModules para mesonero@shanklish.com
 * Ejecutar con: DATABASE_URL="..." npx tsx scripts/fix-mesonero-modules.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('\n══════════════════════════════════════════');
    console.log('   FIX — allowedModules mesonero@shanklish.com');
    console.log('══════════════════════════════════════════\n');

    // 1. Estado actual
    const before = await prisma.user.findUnique({
        where: { email: 'mesonero@shanklish.com' },
        select: { email: true, role: true, allowedModules: true, isActive: true },
    });

    if (!before) {
        console.log('⛔ Usuario mesonero@shanklish.com NO EXISTE en la BD.');
        return;
    }

    console.log('ANTES:');
    console.log(`  email:          ${before.email}`);
    console.log(`  role:           ${before.role}`);
    console.log(`  isActive:       ${before.isActive}`);
    console.log(`  allowedModules: ${before.allowedModules ?? 'null (sin restricción → ve todo lo del rol)'}`);

    const needsFix = before.allowedModules !== '["pos_waiter"]';

    if (!needsFix) {
        console.log('\n✅ Ya tiene allowedModules = \'["pos_waiter"]\' — sin cambios.');
    } else {
        console.log('\n⚠️  allowedModules no está restringido a pos_waiter → aplicando fix...');
        await prisma.user.update({
            where: { email: 'mesonero@shanklish.com' },
            data: { allowedModules: '["pos_waiter"]' },
        });
        const after = await prisma.user.findUnique({
            where: { email: 'mesonero@shanklish.com' },
            select: { allowedModules: true },
        });
        console.log('\nDESPUÉS:');
        console.log(`  allowedModules: ${after?.allowedModules}`);
        console.log('\n✅ Fix aplicado correctamente.');
    }

    // 2. Estado de Shakifel Mixto
    console.log('\n──────────────────────────────────────────');
    console.log('  Shakifel Mixto — posGroup en BD:\n');
    const items = await prisma.menuItem.findMany({
        where: { name: { contains: 'shakifel', mode: 'insensitive' } },
        select: { name: true, posGroup: true, posSubcategory: true, isActive: true },
        orderBy: { name: 'asc' },
    });
    if (items.length === 0) {
        console.log('  (ningún item Shakifel encontrado)');
    } else {
        items.forEach(i => {
            const g = i.posGroup ?? '⛔ NULL';
            const s = i.posSubcategory ?? 'null';
            const a = i.isActive ? '✅' : '❌';
            console.log(`  ${a} ${i.name} | posGroup="${g}" | posSubcategory="${s}"`);
        });
    }

    console.log('\n══════════════════════════════════════════\n');
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
