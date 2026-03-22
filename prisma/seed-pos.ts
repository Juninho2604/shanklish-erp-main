
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const email = 'cajera1@shanklish.com'

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            firstName: 'Cajera',
            lastName: 'Restaurante 1',
            role: 'CASHIER_RESTAURANT',
            passwordHash: '123456', // Contraseña temporal
            isActive: true,
        },
    })

    console.log(`Usuario creado: ${user.email} con rol ${user.role}`)

    const area = await prisma.area.upsert({
        where: { id: 'area-restaurante' }, // ID fijo para ejemplo, normalmente usa cuid
        update: {},
        create: {
            id: 'area-restaurante',
            name: 'Restaurante',
            description: 'Área de servicio de restaurante',
        }
    })
    console.log(`Área creada/verificada: ${area.name}`)
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
