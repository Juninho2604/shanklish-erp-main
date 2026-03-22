
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🍳 Creando usuario de cocina...')

    const email = 'cocina@shanklish.com'

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            firstName: 'Cocina',
            lastName: 'Shanklish',
            role: 'KITCHEN_CHEF',
            passwordHash: '123456',
            isActive: true,
        },
    })

    console.log(`✅ Usuario creado: ${user.email}`)
    console.log(`   Rol: ${user.role}`)
    console.log(`   Password: 123456`)
    console.log('\n📋 Este usuario solo tiene acceso a la Comandera de Cocina (/kitchen)')
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
