
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const email = 'cajera2@shanklish.com'

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            firstName: 'Cajera',
            lastName: 'Delivery 1',
            role: 'CASHIER_DELIVERY',
            passwordHash: '123456',
            isActive: true,
        },
    })

    console.log(`Usuario creado: ${user.email} con rol ${user.role}`)
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
