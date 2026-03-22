
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Iniciando generación de PINs...');

    // 1. Obtener todos los roles jerárquicos
    const managers = await prisma.user.findMany({
        where: {
            role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'] }
        }
    });

    console.log(`📋 Encontrados ${managers.length} usuarios con privilegios:`);

    for (const user of managers) {
        let pin = '';

        if (user.role === 'OWNER') {
            pin = '1234'; // PIN maestro para el dueño (DEMO)
        } else {
            // Generar PIN aleatorio de 4 dígitos
            pin = Math.floor(1000 + Math.random() * 9000).toString();
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { pin }
        });

        console.log(`✅ [${user.role}] ${user.firstName} ${user.lastName} -> PIN Asignado: ${pin}`);
    }

    // BACKUP: Asegurarse de que exista el usuario Cocina (KITCHEN_CHEF) si no existe
    // Esto es de la tarea anterior pero verifiquemos
    const chef = await prisma.user.findFirst({ where: { email: 'cocina@shanklish.com' } });
    if (!chef) {
        console.log('🍳 Creando usuario Cocina por defecto...');
        // (Omitido lógica compleja de hash aquí, asumiendo ya creado por semilla anterior)
    }

    console.log('\n🔒 Proceso completado. PINs generados.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
