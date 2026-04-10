/**
 * migrate-pins.ts
 * ---------------
 * Migra todos los PINs almacenados en texto plano a hashes PBKDF2-SHA256.
 * Usa la misma lógica que hashPin() en pos.actions.ts.
 *
 * Uso:
 *   npx tsx scripts/migrate-pins.ts           # migración real
 *   npx tsx scripts/migrate-pins.ts --dry-run  # solo muestra qué haría, sin escribir
 *
 * Nota: el proyecto usa `tsx`, no `ts-node`. Si intentas con `npx ts-node`
 *       agrega el flag: npx ts-node --esm scripts/migrate-pins.ts
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// PBKDF2-SHA256 — misma lógica que pos.actions.ts : hashPin / verifyPin
// No importamos desde pos.actions.ts porque ese archivo tiene 'use server'
// y depende de next/cache, que no está disponible fuera del runtime Next.js.
// ============================================================================

function hexToUint8Array(hex: string): Uint8Array {
    const pairs = hex.match(/.{2}/g) ?? [];
    return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

function uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function pbkdf2Hex(pin: string, saltHex: string): Promise<string> {
    const salt = hexToUint8Array(saltHex);
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hashBuf = await globalThis.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as any, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        256,
    );
    return uint8ArrayToHex(new Uint8Array(hashBuf));
}

async function hashPin(pin: string): Promise<string> {
    const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const saltHex = uint8ArrayToHex(saltBytes);
    const hashHex = await pbkdf2Hex(pin, saltHex);
    return `${saltHex}:${hashHex}`;
}

function isHashed(pin: string): boolean {
    // Formato hasheado: "saltHex:hashHex" — siempre contiene ':'
    return pin.includes(':');
}

// ============================================================================
// CONFIRMACIÓN INTERACTIVA
// ============================================================================

function ask(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Shanklish ERP — Migración de PINs        ║');
    console.log('╚════════════════════════════════════════════╝');

    if (DRY_RUN) {
        console.log('  Modo: DRY RUN (no se escribirá nada en BD)\n');
    } else {
        console.log('  Modo: PRODUCCIÓN — se actualizarán PINs en BD\n');
    }

    // Busca TODOS los usuarios con PIN, incluyendo soft-deleted,
    // para no dejar hashes expuestos en usuarios inactivos.
    const allUsers = await prisma.user.findMany({
        where: { pin: { not: null } },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            pin: true,
            isActive: true,
            deletedAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    if (allUsers.length === 0) {
        console.log('  No hay usuarios con PIN en la base de datos. Nada que migrar.');
        return;
    }

    const plaintext = allUsers.filter((u) => u.pin && !isHashed(u.pin));
    const alreadyHashed = allUsers.filter((u) => u.pin && isHashed(u.pin));

    console.log(`  Total usuarios con PIN : ${allUsers.length}`);
    console.log(`  Ya hasheados           : ${alreadyHashed.length}`);
    console.log(`  En texto plano         : ${plaintext.length}`);
    console.log('');

    if (plaintext.length === 0) {
        console.log('  Todos los PINs ya están hasheados. Nada que migrar.');
        return;
    }

    console.log('  Usuarios a migrar:');
    for (const u of plaintext) {
        const estado = u.deletedAt ? ' [eliminado]' : u.isActive ? '' : ' [inactivo]';
        console.log(`    • [${u.role}] ${u.firstName} ${u.lastName}${estado}`);
    }
    console.log('');

    if (!DRY_RUN) {
        const confirm = await ask(
            `  ¿Confirmar migración de ${plaintext.length} PIN(s)? Escribe "MIGRAR" para continuar: `,
        );
        if (confirm !== 'MIGRAR') {
            console.log('\n  Operación cancelada.\n');
            return;
        }
        console.log('');
    }

    let migrated = 0;
    let failed = 0;

    for (const user of plaintext) {
        try {
            if (!DRY_RUN) {
                const hashed = await hashPin(user.pin!);
                await prisma.user.update({
                    where: { id: user.id },
                    data: { pin: hashed },
                });
            }
            const label = DRY_RUN ? '(dry)' : '✓';
            console.log(`  ${label} [${user.role}] ${user.firstName} ${user.lastName}`);
            migrated++;
        } catch (err) {
            console.error(`  ✗ Error migrando ${user.firstName} ${user.lastName}:`, err);
            failed++;
        }
    }

    console.log('');
    console.log('════════════════════════════════════════════');
    if (DRY_RUN) {
        console.log(`  DRY RUN completado: ${migrated} PIN(s) se habrían migrado.`);
    } else {
        console.log(`  Migración completada: ${migrated} migrado(s), ${failed} error(es).`);
        if (failed > 0) {
            console.log('  ATENCIÓN: algunos PINs no se pudieron migrar. Revisar errores arriba.');
            process.exitCode = 1;
        }
    }
    console.log('════════════════════════════════════════════');
    console.log('');
}

main()
    .catch((e) => {
        console.error('Error fatal:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
