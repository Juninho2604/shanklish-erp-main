#!/usr/bin/env node
/**
 * check-waiter-setup.js
 * Diagnóstico del sistema de mesoneros con PIN.
 * Uso: DATABASE_URL="postgresql://..." node scripts/check-waiter-setup.js
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ Falta DATABASE_URL. Ejemplo:');
    console.error('   DATABASE_URL="postgresql://user:pass@host:5432/db" node scripts/check-waiter-setup.js');
    process.exit(1);
}

async function main() {
    const client = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 8000 });
    await client.connect();

    console.log('\n══════════════════════════════════════════════════════');
    console.log('         DIAGNÓSTICO — WAITER PIN SETUP');
    console.log('══════════════════════════════════════════════════════\n');

    // ── 1. Sucursales ─────────────────────────────────────────────────────────
    const { rows: branches } = await client.query(`
        SELECT id, name, code, "isActive" FROM "Branch" ORDER BY "isActive" DESC, name ASC
    `);

    console.log(`📍 SUCURSALES (${branches.length} total)`);
    if (branches.length === 0) {
        console.log('   ⛔  NO HAY SUCURSALES en la base de datos.');
    } else {
        branches.forEach(b => {
            const s = b.isActive ? '✅ ACTIVA ' : '❌ inactiva';
            console.log(`   ${s}  code=${b.code}  name="${b.name}"  id=${b.id}`);
        });
    }

    const activeBranch = branches.find(b => b.isActive);
    if (!activeBranch) {
        console.log('\n   ⛔  PROBLEMA CRÍTICO: ninguna sucursal tiene isActive=true.');
        console.log('       validateWaiterPinAction fallará siempre con "Sin sucursal activa".');
    }

    // ── 2. Mesoneros ──────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────────────');
    const { rows: waiters } = await client.query(`
        SELECT id, "firstName", "lastName", "isActive", "isCaptain", pin, "branchId"
        FROM "Waiter"
        ORDER BY "isActive" DESC, "firstName" ASC
    `);

    console.log(`🧑‍🍳 MESONEROS (${waiters.length} total)`);

    if (waiters.length === 0) {
        console.log('   ⛔  NO HAY MESONEROS. Créalos en /dashboard/mesoneros y asígnales PIN.');
    } else {
        const withPin    = waiters.filter(w => w.pin !== null);
        const withoutPin = waiters.filter(w => w.pin === null);
        const active     = waiters.filter(w => w.isActive);
        const captains   = waiters.filter(w => w.isCaptain);

        console.log(`   Total: ${waiters.length}  |  Activos: ${active.length}  |  Con PIN: ${withPin.length}  |  Sin PIN: ${withoutPin.length}  |  Capitanes: ${captains.length}`);
        console.log('');

        waiters.forEach(w => {
            const pinState = w.pin === null
                ? '🔓 sin PIN'
                : w.pin.includes(':')
                    ? '🔒 PIN hashed (PBKDF2) ✅'
                    : '⚠️  PIN TEXTO PLANO (no hasheado)';
            const act = w.isActive ? '✅' : '❌ inactivo';
            const cap = w.isCaptain ? ' ⭐cap' : '';
            console.log(`   ${act}  ${w.firstName} ${w.lastName}${cap}  —  ${pinState}`);
            if (w.pin && !w.pin.includes(':')) {
                console.log(`         ↳ valor raw: "${w.pin}"  ← cámbialo desde /dashboard/mesoneros`);
            }
        });

        // Candidatos válidos para validateWaiterPinAction
        if (activeBranch) {
            const candidates = waiters.filter(
                w => w.branchId === activeBranch.id && w.isActive && w.pin !== null
            );
            console.log('');
            console.log(`   🎯 Candidatos válidos en sucursal activa "${activeBranch.name}":`);
            if (candidates.length === 0) {
                console.log('   ⛔  NINGUNO — la pantalla de PIN quedará vacía.');
                console.log('       Asigna PINs desde /dashboard/mesoneros.');
            } else {
                candidates.forEach(w => {
                    const fmt = w.pin.includes(':') ? 'PBKDF2 ✅' : 'PLAINTEXT ⚠️';
                    const cap = w.isCaptain ? ' (capitán)' : '';
                    console.log(`      ✅  ${w.firstName} ${w.lastName}${cap}  — formato: ${fmt}`);
                });
            }
        }

        if (withoutPin.length > 0) {
            console.log('');
            console.log('   ⚠️  Sin PIN (no aparecerán en identificación):');
            withoutPin.forEach(w => console.log(`      • ${w.firstName} ${w.lastName} (activo=${w.isActive})`));
        }
    }

    // ── 3. Usuarios con rol que permite pos_waiter ────────────────────────────
    console.log('\n──────────────────────────────────────────────────────');
    const posWaiterRoles = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'WAITER', 'CASHIER', 'AREA_LEAD', 'JEFE_AREA'];
    const { rows: users } = await client.query(`
        SELECT "firstName", "lastName", email, role, "allowedModules"
        FROM "User"
        WHERE role = ANY($1) AND "isActive" = true
        ORDER BY "firstName" ASC
    `, [posWaiterRoles]);

    console.log(`👤 USUARIOS ACTIVOS CON ROL QUE PUEDE VER pos_waiter (${users.length})`);
    users.forEach(u => {
        let modStatus = 'todos (acceso por rol)';
        if (u.allowedModules) {
            try {
                const arr = JSON.parse(u.allowedModules);
                modStatus = arr.includes('pos_waiter')
                    ? `restringido ✅ incluye pos_waiter [${arr.join(', ')}]`
                    : `restringido ⛔ NO incluye pos_waiter → [${arr.join(', ')}]`;
            } catch { modStatus = 'allowedModules con JSON inválido'; }
        }
        console.log(`   ${u.firstName} ${u.lastName} (${u.role}) — ${u.email}`);
        console.log(`      módulos: ${modStatus}`);
    });

    console.log('\n══════════════════════════════════════════════════════\n');
    await client.end();
}

main().catch(e => {
    console.error('\n❌ Error al conectar o consultar:', e.message);
    process.exit(1);
});
